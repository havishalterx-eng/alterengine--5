import { finding, isTestFile, sourceFiles } from './lib.mjs';
import { lineOf, parse, ts, walk } from './ast.mjs';
import { registry } from '../../packages/contracts/dist/registry.js';

/**
 * Gate: every capability served by production code is in the registry.
 *
 * This exists because the Adversary found `assertInventoryCovers` had no
 * production caller. An inventory coverage check that nothing calls is
 * machinery with no driver — pattern 3, in the component whose whole job is
 * making absence visible. The function was real, tested, and decorative.
 *
 * It also closes the third evasion directly:
 *
 *   router.get('/admin/usage', async () => ({ activeUsers: 0 }));
 *
 * No registry entry, no inventory entry, no absence state, CI green. That is
 * the twenty-admin-modules case again: real capabilities attached by a
 * mechanism the sweep did not know about, invisible to everyone reading the
 * inventory afterwards.
 *
 * This gate is deliberately built BEFORE any HTTP route exists. Added later,
 * it would have to grandfather whatever had already slipped through.
 */

export const name = 'capability-coverage';
export const closes = 'Rule 15 — a capability outside the registry is invisible';

/** Route-mounting shapes: router.get(...), app.post(...), server.route(...). */
const ROUTE_METHODS = new Set([
  'get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all', 'route', 'use',
]);

const ROUTE_HOSTS = new Set(['router', 'app', 'server', 'fastify', 'express']);

function routeMounts(source) {
  const mounts = [];

  walk(source, (node) => {
    if (!ts.isCallExpression(node)) return;
    if (!ts.isPropertyAccessExpression(node.expression)) return;

    const method = node.expression.name.text;
    if (!ROUTE_METHODS.has(method)) return;

    const host = ts.isIdentifier(node.expression.expression)
      ? node.expression.expression.text
      : undefined;
    if (!host || !ROUTE_HOSTS.has(host)) return;

    const first = node.arguments[0];
    if (!first) return;
    if (!ts.isStringLiteral(first) && !ts.isNoSubstitutionTemplateLiteral(first)) return;

    mounts.push({ method: method.toUpperCase(), path: first.text, node });
  });

  return mounts;
}

export async function run() {
  const findings = [];
  const files = await sourceFiles({ includeTests: false });

  const known = new Set(
    Object.values(registry).map(
      (operation) => `${operation.method} ${operation.path}`,
    ),
  );

  const mounted = new Set();

  for (const file of files) {
    if (isTestFile(file)) continue;

    const { source } = await parse(file);

    for (const mount of routeMounts(source)) {
      const key = `${mount.method} ${mount.path}`;
      mounted.add(key);

      if (!known.has(key)) {
        findings.push(
          finding({
            file,
            line: lineOf(source, mount.node),
            message:
              `Mounts ${key}, which is not in the registry. It will not appear ` +
              'in the capability inventory, so every sweep, migration and audit ' +
              'that reads the inventory is blind to it. Declare it in the registry.',
          }),
        );
      }
    }
  }

  // The inverse. An operation the registry calls `implemented` with nothing
  // serving it is a client method pointing at a route nobody built — the
  // previous build's 117 hand-written client methods, exactly.
  //
  // Scoped to files that mount any route at all: while no HTTP server exists
  // (component 48, Phase 2) this correctly stays silent rather than reporting
  // every operation as unserved.
  if (mounted.size > 0) {
    for (const [operationName, operation] of Object.entries(registry)) {
      if (operation.status !== 'implemented') continue;

      const key = `${operation.method} ${operation.path}`;
      if (!mounted.has(key)) {
        findings.push(
          finding({
            file: 'packages/contracts/src/registry.ts',
            line: 1,
            message:
              `"${operationName}" is declared implemented (${key}) but no route ` +
              'mounts it. A client method derived from it would call a route ' +
              'nobody built.',
          }),
        );
      }
    }
  }

  return findings;
}
