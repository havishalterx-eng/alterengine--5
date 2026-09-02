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
