/**
 * The redaction seam.
 *
 * Phase-1 gate 4: every payload passes through a named redaction boundary
 * before a sink sees it. The real redactor ships in component 37 (Builder A);
 * until it lands, `passThroughRedactor` is deliberately deterministic pass-
 * through. There is no other path to a sink.
 */
export type Redactor = (payload: Record<string, unknown>) => Record<string, unknown>;

export const passThroughRedactor: Redactor = (payload) => payload;
