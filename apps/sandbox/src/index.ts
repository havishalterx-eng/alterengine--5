import { resolveRuntimeMode } from '@alter/contracts';

/**
 * Sandbox entry point — isolated computation only.
 *
 * Rule 4: no browser, no database, no search, no business APIs. Those belong
 * to Tool Gateway (component 27). Code execution and external business actions
 * have different blast radii and must not share a process.
 *
 * Phase 0: proves the toolchain. Component 28 is not built — see
 * docs/build/STATUS.md.
 */
export function main(): void {
  const mode = resolveRuntimeMode();
  // eslint-disable-next-line no-console
  console.log(`alter-sandbox starting in ${mode} mode`);
}

main();
