import { resolveRuntimeMode } from '@alter/contracts';

/**
 * API process — everything on the HTTP request path.
 *
 * Holds the surfaces, the gateways, the design path (L1-L5, which runs once
 * per workflow while a human waits), and the account/control plane.
 *
 * It must NOT host Temporal workers. Workers poll task queues and run
 * arbitrarily long activities; co-locating them means one slow activity
 * starves HTTP requests, and every "degraded, self only" blast radius on the
 * request path becomes a lie. See docs/build/DECISIONS.md.
 *
 * Phase 0: proves the toolchain and the runtime-mode switch. No components
 * are wired yet — see docs/build/STATUS.md.
 */
export function main(): void {
  const mode = resolveRuntimeMode();
  // eslint-disable-next-line no-console
  console.log(`alter-api starting in ${mode} mode`);
}

main();
