// TODO(component-44): add 'cost_ledger_entries' to tenantDataDeclarations
// once Builder B's packages/deletion-registry lands on main. It holds
// tenant rows, so erasure must reach it; the deletion-registration gate
// flags it until then and that flag is correct.
import { readFile } from 'node:fs/promises';
import { Pool, type QueryResultRow } from 'pg';

export interface CostEvent {
  readonly billableCostMinorUnits: bigint;
  readonly idempotencyKey: string;
  readonly internalCostMinorUnits: bigint;
  readonly marginMinorUnits: bigint;
  readonly model: string;
  readonly nodeId: string;
  readonly provider: string;
  readonly recoveryAttempt: bigint;
  readonly retryAttempt: bigint;
  readonly runId: string;
  readonly sandboxComputeMinorUnits: bigint;
  readonly storageMinorUnits: bigint;
  readonly tenantId: string;
  readonly toolName: string;
  /** Present from first migration; no verifier exists to populate it in Phase 1. */
  readonly verificationVerdict: null;
  readonly workflowId: string;
}

export interface CostRecordResult {
  readonly inserted: boolean;
}

export interface CostLedger {
  close(): Promise<void>;
  migrate(): Promise<void>;
  record(event: CostEvent): Promise<CostRecordResult>;
  totalInternalCostForRun(runId: string): Promise<bigint>;
}

export function createCostLedger({ databaseUrl }: { readonly databaseUrl: string }): CostLedger {
  const pool = new Pool({ connectionString: databaseUrl });

  return {
    close: async () => pool.end(),
    migrate: async () => {
      const migration = await readFile(
        new URL('../migrations/001_cost_ledger.sql', import.meta.url),
        'utf8',
      );
      await pool.query(migration);
    },
    record: async (event) => {
      const inserted = await pool.query(
        `INSERT INTO cost_ledger_entries (
          idempotency_key, tenant_id, workflow_id, run_id, node_id, provider, model, tool_name,
          sandbox_compute_minor_units, storage_minor_units, retry_attempt, recovery_attempt,
          internal_cost_minor_units, billable_cost_minor_units, margin_minor_units, verification_verdict
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        ) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
        [
          event.idempotencyKey,
          event.tenantId,
          event.workflowId,
          event.runId,
          event.nodeId,
          event.provider,
          event.model,
          event.toolName,
          event.sandboxComputeMinorUnits,
          event.storageMinorUnits,
          event.retryAttempt,
          event.recoveryAttempt,
          event.internalCostMinorUnits,
          event.billableCostMinorUnits,
          event.marginMinorUnits,
          event.verificationVerdict,
        ],
      );
      return { inserted: inserted.rowCount === 1 };
    },
    totalInternalCostForRun: async (runId) => {
      const result = await pool.query<TotalRow>(
        'SELECT COALESCE(SUM(internal_cost_minor_units), 0)::text AS total FROM cost_ledger_entries WHERE run_id = $1',
        [runId],
      );
      return BigInt(result.rows[0]?.total ?? '0');
    },
  };
}

interface TotalRow extends QueryResultRow {
  readonly total: string;
}
