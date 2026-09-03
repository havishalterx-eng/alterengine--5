import { z } from 'zod';
import type { JsonObject } from '@alter/safety';

/**
 * Component 36 — Observability.
 *
 * One typed, versioned record shape for both events and spans. The version is
 * a literal in the schema, so a producer emitting version 2 while the library
 * speaks version 1 fails validation rather than silently drifting.
 */

export const OBSERVABILITY_SCHEMA_VERSION = 1;

/**
  * Cost encoding decision (Adversary finding 3): cost is carried as a decimal
  * STRING of minor units, e.g. `costMinorUnits: '17000'`.
  *
  * Why: JSON has no bigint, a number loses integer precision past 2^53 minor
  * units, and telemetry must survive `JSON.stringify` without a runtime drop.
  * A string carries the exact integer. Never emit cost as bigint or float.
  *
  * No consumer parses this back yet. Model Gateway, the real reader, arrives
  * in Phase 2; until then the encoding's only proof is the round-trip test
  * in observability.test.ts, which shows the string format is reversible
  * (17n emits '17', BigInt('17') is exact). That test documents the encoding
  * decision — it does not exercise emit() or the sink.
  */

export interface TenantAttribution {
  readonly scope: 'tenant';
  /** Phase-1 gate 2: attribution is structural, enforced, not defaulted. */
  readonly runId: string;
  readonly nodeId: string;
  readonly component: string;
  readonly tenantId: string;
}

/**
 * A system record — a scheduled sweep, a boot, anything the engine does for
 * itself — carries PROCESS OR DRIVER IDENTITY, never run identity.
 *
 * Adversary finding 4: the first consumers fabricated `runId: 'system:worker'`
 * because the schema demanded a run id and offered nowhere else to put it. Run
 * Monitor would have listed those as real runs. A system record structurally
 * cannot name a runId, nodeId, or tenantId — the fields do not exist on this
 * type, and the zod branch is strict, so smuggling one in is rejected at the
 * boundary too.
 */
export interface SystemAttribution {
  readonly scope: 'system';
  readonly component: string;
  /** Names the driver or process, matching its @driver tag where it has one. */
  readonly driver: string;
}

export type ObservabilityAttribution = TenantAttribution | SystemAttribution;

interface ObservabilityRecordBase {
  readonly schemaVersion: typeof OBSERVABILITY_SCHEMA_VERSION;
  readonly kind: 'event' | 'span';
  readonly name: string;
  /**
   * Payloads are JSON-safe by TYPE, not by hope (Adversary finding 3): the
   * value type excludes bigint, undefined, functions, symbols and anything
   * else that cannot survive serialisation. A record carrying one does not
   * typecheck — silent telemetry loss becomes a compile error. The zod layer
   * below enforces the same rule at runtime for dynamically-built payloads,
   * including cycles, which the type level cannot see.
   */
  readonly payload: JsonObject;
}

export type ObservabilityRecord = ObservabilityRecordBase & ObservabilityAttribution;

/**
 * A value is JSON-safe if JSON.stringify cannot mangle, drop, or throw on it.
 *
 * REPLACED, not patched (PR #5 round 3): the previous validator walked values
 * with Object.values() and .every(), which are built to iterate normal data,
 * not to certify that nothing abnormal is present. Each review round found
 * another shape they skip — Map, then Symbol keys, sparse arrays, extra array
 * properties, throwing getters. This version never asks a convenience method
 * whether a shape looks fine. It walks every own key with Reflect.ownKeys and
 * Object.getOwnPropertyDescriptor, and NEVER reads a property until its
 * descriptor has been confirmed to be a plain enumerable data property with
 * no get/set — so a getter cannot run, and invisible keys cannot hide.
 *
 * Correct by construction, not by accumulated test case:
 *   - primitives: string, finite number, boolean, null are safe
 *   - undefined, bigint, symbol, function are unsafe
 *   - arrays: exactly the indices 0..length-1 plus 'length' in own keys —
 *     no holes, no extra properties, no symbol keys; every index a plain
 *     enumerable data property
 *   - plain objects: prototype Object.prototype or null, no symbol keys,
 *     every own key a plain enumerable data property
 *   - anything else (Map, Set, Date, class instance, boxed primitive,
 *     typed array, ...) is unsafe by falling through, not by enumeration
 *
 * After a descriptor is confirmed plain data, the live property is read once
 * and compared with descriptor.value. On a real object a plain data property
 * read cannot run code, so this violates nothing — but on a Proxy the read
 * goes through the get trap, and a trap that lies or throws diverges from the
 * descriptor and is rejected. A Proxy with NO traps is indistinguishable from
 * its target by ECMAScript design and serialises identically to it, so it
 * passes — the dangerous proxies are the divergent ones, and those are caught.
 *
 * This deliberately REJECTS values JSON.stringify can handle, like Date (it
 * stringifies to ISO form). Parity with the type level is the rule: JsonObject
 * has no Date, so a dynamically-built record carrying one is a validation
 * failure, not a silent conversion. A producer who wants an ISO timestamp
 * encodes it as a string.
 *
 * Cycles are tracked with a seen-set, so a circular payload is reported as a
 * validation failure instead of overflowing the stack.
 */
function isPlainEnumerableDataProperty(
  descriptor: PropertyDescriptor | undefined,
): boolean {
  return (
    descriptor !== undefined &&
    descriptor.get === undefined &&
    descriptor.set === undefined &&
    descriptor.enumerable === true &&
    'value' in descriptor
  );
}

/** A canonical array index: "0", "1", ... — not "01", not "-1", not "1e2". */
function isCanonicalIndex(key: string, length: number): boolean {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) return false;
  return Number(key) < length;
}

function isJsonSafe(value: unknown, seen: ReadonlySet<object>): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (
    value === undefined ||
    typeof value === 'bigint' ||
    typeof value === 'symbol' ||
    typeof value === 'function'
  ) {
    return false;
  }
  if (typeof value !== 'object') {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  const nextSeen = new Set(seen);
  nextSeen.add(value);
  return Array.isArray(value)
    ? isArrayShapeSafe(value, nextSeen)
    : isPlainObjectShapeSafe(value, nextSeen);
}

/**
 * An array is safe only if its own keys are exactly 0..length-1 plus
 * 'length'. A hole is an index within length that is NOT an own key (a sparse
 * array would serialize it as null); an extra key like arr.hidden would be
 * silently dropped; a symbol key is invisible to JSON. Every index must be a
 * plain enumerable data property, read live only after its descriptor is
 * confirmed (Proxy divergence check — see the walkthrough above).
 */
function isArrayShapeSafe(
  value: readonly unknown[],
  seen: ReadonlySet<object>,
): boolean {
  const length = value.length;
  const indexKeys = new Set<string>();

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') return false;
    if (key === 'length') continue;
    if (!isCanonicalIndex(key, length)) return false;
    indexKeys.add(key);
  }

  if (indexKeys.size !== length) return false;

  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!isPlainEnumerableDataProperty(descriptor)) return false;
    if (!Object.is(value[index], descriptor?.value)) return false;
    if (!isJsonSafe(descriptor?.value, seen)) return false;
  }
  return true;
}

/**
 * A plain object is safe only if its prototype is Object.prototype or null
 * (not a Map, a Set, a class instance, anything custom), it has no symbol
 * keys (JSON cannot carry them), and every own key is a plain enumerable data
 * property — read live only after the descriptor is confirmed.
 */
function isPlainObjectShapeSafe(
  value: object,
  seen: ReadonlySet<object>,
): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!isPlainEnumerableDataProperty(descriptor)) return false;
    // Live read AFTER the descriptor is confirmed plain data: on a real
    // object this cannot run code; on a Proxy it pierces the get trap.
    if (!Object.is(Reflect.get(value, key), descriptor?.value)) return false;
    if (!isJsonSafe(descriptor?.value, seen)) return false;
  }
  return true;
}

const jsonSafePayload = z
  .record(z.string(), z.unknown())
  .superRefine((payload, ctx) => {
    for (const [key, value] of Object.entries(payload)) {
      // The walk itself must not be able to crash emit(): a Proxy trap that
      // throws during Reflect.ownKeys or the post-descriptor live read turns
      // into a validation failure, never an exception escaping safeParse.
      let safe: boolean;
      try {
        safe = isJsonSafe(value, new Set());
      } catch {
        safe = false;
      }
      if (!safe) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message:
            `payload.${key} cannot survive JSON serialisation ` +
            '(bigint, symbol, function, undefined, non-finite number, cycle, ' +
            'or a non-plain object such as Map, Set, Date or a class instance)',
        });
      }
    }
  });

/**
 * Strict on both branches: a system record naming a runId is a validation
 * failure, not an extra key silently stripped.
 */
export const observabilityAttribution = z.discriminatedUnion('scope', [
  z.strictObject({
    scope: z.literal('tenant'),
    runId: z.string().min(1),
    nodeId: z.string().min(1),
    component: z.string().min(1),
    tenantId: z.string().min(1),
  }),
  z.strictObject({
    scope: z.literal('system'),
    component: z.string().min(1),
    driver: z.string().min(1),
  }),
]);

export const observabilityRecordSchema = z
  .strictObject({
    schemaVersion: z.literal(OBSERVABILITY_SCHEMA_VERSION),
    kind: z.enum(['event', 'span']),
    name: z.string().min(1),
    payload: jsonSafePayload,
  })
  .and(observabilityAttribution);
