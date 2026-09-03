import { loadConfig } from '@alter/contracts';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildCostEventKey,
  CostNotFoundError,
  createCostLedger,
  parseMinorUnits,
  VerdictConflictError,
  type CostEvent,
} from './ledger.js';

/**
 * Cost Ledger integration tests — real Postgres, alter_builder_c.
 *
 * Phase 1 done-gate halves (PHASE-1-SCOPE.md): no float in the cost path,
 * duplicates never double-count (sequential AND concurrent), verdict column
 * from the first migration.
 *
 * Fix B adds: the verdict lifecycle (record now, attach later — the exact
 * ordering Phase 2 needs), the canonical idempotency-key builder, and the
 * single-rounding scaled-integer price parser.
 */

const runId = `run-${crypto.randomUUID()}`;
let databaseUrl: string;
let ledger: ReturnType<typeof createCostLedger>;

function event(overrides: Partial<CostEvent> = {}): CostEvent {
  return {
    billableCostMinorUnits: 99n,
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
    workflowId: 'workflow-1',
    ...overrides,
  };
}

beforeAll(async () => {
  databaseUrl = configuredDatabaseUrl();
  ledger = createCostLedger({ databaseUrl });
  await ledger.migrate();
});

afterAll(async () => {
  await ledger?.close();
});

describe('idempotency (done gate 2)', () => {
  it('does not double-count duplicate events against real Postgres', async () => {
    const first = await ledger.record(event());
    const second = await ledger.record(event());

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(await ledger.totalInternalCostForRun(runId)).toBe(125n);
  });

  it('does not double-count under concurrency, not merely in sequence', async () => {
    // The guarantee comes from the unique index plus ON CONFLICT DO NOTHING,
    // so this proves the database enforces it rather than the application
    // checking first and then writing.
    const concurrentRunId = `run-concurrent-${crypto.randomUUID()}`;
    const concurrentEvent = event({ runId: concurrentRunId, internalCostMinorUnits: 70n });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => ledger.record(concurrentEvent)),
    );

    // Exactly one writer may insert, no matter how they interleave.
    expect(results.filter((result) => result.inserted)).toHaveLength(1);
    expect(await ledger.totalInternalCostForRun(concurrentRunId)).toBe(70n);
  });
});

describe('the canonical idempotency key (Fix B, finding 2)', () => {
  it('is derived from full event identity — same call, same key, every time', () => {
    expect(buildCostEventKey(event())).toBe(buildCostEventKey(event()));
  });

  it('separates genuinely distinct attempts — retry and recovery count', () => {
    const base = event();
    const keys = new Set([
      buildCostEventKey(base),
      buildCostEventKey(event({ retryAttempt: 1n })),
      buildCostEventKey(event({ recoveryAttempt: 1n })),
      buildCostEventKey(event({ nodeId: 'node-2' })),
      buildCostEventKey(event({ model: 'model-other' })),
    ]);
    expect(keys.size).toBe(5);
  });

  it('is the key the ledger actually inserts under', async () => {
    const keyRunId = `run-key-${crypto.randomUUID()}`;
    const result = await ledger.record(event({ runId: keyRunId }));
    expect(result.idempotencyKey).toBe(
      buildCostEventKey(event({ runId: keyRunId })),
    );
  });
});

describe('the verdict lifecycle (Fix B, finding 2)', () => {
  it('records a cost with no verdict, attaches one later, and reads it back', async () => {
    // The exact Phase 2 ordering: Model Gateway records the cost when the
    // call completes; Verification attaches the verdict afterwards. Contract
    // 43's verified-run billing is only claimable if this works.
    const verdictRunId = `run-verdict-${crypto.randomUUID()}`;
    const { idempotencyKey } = await ledger.record(event({ runId: verdictRunId }));

    expect(await persistedVerdict(idempotencyKey)).toBeNull();

    await ledger.attachVerdict({ idempotencyKey, verdict: 'passed' });

    expect(await persistedVerdict(idempotencyKey)).toBe('passed');
  });

  it('fails loudly when the verdict targets a cost that does not exist', async () => {
    const missing = buildCostEventKey(
      event({ runId: `run-never-recorded-${crypto.randomUUID()}` }),
    );
    await expect(
      ledger.attachVerdict({ idempotencyKey: missing, verdict: 'passed' }),
    ).rejects.toThrow(CostNotFoundError);
    // And it did not silently create a row to attach to.
    expect(await persistedVerdict(missing)).toBe('no-row');
  });

  it('is idempotent for the same verdict and terminal against a different one', async () => {
    const terminalRunId = `run-terminal-${crypto.randomUUID()}`;
    const { idempotencyKey } = await ledger.record(event({ runId: terminalRunId }));

    await ledger.attachVerdict({ idempotencyKey, verdict: 'passed' });
    // Replay of the same verdict (retry after a network blip) succeeds.
    await expect(
      ledger.attachVerdict({ idempotencyKey, verdict: 'passed' }),
    ).resolves.toBeUndefined();
    // A different verdict on a verdicted cost is refused, loudly.
    await expect(
      ledger.attachVerdict({ idempotencyKey, verdict: 'failed' }),
    ).rejects.toThrow(VerdictConflictError);
    expect(await persistedVerdict(idempotencyKey)).toBe('passed');
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

describe('parseMinorUnits — the single rounding point (Fix B, finding 2)', () => {
  it.each([
    ['12.5', 12_500_000n],
    ['17', 17_000_000n],
    ['0.000123', 123n],
    ['0.0000009', 1n],
    ['0.0000005', 1n],
    ['0.0000004', 0n],
    ['-0.26', -260_000n],
    ['0', 0n],
  ])('parses %s to exactly %s micro-units', (price, expected) => {
    expect(parseMinorUnits(price)).toBe(expected);
  });

  it.each([
    ['1e5'],
    [''],
    ['1.2.3'],
    ['.5'],
    ['5.'],
    ['abc'],
    ['+5'],
    ['0x10'],
  ])('rejects a non-plain-decimal price: %s', (price) => {
    expect(() => parseMinorUnits(price)).toThrow('Not a plain decimal price');
  });
});

// One path. See audit-driver.test.ts for why the .env fallback is gone.
function configuredDatabaseUrl(): string {
  return loadConfig(process.env).databaseUrl;
}

async function persistedVerdict(key: string): Promise<string | null | 'no-row'> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ verification_verdict: string | null }>(
      'select verification_verdict from cost_ledger_entries where idempotency_key = $1',
      [key],
    );
    if (result.rows.length === 0) return 'no-row';
    return result.rows[0]?.verification_verdict ?? null;
  } finally {
    await client.end();
  }
}
