import { observabilityRecordSchema, type ObservabilityRecord } from './schema.js';
import { passThroughRedactor, type Redactor } from './redactor.js';

export type Sink = (record: ObservabilityRecord) => void;

interface ObserverOptions {
  sink: Sink;
  redactor?: Redactor;
  /**
   * Fail-open needs a loud local log. Default: console.error. Callers may
   * substitute, e.g. tests. The sink's error is logged, never rethrown.
   */
  onSinkError?: (error: unknown, record: unknown) => void;
}

/**
 * Composition-root observer. The only way a record reaches a sink.
 * Fail-open: sink errors are logged loudly and never propagate.
 */
export function createObserver(options: ObserverOptions) {
  const redactor = options.redactor ?? passThroughRedactor;
  const onSinkError =
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

  return {
    emit(record: unknown) {
      const validated = observabilityRecordSchema.parse(record);

      const redacted: ObservabilityRecord = {
        ...validated,
        payload: redactor(validated.payload),
      };

      try {
        options.sink(redacted);
      } catch (error) {
        onSinkError(error, redacted);
      }
    },
  };
}
