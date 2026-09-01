import { resolveRuntimeMode } from '@alter/contracts';

/**
 * Engine entry point.
 *
 * Phase 0: proves the toolchain and the runtime-mode switch. No components
 * are wired yet — see docs/build/STATUS.md.
 */
export function main(): void {
  const mode = resolveRuntimeMode();
  // eslint-disable-next-line no-console
  console.log(`alter-engine starting in ${mode} mode`);
}

main();
