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
 * A string carries the exact integer; Cost Ledger parses it back with
 * `BigInt()`. Never emit cost as bigint or float.
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
 * A value is JSON-safe if JSON.stringify cannot mangle or drop it:
 * bigint, symbol, function, undefined, non-finite numbers and cycles are not.
 * Cycles are tracked with a seen-set, so a circular payload is reported as a
 * validation failure instead of overflowing the stack.
 */
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
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.every((child) => isJsonSafe(child, nextSeen));
}

const jsonSafePayload = z
  .record(z.string(), z.unknown())
  .superRefine((payload, ctx) => {
    for (const [key, value] of Object.entries(payload)) {
      if (!isJsonSafe(value, new Set())) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message:
            `payload.${key} cannot survive JSON serialisation ` +
            '(bigint, symbol, function, undefined, non-finite number, or cycle)',
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
