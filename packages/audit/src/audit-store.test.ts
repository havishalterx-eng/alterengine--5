import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { GENESIS_HASH } from './hash.js';
import { createAuditHarness, type AuditHarness } from './test-helpers.js';

let h: AuditHarness;

beforeAll(async () => {
  h = await createAuditHarness();
});

beforeEach(async () => {
  await h.pool.query('TRUNCATE audit_events, audit_alerts RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await h.close();
});

/** Runs a block inside a transaction with the minimization flag set. */
async function withMinimization(
  pool: Pool,
  fn: (client: PoolClient) => Promise<unknown>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL alter.allow_audit_minimization = 'on'");
    await fn(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function event(overrides: Partial<{ tenantId: string; actorId: string; eventType: string; payload: unknown }> = {}) {
  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    actorId: overrides.actorId ?? 'actor-1',
    eventType: overrides.eventType ?? 'tool.invoked',
    occurredAt: new Date('2026-09-02T00:00:00Z'),
    payload: overrides.payload ?? { tool: 'search', query: 'x' },
  };
}

describe('audit chain linkage', () => {
  it('first entry links to the genesis hash; each entry links to its predecessor', async () => {
    const a = await h.store.append(event());
    const b = await h.store.append(event({ eventType: 'tool.denied' }));

    expect(a.prevHash.equals(GENESIS_HASH)).toBe(true);
    expect(b.prevHash.equals(a.entryHash)).toBe(true);
    expect(a.entryHash.length).toBe(32);
    expect(b.entryHash.length).toBe(32);
  });

  it('a forked chain is impossible at the database: two entries cannot claim the same predecessor', async () => {
    const a = await h.store.append(event());
    // Attempt to insert a second entry claiming the same predecessor.
    await expect(
      h.pool.query(
        `INSERT INTO audit_events (seq, tenant_id, actor_id, event_type, occurred_at, prev_hash, entry_hash, payload)
         VALUES (nextval(pg_get_serial_sequence('audit_events','seq')), 'tenant-1', 'actor-1', 'tool.invoked',
                 '2026-09-02T00:00:00Z', $1, $2, '{}')`,
        [a.prevHash, Buffer.alloc(32, 1)],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});

describe('immutability (done-gate item 4)', () => {
  it('a direct UPDATE is rejected by the trigger', async () => {
    const a = await h.store.append(event());
    await expect(
      h.pool.query('UPDATE audit_events SET event_type = $1 WHERE seq = $2', [
        'tampered',
        a.seq,
      ]),
    ).rejects.toThrow(/append-only/i);
  });

  it('a direct DELETE is rejected by the trigger', async () => {
    const a = await h.store.append(event());
    await expect(
      h.pool.query('DELETE FROM audit_events WHERE seq = $1', [a.seq]),
    ).rejects.toThrow(/append-only/i);
  });

  it('even with the minimization flag, history columns cannot be rewritten', async () => {
    const a = await h.store.append(event());
    await expect(
      withMinimization(h.pool, (client) =>
        client.query('UPDATE audit_events SET actor_id = $1 WHERE seq = $2', [
          'attacker',
          a.seq,
        ]),
      ),
    ).rejects.toThrow(/history columns are immutable/i);
  });
});

describe('minimization (done-gate item 5a, Section 18)', () => {
  it('strips payloads to an event skeleton and schedules destruction', async () => {
    await h.store.append(event({ tenantId: 'tenant-min', payload: { secret: 'content' } }));
    await h.store.append(event({ tenantId: 'tenant-min', payload: { secret: 'more' } }));

    const minimized = await h.store.minimizeForAccountDeletion('tenant-min');
    expect(minimized).toBe(2);

    const rows = await h.store.readForTenant('tenant-min');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.payload).toBeNull();
      expect(row.retentionUntil).not.toBeNull();
      // Skeleton survives: what happened, when, under which identifier.
      expect(row.eventType).toBeTruthy();
      expect(row.actorId).toBeTruthy();
      expect(row.occurredAt).toBeInstanceOf(Date);
    }
  });

  it('does not touch other tenants', async () => {
    await h.store.append(event({ tenantId: 'tenant-a', payload: { keep: true } }));
    await h.store.append(event({ tenantId: 'tenant-b', payload: { keep: true } }));

    await h.store.minimizeForAccountDeletion('tenant-a');

    const b = await h.store.readForTenant('tenant-b');
    expect(b[0]!.payload).toEqual({ keep: true });
    expect(b[0]!.retentionUntil).toBeNull();
  });
});

describe('scheduled destruction (done-gate item 5b, scheduled half)', () => {
  it('destroys only expired minimized skeletons', async () => {
    // A minimized skeleton with an already-expired window.
    await withMinimization(h.pool, (client) =>
      client.query(
        `INSERT INTO audit_events (seq, tenant_id, actor_id, event_type, occurred_at, prev_hash, entry_hash, payload, retention_until)
         VALUES (nextval(pg_get_serial_sequence('audit_events','seq')), 'tenant-exp', 'actor', 'tool.invoked',
                 '2026-09-02T00:00:00Z', $1, $2, NULL, now() - interval '1 day')`,
        [GENESIS_HASH, Buffer.alloc(32, 2)],
      ),
    );
    // A live (unminimized) row that must survive.
    await h.store.append(event({ tenantId: 'tenant-live' }));

    const destroyed = await h.store.destroyExpiredSkeletons();
    expect(destroyed).toBe(1);

    const remaining = await h.store.readAll();
    expect(remaining.some((r) => r.tenantId === 'tenant-live')).toBe(true);
    expect(remaining.some((r) => r.tenantId === 'tenant-exp')).toBe(false);
  });

  it('cannot destroy a live or unexpired row even with the flag', async () => {
    const a = await h.store.append(event({ tenantId: 'tenant-live2' }));
    await expect(
      withMinimization(h.pool, (client) =>
        client.query('DELETE FROM audit_events WHERE seq = $1', [a.seq]),
      ),
    ).rejects.toThrow(/only expired minimized skeletons/i);
  });
});
