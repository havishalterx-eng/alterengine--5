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
import type { JsonObject } from '@alter/safety';
import { type ObservabilityRecord, type Observer } from '@alter/observability';

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

/**
 * A system record carries driver identity, never run identity (Adversary
 * finding 4). See the matching comment in audit-verifier-scheduler.ts.
 */
function record(name: string, payload: JsonObject): ObservabilityRecord {
  return {
    component: '38',
    driver: 'audit-retention-sweeper',
    kind: 'event',
    name,
    payload,
    schemaVersion: 1,
    scope: 'system',
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
