import { observabilityRecordSchema, type ObservabilityRecord } from './schema.js';
import { type Redactor } from './redactor.js';

export type Sink = (record: ObservabilityRecord) => void | Promise<void>;

interface Thenable {
  then(
    onFulfilled?: ((value: unknown) => unknown) | undefined,
    onRejected?: ((reason: unknown) => unknown) | undefined,
  ): unknown;
}

/**
 * Duck-typed, not `instanceof Promise`.
 *
 * The Adversary found that a promise from another realm — a worker thread, a
 * vm context, a bundled copy of a library — is not `instanceof Promise`, so
 * the check missed it and the rejection went unhandled.
 */
function isThenable(value: unknown): value is Thenable {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

interface ObserverOptions {
  sink: Sink;
  /**
   * REQUIRED. There is no default.
   *
   * The Adversary found that defaulting to passThroughRedactor sent
   * `{ ssn: 'SSN-123' }` to the sink unredacted whenever a caller set the
   * observer up the simple way — which is the way most callers set things up.
   * A safe default that has to be remembered is not a default, and rule 19
   * says the dangerous configuration is never what you get by doing nothing.
   *
   * Pass passThroughRedactor explicitly if a payload genuinely needs no
   * redaction. Then that decision is visible in the diff.
   */
  redactor: Redactor;
  /**
   * Fail-open needs a loud local log. Default: console.error. Callers may
   * substitute, e.g. tests. The sink's error is logged, never rethrown.
   */
  onSinkError?: (error: unknown, record: unknown) => void;
}

/**
 * What a consumer holds.
 *
 * Exported because the first real consumer had to write
 * `Pick<ReturnType<typeof createObserver>, 'emit'>` to inject an observer,
 * and every consumer after it would have written the same thing or invented a
 * different shape. Rule 18: one definition per shared primitive, and the
 * definition belongs here rather than being reconstructed at each call site.
 */
export interface Observer {
  /**
   * Typed, JSON-safe input (Adversary finding 3): a record carrying a bigint
   * or any other unserialisable value does not typecheck. The runtime schema
   * check remains as defence for dynamically-built records, and a failure
   * there is loud, not a silent drop.
   */
  emit(record: ObservabilityRecord): void;
}

/**
 * Composition-root observer. The only way a record reaches a sink.
 * Fail-open: sink errors are logged loudly and never propagate.
 */
export function createObserver(options: ObserverOptions): Observer {
  const redactor = options.redactor;
  const reportFailure =
    options.onSinkError ??
    ((error: unknown, record: unknown) => {
      // Loud local logging. Fail-open means emit() must recover; silence here
      // would make an observability outage invisible, which rule 18 forbids.
      console.error(
        '[observability] sink failure (fail-open); record dropped:',
        error,
        record,
      );
    });

  /**
   * The error reporter must not become the error.
   *
   * The Adversary found that an onSinkError which itself throws propagated
   * straight into emit(), so the one path guaranteeing fail-open was the path
   * that broke it. Nothing past this point can throw into a caller.
   */
  const onSinkError = (error: unknown, record: unknown): void => {
    try {
      const reported = reportFailure(error, record) as unknown;
      if (isThenable(reported)) reported.then(undefined, () => {});
    } catch {
      // Deliberately silent. There is nowhere left to report to, and
      // rethrowing here would defeat the entire purpose of this wrapper.
    }
  };

  return {
    emit(record: ObservabilityRecord) {
      // A malformed record must not break the run it is describing. The input
      // is typed, but records can be assembled dynamically, so the schema is
      // still enforced at runtime — loudly, never as a silent drop.
      //
      // The parse itself is guarded because zod's safeParse does not catch
      // arbitrary exceptions: a payload getter that throws (PR #5 round 2,
      // finding 3) crashes inside zod's record parse before any refinement
      // runs. That exception is a validation failure here, not a crash into
      // a caller who only asked to log something.
      let parsed: ReturnType<typeof observabilityRecordSchema.safeParse>;
      try {
        parsed = observabilityRecordSchema.safeParse(record);
      } catch (error) {
        onSinkError(error, record);
        return;
      }
      if (!parsed.success) {
        onSinkError(parsed.error, record);
        return;
      }

      let redacted: ObservabilityRecord;
      try {
        const payload = redactor(record.payload);

        // A redactor returning a promise would put that promise in the record
        // and leave its rejection unhandled. Redaction is synchronous by
        // contract; anything else is dropped fail-closed rather than sent.
        if (isThenable(payload)) {
          payload.then(undefined, () => {});
          onSinkError(
            new Error('redactor returned a promise; redaction must be synchronous'),
            record,
          );
          return;
        }

        redacted = { ...record, payload };
      } catch (error) {
        // Fail-CLOSED for the record: never send an unredacted payload to a
        // sink. The run survives, the record is dropped, the failure is loud.
        onSinkError(error, record);
        return;
      }

      try {
        const result = options.sink(redacted) as unknown;
        if (isThenable(result)) {
          result.then(undefined, (error: unknown) => onSinkError(error, redacted));
        }
      } catch (error) {
        // A thrown value can itself be a rejected promise. Caught as a value,
        // its rejection would still go unhandled.
        if (isThenable(error)) error.then(undefined, () => {});
        onSinkError(error, redacted);
      }
    },
  };
}
