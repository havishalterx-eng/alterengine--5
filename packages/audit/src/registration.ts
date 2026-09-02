/**
 * Component 38 — Audit. Deletion & Retention registration (rule 20).
 *
 * Every component holding tenant data registers with Deletion & Retention
 * (component 44). Per the CEO's decision in PHASE-1-SCOPE.md, the declaration
 * lives in code and names physical table names — a database row does not
 * appear in a pull request diff, and registration decides whether a tenant's
 * data is reachable by erasure, so it deserves the same review as code.
 *
 * Component 44 is Phase 1 (registration) / Phase 7 (erasure). This is the
 * Phase-1 declaration surface: it records the registration in a module-level
 * registry that 44's live-schema check will read, and it validates the
 * declaration so a malformed one fails loudly rather than silently.
 */

export interface DeletionRegistration {
  /** Component number from docs/architecture/contracts.md. */
  readonly component: number;
  /** Physical table names, not class names. */
  readonly tables: readonly string[];
  /** Non-empty reason. No wildcards. */
  readonly reason: string;
}

const registrations = new Map<string, DeletionRegistration>();

/**
 * Declares that a component's physical tables hold tenant data and are in
 * scope for Deletion & Retention. Idempotent per table.
 */
export function registerForDeletion(registration: DeletionRegistration): void {
  if (registration.tables.length === 0) {
    throw new Error(
      `registerForDeletion (component ${registration.component}): no tables declared.`,
    );
  }
  if (registration.reason.trim() === '') {
    throw new Error(
      `registerForDeletion (component ${registration.component}): a non-empty reason is required.`,
    );
  }
  for (const table of registration.tables) {
    if (table.trim() === '') {
      throw new Error(
        `registerForDeletion (component ${registration.component}): empty table name.`,
      );
    }
    registrations.set(table, registration);
  }
}

/** Every registered table, keyed by physical table name. */
export function deletionRegistrations(): ReadonlyMap<
  string,
  DeletionRegistration
> {
  return registrations;
}
