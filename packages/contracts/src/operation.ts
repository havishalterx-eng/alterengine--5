import type { z } from 'zod';

/**
 * An operation is the single definition of one cross-component call.
 *
 * The schema is the source. Both sides — the server handler and the client
 * method — are derived from this, so a client method with no server operation
 * behind it is not merely untested, it is unrepresentable.
 *
 * The previous build kept a committed `openapi.json` beside 117 hand-written
 * client methods. Both existed; neither produced the other. That is how a
 * method ends up calling a route nobody built, and why "the API exists and the
 * screen never called it" was a whole category of defect rather than a bug.
 */

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Capability status, as it appears in the generated inventory.
 *
 * `unimplemented` and `deferred` both require a tracking reference. That is
 * enforced by the type, not by review — see the union below. Absence has to be
 * legible, and an absence nobody can look up is not legible.
 */
export type CapabilityStatus = 'implemented' | 'unimplemented' | 'deferred';

interface OperationBase<I extends z.ZodType, O extends z.ZodType> {
  /** Component number from docs/architecture/contracts.md. */
  readonly component: number;
  readonly method: HttpMethod;
  readonly path: string;
  readonly input: I;
  readonly output: O;
  /** Human-readable capability name, as it appears in the inventory. */
  readonly capability: string;
}

interface ImplementedOperation<I extends z.ZodType, O extends z.ZodType>
  extends OperationBase<I, O> {
  readonly status: 'implemented';
  readonly trackingReference?: never;
}

interface AbsentOperation<I extends z.ZodType, O extends z.ZodType>
  extends OperationBase<I, O> {
  readonly status: 'unimplemented' | 'deferred';
  /**
   * Required. An unbuilt capability that cannot be looked up is invisible in
   * exactly the way rule 15 forbids.
   */
  readonly trackingReference: string;
}

export type Operation<
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
> = ImplementedOperation<I, O> | AbsentOperation<I, O>;

export type Registry = Readonly<Record<string, Operation>>;

/**
 * Identity function that pins the literal types.
 *
 * Without it, `status: 'unimplemented'` widens to `string` and the union above
 * stops discriminating, which would let an absent capability be declared with
 * no tracking reference.
 */
export function defineOperation<
  const I extends z.ZodType,
  const O extends z.ZodType,
  const T extends Operation<I, O>,
>(operation: T): T {
  return operation;
}

export function defineRegistry<const R extends Registry>(registry: R): R {
  return registry;
}

export type InputOf<T> = T extends Operation<infer I, z.ZodType>
  ? z.infer<I>
  : never;

export type OutputOf<T> = T extends Operation<z.ZodType, infer O>
  ? z.infer<O>
  : never;
