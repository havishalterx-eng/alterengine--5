import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/**
 * Loads .env for tests.
 *
 * Configuration now goes through loadConfig(), which requires every setting
 * and defaults nothing — an absent setting must never select a permissive
 * value. That is correct, and it means the test runner has to supply the same
 * environment CI does, rather than each test file inventing its own loader.
 *
 * Reading the file here is deliberate: this is build configuration, not a
 * production path. An already-set variable always wins, so CI — which exports
 * these directly and has no .env — is unaffected.
 */
function envFromFile(): Record<string, string> {
  if (!existsSync('.env')) return {};

  const parsed: Record<string, string> = {};
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) {
      parsed[match[1]] = match[2].trim();
    }
  }
  return parsed;
}

export default defineConfig({
  test: {
    env: envFromFile(),
    // Integration tests share one real Postgres database. Concurrent files
    // would race on schema DDL and truncate each other's tables, so run files
    // sequentially.
    fileParallelism: false,
  },
});
