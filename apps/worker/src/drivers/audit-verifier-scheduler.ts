import type {
  AuditAlertSink,
  AuditChainVerifier} from '@alter/audit';
import { SYSTEM_TENANT, type Observer } from '@alter/observability';
import {
  type VerificationResult,
} from '@alter/audit';

/**
 * Component 38 — Audit. The driver that runs chain verification on a schedule.
 *
 * @driver audit-verifier-scheduler
 *
 * This is the fix for the previous build's single most instructive failure: a
 * hash-chain verifier that detected all four tamper modes and was never
 * called. 38 is not done when the chain verifies — it is done when the
 * verifier runs on a schedule, that schedule has a named driver, a test
 * asserts the driver exists, and the scheduled run catches a tampered entry.
 */
export class AuditVerifierScheduler {
  constructor(
    private readonly verifier: AuditChainVerifier,
    private readonly alerts: AuditAlertSink,
    private readonly observer: Observer,
  ) {}

  /**
   * One scheduled run. Verifies the chain and raises an alert on any
   * non-valid result. Returns the result so callers and tests can assert on
   * it.
   */
  async tick(): Promise<VerificationResult> {
    const startedAt = Date.now();
    this.observer.emit(record('audit.verification.tick.started', {}));

    try {
      const result = await this.verifier.verify();
      if (!result.valid) {
        await this.alerts.raise('verification_failed', result.issues);
      }
      this.observer.emit(
        record('audit.verification.tick.finished', {
          durationMs: Date.now() - startedAt,
          issueCount: result.issues.length,
          issueTypes: result.issues.map((issue) => issue.type),
          outcome: result.valid ? 'valid' : 'invalid',
        }),
      );
      return result;
    } catch (error) {
      this.observer.emit(
        record('audit.verification.tick.finished', {
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
    nodeId: 'audit-verifier-scheduler',
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
