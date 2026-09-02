/**
 * Emits the capability inventory from the registry.
 *
 * Build-time, generated, never hand-edited. `--check` fails if the committed
 * inventory is stale, so a registry change that was not regenerated cannot
 * reach main — the inventory and the code cannot drift apart silently.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildInventory } from '../packages/contracts/dist/inventory.js';
import { assertNoDuplicateRoutes } from '../packages/contracts/dist/derive.js';
import { registry } from '../packages/contracts/dist/registry.js';

const OUTPUT = fileURLToPath(new URL('../capability-inventory.json', import.meta.url));

// Two registry operations claiming the same method and path would let mount
// order decide which one a request reaches. Checked here because this script
// runs in CI on every push, so the check has a real driver rather than only a
// test that calls it.
assertNoDuplicateRoutes(registry);

const inventory = buildInventory(registry);
const serialised = `${JSON.stringify(inventory, null, 2)}\n`;

if (process.argv.includes('--check')) {
  let committed;
  try {
    committed = await readFile(OUTPUT, 'utf8');
  } catch {
    console.error('capability-inventory.json is missing. Run: pnpm inventory');
    process.exit(1);
  }

  if (committed !== serialised) {
    console.error(
      'capability-inventory.json is stale — the registry changed and the ' +
        'inventory was not regenerated. Run: pnpm inventory',
    );
    process.exit(1);
  }

  console.log(`Inventory is current: ${inventory.total} capabilities.`);
  process.exit(0);
}

await writeFile(OUTPUT, serialised);

const { implemented, unimplemented, deferred } = inventory.counts;
console.log(
  `Wrote capability-inventory.json — ${inventory.total} capabilities ` +
    `(${implemented} implemented, ${unimplemented} unimplemented, ${deferred} deferred).`,
);
