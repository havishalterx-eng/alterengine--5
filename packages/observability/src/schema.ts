import { z } from 'zod';

/**
 * Component 36 — Observability.
 *
 * One typed, versioned record shape for both events and spans. The version is
 * a literal in the schema, so a producer emitting version 2 while the library
 * speaks version 1 fails validation rather than silently drifting.
 */

export const OBSERVABILITY_SCHEMA_VERSION = 1;

/**
 * Who a record belongs to.
 *
 * `tenant` records carry a real tenant id. `system` records — a scheduled
 * sweep, a boot, anything the engine does for itself — belong to no tenant.
 *
 * The first consumer had to write `tenantId: 'system'` because the schema
 * demanded a non-empty string and offered nowhere else to put it. That magic
 * value was already hardcoded in two files. It would have spread, a query
 * filtering by tenant would silently have matched system records, and a
 * tenant genuinely named "system" would have collided with them.
 *
 * Making the distinction structural means a consumer cannot express it
 * ambiguously, and a filter cannot get it wrong by accident.
 */
export const SYSTEM_TENANT = 'system' as const;

export const observabilityAttribution = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('tenant'),
    /** Phase-1 gate 2: attribution is structural, enforced, not defaulted. */
    runId: z.string().min(1),
    nodeId: z.string().min(1),
    component: z.string().min(1),
    tenantId: z.string().min(1),
  }),
  z.object({
    scope: z.literal('system'),
    runId: z.string().min(1),
    nodeId: z.string().min(1),
    component: z.string().min(1),
    /** Fixed by the type. A system record cannot claim a tenant. */
    tenantId: z.literal(SYSTEM_TENANT),
  }),
]);

export const observabilityRecordSchema = z
  .object({
    schemaVersion: z.literal(OBSERVABILITY_SCHEMA_VERSION),
    kind: z.enum(['event', 'span']),
    name: z.string().min(1),
    /** Payloads are always objects; a raw string is rejected at the boundary. */
    payload: z.record(z.string(), z.unknown()),
  })
  .and(observabilityAttribution);

export type ObservabilityRecord = z.infer<typeof observabilityRecordSchema>;
