import { resolveRuntimeMode } from '@alter/contracts';

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
 * Phase 0: proves the toolchain and the runtime-mode switch. No components
 * are wired yet — see docs/build/STATUS.md.
 */
export function main(): void {
  const mode = resolveRuntimeMode();
  // eslint-disable-next-line no-console
  console.log(`alter-worker starting in ${mode} mode`);
}

main();
