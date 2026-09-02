import type { TenantDataDeclaration, TenantDataExemption } from './declaration.js';

/** Minimal client shape — satisfied by pg.Client, pool, or a test double. */
interface Queryable {
  query(sql: string): Promise<{ rows: { schema_name: string; table_name: string }[] }>;
}

/**
 * Enumerate every base table and materialized view in all user schemas
 * of a real database.
 *
 * Excludes pg_catalog, information_schema, and any schema starting with pg_.
 * Returns schema-qualified names like 'public.customers'.
 */
export async function listLiveTables(client: Queryable): Promise<string[]> {
  // pg_catalog, not information_schema. A materialized view stores rows and
  // can therefore hold tenant data, but information_schema.tables does not
  // list materialized views at all -- verified against a real database, where
  // filtering on table_type = 'MATERIALIZED VIEW' returned zero rows. A filter
  // that can never match is worse than no filter: it looks like coverage.
  //
  // relkind: r = ordinary table, p = partitioned table, m = materialized view.
  const result = await client.query(
    `SELECT n.nspname AS schema_name, c.relname AS table_name
     FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p', 'm')
       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
       AND n.nspname NOT LIKE 'pg\\_%'`,
  );
  return result.rows
    .map((row) => `${row.schema_name}.${row.table_name}`)
    .sort();
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
 * Comparison uses exact schema-qualified identifiers — no lowercasing.
 */
export function certifySchemaCoverage(
  liveTables: readonly string[],
  declarations: readonly TenantDataDeclaration[],
  exemptions: readonly TenantDataExemption[],
): Certification {
  const declared = new Set(declarations.map((d) => `${d.schema}.${d.table}`));
  const exempt = new Set(exemptions.map((e) => `${e.schema}.${e.table}`));
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
