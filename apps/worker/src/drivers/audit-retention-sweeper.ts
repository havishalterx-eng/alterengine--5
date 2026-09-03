/**
 * Component 38 — Audit. The driver that destroys expired minimized skeletons
 * on a schedule.
 *
 * @driver audit-retention-sweeper
 *
 * Section 18: on account deletion the audit trail is minimized to an event
 * skeleton (what happened, when, under which identifier — no content), held
 * for a retention window, then genuinely destroyed. This driver runs the
 * destruction on a schedule. The account-deletion trigger that invokes
 * minimization lives in components 54 and 44 (Phase 7); the scheduled
 * destruction half is provable now.
 */

import type { AuditStore } from '@alter/audit';
import { SYSTEM_TENANT, type Observer } from '@alter/observability';

export class AuditRetentionSweeper {
  constructor(
    private readonly store: AuditStore,
    private readonly observer: Observer,
  ) {}

  /** One scheduled run. Returns the number of skeletons destroyed. */
  async tick(): Promise<number> {
    const startedAt = Date.now();
    this.observer.emit(record('audit.retention.tick.started', {}));
    try {
      const destroyed = await this.store.destroyExpiredSkeletons();
      this.observer.emit(
        record('audit.retention.tick.finished', {
          destroyed,
          durationMs: Date.now() - startedAt,
          outcome: 'completed',
        }),
      );
      return destroyed;
    } catch (error) {
      this.observer.emit(
        record('audit.retention.tick.finished', {
          durationMs: Date.now() - startedAt,
          error: errorMessage(error),
          outcome: 'error',
        }),
      );
      throw error;
    }
  }
}

function record(name: string, payload: Record<string, unknown>) {
  return {
    component: '38',
    kind: 'event' as const,
    name,
    nodeId: 'audit-retention-sweeper',
    payload,
    runId: 'system:worker',
    schemaVersion: 1 as const,
    scope: 'system' as const,
    tenantId: SYSTEM_TENANT,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
