import type {
  AuditAlertSink,
  AuditChainVerifier} from '@alter/audit';
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
  ) {}

  /**
   * One scheduled run. Verifies the chain and raises an alert on any
   * non-valid result. Returns the result so callers and tests can assert on
   * it.
   */
  async tick(): Promise<VerificationResult> {
    const result = await this.verifier.verify();
    if (!result.valid) {
      await this.alerts.raise('verification_failed', result.issues);
    }
    return result;
  }
}
