import { createHmac, type webcrypto } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { loadConfig } from '@alter/contracts';
import { createIdentityStore, type IdentityStore } from '@alter/identity';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTenantGateway, TenantAccessDeniedError } from './gateway.js';

const ISSUER = 'https://identity.alter.test';
const AUDIENCE = 'alter-engine';
const config = loadConfig(process.env);

type CryptoKey = webcrypto.CryptoKey;

interface KeyPair {
  readonly kid: string;
  readonly publicKey: CryptoKey;
  readonly privateKey: CryptoKey;
  readonly jwk: Record<string, string>;
}

let store: IdentityStore;
let server: Server;
let serverUrl: string;
let serving: KeyPair[];
let hits: number;

beforeAll(async () => {
  store = createIdentityStore({ databaseUrl: config.databaseUrl });
  await store.migrate();
});

afterAll(async () => {
  await store.close();
});

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
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  return {
    kid,
    publicKey,
    privateKey,
    jwk: (await exportJWK(publicKey)) as Record<string, string>,
  };
}

async function mint(
  pair: KeyPair,
  email: string,
  options: {
    readonly issuer?: string;
    readonly audience?: string;
    readonly expiresIn?: string;
    readonly notBefore?: string;
  } = {},
): Promise<string> {
  const token = new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: pair.kid })
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '15m')
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE);
  if (options.notBefore !== undefined) token.setNotBefore(options.notBefore);
  return token.sign(pair.privateKey);
}

function gateway() {
  return createTenantGateway({
    databaseUrl: config.databaseUrl,
    identity: store,
    jwt: {
      jwksUrl: serverUrl,
      issuer: ISSUER,
      audience: AUDIENCE,
      minFetchIntervalMs: 250,
      negativeCacheMs: 60_000,
    },
  });
}

async function realMember(role = 'Member') {
  const tag = crypto.randomUUID().slice(0, 8);
  const account = await store.createAccount({
    name: `gateway-${tag}`,
    ownerEmail: `owner-${tag}@alter.test`,
  });
  const email = `member-${tag}@alter.test`;
  await store.addMember({ accountId: account.accountId, email, role });
  return { account, email };
}

describe('done gate 1 — token in, ActorContext out through component 42', () => {
  it('derives a real member role into non-empty permissions', async () => {
    const { account, email } = await realMember('Admin');
    const pair = await newKeyPair('gate-1');
    serving = [pair];

    const context = await gateway().resolveHumanRequest({
      bearerToken: await mint(pair, email),
      tenantId: account.accountId,
    });

    expect(context.tenant_id).toBe(account.accountId);
    expect(context.resolved_permissions.length).toBeGreaterThan(0);
    expect(context.resolved_permissions).toContain('create_workflow');
  });
});

describe('done gate 2 — malformed or untrusted bearer tokens fail closed', () => {
  it('rejects missing, expired, wrong issuer, wrong audience, alg:none, and HS256 confusion', async () => {
    const { account, email } = await realMember();
    const pair = await newKeyPair('gate-2');
    serving = [pair];
    const attempt = gateway();

    const none = `${Buffer.from(JSON.stringify({ alg: 'none', kid: pair.kid })).toString('base64url')}.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.`;
    const rsHeader = Buffer.from(JSON.stringify({ alg: 'RS256', kid: pair.kid })).toString('base64url');
    const rsPayload = Buffer.from(JSON.stringify({ iss: ISSUER, aud: AUDIENCE, email, exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url');
    const confused = `${rsHeader}.${rsPayload}.${createHmac('sha256', JSON.stringify(pair.jwk)).update(`${rsHeader}.${rsPayload}`).digest('base64url')}`;
    const attempts = [
      undefined,
      await mint(pair, email, { expiresIn: '-10m' }),
      await mint(pair, email, { notBefore: '10m' }),
      await mint(pair, email, { issuer: `${ISSUER}-evil` }),
      await mint(pair, email, { audience: 'not-alter' }),
      none,
      confused,
    ];

    for (const bearerToken of attempts) {
      await expect(attempt.resolveHumanRequest({ bearerToken, tenantId: account.accountId }))
        .rejects.toThrow(TenantAccessDeniedError);
    }
  });
});

describe('done gate 3 — unknown kids are negatively cached and rate limited', () => {
  it('bounds 30 unknown-kid requests to two JWKS hits', async () => {
    const { account, email } = await realMember();
    const pair = await newKeyPair('known');
    serving = [pair];
    const attempt = gateway();
    await attempt.resolveHumanRequest({ bearerToken: await mint(pair, email), tenantId: account.accountId });

    for (let index = 0; index < 30; index += 1) {
      const parts = (await mint(pair, email)).split('.');
      parts[0] = Buffer.from(JSON.stringify({ alg: 'RS256', kid: `unknown-${index}` })).toString('base64url');
      await expect(attempt.resolveHumanRequest({ bearerToken: parts.join('.'), tenantId: account.accountId }))
        .rejects.toThrow(TenantAccessDeniedError);
    }

    expect(attempt.jwksFetchCount()).toBeLessThanOrEqual(2);
    expect(hits).toBeLessThanOrEqual(2);
  });
});

describe('done gate 4 — refresh replaces, never merges, key maps', () => {
  it('rejects the rotated-out key immediately after a real refresh', async () => {
    const { account, email } = await realMember();
    const oldPair = await newKeyPair('old');
    const newPair = await newKeyPair('new');
    serving = [oldPair];
    const attempt = gateway();
    const oldToken = await mint(oldPair, email);
    await attempt.resolveHumanRequest({ bearerToken: oldToken, tenantId: account.accountId });

    serving = [newPair];
    await new Promise((resolve) => setTimeout(resolve, 300));
    await attempt.resolveHumanRequest({ bearerToken: await mint(newPair, email), tenantId: account.accountId });
    await expect(attempt.resolveHumanRequest({ bearerToken: oldToken, tenantId: account.accountId }))
      .rejects.toThrow(TenantAccessDeniedError);
  });
});

describe('done gate 5 — a valid tenant A member cannot scope to tenant B', () => {
  it('denies the cross-tenant ActorContext', async () => {
    const member = await realMember();
    const other = await realMember();
    const pair = await newKeyPair('gate-5');
    serving = [pair];

    await expect(gateway().resolveHumanRequest({
      bearerToken: await mint(pair, member.email),
      tenantId: other.account.accountId,
    })).rejects.toThrow(TenantAccessDeniedError);
  });
});

describe('RLS proof — the resolved tenant context constrains a non-superuser connection', () => {
  it('can read tenant A and cannot read tenant B at the database level', async () => {
    const tenantA = await realMember();
    const tenantB = await realMember();
    const pair = await newKeyPair('rls');
    serving = [pair];
    const roleName = `alter_gateway_rls_${crypto.randomUUID().replaceAll('-', '')}`;
    const password = crypto.randomUUID();
    const admin = new Client({ connectionString: config.databaseUrl });
    await admin.connect();

    try {
      await admin.query(`CREATE ROLE ${roleName} LOGIN PASSWORD '${password}'`);
      await admin.query(`GRANT USAGE ON SCHEMA public TO ${roleName}`);
      await admin.query(`GRANT SELECT ON accounts, memberships, custom_roles TO ${roleName}`);
      await admin.query(`GRANT SELECT ON users TO ${roleName}`);
      const url = new URL(config.databaseUrl);
      url.username = roleName;
      url.password = password;
      const rlsIdentity = createIdentityStore({ databaseUrl: url.toString() });
      const rlsGateway = createTenantGateway({
        databaseUrl: url.toString(),
        identity: rlsIdentity,
        jwt: { jwksUrl: serverUrl, issuer: ISSUER, audience: AUDIENCE },
      });

      try {
        const context = await rlsGateway.resolveHumanRequest({
          bearerToken: await mint(pair, tenantA.email),
          tenantId: tenantA.account.accountId,
        });
        const rows = await rlsGateway.withActor(context, async (client) => {
          const own = await client.query('SELECT id FROM accounts WHERE id = $1', [tenantA.account.accountId]);
          const foreign = await client.query('SELECT id FROM accounts WHERE id = $1', [tenantB.account.accountId]);
          return { own: own.rowCount, foreign: foreign.rowCount };
        });
        expect(rows).toEqual({ own: 1, foreign: 0 });
      } finally {
        await rlsGateway.close();
        await rlsIdentity.close();
      }
    } finally {
      await admin.query(`DROP OWNED BY ${roleName}`);
      await admin.query(`DROP ROLE IF EXISTS ${roleName}`);
      await admin.end();
    }
  });
});
