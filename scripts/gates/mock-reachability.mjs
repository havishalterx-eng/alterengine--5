import { finding, isTestFile, readLines, sourceFiles } from './lib.mjs';

/**
 * Gate: no unannounced mock.
 *
 * Closes systemic pattern 1. Four of the previous build's six critical findings
 * were mock implementations sitting behind real interfaces, and not one was
 * marked. The entire non-test codebase held one TODO and one FIXME — an absence
 * that was read as discipline when it was only absence.
 *
 * A mock in production source is allowed to exist only if it announces itself
 * AND gates itself through assertMockAllowed(), which throws in production.
 */

export const name = 'mock-reachability';
export const closes = 'Pattern 1 — mock code did not announce itself';

const MOCK_SIGNALS = [
  /\bclass\s+Mock[A-Z]/,
  /\bclass\s+Fake[A-Z]/,
  /\bclass\s+Stub[A-Z]/,
  /\bconst\s+mock[A-Z]\w*\s*[:=]/,
  /\bfunction\s+(?:mock|fake|stub)[A-Z]/,
];

const MARKER = /@mock\b/;
const GATE_CALL = /assertMockAllowed\s*\(/;

export async function run() {
  const findings = [];
  const files = await sourceFiles({ includeTests: false });

  for (const file of files) {
    if (isTestFile(file)) continue;

    const lines = await readLines(file);
    const body = lines.join('\n');
    const gated = GATE_CALL.test(body);

    lines.forEach((text, index) => {
      if (!MOCK_SIGNALS.some((pattern) => pattern.test(text))) return;

      // Look back a few lines for the marker in a doc comment.
      const context = lines.slice(Math.max(0, index - 6), index + 1).join('\n');
      const announced = MARKER.test(context);

      if (!announced) {
        findings.push(
          finding({
            file,
            line: index + 1,
            message:
              'Mock-shaped declaration with no @mock marker. ' +
              'An unmarked mock is indistinguishable from an implementation.',
          }),
        );
        return;
      }

      if (!gated) {
        findings.push(
          finding({
            file,
            line: index + 1,
            message:
              'Mock is marked but never calls assertMockAllowed(). ' +
              'It would be selectable in production.',
          }),
        );
      }
    });
  }

  return findings;
}
