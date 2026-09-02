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

export class AuditRetentionSweeper {
  constructor(private readonly store: AuditStore) {}

  /** One scheduled run. Returns the number of skeletons destroyed. */
  async tick(): Promise<number> {
    return this.store.destroyExpiredSkeletons();
  }
}
