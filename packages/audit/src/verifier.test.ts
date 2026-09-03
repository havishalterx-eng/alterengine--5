import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuditEvent } from './audit-store.js';
import { computeEntryHash, GENESIS_HASH } from './hash.js';
import { createAuditHarness, type AuditHarness } from './test-helpers.js';
import { verifyEvents } from './verifier.js';

let h: AuditHarness;
/** Set only when beforeAll succeeded; afterAll must not TypeError when it did not. */
let hReady = false;

beforeAll(async () => {
  h = await createAuditHarness();
  hReady = true;
});

afterAll(async () => {
  // Missing configuration already fails the run once, clearly, at loadConfig;
  // teardown must not add a TypeError on a harness that was never created.
  // Same pattern as the worker driver tests.
  if (hReady) await h.close();
});

beforeEach(async () => {
  await h.pool.query('TRUNCATE audit_events, audit_alerts RESTART IDENTITY CASCADE');
});

function makeEvent(
  seq: number,
  prevHash: Buffer,
  overrides: Partial<Pick<AuditEvent, 'tenantId' | 'actorId' | 'eventType' | 'payload'>> = {},
): AuditEvent {
  const tenantId = overrides.tenantId ?? 'tenant-1';
  const actorId = overrides.actorId ?? 'actor-1';
  const eventType = overrides.eventType ?? 'tool.invoked';
  const payload = overrides.payload ?? { tool: 'search' };
  const occurredAt = new Date('2026-09-02T00:00:00Z');
  const entryHash = computeEntryHash({
    prevHash,
    seq,
    tenantId,
    actorId,
    eventType,
    occurredAt,
    payload,
  });
  return {
    seq,
    tenantId,
    actorId,
    eventType,
    occurredAt,
    prevHash,
    entryHash,
    payload,
    retentionUntil: null,
  };
}

/** A valid three-entry chain. */
function validChain(): AuditEvent[] {
  const a = makeEvent(1, GENESIS_HASH);
  const b = makeEvent(2, a.entryHash);
  const c = makeEvent(3, b.entryHash);
  return [a, b, c];
}

function chain3(): [AuditEvent, AuditEvent, AuditEvent] {
  const chain = validChain();
  return [chain[0]!, chain[1]!, chain[2]!];
}

describe('verifier — clean chain', () => {
  it('reports a valid chain as valid', () => {
    const result = verifyEvents(validChain());
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('reports an empty chain as valid', () => {
    expect(verifyEvents([]).valid).toBe(true);
  });

  it('verifies a clean multi-event chain via the paged read path', async () => {
    for (let i = 0; i < 5; i++) {
      await h.store.append({
        tenantId: 'tenant-1',
        actorId: 'actor-1',
        eventType: 'tool.invoked',
        occurredAt: new Date('2026-09-02T00:00:00Z'),
        payload: { i },
      });
    }
    const result = await h.verifier.verify();
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

describe('verifier — hash-mismatch (done-gate item 3)', () => {
  it('detects a field changed without recomputing the hash', () => {
    const [a, b, c] = chain3();
    // Tamper b's event type without recomputing its hash.
    const tampered: AuditEvent = { ...b, eventType: 'tampered' };
    const result = verifyEvents([a, tampered, c]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'hash-mismatch' && i.seq === b.seq)).toBe(true);
  });

  it('detects a hash-mismatch against the real database', async () => {
    // Insert a row with a deliberately wrong entry_hash via raw SQL.
    await h.pool.query(
      `INSERT INTO audit_events (seq, tenant_id, actor_id, event_type, occurred_at, prev_hash, entry_hash, payload)
       VALUES (nextval(pg_get_serial_sequence('audit_events','seq')), 'tenant-1', 'actor-1', 'tool.invoked',
               '2026-09-02T00:00:00Z', $1, $2, '{}')`,
      [GENESIS_HASH, Buffer.alloc(32, 0xaa)],
    );
    const result = await h.verifier.verify();
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'hash-mismatch')).toBe(true);
  });
});

describe('verifier — fork (done-gate item 3)', () => {
  it('detects two entries claiming the same predecessor', () => {
    const a = makeEvent(1, GENESIS_HASH);
    const fork1 = makeEvent(2, a.entryHash);
    const fork2 = makeEvent(3, a.entryHash); // same predecessor as fork1
    const result = verifyEvents([a, fork1, fork2]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'fork')).toBe(true);
  });
});

describe('verifier — cycle (done-gate item 3)', () => {
  it('detects a chain that loops back to a revisited entry hash', () => {
    const a = makeEvent(1, GENESIS_HASH);
    const b = makeEvent(2, a.entryHash);
    // c claims b as predecessor but reuses b's entry hash — a loop.
    const c: AuditEvent = { ...b, seq: 3 };
    const result = verifyEvents([a, b, c]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'cycle')).toBe(true);
  });
});

describe('verifier — orphan (done-gate item 3)', () => {
  it('detects an entry whose predecessor does not exist', () => {
    const a = makeEvent(1, GENESIS_HASH);
    const b = makeEvent(2, a.entryHash);
    // c's predecessor is a hash that appears nowhere in the chain.
    const c = makeEvent(3, Buffer.alloc(32, 0xbb));
    const result = verifyEvents([a, b, c]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'orphan' && i.seq === c.seq)).toBe(true);
  });

  it('detects an orphan against the real database', async () => {
    // Insert a row whose prev_hash matches no entry (and is not genesis).
    await h.pool.query(
      `INSERT INTO audit_events (seq, tenant_id, actor_id, event_type, occurred_at, prev_hash, entry_hash, payload)
       VALUES (nextval(pg_get_serial_sequence('audit_events','seq')), 'tenant-1', 'actor-1', 'tool.invoked',
               '2026-09-02T00:00:00Z', $1, $2, '{}')`,
      [Buffer.alloc(32, 0xcc), Buffer.alloc(32, 0xdd)],
    );
    const result = await h.verifier.verify();
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'orphan')).toBe(true);
  });
});
