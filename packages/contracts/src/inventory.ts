import type { CapabilityStatus, Registry } from './operation.js';

/**
 * The capability inventory.
 *
 * A machine-readable list of every capability the system declares, each with
 * its status. This is what lets any sweep prove its own coverage.
 *
 * The previous build's mock-to-live remediation missed twenty admin modules —
 * not through carelessness, but because those modules were attached by a
 * different mechanism and were never in the sweep's scope. Nobody could see
 * the boundary of the work they had just finished. Every migration, audit and
 * cleanup has an invisible edge until an inventory is generated from the same
 * source the code is derived from.
 */

export interface InventoryEntry {
  readonly operation: string;
  readonly component: number;
  readonly capability: string;
  readonly status: CapabilityStatus;
  readonly method: string;
  readonly path: string;
  readonly trackingReference: string | null;
}

export interface Inventory {
  readonly generatedFrom: 'registry';
  readonly total: number;
  readonly counts: Readonly<Record<CapabilityStatus, number>>;
  readonly entries: readonly InventoryEntry[];
}

export function buildInventory(registry: Registry): Inventory {
  const entries: InventoryEntry[] = Object.entries(registry)
    .map(([operation, definition]) => ({
      operation,
      component: definition.component,
      capability: definition.capability,
      status: definition.status,
      method: definition.method,
      path: definition.path,
      trackingReference:
        definition.status === 'implemented'
          ? null
          : definition.trackingReference,
    }))
    .sort((a, b) => a.operation.localeCompare(b.operation));

  const counts: Record<CapabilityStatus, number> = {
    implemented: 0,
    unimplemented: 0,
    deferred: 0,
  };

  for (const entry of entries) {
    counts[entry.status] += 1;
  }

  return {
    generatedFrom: 'registry',
    total: entries.length,
    counts,
    entries,
  };
}

export class InventoryCoverageError extends Error {
  override readonly name = 'InventoryCoverageError';
}

/**
 * Done-gate item 6: a capability present in code but absent from the inventory
 * fails the build.
 *
 * `declaredInCode` is the set of capabilities something in the repository
 * actually serves or calls. Anything there that the inventory does not know
 * about is a capability nobody can see — precisely the invisible edge that let
 * twenty admin modules fall out of scope last time.
 */
export function assertInventoryCovers(
  inventory: Inventory,
  declaredInCode: readonly string[],
): void {
  const known = new Set(inventory.entries.map((entry) => entry.capability));
  const missing = declaredInCode.filter((capability) => !known.has(capability));

  if (missing.length > 0) {
    throw new InventoryCoverageError(
      `${missing.length} capability(ies) exist in code but not in the inventory: ` +
        `${missing.join(', ')}. A capability absent from the inventory is invisible ` +
        `to every sweep, migration and audit that reads it.`,
    );
  }
}
