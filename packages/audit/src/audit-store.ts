/**
 * Component 38 — Audit. The append-only, tamper-evident audit store.
 *
 * @tenant-data
 * Holds tenant-scoped audit events. Registered with Deletion & Retention
 * (rule 20): on account deletion the trail is minimized per Section 18, not
 * erased outright, and the retained skeleton is destroyed on schedule.
 */

import { Pool } from 'pg';
import { computeEntryHash, GENESIS_HASH } from './hash.js';
import { registerForDeletion } from './registration.js';
import { SCHEMA_SQL } from './schema.js';

registerForDeletion({
  component: 38,
  tables: ['audit_events', 'audit_alerts'],
  reason:
    'Tenant-scoped audit trail. Minimized to an event skeleton on account ' +
    'deletion (Section 18), then destroyed after the retention window.',
});

export interface AuditEventInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly payload: unknown;
}

export interface AuditEvent {
  readonly seq: number;
  readonly tenantId: string;
  readonly actorId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly prevHash: Buffer;
  readonly entryHash: Buffer;
  readonly payload: unknown;
  readonly retentionUntil: Date | null;
}

export interface AuditStoreOptions {
  readonly connectionString: string;
  /** Retention window for minimized skeletons (Section 18). */
  readonly retentionWindow?: string;
}

const DEFAULT_RETENTION_WINDOW = '90 days';

/**
 * The audit store. Writes are async and never block a run; a write failure is
 * loud (throws) because an audit gap is a compliance gap. Reads are sync.
 */
export class AuditStore {
  readonly pool: Pool;
  private readonly retentionWindow: string;

  constructor(options: AuditStoreOptions) {
    if (!options.connectionString) {
      throw new Error('AuditStore: a connection string is required.');
    }
    this.pool = new Pool({ connectionString: options.connectionString });
    this.retentionWindow = options.retentionWindow ?? DEFAULT_RETENTION_WINDOW;
  }

  /** Applies the schema. Idempotent. */
  async ensureSchema(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
  }

  /**
   * The highest sequence value ever ALLOCATED, which is not the same as the
   * highest row present.
   *
   * Deleting entries from the end of the chain leaves every remaining hash
   * link intact, so hash verification alone reports a truncated chain as
   * valid. The Postgres sequence never goes backwards when rows are deleted,
   * so it is an anchor outside the data being verified — which is what makes
   * truncation detectable at all.
   */
  async highestAllocatedSeq(): Promise<number> {
    // pg_sequences reports last_value NULL until the sequence has been used,
    // which is the empty-chain case and must read as 0 rather than as a gap.
    const result = await this.pool.query<{ last_value: string | null }>(
      `SELECT s.last_value
       FROM pg_sequences s
       WHERE format('%I.%I', s.schemaname, s.sequencename)
             = pg_get_serial_sequence('audit_events', 'seq')`,
    );
    const value = result.rows[0]?.last_value;
    return value === null || value === undefined ? 0 : Number(value);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Appends an event to the chain. The predecessor hash is read and the new
   * entry inserted in one transaction, so two concurrent appends cannot both
   * claim the same predecessor — the unique constraint on `prev_hash` is the
   * backstop.
   */
  async append(input: AuditEventInput): Promise<AuditEvent> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const last = await client.query<{ entry_hash: Buffer }>(
        'SELECT entry_hash FROM audit_events ORDER BY seq DESC LIMIT 1 FOR UPDATE',
      );
      const prevHash = last.rows[0]?.entry_hash ?? GENESIS_HASH;
      const seqResult = await client.query<{ seq: number }>(
        "SELECT nextval(pg_get_serial_sequence('audit_events', 'seq')) AS seq",
      );
      const seq = seqResult.rows[0]?.seq;
      if (seq === undefined) {
        throw new Error('AuditStore: could not allocate a sequence value.');
      }

      const entryHash = computeEntryHash({
        prevHash,
        seq,
        tenantId: input.tenantId,
        actorId: input.actorId,
        eventType: input.eventType,
        occurredAt: input.occurredAt,
        payload: input.payload,
      });

      const result = await client.query<{
        seq: number;
        tenant_id: string;
        actor_id: string;
        event_type: string;
        occurred_at: Date;
        prev_hash: Buffer;
        entry_hash: Buffer;
        payload: unknown;
        retention_until: Date | null;
      }>(
        `INSERT INTO audit_events
           (seq, tenant_id, actor_id, event_type, occurred_at, prev_hash, entry_hash, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING seq, tenant_id, actor_id, event_type, occurred_at,
                   prev_hash, entry_hash, payload, retention_until`,
        [
          seq,
          input.tenantId,
          input.actorId,
          input.eventType,
          input.occurredAt,
          prevHash,
          entryHash,
          input.payload === undefined ? null : JSON.stringify(input.payload),
        ],
      );
      await client.query('COMMIT');
      return mapRow(result.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Reads the chain in sequence order. */
  async readAll(): Promise<AuditEvent[]> {
    const result = await this.pool.query<Row>(
      'SELECT seq, tenant_id, actor_id, event_type, occurred_at, prev_hash, entry_hash, payload, retention_until FROM audit_events ORDER BY seq ASC',
    );
    return result.rows.map(mapRow);
  }

  /**
   * Reads one page of the chain in sequence order. The verifier uses this so
   * the read path is incremental — it never loads the whole history into
   * memory, which is what lets it run on a schedule.
   */
  async readPage(limit: number, offset: number): Promise<AuditEvent[]> {
    const result = await this.pool.query<Row>(
      'SELECT seq, tenant_id, actor_id, event_type, occurred_at, prev_hash, entry_hash, payload, retention_until FROM audit_events ORDER BY seq ASC LIMIT $1 OFFSET $2',
      [limit, offset],
    );
    return result.rows.map(mapRow);
  }

  /** Reads the chain for one tenant, in sequence order. */
  async readForTenant(tenantId: string): Promise<AuditEvent[]> {
    const result = await this.pool.query<Row>(
      'SELECT seq, tenant_id, actor_id, event_type, occurred_at, prev_hash, entry_hash, payload, retention_until FROM audit_events WHERE tenant_id = $1 ORDER BY seq ASC',
      [tenantId],
    );
    return result.rows.map(mapRow);
  }

  /**
   * Section 18 minimization. Strips every event for the tenant to its skeleton
   * (what happened, when, under which identifier — no content, no payloads)
   * and schedules it for destruction after the retention window. The trigger
   * permits this exact mutation and nothing else.
   */
  async minimizeForAccountDeletion(tenantId: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL alter.allow_audit_minimization = 'on'");
      const result = await client.query(
        `UPDATE audit_events
         SET payload = NULL, retention_until = now() + $2::interval
         WHERE tenant_id = $1 AND payload IS NOT NULL`,
        [tenantId, this.retentionWindow],
      );
      await client.query('COMMIT');
      return result.rowCount ?? 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Destroys minimized skeletons whose retention window has expired. The
   * trigger only permits deleting an expired, minimized skeleton.
   */
  async destroyExpiredSkeletons(): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL alter.allow_audit_minimization = 'on'");
      const result = await client.query(
        'DELETE FROM audit_events WHERE retention_until IS NOT NULL AND retention_until <= now()',
      );
      await client.query('COMMIT');
      return result.rowCount ?? 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

interface Row {
  seq: number;
  tenant_id: string;
  actor_id: string;
  event_type: string;
  occurred_at: Date;
  prev_hash: Buffer;
  entry_hash: Buffer;
  payload: unknown;
  retention_until: Date | null;
}

function mapRow(row: Row): AuditEvent {
  return {
    seq: row.seq,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    prevHash: row.prev_hash,
    entryHash: row.entry_hash,
    payload: row.payload,
    retentionUntil: row.retention_until,
  };
}
