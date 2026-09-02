/**
 * Gate runner.
 *
 * GATE_MODE=warn  (default) — report findings, exit 0
 * GATE_MODE=fail             — report findings, exit 1 if any
 *
 * Every gate is defined in Phase 0 in warn mode and flipped to fail at the end
 * of Phase 1. Warn first reveals the true violation count before it blocks
 * anyone; flipping to fail while that count is unknown stalls the team on day
 * two. See docs/build/DECISIONS.md.
 */

import * as capabilityCoverage from './capability-coverage.mjs';
import * as deletionRegistration from './deletion-registration.mjs';
import * as driverExistence from './driver-existence.mjs';
import * as duplicatePrimitive from './duplicate-primitive.mjs';
import * as mockReachability from './mock-reachability.mjs';
import * as unsafeDefault from './unsafe-default.mjs';

const GATES = [
  mockReachability,
  unsafeDefault,
  driverExistence,
  duplicatePrimitive,
  deletionRegistration,
  capabilityCoverage,
];

const mode = process.env['GATE_MODE'] === 'fail' ? 'fail' : 'warn';

let total = 0;

console.log(`Running ${GATES.length} gates in ${mode} mode.\n`);

for (const gate of GATES) {
  const findings = await gate.run();
  total += findings.length;

  const status = findings.length === 0 ? 'clean' : `${findings.length} finding(s)`;
  console.log(`${gate.name} — ${status}`);
  console.log(`  closes: ${gate.closes}`);

  for (const item of findings) {
    console.log(`  ${item.file}:${item.line}  ${item.message}`);
  }
  console.log('');
}

if (total === 0) {
  console.log('All gates clean.');
  process.exit(0);
}

if (mode === 'warn') {
  console.log(`${total} finding(s). Warn mode — not failing the build.`);
  console.log('Flip to GATE_MODE=fail at the end of Phase 1.');
  process.exit(0);
}

console.log(`${total} finding(s). Failing.`);
process.exit(1);
