import { finding, isTestFile, readLines, sourceFiles } from './lib.mjs';

/**
 * Gate: one definition per shared primitive.
 *
 * Closes systemic pattern 4. The previous build had two ID validators with
 * different strictness — which one a boundary happened to import decided what
 * that boundary accepted. It also shipped two packages whose entire contents
 * were `export {}`, linted and built on every CI run.
 *
 * Rule 18: every shared primitive has exactly one definition.
 */

export const name = 'duplicate-primitive';
export const closes = 'Pattern 4 — duplicated primitives drifted apart';

// Exported names that must be unique across the repository. Two definitions of
// the same concept is the bug, regardless of which file wins an import.
const TRACKED = /^export\s+(?:async\s+)?(?:function|class|const|type|interface)\s+(\w+)/;

const ALLOW_DUPLICATES = new Set(['main', 'run', 'name', 'closes', 'default']);

export async function run() {
  const findings = [];
  const files = await sourceFiles({ includeTests: false });
  const seen = new Map();

  for (const file of files) {
    if (isTestFile(file)) continue;
    if (file.endsWith('index.ts')) continue; // barrels re-export by design

    const lines = await readLines(file);

    lines.forEach((text, index) => {
      const match = TRACKED.exec(text.trim());
      if (!match) return;

      const symbol = match[1];
      if (ALLOW_DUPLICATES.has(symbol)) return;

      const existing = seen.get(symbol);
      if (existing) {
        findings.push(
          finding({
            file,
            line: index + 1,
            message:
              `"${symbol}" is also defined at ${existing.file}:${existing.line}. ` +
              'Two definitions drift. Pick one home and import it.',
          }),
        );
        return;
      }

      seen.set(symbol, { file, line: index + 1 });
    });
  }

  // An empty package is the other half of this pattern: it builds, it lints,
  // and it contains nothing.
  for (const file of files) {
    if (!file.endsWith('index.ts')) continue;
    const body = (await readLines(file)).join('\n').trim();
    if (body === 'export {}' || body === 'export {};' || body === '') {
      findings.push(
        finding({
          file,
          line: 1,
          message: 'Empty barrel. It builds and lints and contains nothing.',
        }),
      );
    }
  }

  return findings;
}
