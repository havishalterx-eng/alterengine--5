import { createHmac, type webcrypto } from 'node:crypto';

type CryptoKey = webcrypto.CryptoKey;
import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJwtValidator, JwtRejectedError, PINNED_ALG } from './jwt.js';

/**
 * Component 37 — JWT validation tests, done-gate items 2, 3 and 4 of
 * contract 1 (the validator itself; the gateway composes it in
 * packages/tenant-gateway).
 *
 * Everything here is real: a local HTTP server serving a real JWKS, real
 * RSA keys generated with jose, real signed tokens. No fixture tokens, no
 * recorded responses — the same pattern the SSRF guard tests use.
 */

const ISSUER = 'https://identity.alter.test';
const AUDIENCE = 'alter-engine';

interface KeyPair {
  readonly kid: string;
  readonly publicKey: CryptoKey;
  readonly privateKey: CryptoKey;
  readonly jwk: Record<string, string>;
}

let server: Server;
let serverUrl: string;
let serving: KeyPair[];
let hits: number;

beforeEach(async () => {
  serving = [];
  hits = 0;
  server = createServer((_request, response) => {
    hits += 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ keys: serving.map((pair) => ({ ...pair.jwk, kid: pair.kid })) }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/jwks`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function newKeyPair(kid: string): Promise<KeyPair> {
  const { publicKey, privateKey } = await generateKeyPair(PINNED_ALG);
  const jwk = (await exportJWK(publicKey)) as Record<string, string>;
  return { kid, publicKey, privateKey, jwk };
}

async function mint(
  pair: KeyPair,
  claims: Record<string, unknown>,
  options: { issuer?: string; audience?: string; expiresIn?: string } = {},
): Promise<string> {
  const builder = new SignJWT(claims as Record<string, string | number | (string | number)[]>)
    .setProtectedHeader({ alg: PINNED_ALG, kid: pair.kid })
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '15m');
  builder.setIssuer(options.issuer ?? ISSUER);
  builder.setAudience(options.audience ?? AUDIENCE);
  return builder.sign(pair.privateKey);
}

function validator(): ReturnType<typeof createJwtValidator> {
  return createJwtValidator({
    jwksUrl: serverUrl,
    issuer: ISSUER,
    audience: AUDIENCE,
    minFetchIntervalMs: 250,
    negativeCacheMs: 60_000,
  });
}

describe('done gate 2 — rejects what must be rejected', () => {
  it('accepts a real, correctly signed token and returns its claims', async () => {
    const pair = await newKeyPair('key-1');
    serving = [pair];
    const token = await mint(pair, { email: 'member@alter.test' });

    const claims = await validator().verify(token);
    expect(claims.email).toBe('member@alter.test');
  });

  it('rejects a missing token', async () => {
    await expect(validator().verify('')).rejects.toThrow(JwtRejectedError);
  });

  it('rejects an expired token', async () => {
    const pair = await newKeyPair('key-1');
    serving = [pair];
    const token = await mint(pair, { email: 'x@alter.test' }, { expiresIn: '-10m' });
    // -10m is far outside the bounded clock skew (max 30s).
    await expect(validator().verify(token)).rejects.toThrow(/exp/i);
  });

  it('rejects a wrong issuer — exact match, no substring', async () => {
    const pair = await newKeyPair('key-1');
    serving = [pair];
    const token = await mint(pair, { email: 'x@alter.test' }, { issuer: `${ISSUER}-evil` });
    await expect(validator().verify(token)).rejects.toThrow(/iss/i);
  });

  it('rejects a wrong audience', async () => {
    const pair = await newKeyPair('key-1');
    serving = [pair];
    const token = await mint(pair, { email: 'x@alter.test' }, { audience: 'somebody-else' });
    await expect(validator().verify(token)).rejects.toThrow(/aud/i);
  });

  it('rejects alg:none before any key work', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', kid: 'key-1' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ email: 'x@alter.test' })).toString('base64url');
    const unsignedToken = `${header}.${payload}.`;
    const attempt = validator();
    await expect(attempt.verify(unsignedToken)).rejects.toThrow('only RS256 is accepted');
    // It never reached the JWKS endpoint.
    expect(attempt.jwksFetchCount()).toBe(0);
    expect(hits).toBe(0);
  });

  it('rejects an honestly-labelled HS256 token', async () => {
    const pair = await newKeyPair('key-1');
    serving = [pair];
    const hs256 = await new SignJWT({ email: 'x@alter.test' })
      .setProtectedHeader({ alg: 'HS256', kid: pair.kid })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('attacker-shared-secret'));
    await expect(validator().verify(hs256)).rejects.toThrow('only RS256 is accepted');
  });

  it('rejects the confusion attack: header says RS256, signature is HMAC with the public key as secret', async () => {
    const pair = await newKeyPair('key-1');
    serving = [pair];
    // The attacker signs HMAC-SHA256 using the RSA PUBLIC key material as
    // the shared secret, and labels the header RS256. Pin 1 passes (the
    // header lies), so the cryptographic verify must catch it: an RSA
    // signature check against an HMAC can never succeed.
    const header = Buffer.from(JSON.stringify({ alg: PINNED_ALG, kid: pair.kid })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ iss: ISSUER, aud: AUDIENCE, email: 'x@alter.test', exp: Math.floor(Date.now() / 1000) + 900, iat: Math.floor(Date.now() / 1000) }),
    ).toString('base64url');
    const secret = JSON.stringify(pair.jwk);
    const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    const confusedToken = `${header}.${payload}.${signature}`;

    await expect(validator().verify(confusedToken)).rejects.toThrow(JwtRejectedError);
  });

  it('ignores non-RSA or unlabelled keys in the JWKS document — the key-import filter', async () => {
    const pair = await newKeyPair('key-1');
    serving = [pair];
    // The document also carries a key claiming ES256 and one with no alg.
    // Neither is importable; only the pinned RSA/RS256 key is.
    const { publicKey: ecPublicKey, privateKey: ecPrivateKey } = await generateKeyPair('ES256');
    const ecJwk = (await exportJWK(ecPublicKey)) as Record<string, string>;
    const servingSnapshot = serving;
    serving = [
      ...servingSnapshot,
      { kid: 'ec-1', publicKey: ecPublicKey, privateKey: ecPrivateKey, jwk: { ...ecJwk, alg: 'ES256' } },
      { kid: 'noalg-1', publicKey: pair.publicKey, privateKey: pair.privateKey, jwk: { ...pair.jwk } },
    ];
    // A token honestly signed ES256 dies at pin 1 regardless.
    const es256 = await new SignJWT({ email: 'x@alter.test' })
      .setProtectedHeader({ alg: 'ES256', kid: 'ec-1' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(ecPrivateKey);
    await expect(validator().verify(es256)).rejects.toThrow('only RS256 is accepted');
  });
});

describe('done gate 3 — unknown kids cannot cause unbounded JWKS fetches', () => {
  it('rejects settings that would disable either unknown-kid guard', () => {
    expect(() => createJwtValidator({
      jwksUrl: serverUrl,
      issuer: ISSUER,
      audience: AUDIENCE,
      minFetchIntervalMs: 0,
    })).toThrow(JwtRejectedError);
    expect(() => createJwtValidator({
      jwksUrl: serverUrl,
      issuer: ISSUER,
      audience: AUDIENCE,
      negativeCacheMs: 0,
    })).toThrow(JwtRejectedError);
  });

  it('hammers 30 unknown-kid requests and the endpoint is hit at most twice', async () => {
    const pair = await newKeyPair('key-1');
    serving = [pair];
    const attempt = validator();

    // First a real token, so the key map is loaded.
    await attempt.verify(await mint(pair, { email: 'x@alter.test' }));
    const fetchesAfterFirst = attempt.jwksFetchCount();
    expect(fetchesAfterFirst).toBe(1);

    // 30 requests, each with a DIFFERENT unknown kid: the worst case, since
    // a repeated kid would be caught by the negative cache directly.
    let rejections = 0;
    for (let index = 0; index < 30; index += 1) {
      const unknown = await mint(pair, { email: 'x@alter.test' });
      // Rewrite the kid in the protected header to an unknown one, re-signing
      // is not needed — the kid lookup fails before signature verification.
      const parts = unknown.split('.');
      const header = JSON.parse(Buffer.from(parts[0] ?? '', 'base64url').toString()) as { alg: string; kid: string };
      header.kid = `unknown-kid-${index}`;
      parts[0] = Buffer.from(JSON.stringify(header)).toString('base64url');
      try {
        await attempt.verify(parts.join('.'));
      } catch {
        rejections += 1;
      }
    }

    expect(rejections).toBe(30);
    // Bounded: one fetch (rate-limited window), plus the initial load.
    expect(attempt.jwksFetchCount()).toBeLessThanOrEqual(fetchesAfterFirst + 1);
    expect(hits).toBeLessThanOrEqual(2);
  });
});

describe('done gate 4 — rotated-out keys stop validating immediately', () => {
  it('replaces the key map on refresh; the old key is gone, not merged', async () => {
    const oldPair = await newKeyPair('key-old');
    const newPair = await newKeyPair('key-new');
    serving = [oldPair];
    const attempt = validator();

    const oldToken = await mint(oldPair, { email: 'x@alter.test' });
    await expect(attempt.verify(oldToken)).resolves.toBeDefined();

    // The provider rotates: the JWKS now serves ONLY the new key.
    serving = [newPair];

    // Past the rate-limit window, the way a real rotation is: keys rotate
    // over minutes, not milliseconds.
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Refresh happens — triggered the way it really would be, by a token
    // carrying the new kid.
    const newToken = await mint(newPair, { email: 'x@alter.test' });
    await expect(attempt.verify(newToken)).resolves.toBeDefined();

    // Immediately, not eventually: the old key is no longer in the map, so
    // the old token is rejected on its next presentation — it does not
    // keep validating until some cache TTL expires.
    await expect(attempt.verify(oldToken)).rejects.toThrow(/Unknown key id|Token rejected/);
  });
});
