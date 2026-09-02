/**
 * Component 38 — Audit. Chain verifier.
 *
 * Detects all four real failure modes of a hash chain:
 *   - hash-mismatch: a field was changed without recomputing the entry hash.
 *   - fork: two entries claim the same predecessor (same prev_hash).
 *   - cycle: the chain loops — an entry hash is revisited.
 *   - orphan: an entry's predecessor does not exist in the chain.
 *
 * The previous build's verifier detected all four correctly and was never
 * called. This verifier is the same logic; the driver that runs it on a
 * schedule is what makes it real (see apps/worker/src/drivers).
 *
 * The core is a pure function over events so every failure mode is testable.
 * Fork and cycle are physically impossible to insert through the real store —
 * the unique constraints on prev_hash and entry_hash forbid them — so the
 * verifier is the second line of defence that catches them if they ever appear
 * (for example if the constraints are ever dropped or the data is restored
 * from a tampered backup).
 */

import type { AuditStore} from './audit-store.js';
import { type AuditEvent } from './audit-store.js';
import { computeEntryHash, GENESIS_HASH, toHex } from './hash.js';

export type VerificationIssueType =
  | 'hash-mismatch'
  | 'fork'
  | 'cycle'
  | 'orphan';

export interface VerificationIssue {
  readonly type: VerificationIssueType;
  readonly seq: number;
  readonly detail: string;
}

export interface VerificationResult {
  readonly valid: boolean;
  readonly issues: readonly VerificationIssue[];
}

/** Verifies a chain of events in sequence order. Fail-closed. */
/**
 * @verifier-driver AuditChainVerifier.verify
 *
 * The batch form. Production uses the incremental form — AuditChainVerifier
 * pages the chain so it never loads whole into memory — and both share
 * `checkEvent`, which is where every tamper check actually lives.
 *
 * This form exists because two of the four tamper modes, a forked chain and a
 * cycle, are physically un-insertable through the real store: the unique
 * constraint on the previous hash forbids them. They are proved by feeding
 * tampered event lists to this function directly. Hash mismatch and orphan
 * are proved against the real database.
 *
 * So it is genuinely not called from production, and that is the design
 * rather than an oversight. It is marked instead of deleted because deleting
 * it would remove the only way to test the two modes the database prevents.
 */
export function verifyEvents(events: readonly AuditEvent[]): VerificationResult {
  const issues: VerificationIssue[] = [];
  const state: ChainState = {
    seenEntryHashes: new Set(),
    seenPrevHashes: new Set(),
  };
  for (const event of events) {
    checkEvent(event, state, issues);
  }
  return { valid: issues.length === 0, issues };
}

interface ChainState {
  readonly seenEntryHashes: Set<string>;
  readonly seenPrevHashes: Set<string>;
}

/** Applies the four failure-mode checks to one event, mutating state. */
function checkEvent(
  event: AuditEvent,
  state: ChainState,
  issues: VerificationIssue[],
): void {
  const entryHex = toHex(event.entryHash);
  const prevHex = toHex(event.prevHash);

  // hash-mismatch: recompute and compare.
  const expected = computeEntryHash({
    prevHash: event.prevHash,
    seq: event.seq,
    tenantId: event.tenantId,
    actorId: event.actorId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    payload: event.payload,
  });
  if (!expected.equals(event.entryHash)) {
    issues.push({
      type: 'hash-mismatch',
      seq: event.seq,
      detail: `recomputed ${toHex(expected)} != stored ${entryHex}`,
    });
  }

  // orphan: predecessor does not exist among earlier entries.
  if (!event.prevHash.equals(GENESIS_HASH) && !state.seenEntryHashes.has(prevHex)) {
    issues.push({
      type: 'orphan',
      seq: event.seq,
      detail: `prev_hash ${prevHex} has no matching entry in the chain`,
    });
  }

  // fork: another entry already claimed this predecessor.
  if (state.seenPrevHashes.has(prevHex)) {
    issues.push({
      type: 'fork',
      seq: event.seq,
      detail: `prev_hash ${prevHex} is already claimed by an earlier entry`,
    });
  }

  // cycle: this entry hash was already seen.
  if (state.seenEntryHashes.has(entryHex)) {
    issues.push({
      type: 'cycle',
      seq: event.seq,
      detail: `entry_hash ${entryHex} already appears earlier in the chain`,
    });
  }

  state.seenEntryHashes.add(entryHex);
  state.seenPrevHashes.add(prevHex);
}

export class AuditChainVerifier {
  constructor(private readonly store: AuditStore) {}

  /**
   * Verifies the real chain in the store. The read path is incremental — the
   * chain is read in pages, never loaded whole into memory — so it can run on
   * a schedule. The whole chain is still verified, so tampering anywhere is
   * caught.
   */
  async verify(): Promise<VerificationResult> {
    const issues: VerificationIssue[] = [];
    const state: ChainState = {
      seenEntryHashes: new Set(),
      seenPrevHashes: new Set(),
    };
    const PAGE = 1000;
    let offset = 0;
    for (;;) {
      const page = await this.store.readPage(PAGE, offset);
      if (page.length === 0) break;
      for (const event of page) {
        checkEvent(event, state, issues);
      }
      offset += page.length;
    }
    return { valid: issues.length === 0, issues };
  }
}
