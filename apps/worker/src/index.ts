import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AuditAlertSink,
  AuditChainVerifier,
  AuditStore,
} from '@alter/audit';
import { resolveRuntimeMode } from '@alter/contracts';
import { AuditRetentionSweeper } from './drivers/audit-retention-sweeper.js';
import { AuditVerifierScheduler } from './drivers/audit-verifier-scheduler.js';

/**
 * Worker process — the run path, and every background driver.
 *
 * Hosts the Temporal workers, the executor and node types, recovery,
 * verification, learning, and the drivers behind scheduled work (the outbox
 * relay, the retention sweeper, the drift detector's trigger).
 *
 * It is separate from the API process because the two scale and fail
 * differently: workers are long-running and poll task queues, requests are
 * short and latency-bound. Splitting them is also what makes rule 17
 * checkable — a background driver has a process it demonstrably runs in,
 * rather than being assumed to exist somewhere.
 *
 * Component 38: the audit verifier scheduler and the retention sweeper are
 * wired here so chain verification runs on a schedule, unprompted, in a real
 * process — not a verifier that exists and is never called.
 */

const VERIFY_INTERVAL_MS = 60_000;
const SWEEP_INTERVAL_MS = 60_000;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const text = readFileSync(join(process.cwd(), '.env'), 'utf8');
  const match = text.match(/^DATABASE_URL=(.+)$/m);
  if (!match) {
    throw new Error('DATABASE_URL is not set and not present in .env');
  }
  return match[1]!.trim();
}

export function main(): void {
  const mode = resolveRuntimeMode();
  // eslint-disable-next-line no-console
  console.log(`alter-worker starting in ${mode} mode`);

  const store = new AuditStore({ connectionString: databaseUrl() });
  const verifier = new AuditChainVerifier(store);
  const alerts = new AuditAlertSink(store.pool);
  const scheduler = new AuditVerifierScheduler(verifier, alerts);
  const sweeper = new AuditRetentionSweeper(store);

  // Chain verification runs on a schedule, unprompted. A non-valid result is
  // alerted by the scheduler; a failure to run at all is a loud crash.
  setInterval(() => {
    scheduler
      .tick()
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('audit verification failed to run:', error);
      });
  }, VERIFY_INTERVAL_MS);

  setInterval(() => {
    sweeper
      .tick()
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('audit retention sweep failed to run:', error);
      });
  }, SWEEP_INTERVAL_MS);
}

main();
