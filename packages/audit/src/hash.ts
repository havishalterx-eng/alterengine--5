/**
 * Component 38 — Audit. Hash-chain primitives.
 *
 * Every entry carries a 32-byte `entry_hash` over its own fields plus the
 * `prev_hash` of its predecessor, so the chain is tamper-evident: changing any
 * field breaks the recomputed hash, and changing the hash breaks the next
 * entry's linkage.
 *
 * The genesis hash is 32 zero bytes. The first entry's `prev_hash` is the
 * genesis hash.
 */

import { createHash } from 'node:crypto';

/** 32 zero bytes — the predecessor of the first entry in the chain. */
export const GENESIS_HASH: Buffer = Buffer.alloc(32, 0);

export function toHex(buffer: Buffer): string {
  return buffer.toString('hex');
}

export function fromHex(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

export interface HashableEvent {
  readonly prevHash: Buffer;
  readonly seq: number;
  readonly tenantId: string;
  readonly actorId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly payload: unknown;
}

/**
 * The canonical serialization of an event's fields, excluding `entry_hash`
 * itself. Key order is fixed so the hash is deterministic across processes.
 */
export function canonicalize(event: HashableEvent): string {
  return JSON.stringify({
    prevHash: toHex(event.prevHash),
    seq: event.seq,
    tenantId: event.tenantId,
    actorId: event.actorId,
    eventType: event.eventType,
    occurredAt: event.occurredAt.toISOString(),
    payload: event.payload ?? null,
  });
}

/** SHA-256 of the canonical event. Always 32 bytes. */
export function computeEntryHash(event: HashableEvent): Buffer {
  return createHash('sha256').update(canonicalize(event)).digest();
}
