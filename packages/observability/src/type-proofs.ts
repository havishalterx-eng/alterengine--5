import type { ObservabilityRecord } from './schema.js';

/**
 * Compile-time proofs for Adversary findings 3 and 4.
 *
 * `@ts-expect-error` makes `pnpm build` FAIL if the error below ever stops
 * occurring. That is the point: the regression these guard against is silent
 * telemetry loss — a record that compiles, validates, and vanishes. If the
 * type system ever accepts these records again, the build is red, not blind.
 */

const tenantRecord: ObservabilityRecord = {
  schemaVersion: 1,
  kind: 'event',
  scope: 'tenant',
  runId: 'run-1',
  nodeId: 'node-1',
  component: '26',
  tenantId: 'tenant-1',
  name: 'model.call',
  payload: { prompt: 'hi' },
};

/**
 * Finding 3: a bigint cost payload must not typecheck. The old behaviour was
 * a runtime drop inside the sink's JSON.stringify — telemetry vanished and
 * the run looked fine. It must be a compile error instead. Cost is carried as
 * a decimal string of minor units; see the encoding decision in schema.ts.
 */
export const bigintCostRecord: ObservabilityRecord = {
  ...tenantRecord,
  // @ts-expect-error bigint cannot survive JSON serialisation and must not typecheck
  payload: { costMinorUnits: 17n },
};

/** Same rule: a symbol is not a JsonValue either. */
export const symbolPayloadRecord: ObservabilityRecord = {
  ...tenantRecord,
  // @ts-expect-error symbol cannot survive JSON serialisation and must not typecheck
  payload: { token: Symbol('secret') },
};

/**
 * Finding 4: a system record must not be able to name a run. The old
 * behaviour was `runId: 'system:worker'` — a fabricated run that Run Monitor
 * would have listed as real. The type has no such field, so naming one is a
 * compile error; the strict schema rejects it at runtime as well
 * (observability.test.ts, 'rejects a system record that names a runId').
 */
export const systemRecordWithRun: ObservabilityRecord = {
  schemaVersion: 1,
  kind: 'event',
  scope: 'system',
  component: '38',
  driver: 'audit-verifier-scheduler',
  name: 'audit.verification.tick.started',
  payload: {},
  // @ts-expect-error a system record carries driver identity, never run identity
  runId: 'system:worker',
};
