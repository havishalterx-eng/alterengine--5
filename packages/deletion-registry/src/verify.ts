import type { TenantDataDeclaration, TenantDataExemption } from './declaration.js';

/** Minimal client shape — satisfied by pg.Client, pool, or a test double. */
interface Queryable {
  query(sql: string): Promise<{ rows: { table_name: string }[] }>;
}

/**
 * Enumerate every base table in the public schema of a real database.
 *
 * Verification checks what EXISTS, never what was deleted — contract 44's
 * non-responsibility is a hand-maintained list, so the verdict is computed
 * fresh from information_schema on every call.
 */
export async function listLiveTables(client: Queryable): Promise<string[]> {
  const result = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  return result.rows.map((row) => row.table_name);
}

export type Certification =
  | { status: 'complete' }
  | {
      status: 'incomplete';
      unregistered: readonly string[];
      stale: readonly string[];
    };

/**
 * Fail-closed coverage check. A live table with no declaration and no
 * exemption blocks certification rather than being silently skipped. Declared
 * tables missing from the live schema are drift in the other direction.
 */
export function certifySchemaCoverage(
  liveTables: readonly string[],
  declarations: readonly TenantDataDeclaration[],
  exemptions: readonly TenantDataExemption[],
): Certification {
  const declared = new Set(declarations.map((d) => d.table));
  const exempt = new Set(exemptions.map((e) => e.table));
  const covered = new Set([...declared, ...exempt]);

  const unregistered = liveTables
    .filter((table) => !covered.has(table))
    .sort();
  const stale = [...covered]
    .filter((table) => !liveTables.includes(table))
    .sort();

  if (unregistered.length > 0 || stale.length > 0) {
    return { status: 'incomplete', unregistered, stale };
  }
  return { status: 'complete' };
}
