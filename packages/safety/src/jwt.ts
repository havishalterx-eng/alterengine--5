import type { webcrypto } from 'node:crypto';
import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';

/** jose v6 keys are WebCrypto keys; aliased because the DOM lib is not loaded. */
type CryptoKey = webcrypto.CryptoKey;

/**
 * Component 37 — JWT validation, the one definition (rule 18).
 *
 * Contract 1 lists Safety as the plane owner of JWT validation; this is
 * consumed by the Identity & Tenant Gateway now and by Public Surface later.
 *
 * Carries forward exactly what the previous build's audit rated ahead of most
 * production systems — do not weaken any of it:
 *   - algorithm pinned at BOTH the header check and the key-import filter
 *     (and again at the verify call: three independent pins)
 *   - issuer matched exactly
 *   - audience validated
 *   - expiry and not-before checked with bounded clock skew
 *
 * The JWKS client is deliberately NOT jose's createRemoteJWKSet: that helper
 * merges refreshed keys into the existing set, which is the old build's
 * revocation defect — rotated-out keys kept validating forever. Here the key
 * map is REPLACED on every successful fetch, unknown kids get a negative
 * cache, and fetches are rate-limited, so an attacker hammering with unknown
 * kids cannot turn the gateway into an outbound amplification vector.
 */

/** Pinned, exactly one algorithm. alg:none and HS256 are rejected before any key work. */
export const PINNED_ALG = 'RS256' as const;
const PINNED_KTY = 'RSA' as const;

/** Bounded clock skew for exp/nbf. Callers may lower it, never raise it. */
export const MAX_CLOCK_SKEW_SECONDS = 30;
const JWKS_MAX_BYTES = 1_048_576;

export class JwtRejectedError extends Error {
  override readonly name = 'JwtRejectedError';
  constructor(message: string) {
    super(message);
  }
}

export interface JwtClaims {
  readonly [claim: string]: unknown;
}

export interface JwtValidatorOptions {
  /** JWKS endpoint of the managed identity provider. Configuration, never user input. */
  readonly jwksUrl: string;
  /** Matched exactly — no substring, no prefix. */
  readonly issuer: string;
  readonly audience: string;
  /** Clock skew bound for exp/nbf. Clamped to MAX_CLOCK_SKEW_SECONDS. */
  readonly clockSkewSeconds?: number;
  /**
   * Minimum interval between JWKS fetches. With unknown-kid requests arriving
   * continuously, at most one fetch happens per interval — the rate limit
   * half of done-gate item 3.
   */
  readonly minFetchIntervalMs?: number;
  /** How long an unknown kid is remembered as absent before a retry is allowed. */
  readonly negativeCacheMs?: number;
}

export interface JwtValidator {
  /** Verifies signature, pinned algorithm, issuer, audience, exp and nbf. Throws JwtRejectedError; never returns partial claims. */
  verify(token: string): Promise<JwtClaims>;
  /** Number of JWKS HTTP fetches actually performed. Exposed for the tests and the report. */
  jwksFetchCount(): number;
}

interface JwksDocument {
  readonly keys: readonly { kid?: string; kty?: string; alg?: string }[];
}

export function createJwtValidator(options: JwtValidatorOptions): JwtValidator {
  const clockSkew = Math.min(
    nonNegativeInteger(options.clockSkewSeconds, MAX_CLOCK_SKEW_SECONDS, 'clockSkewSeconds'),
    MAX_CLOCK_SKEW_SECONDS,
  );
  const minFetchIntervalMs = positiveInteger(options.minFetchIntervalMs, 5_000, 'minFetchIntervalMs');
  const negativeCacheMs = positiveInteger(options.negativeCacheMs, 60_000, 'negativeCacheMs');

  let keys = new Map<string, CryptoKey>();
  let negativeUntil = new Map<string, number>();
  let lastFetchStarted = Number.NEGATIVE_INFINITY;
  let fetchCount = 0;
  let inflight: Promise<void> | null = null;

  async function verify(token: string): Promise<JwtClaims> {
    let header: { alg?: string; kid?: string };
    try {
      header = decodeProtectedHeader(token);
    } catch {
      throw new JwtRejectedError('Token is not a structurally valid JWT');
    }

    // Pin 1 — the header check. This is where alg:none and HS256-confusion
    // die before any key is touched.
    if (header.alg !== PINNED_ALG) {
      throw new JwtRejectedError(
        `Token algorithm is "${String(header.alg)}"; only ${PINNED_ALG} is accepted`,
      );
    }
    const kid = header.kid;
    if (kid === undefined || kid === '') {
      throw new JwtRejectedError('Token header carries no key id (kid)');
    }

    let key = keys.get(kid);
    if (key === undefined) {
      const blocked = negativeUntil.get(kid);
      if (blocked !== undefined && blocked > Date.now()) {
        throw new JwtRejectedError(
          `Unknown key id "${kid}" (negatively cached); no JWKS fetch attempted`,
        );
      }
      await loadKeys(kid);
      key = keys.get(kid);
      if (key === undefined) {
        negativeUntil.set(kid, Date.now() + negativeCacheMs);
        throw new JwtRejectedError(`Unknown key id "${kid}" after a JWKS refresh`);
      }
    }

    try {
      // Pin 3 — the verify call pins the algorithm again, so even a key
      // imported by some other path cannot be used with a different alg.
      const { payload } = await jwtVerify(token, key, {
        algorithms: [PINNED_ALG],
        issuer: options.issuer,
        audience: options.audience,
        clockTolerance: clockSkew,
      });
      return payload as JwtClaims;
    } catch (error) {
      throw new JwtRejectedError(`Token rejected: ${errorMessage(error)}`);
    }
  }

  /**
   * Rate-limited, deduplicated JWKS fetch. The key map is REPLACED on every
   * successful load — never merged — so a key rotated out at the provider
   * stops validating on this refresh, not eventually.
   */
  function loadKeys(kid: string): Promise<void> {
    if (inflight !== null) return inflight;

    const sinceLast = Date.now() - lastFetchStarted;
    if (sinceLast < minFetchIntervalMs) {
      // Rate limited: no fetch now, and this kid is remembered as absent
      // until the negative cache expires, so a burst of unknown kids does
      // not become a burst of outbound requests.
      negativeUntil.set(kid, Date.now() + negativeCacheMs);
      return Promise.resolve();
    }

    lastFetchStarted = Date.now();
    inflight = (async () => {
      try {
        const document = await fetchJwks(options.jwksUrl);
        const next = new Map<string, CryptoKey>();
        for (const jwk of document.keys) {
          // Pin 2 — the key-import filter. Only RSA keys are imported, and a
          // key that DECLARES an algorithm other than the pinned one is
          // rejected; a key with no alg claim is imported under the pinned
          // algorithm (importJWK's second argument), so it can never be used
          // with anything else. A hostile endpoint cannot slip in a key
          // usable with a different algorithm.
          if (jwk.kty !== PINNED_KTY) continue;
          if (jwk.alg !== undefined && jwk.alg !== PINNED_ALG) continue;
          if (jwk.kid === undefined || jwk.kid === '') continue;
          try {
            const imported = await importJWK(jwk as Record<string, string>, PINNED_ALG);
            if (imported instanceof Uint8Array) continue;
            next.set(jwk.kid, imported);
          } catch {
            // A malformed key in the document is skipped, not fatal.
          }
        }
        keys = next;
        negativeUntil = new Map();
      } finally {
        inflight = null;
      }
    })();

    return inflight;
  }

  async function fetchJwks(url: string): Promise<JwksDocument> {
    fetchCount += 1;
    let response: Response;
    try {
      response = await fetch(url, { headers: { accept: 'application/json' } });
    } catch (error) {
      throw new JwtRejectedError(`JWKS endpoint unreachable: ${errorMessage(error)}`);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new JwtRejectedError(`JWKS endpoint returned HTTP ${response.status}`);
    }
    const body = await readBounded(response);
    try {
      const parsed: unknown = JSON.parse(body);
      const document = parsed as JwksDocument;
      if (!Array.isArray(document.keys)) {
        throw new JwtRejectedError('JWKS document has no keys array');
      }
      return document;
    } catch (error) {
      if (error instanceof JwtRejectedError) throw error;
      throw new JwtRejectedError('JWKS document is not valid JSON');
    }
  }

  async function readBounded(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (reader === undefined) throw new JwtRejectedError('JWKS response has no body');
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      length += value.length;
      if (length > JWKS_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new JwtRejectedError('JWKS document exceeds the 1 MiB safety limit');
      }
      chunks.push(value);
    }
    const total = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      total.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(total);
  }

  return { verify, jwksFetchCount: () => fetchCount };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure';
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new JwtRejectedError(`${name} must be a positive integer`);
  }
  return resolved;
}

function nonNegativeInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new JwtRejectedError(`${name} must be a non-negative integer`);
  }
  return resolved;
}
