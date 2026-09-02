import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCostLedger } from './ledger.js';

const idempotencyKey = `cost-ledger-${crypto.randomUUID()}`;
const runId = `run-${crypto.randomUUID()}`;
let databaseUrl: string;
let ledger: ReturnType<typeof createCostLedger>;

beforeAll(async () => {
  databaseUrl = await configuredDatabaseUrl();
  ledger = createCostLedger({ databaseUrl });
  await ledger.migrate();
});

afterAll(async () => {
  await ledger?.close();
});

describe('Cost Ledger', () => {
  it('does not double-count duplicate idempotency keys against real Postgres', async () => {
    const event = {
      billableCostMinorUnits: 99n,
      idempotencyKey,
      internalCostMinorUnits: 125n,
      marginMinorUnits: -26n,
      model: 'model-test',
      nodeId: 'node-1',
      provider: 'provider-test',
      recoveryAttempt: 0n,
      retryAttempt: 0n,
      runId,
      sandboxComputeMinorUnits: 0n,
      storageMinorUnits: 0n,
      tenantId: 'tenant-1',
      toolName: 'tool-test',
      verificationVerdict: null,
      workflowId: 'workflow-1',
    };

    const first = await ledger.record(event);
    const second = await ledger.record(event);

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(await ledger.totalInternalCostForRun(runId)).toBe(125n);
    expect(await persistedVerdict(databaseUrl, idempotencyKey)).toBeNull();
  });

  it('does not double-count under concurrency, not merely in sequence', async () => {
    // The Adversary noted the test above only proves the sequential case. Two
    // simultaneous writers with the same key are the case that actually
    // happens: a retry racing the original, or two workers claiming one run.
    // The guarantee comes from the unique index plus ON CONFLICT DO NOTHING,
    // so this proves the database enforces it rather than the application
    // checking first and then writing.
    const concurrentKey = `cost-ledger-concurrent-${crypto.randomUUID()}`;
    const concurrentRunId = `run-concurrent-${crypto.randomUUID()}`;
    const event = {
      billableCostMinorUnits: 50n,
      idempotencyKey: concurrentKey,
      internalCostMinorUnits: 70n,
      marginMinorUnits: -20n,
      model: 'model-test',
      nodeId: 'node-1',
      provider: 'provider-test',
      recoveryAttempt: 0n,
      retryAttempt: 0n,
      runId: concurrentRunId,
      sandboxComputeMinorUnits: 0n,
      storageMinorUnits: 0n,
      tenantId: 'tenant-1',
      toolName: 'tool-test',
      verificationVerdict: null,
      workflowId: 'workflow-1',
    };

    const WRITERS = 8;
    const results = await Promise.all(
      Array.from({ length: WRITERS }, () => ledger.record(event)),
    );

    // Exactly one writer may insert, no matter how they interleave.
    expect(results.filter((result) => result.inserted)).toHaveLength(1);
    expect(await ledger.totalInternalCostForRun(concurrentRunId)).toBe(70n);
  });

  it('creates a nullable verification verdict column from the first migration', async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const result = await client.query<{ is_nullable: string }>(
        "select is_nullable from information_schema.columns where table_name = 'cost_ledger_entries' and column_name = 'verification_verdict'",
      );
      expect(result.rows).toEqual([{ is_nullable: 'YES' }]);
    } finally {
      await client.end();
    }
  });
});

async function configuredDatabaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL !== undefined && process.env.DATABASE_URL !== '') {
    return process.env.DATABASE_URL;
  }

  const env = await readFile('.env', 'utf8');
  const line = env.split('\n').find((candidate) => candidate.startsWith('DATABASE_URL='));
  if (line === undefined) throw new Error('DATABASE_URL is required for real Cost Ledger tests');
  return line.slice('DATABASE_URL='.length);
}

async function persistedVerdict(url: string, key: string): Promise<string | null> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<{ verification_verdict: string | null }>(
      'select verification_verdict from cost_ledger_entries where idempotency_key = $1',
      [key],
    );
    return result.rows[0]?.verification_verdict ?? null;
  } finally {
    await client.end();
  }
}
