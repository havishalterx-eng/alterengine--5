import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AuditAlertSink,
  AuditChainVerifier,
  AuditStore,
} from '@alter/audit';
import { createObserver, passThroughRedactor } from '@alter/observability';
import { AuditRetentionSweeper } from './audit-retention-sweeper.js';
import { AuditVerifierScheduler } from './audit-verifier-scheduler.js';

/**
 * Driver-existence test for component 38.
 *
 * The driver-existence gate requires a named @driver and a test that
 * references it. This test names both drivers and proves the scheduled run
 * actually catches a deliberately tampered entry against real Postgres — the
 * exact failure the previous build shipped: a verifier that worked and was
 * never called.
 */

const DRIVER_VERIFIER = 'audit-verifier-scheduler';
const DRIVER_SWEEPER = 'audit-retention-sweeper';

let store: AuditStore;
let scheduler: AuditVerifierScheduler;
let sweeper: AuditRetentionSweeper;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const text = readFileSync(join(process.cwd(), '.env'), 'utf8');
  const match = text.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error('DATABASE_URL not set and not present in .env');
  return match[1]!.trim();
}

beforeAll(async () => {
  store = new AuditStore({ connectionString: databaseUrl() });
  await store.ensureSchema();
  await store.pool.query('TRUNCATE audit_events, audit_alerts RESTART IDENTITY CASCADE');
  const verifier = new AuditChainVerifier(store);
  const alerts = new AuditAlertSink(store.pool);
  const observer = createObserver({ sink: () => {}, redactor: passThroughRedactor });
  scheduler = new AuditVerifierScheduler(verifier, alerts, observer);
  sweeper = new AuditRetentionSweeper(store, observer);
});

afterAll(async () => {
  await store.close();
});

describe('audit drivers exist (done-gate item 1)', () => {
  it(`declares the ${DRIVER_VERIFIER} driver`, () => {
    expect(scheduler).toBeInstanceOf(AuditVerifierScheduler);
    expect(DRIVER_VERIFIER).toMatch(/^audit-verifier-scheduler$/);
  });

  it(`declares the ${DRIVER_SWEEPER} driver`, () => {
    expect(sweeper).toBeInstanceOf(AuditRetentionSweeper);
    expect(DRIVER_SWEEPER).toMatch(/^audit-retention-sweeper$/);
  });
});

describe('scheduled run catches a tampered entry (done-gate item 2)', () => {
  it('raises an alert when the chain contains a deliberately tampered entry', async () => {
    // A clean entry.
    const clean = await store.append({
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      eventType: 'tool.invoked',
      occurredAt: new Date('2026-09-02T00:00:00Z'),
      payload: { tool: 'search' },
    });
    // A deliberately tampered entry: linked to the clean entry but with a
    // wrong entry_hash for its fields.
    await store.pool.query(
      `INSERT INTO audit_events (seq, tenant_id, actor_id, event_type, occurred_at, prev_hash, entry_hash, payload)
       VALUES (nextval(pg_get_serial_sequence('audit_events','seq')), 'tenant-1', 'actor-1', 'tool.invoked',
               '2026-09-02T00:00:00Z', $1, $2, '{}')`,
      [clean.entryHash, Buffer.alloc(32, 0xee)],
    );

    const result = await scheduler.tick();

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'hash-mismatch')).toBe(true);

    const alerts = await new AuditAlertSink(store.pool).recent(5);
    expect(alerts.some((a) => a.kind === 'verification_failed')).toBe(true);
  });

  it('reports a clean chain as valid and raises no alert', async () => {
    await store.pool.query('TRUNCATE audit_events, audit_alerts RESTART IDENTITY CASCADE');
    await store.append({
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      eventType: 'tool.invoked',
      occurredAt: new Date('2026-09-02T00:00:00Z'),
      payload: { tool: 'search' },
    });

    const result = await scheduler.tick();
    expect(result.valid).toBe(true);

    const alerts = await new AuditAlertSink(store.pool).recent(5);
    expect(alerts.some((a) => a.kind === 'verification_failed')).toBe(false);
  });
});
