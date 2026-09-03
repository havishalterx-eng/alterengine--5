import {
  AuditAlertSink,
  AuditChainVerifier,
  AuditStore,
} from '@alter/audit';
import { loadConfig } from '@alter/contracts';
import {
  createObserver,
  passThroughRedactor,
  type ObservabilityRecord,
} from '@alter/observability';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditRetentionSweeper } from './audit-retention-sweeper.js';
import { AuditVerifierScheduler } from './audit-verifier-scheduler.js';

let store: AuditStore;
let records: ObservabilityRecord[];

beforeAll(async () => {
  const config = worktreeConfig();
  store = new AuditStore({ connectionString: config.databaseUrl });
  await store.ensureSchema();
});

beforeEach(async () => {
  records = [];
  await store.pool.query('TRUNCATE audit_events, audit_alerts RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await store.close();
});

describe('worker observability wiring', () => {
  it('emits start and valid-finish records for a real audit verification tick', async () => {
    const scheduler = new AuditVerifierScheduler(
      new AuditChainVerifier(store),
      new AuditAlertSink(store.pool),
      recordingObserver(),
    );

    const result = await scheduler.tick();

    expect(result.valid).toBe(true);
    expect(records).toMatchObject([
      { name: 'audit.verification.tick.started', payload: {} },
      {
        name: 'audit.verification.tick.finished',
        payload: { durationMs: expect.any(Number), outcome: 'valid' },
      },
    ]);
  });

  it('emits start and finish records for a real retention sweep tick', async () => {
    const sweeper = new AuditRetentionSweeper(store, recordingObserver());

    const destroyed = await sweeper.tick();

    expect(destroyed).toBe(0);
    expect(records).toMatchObject([
      { name: 'audit.retention.tick.started', payload: {} },
      {
        name: 'audit.retention.tick.finished',
        payload: { destroyed: 0, durationMs: expect.any(Number), outcome: 'completed' },
      },
    ]);
  });

  it('keeps a real verification tick running when its observer sink fails', async () => {
    const sinkFailures: unknown[] = [];
    const observer = createObserver({
      sink: () => {
        throw new Error('deliberate sink outage');
      },
      redactor: passThroughRedactor,
      onSinkError: (error) => sinkFailures.push(error),
    });
    const scheduler = new AuditVerifierScheduler(
      new AuditChainVerifier(store),
      new AuditAlertSink(store.pool),
      observer,
    );

    const result = await scheduler.tick();

    expect(result.valid).toBe(true);
    expect(sinkFailures).toHaveLength(2);
  });

  it('emits an error record before propagating a verifier tick failure', async () => {
    const closedStore = new AuditStore({ connectionString: (worktreeConfig()).databaseUrl });
    await closedStore.ensureSchema();
    await closedStore.close();
    const scheduler = new AuditVerifierScheduler(
      new AuditChainVerifier(closedStore),
      new AuditAlertSink(closedStore.pool),
      recordingObserver(),
    );

    await expect(scheduler.tick()).rejects.toThrow();

    expect(records).toMatchObject([
      { name: 'audit.verification.tick.started', payload: {} },
      {
        name: 'audit.verification.tick.finished',
        payload: { durationMs: expect.any(Number), outcome: 'error' },
      },
    ]);
  });

  it('emits an error record before propagating a retention tick failure', async () => {
    const closedStore = new AuditStore({ connectionString: (worktreeConfig()).databaseUrl });
    await closedStore.ensureSchema();
    await closedStore.close();
    const sweeper = new AuditRetentionSweeper(closedStore, recordingObserver());

    await expect(sweeper.tick()).rejects.toThrow();

    expect(records).toMatchObject([
      { name: 'audit.retention.tick.started', payload: {} },
      {
        name: 'audit.retention.tick.finished',
        payload: { durationMs: expect.any(Number), outcome: 'error' },
      },
    ]);
  });
});

function recordingObserver() {
  return createObserver({
    sink: (record) => {
      records.push(record);
    },
    redactor: passThroughRedactor,
  });
}

/**
 * Configuration for this test.
 *
 * Reads the environment, never the .env file. vitest.config.ts already loads
 * .env into the test environment when one exists, and CI exports the same
 * variables directly with no file present.
 *
 * A test that opens .env itself passes locally and fails in CI. That exact
 * bug was fixed once in registry.test.ts and reappeared here, because
 * nothing prevented it -- so it is now also a gate.
 */
function worktreeConfig() {
  return loadConfig(process.env);
}
