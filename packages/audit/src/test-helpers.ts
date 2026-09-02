/**
 * Test helper — real Postgres on the builder's own database.
 *
 * Done means verified against real execution. These helpers connect to the
 * real Postgres instance (port 5440) on the builder's own database
 * (alter_builder_c), apply the real schema, and clean the tables between
 * tests. No fixtures, no mocks.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { AuditAlertSink, AuditChainVerifier, AuditStore, SCHEMA_SQL } from './index.js';

/** The builder's own database, from .env or the environment. */
export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = join(process.cwd(), '.env');
  const text = readFileSync(envPath, 'utf8');
  const match = text.match(/^DATABASE_URL=(.+)$/m);
  if (!match) {
    throw new Error('DATABASE_URL is not set and not present in .env');
  }
  return match[1]!.trim();
}

export interface AuditHarness {
  readonly store: AuditStore;
  readonly verifier: AuditChainVerifier;
  readonly alerts: AuditAlertSink;
  readonly pool: Pool;
  close(): Promise<void>;
}

/** Builds a store + verifier + alert sink against the real database. */
export async function createAuditHarness(): Promise<AuditHarness> {
  const store = new AuditStore({ connectionString: databaseUrl() });
  await store.ensureSchema();
  await store.pool.query('TRUNCATE audit_events, audit_alerts RESTART IDENTITY CASCADE');
  const verifier = new AuditChainVerifier(store);
  const alerts = new AuditAlertSink(store.pool);
  return {
    store,
    verifier,
    alerts,
    pool: store.pool,
    async close() {
      await store.close();
    },
  };
}

/** Applies the schema to a fresh pool (used by tests that need raw SQL). */
export async function applySchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
