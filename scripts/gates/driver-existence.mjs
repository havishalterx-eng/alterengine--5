import { finding, isTestFile, readLines, sourceFiles } from './lib.mjs';

/**
 * Gate: every scheduled or background capability has a driver, and a test
 * asserting that driver exists.
 *
 * Closes systemic pattern 3 — the most expensive one. The previous build had a
 * durable queue with correct leasing that no scheduler ever drove; a search for
 * every scheduler primitive across the service returned zero matches. It had an
 * audit-chain verifier detecting all four tamper modes with exactly one
 * reference in the repository: its own definition. It had a promotion gate the
 * audit called the best-designed component in the codebase, with zero
 * production callers.
 *
 * Real machinery. Nothing driving it. All of it passing tests.
 *
 * A component declares its driver with an @driver tag. This gate checks the
 * declaration exists and that some test names it.
 */

export const name = 'driver-existence';
export const closes = 'Pattern 3 — real machinery with nothing driving it';

const NEEDS_DRIVER = [
  /\bclass\s+\w*(?:Queue|Scheduler|Worker|Poller|Reaper|Sweeper|Relay|Monitor)\b/,
  /\bclass\s+\w*(?:Job|Task)Runner\b/,
];

const DRIVER_TAG = /@driver\s+(\S+)/;

export async function run() {
  const findings = [];
  const production = await sourceFiles({ includeTests: false });
  const tests = await sourceFiles();
  const testBodies = [];

  for (const file of tests) {
    if (!isTestFile(file)) continue;
    testBodies.push((await readLines(file)).join('\n'));
  }

  for (const file of production) {
    if (isTestFile(file)) continue;

    const lines = await readLines(file);

    lines.forEach((text, index) => {
      if (!NEEDS_DRIVER.some((pattern) => pattern.test(text))) return;

      const context = lines.slice(Math.max(0, index - 12), index + 1).join('\n');
      const declared = DRIVER_TAG.exec(context);

      if (!declared) {
        findings.push(
          finding({
            file,
            line: index + 1,
            message:
              'Background capability with no @driver declaration. ' +
              'Name what invokes this, or it is machinery with no driver.',
          }),
        );
        return;
      }

      const driver = declared[1];
      const proven = testBodies.some((body) => body.includes(driver));

      if (!proven) {
        findings.push(
          finding({
            file,
            line: index + 1,
            message:
              `Declares @driver ${driver}, but no test references it. ` +
              'The driver must be asserted to exist, not merely named.',
          }),
        );
      }
    });
  }

  return findings;
}
