import { describe, expect, it } from 'vitest';
import { createObserver, passThroughRedactor, observabilityRecordSchema } from './index.js';

/**
 * Done-gate tests for component 36 (Observability), Phase 1 halves.
 *
 * These four are the Phase 1 scope from docs/build/PHASE-1-SCOPE.md:
 *   1. The event/span schema is typed and versioned — no unstructured string.
 *   2. Every record structurally carries run, node, component and tenant.
 *   3. A failing sink never throws into its caller; it logs loudly locally.
 *   4. Every payload passes through a named redaction boundary.
 */

describe('36.1 — typed, versioned schema (done gate 1)', () => {
  const base = {
    schemaVersion: 1,
    kind: 'span',
    runId: 'run-1',
    nodeId: 'node-1',
    component: '36',
    tenantId: 'tenant-1',
    name: 'model.call',
    payload: { prompt: 'hi' },
  } as const;

  it('accepts a fully attributed record', () => {
    const parsed = observabilityRecordSchema.parse(base);
    expect(parsed.name).toBe('model.call');
  });

  it('rejects a record whose schema version is not current', () => {
    expect(
      observabilityRecordSchema.safeParse({ ...base, schemaVersion: 2 }).success,
    ).toBe(false);
  });

  it('rejects an unstructured string payload at the boundary', () => {
    const observer = createObserver({
      sink: () => {},
      redactor: passThroughRedactor,
    });
    expect(() =>
      observer.emit({ ...base, payload: 'not-an-object' } as never),
    ).toThrow();
  });

  it('rejects a missing attribution field (shape, not values)', () => {
    for (const field of ['runId', 'nodeId', 'component', 'tenantId'] as const) {
      const { [field]: _dropped, ...without } = base as Record<
        string,
        unknown
      >;
      expect(
        observabilityRecordSchema.safeParse(without).success,
        `missing ${field} must not parse`,
      ).toBe(false);
    }
  });
});

describe('36.2 — failing sink is fail-open and loud (done gate 3)', () => {
  const record = {
    schemaVersion: 1,
    kind: 'event',
    runId: 'r',
    nodeId: 'n',
    component: 'c',
    tenantId: 't',
    name: 'x',
    payload: { ok: true },
  };

  it('never throws into its caller, and logs loudly locally', () => {
    const loudLogs: unknown[] = [];
    const emit = createObserver({
      sink: () => {
        throw new Error('sink on fire');
      },
      redactor: passThroughRedactor,
      onSinkError: (error, record) => {
        loudLogs.push({ error, record });
      },
    }).emit;

    // The whole point of fail-open: emit must not propagate the sink's throw.
    expect(() => emit(record)).not.toThrow();
    expect(loudLogs).toHaveLength(1);
    const entry = loudLogs[0] as { error: unknown; record: unknown };
    expect((entry.error as Error).message).toBe('sink on fire');
  });

  it('contains a sink that returns a rejected promise — no unhandled rejection', async () => {
    const loudLogs: unknown[] = [];
    const emit = createObserver({
      sink: () => Promise.reject(new Error('async blowup')) as never,
      redactor: passThroughRedactor,
      onSinkError: (error) => {
        loudLogs.push(error);
      },
    }).emit;

    emit(record);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(loudLogs).toHaveLength(1);
    expect((loudLogs[0] as Error).message).toBe('async blowup');
  });

  it('never sends an unredacted payload when the redactor itself fails', () => {
    const seen: unknown[] = [];
    const loudLogs: unknown[] = [];
    const emit = createObserver({
      sink: (rec) => seen.push(rec),
      redactor: () => {
        throw new Error('redactor down');
      },
      onSinkError: (error) => {
        loudLogs.push(error);
      },
    }).emit;

    expect(() => emit(record)).not.toThrow();
    expect(seen, 'sink must never see an unredacted payload').toHaveLength(0);
    expect(loudLogs).toHaveLength(1);
  });
});

describe('36.3 — redaction seam (done gate 4)', () => {
  it('routes every payload through the named redactor before the sink sees it', () => {
    const seen: unknown[] = [];
    const emit = createObserver({
      sink: (record) => {
        seen.push(record);
      },
      redactor: (payload) => ({ redacted: true, original: payload }),
    }).emit;

    const record = {
      schemaVersion: 1,
      kind: 'event',
      runId: 'r',
      nodeId: 'n',
      component: 'c',
      tenantId: 't',
      name: 'x',
      payload: { secret: 'abc' },
    };
    emit(record);

    const observed = seen[0] as { payload: unknown };
    expect(observed.payload).toEqual({
      redacted: true,
      original: { secret: 'abc' },
    });
  });

  it('has no path that writes a payload raw — the sink is only reachable via emit()', () => {
    // Structural: createObserver never exposes the sink directly.
    const sink = () => {};
    const observer = createObserver({ sink, redactor: passThroughRedactor });
    expect(Object.keys(observer)).toEqual(['emit']);
  });
});
