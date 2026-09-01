/**
 * The absence-visible protocol.
 *
 * Rule 15: absence is visible, never invisible. A declared-but-unbuilt
 * capability returns a real 501 with a tracking reference, renders a genuine
 * disabled state, and is marked unimplemented in the generated inventory.
 *
 * This is the constructive twin of fail-closed. Fail-closed says an
 * unverifiable thing must not pass; absence-visible says an unbuilt thing must
 * announce itself. Together they make the previous build's worst pattern
 * impossible: a stub that returns plausible data and is indistinguishable from
 * a working implementation.
 *
 * A stub MUST NOT return a fabricated success. It throws this.
 */

export class UnimplementedCapabilityError extends Error {
  override readonly name = 'UnimplementedCapabilityError';

  /** HTTP status. 501 Not Implemented, never 200 with empty data. */
  readonly status = 501 as const;

  /** Component number from docs/architecture/contracts.md. */
  readonly component: number;

  /** The capability that does not exist yet. */
  readonly capability: string;

  /** Issue or ticket tracking the work. Required — absence must be trackable. */
  readonly trackingReference: string;

  constructor(args: {
    component: number;
    capability: string;
    trackingReference: string;
  }) {
    super(
      `Capability "${args.capability}" (component ${args.component}) is declared but not implemented. ` +
        `Tracking: ${args.trackingReference}.`,
    );
    this.component = args.component;
    this.capability = args.capability;
    this.trackingReference = args.trackingReference;
  }

  toResponseBody(): {
    error: 'unimplemented';
    component: number;
    capability: string;
    trackingReference: string;
    message: string;
  } {
    return {
      error: 'unimplemented',
      component: this.component,
      capability: this.capability,
      trackingReference: this.trackingReference,
      message: this.message,
    };
  }
}

/**
 * Marks a code path as not built. Call it; never return a placeholder value.
 *
 * The return type is `never`, so TypeScript will not let a caller treat the
 * result as data. That is deliberate — it makes "stub that quietly returns
 * something" a compile error rather than a code-review finding.
 */
export function unimplemented(args: {
  component: number;
  capability: string;
  trackingReference: string;
}): never {
  throw new UnimplementedCapabilityError(args);
}
