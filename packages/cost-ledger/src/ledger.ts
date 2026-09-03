import { readFile } from 'node:fs/promises';
import { Pool, type QueryResultRow } from 'pg';

/**
 * Component 39 — Cost Ledger.
 *
 * Scaled-integer pricing decision (Adversary finding 2, third bullet):
 * the minor-unit scale is 10^-6 — six decimal places, "micro-units". All
 * money in this component is a bigint count of micro-units. Rounding happens
 * EXACTLY ONCE, here, inside parseMinorUnits(): a caller hands over the
 * provider's decimal price as a string and receives the scaled integer.
 * Nobody downstream may round, re-scale, or convert — and no float ever
 * participates, which the cost-no-float gate enforces structurally.
 *
 * Why 10^-6: provider pricing (per-token model prices especially) commonly
 * carries six decimals; a coarser scale would silently re-round at the
 * caller, and a finer one buys nothing that survives a currency conversion.
 */

/** The minor-unit scale: one unit of currency is 10^6 micro-units. */
export const MINOR_UNIT_SCALE = 1_000_000n;

export interface CostEvent {
  readonly billableCostMinorUnits: bigint;
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
  readonly workflowId: string;
}

/**
 * The verdict values Verification (29) may attach. The ledger records them;
 * it never decides them. Values are fixed here so the database column and
 * the Phase 2 writer agree from the first row.
 */
export type VerificationVerdict = 'passed' | 'failed' | 'needs_review';

export interface CostRecordResult {
  readonly inserted: boolean;
  readonly idempotencyKey: string;
}

export interface VerdictAttachment {
  readonly idempotencyKey: string;
  readonly verdict: VerificationVerdict;
}

export class CostNotFoundError extends Error {
  public constructor(idempotencyKey: string) {
    super(`No cost entry with idempotency key ${idempotencyKey}: a verdict cannot be attached to a cost that does not exist`);
    this.name = 'CostNotFoundError';
  }
}

export class VerdictConflictError extends Error {
  public constructor(idempotencyKey: string, existing: string, attempted: string) {
    super(
      `Cost entry ${idempotencyKey} already carries verdict "${existing}"; ` +
      `refusing to overwrite it with "${attempted}". A verdict is terminal.`,
    );
    this.name = 'VerdictConflictError';
  }
}

/**
 * The canonical idempotency key (Adversary finding 2, second bullet).
 *
 * Belongs to this component, not to each caller: two consumers inventing
 * their own key format is a double charge. The key is derived from the full
 * event identity, so the same call — same run, node, provider, model, tool,
 * retry and recovery attempt — always deduplicates to one row, and a
 * genuinely distinct attempt never collides.
 */
export function buildCostEventKey(event: CostEvent): string {
  return [
    'cost',
    'v1',
    event.tenantId,
    event.workflowId,
    event.runId,
    event.nodeId,
    event.provider,
    event.model,
    event.toolName,
    event.retryAttempt.toString(),
    event.recoveryAttempt.toString(),
  ].join(':');
}

/**
 * Parses a decimal price string into scaled integer micro-units.
 * Round-half-up at the sixth decimal — the single rounding point in the
 * cost path. String arithmetic and BigInt only; no float ever exists.
 */
export function parseMinorUnits(price: string): bigint {
  if (!/^-?\d+(\.\d+)?$/.test(price)) {
    throw new Error(`Not a plain decimal price: "${price}"`);
  }
  const negative = price.startsWith('-');
  const unsigned = negative ? price.slice(1) : price;
  const [integerPart, fractionalPart = ''] = unsigned.split('.');
  // The regex above guarantees an integer part; this is the fail-closed
  // narrowing for noUncheckedIndexedAccess, not a reachable branch.
  if (integerPart === undefined) throw new Error(`Not a plain decimal price: "${price}"`);
  const kept = fractionalPart.slice(0, 6).padEnd(6, '0');
  const dropped = fractionalPart.slice(6);
  let microUnits = BigInt(integerPart) * MINOR_UNIT_SCALE + BigInt(kept);
  if (dropped.length > 0 && dropped[0] !== undefined && dropped[0] >= '5') {
    microUnits += 1n;
  }
  return negative ? -microUnits : microUnits;
}

export interface CostLedger {
  close(): Promise<void>;
  migrate(): Promise<void>;
  record(event: CostEvent): Promise<CostRecordResult>;
  /** Attaches a verification verdict to a recorded cost. Attaching to a cost that does not exist fails loudly. */
  attachVerdict(attachment: VerdictAttachment): Promise<void>;
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
      // The key is computed, never accepted: a caller cannot invent a
      // colliding or divergent format, because the field is not theirs.
      const idempotencyKey = buildCostEventKey(event);
      const inserted = await pool.query(
        `INSERT INTO cost_ledger_entries (
          idempotency_key, tenant_id, workflow_id, run_id, node_id, provider, model, tool_name,
          sandbox_compute_minor_units, storage_minor_units, retry_attempt, recovery_attempt,
          internal_cost_minor_units, billable_cost_minor_units, margin_minor_units, verification_verdict
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NULL
        ) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
        [
          idempotencyKey,
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
        ],
      );
      return { inserted: inserted.rowCount === 1, idempotencyKey };
    },
    attachVerdict: async ({ idempotencyKey, verdict }) => {
      // Only a row with no verdict, or the same verdict (idempotent replay),
      // may be updated. A different verdict on a verdicted cost is terminal
      // and rejected; a missing cost is not silently created.
      const updated = await pool.query(
        `UPDATE cost_ledger_entries
         SET verification_verdict = $2
         WHERE idempotency_key = $1 AND (verification_verdict IS NULL OR verification_verdict = $2)
         RETURNING id`,
        [idempotencyKey, verdict],
      );
      if (updated.rowCount === 1) return;

      const existing = await pool.query<{ verification_verdict: string | null }>(
        'SELECT verification_verdict FROM cost_ledger_entries WHERE idempotency_key = $1',
        [idempotencyKey],
      );
      const current = existing.rows[0]?.verification_verdict;
      if (current === undefined) throw new CostNotFoundError(idempotencyKey);
      // Unreachable for a null verdict (the update above would have matched
      // it); the fallback keeps the type honest rather than casted.
      throw new VerdictConflictError(idempotencyKey, current ?? 'null', verdict);
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
