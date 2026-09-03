import { readFile } from 'node:fs/promises';
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
  const config = loadConfig(await worktreeEnvironment());
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
    const closedStore = new AuditStore({ connectionString: (await worktreeConfig()).databaseUrl });
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
    const closedStore = new AuditStore({ connectionString: (await worktreeConfig()).databaseUrl });
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

async function worktreeConfig() {
  return loadConfig(await worktreeEnvironment());
}

async function worktreeEnvironment(): Promise<Readonly<Record<string, string | undefined>>> {
  const file = await readFile('.env', 'utf8');
  const environment: Record<string, string | undefined> = {};
  for (const line of file.split('\n')) {
    if (line.length === 0 || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    environment[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return environment;
}
