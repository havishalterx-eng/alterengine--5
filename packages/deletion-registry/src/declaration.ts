/**
 * Component 44 — tenant-data declarations.
 *
 * Lives in code, not in a database table: a DB row does not appear in a pull
 * request diff, and this declaration decides whether tenant data is reachable
 * by erasure. Physical table names only, never class names — the gate joins
 * against information_schema at string level.
 *
 * A component holding tenant data MUST add its tables here. The exemption
 * list is the other half: a table holding no tenant data still gets named,
 * with a reason and a named owner. No wildcards. Both lists are empty now
 * because nothing holds tenant data yet — they grow as components land.
 */
export interface TenantDataDeclaration {
  readonly schema: string;
  readonly table: string;
  /** Component number owning the data, from docs/architecture/contracts.md. */
  readonly component: number;
  /** Reviewable owner, as commit author or role (e.g. 'Builder B'). */
  readonly owner: string;
}

export interface TenantDataExemption {
  readonly schema: string;
  readonly table: string;
  /** Required non-empty. A reason can be reviewed; silence cannot. */
  readonly reason: string;
  readonly owner: string;
}

export const tenantDataDeclarations: readonly TenantDataDeclaration[] = [
  {
    schema: 'public',
    table: 'cost_ledger_entries',
    component: 39,
    owner: 'Builder A',
  },
];

export const tenantDataExemptions: readonly TenantDataExemption[] = [];
