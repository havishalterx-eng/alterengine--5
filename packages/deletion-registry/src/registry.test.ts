import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import {
  tenantDataDeclarations,
  tenantDataExemptions,
  certifySchemaCoverage,
  listLiveTables,
} from './index.js';

/**
 * Done-gate tests for component 44 (Deletion & Retention), registration
 * interface — Phase 1 halves from docs/build/PHASE-1-SCOPE.md:
 *   1. A declaration is written in code and read back — here, verified
 *      against real Postgres (the gate's join is at string level).
 *   2. Live-schema enumeration sees a real table and flags it unregistered.
 *   3. Missing declaration yields `incomplete` — never a silent skip.
 *
 * Real execution: the live-schema enumeration runs against the shared
 * Postgres on 5440, in Builder B's own database (alter_builder_b).
 */

const dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(dirname, '../../../.env');
process.loadEnvFile(envPath);

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined) {
  // Fail closed (rule 7): an unconfigured test is an error, not a skip.
  throw new Error('DATABASE_URL is not set; cannot verify against real Postgres');
}

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

describe('44 — declaration shape (done gate 1)', () => {
  it('declarations name physical table names, each with component and owner', () => {
    for (const d of tenantDataDeclarations) {
      expect(d.table, 'must be a physical table name').toMatch(/^[a-z_][a-z0-9_]*$/);
      expect(typeof d.component).toBe('number');
      expect(d.owner.length).toBeGreaterThan(0);
    }
  });

  it('exemptions each carry a non-empty reason and a named owner, no wildcards', () => {
    for (const e of tenantDataExemptions) {
      expect(e.reason.length, 'exemption must have a reason').toBeGreaterThan(0);
      expect(e.owner.length, 'exemption must have a named owner').toBeGreaterThan(0);
      expect(e.table).not.toContain('*');
    }
  });
});

describe('44 — live-schema enumeration vs real Postgres (done gate 2)', () => {
  const probeTable = 'wt_b_gate44_probe';

  it('sees a real table, flags it unregistered, and re-checks after drop', async () => {
    await client.query(`CREATE TABLE ${probeTable} (id serial PRIMARY KEY)`);
    let tables = await listLiveTables(client);
    expect(tables).toContain(probeTable);

    const probeDecls = tenantDataDeclarations.filter((d) => d.table !== probeTable);
    const first = certifySchemaCoverage(tables, probeDecls, tenantDataExemptions);
    expect(first.status).toBe('incomplete');
    if (first.status === 'incomplete') {
      expect(first.unregistered).toContain(probeTable);
    }

    await client.query(`DROP TABLE ${probeTable}`);
    tables = await listLiveTables(client);
    expect(tables).not.toContain(probeTable);

    // Drift in the other direction: a declaration for a table gone missing.
    const stale = certifySchemaCoverage(
      tables,
      [...tenantDataDeclarations, { table: probeTable, component: 44, owner: 'Builder B' }],
      tenantDataExemptions,
    );
    expect(stale.status).toBe('incomplete');
    if (stale.status === 'incomplete') {
      expect(stale.stale).toContain(probeTable);
    }
  });
});

describe('44 — fail-closed semantics (done gate 3)', () => {
  it('missing declaration for a live table yields incomplete, never skipped', () => {
    const result = certifySchemaCoverage(
      ['users'],
      [{ table: 'audit_log', component: 38, owner: 'Builder C' }],
      [],
    );
    expect(result.status).toBe('incomplete');
    if (result.status === 'incomplete') {
      expect(result.unregistered).toEqual(['users']);
    }
  });

  it('exempted tables are explicitly out of scope, not silently skipped', () => {
    const result = certifySchemaCoverage(
      ['users'],
      [],
      [{ table: 'users', reason: 'no tenant data; system config only', owner: 'CEO' }],
    );
    expect(result.status).toBe('complete');
  });
});
