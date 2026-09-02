/**
 * Component 38 — Audit. Alert sink.
 *
 * Chain verification is fail-closed: a non-valid result must never be reported
 * as valid, and it must be loud. This sink records an alert for any non-valid
 * verification result. In Phase 1 the alert is a durable row in `audit_alerts`
 * (testable against real Postgres); delivery to component 45 Notification is a
 * Phase 5 concern.
 */

import type { Pool } from 'pg';

export interface AuditAlert {
  readonly id: number;
  readonly raisedAt: Date;
  readonly kind: string;
  readonly detail: unknown;
}

export class AuditAlertSink {
  constructor(private readonly pool: Pool) {}

  /** Records an alert. Throws on failure — a silent alert is a false clean. */
  async raise(kind: string, detail: unknown): Promise<AuditAlert> {
    const result = await this.pool.query<{
      id: number;
      raised_at: Date;
      kind: string;
      detail: unknown;
    }>(
      'INSERT INTO audit_alerts (kind, detail) VALUES ($1, $2) RETURNING id, raised_at, kind, detail',
      [kind, JSON.stringify(detail)],
    );
    const row = result.rows[0]!;
    return {
      id: row.id,
      raisedAt: row.raised_at,
      kind: row.kind,
      detail: row.detail,
    };
  }

  /** Most recent alerts, newest first. */
  async recent(limit = 10): Promise<AuditAlert[]> {
    const result = await this.pool.query<{
      id: number;
      raised_at: Date;
      kind: string;
      detail: unknown;
    }>(
      'SELECT id, raised_at, kind, detail FROM audit_alerts ORDER BY id DESC LIMIT $1',
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      raisedAt: row.raised_at,
      kind: row.kind,
      detail: row.detail,
    }));
  }
}
