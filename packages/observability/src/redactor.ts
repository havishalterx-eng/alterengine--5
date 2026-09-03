import type { Redactor } from '@alter/safety';

/**
 * The redaction seam.
 *
 * The Redactor type is owned by @alter/safety (rule 18: one definition per
 * shared primitive). It was previously defined here over
 * `Record<string, unknown>` while Safety's redaction spoke `JsonValue`, which
 * forced a cast at the call site — and a cast at a policy boundary is where
 * redaction quietly stops happening (Adversary finding 5).
 *
 * `passThroughRedactor` is deliberately deterministic pass-through for
 * payloads that genuinely need no redaction. It must be passed explicitly so
 * the decision is visible in the diff; there is no default.
 */
export const passThroughRedactor: Redactor = (payload) => payload;

export type { Redactor } from '@alter/safety';
