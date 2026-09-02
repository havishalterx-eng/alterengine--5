import { finding, isTestFile, sourceFiles } from './lib.mjs';
import { lineOf, parse, ts, walk } from './ast.mjs';

/**
 * Gate: everything holding tenant data registers with Deletion & Retention.
 *
 * Rule 20. Erasure that misses one table is not erasure, and the miss stays
 * invisible until someone exercises a legal right and the answer is wrong.
 *
 * Rebuilt after the Adversary evaded the first version, which keyed on class
 * names ending Store, Repository, Repo, Dao or Table. This passed cleanly:
 *
 *   export const workflowCatalog = {
 *     async save(tenantId: TenantId, workflow: Workflow): Promise<void> {
 *       await db.query(
 *         'insert into workflows (tenant_id, body) values ($1, $2)',
 *         [tenantId, workflow],
 *       );
 *     },
 *   };
 *
 * It holds tenant rows under none of those names. The persistence call is the
 * signal, not the identifier.
 *
 * The second bug is also fixed: registration anywhere in a file no longer
 * satisfies every table in it. Each written table is checked by name.
 *
 * STAGED. This is the source-level layer. The Integrator owns the
 * schema-derived gate for component 44, which reads live tables from
 * information_schema and is the load-bearing one. Contract 44 forbids a
 * heuristic as the sole check, and this is explicitly not the sole check —
 * it is the early-warning layer that works before any migration exists.
 */

export const name = 'deletion-registration';
export const closes = 'Rule 20 — erasure must reach every store';

const NO_TENANT_DATA_TAG = /@no-tenant-data\b/;
const TENANT_COLUMN = /\btenant_id\b/i;
const WRITE = /\b(insert\s+into|update|upsert|merge\s+into)\s+([a-z_][a-z0-9_.]*)/i;

/** SQL string literals that write, with the table they write to. */
function tenantWrites(source) {
  const writes = [];

  walk(source, (node) => {
    const text =
      ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        ? node.text
        : ts.isTemplateExpression(node)
          ? node.getText(source)
          : undefined;

    if (!text) return;

    const write = WRITE.exec(text);
    if (!write) return;
    if (!TENANT_COLUMN.test(text)) return;

    writes.push({ table: write[2], node });
  });

  return writes;
}

/** Table names this file registers, from registerForDeletion('table', ...). */
function registeredTables(source) {
  const tables = new Set();

  walk(source, (node) => {
    if (!ts.isCallExpression(node)) return;

    const callee = ts.isIdentifier(node.expression)
      ? node.expression.text
      : ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : undefined;

    if (callee !== 'registerForDeletion') return;

    for (const argument of node.arguments) {
      if (ts.isStringLiteral(argument)) tables.add(argument.text.toLowerCase());
      if (ts.isObjectLiteralExpression(argument)) {
        for (const property of argument.properties) {
          if (
            ts.isPropertyAssignment(property) &&
            property.name.getText(source).replace(/['"]/g, '') === 'table' &&
            ts.isStringLiteral(property.initializer)
          ) {
            tables.add(property.initializer.text.toLowerCase());
          }
        }
      }
    }
  });

  return tables;
}

export async function run() {
  const findings = [];
  const files = await sourceFiles({ includeTests: false });

  for (const file of files) {
    if (isTestFile(file)) continue;

    const { text, source } = await parse(file);
    if (NO_TENANT_DATA_TAG.test(text)) continue;

    const registered = registeredTables(source);

    for (const { table, node } of tenantWrites(source)) {
      if (registered.has(table.toLowerCase())) continue;

      findings.push(
        finding({
          file,
          line: lineOf(source, node),
          message:
            `Writes tenant rows to "${table}" with no registerForDeletion("${table}"). ` +
            'Erasure would silently miss it. Registration anywhere else in this ' +
            'file does not cover this table.',
        }),
      );
    }
  }

  return findings;
}
