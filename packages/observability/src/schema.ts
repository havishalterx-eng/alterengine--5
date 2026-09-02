import { z } from 'zod';

/**
 * Component 36 — Observability.
 *
 * One typed, versioned record shape for both events and spans. The version is
 * a literal in the schema, so a producer emitting version 2 while the library
 * speaks version 1 fails validation rather than silently drifting.
 */

export const OBSERVABILITY_SCHEMA_VERSION = 1;

export const observabilityAttribution = z.object({
  /** Phase-1 gate 2: attribution is structural, enforced, not defaulted. */
  runId: z.string().min(1),
  nodeId: z.string().min(1),
  component: z.string().min(1),
  tenantId: z.string().min(1),
});

export const observabilityRecordSchema = z.object({
  schemaVersion: z.literal(OBSERVABILITY_SCHEMA_VERSION),
  kind: z.enum(['event', 'span']),
  name: z.string().min(1),
  /** Payloads are always objects; a raw string is rejected at the boundary. */
  payload: z.record(z.string(), z.unknown()),
  ...observabilityAttribution.shape,
});

export type ObservabilityRecord = z.infer<typeof observabilityRecordSchema>;
