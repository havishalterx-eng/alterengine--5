import { finding, isTestFile, readLines, sourceFiles } from './lib.mjs';

/**
 * Gate: every component holding tenant data registers with Deletion &
 * Retention (component 44).
 *
 * Rule 20. Erasure that misses one table is not erasure, and the miss is
 * invisible until someone exercises a legal right and the answer is wrong.
 * Registration is checked mechanically because "remember to register" is
 * exactly the kind of discipline that holds for forty components and fails on
 * the forty-first.
 *
 * A component holding tenant data declares @tenant-data and registers itself.
 */

export const name = 'deletion-registration';
export const closes = 'Rule 20 — erasure must reach every store';

const TENANT_DATA_TAG = /@tenant-data\b/;
const NO_TENANT_DATA_TAG = /@no-tenant-data\b/;
const REGISTRATION = /registerForDeletion\s*\(/;

// Storage-shaped declarations that plausibly hold tenant rows.
const STORAGE_SHAPE = /\bclass\s+\w*(?:Store|Repository|Repo|Dao|Table)\b/;

export async function run() {
  const findings = [];
  const files = await sourceFiles({ includeTests: false });

  for (const file of files) {
    if (isTestFile(file)) continue;

    const lines = await readLines(file);
    const body = lines.join('\n');
    const registers = REGISTRATION.test(body);
    // @no-tenant-data contains @tenant-data as a substring, so test it first.
    const declaresNoTenantData = NO_TENANT_DATA_TAG.test(body);
    const declaresTenantData = !declaresNoTenantData && TENANT_DATA_TAG.test(body);

    if (declaresTenantData && !registers) {
      findings.push(
        finding({
          file,
          line: 1,
          message:
            'Declares @tenant-data but never calls registerForDeletion(). ' +
            'Erasure would silently miss this store.',
        }),
      );
      continue;
    }

    lines.forEach((text, index) => {
      if (!STORAGE_SHAPE.test(text)) return;
      if (declaresTenantData || declaresNoTenantData || registers) return;

      findings.push(
        finding({
          file,
          line: index + 1,
          message:
            'Storage-shaped class with no @tenant-data decision recorded. ' +
            'Mark it @tenant-data and register it, or mark it @no-tenant-data.',
        }),
      );
    });
  }

  return findings;
}
