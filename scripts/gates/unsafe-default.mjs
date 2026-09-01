import { finding, isTestFile, readLines, sourceFiles } from './lib.mjs';

/**
 * Gate: safety is what you get by doing nothing.
 *
 * Closes systemic pattern 2. In the previous build a missing environment
 * variable selected a mock. The notifications case showed the inversion most
 * clearly: a half-configured deployment crashed loudly at boot, while a fully
 * unconfigured one started happily and discarded every email.
 *
 * Rule 19: an unset variable must never select a mock, a bypass, or a
 * permissive mode. This gate looks for env reads that fall back to a
 * permissive value.
 */

export const name = 'unsafe-default';
export const closes = 'Pattern 2 — missing configuration silently selected a mock';

const ENV_READ = /process\.env\[?['"`]?(\w+)['"`]?\]?/;

const PERMISSIVE_FALLBACK =
  /(?:\?\?|\|\|)\s*(['"`])(?:true|1|yes|on|mock|fake|stub|dev|development|debug|allow|permissive|insecure|none|\*)\1/i;

const PERMISSIVE_BOOLEAN = /(?:\?\?|\|\|)\s*true\b/;

export async function run() {
  const findings = [];
  const files = await sourceFiles({ includeTests: false });

  for (const file of files) {
    if (isTestFile(file)) continue;

    const lines = await readLines(file);

    lines.forEach((text, index) => {
      if (!ENV_READ.test(text)) return;

      if (PERMISSIVE_FALLBACK.test(text) || PERMISSIVE_BOOLEAN.test(text)) {
        findings.push(
          finding({
            file,
            line: index + 1,
            message:
              'Environment read falls back to a permissive value. ' +
              'Unset must never grant a permission — fail, or default to the safe side.',
          }),
        );
      }
    });
  }

  return findings;
}
