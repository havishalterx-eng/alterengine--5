import type {
  AuditAlertSink,
  AuditChainVerifier} from '@alter/audit';
import type { JsonObject } from '@alter/safety';
import { type ObservabilityRecord, type Observer } from '@alter/observability';
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

/**
 * A system record carries driver identity, never run identity (Adversary
 * finding 4). `runId: 'system:worker'` fabricated a run that Run Monitor
 * would have listed as real; this record cannot name a run at all — the type
 * has no field for it and the schema rejects the key.
 */
function record(name: string, payload: JsonObject): ObservabilityRecord {
  return {
    component: '38',
    driver: 'audit-verifier-scheduler',
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
