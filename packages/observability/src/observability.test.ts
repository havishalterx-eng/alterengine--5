import { describe, expect, it } from 'vitest';
import {
  createObserver,
  observabilityRecordSchema,
  passThroughRedactor,
  type ObservabilityRecord,
  type SystemAttribution,
  type TenantAttribution,
} from './index.js';

/**
 * Done-gate tests for component 36 (Observability), Phase 1 halves.
 *
 * These four are the Phase 1 scope from docs/build/PHASE-1-SCOPE.md:
 *   1. The event/span schema is typed and versioned — no unstructured string.
 *   2. Every tenant record structurally carries run, node, component, tenant;
 *      every system record carries driver identity and CANNOT name a run.
 *   3. A failing sink never throws into its caller; it logs loudly locally.
 *   4. Every payload passes through a named redaction boundary.
 *
 * Type-level proofs (bigint rejected at compile time, system record with a
 * runId rejected at compile time) live in type-proofs.ts, where
 * `@ts-expect-error` makes `pnpm build` fail if either regression returns.
 */

const tenantRecord: ObservabilityRecord & TenantAttribution = {
  schemaVersion: 1,
  kind: 'span',
  scope: 'tenant',
  runId: 'run-1',
  nodeId: 'node-1',
  component: '26',
  tenantId: 'tenant-1',
  name: 'model.call',
  payload: { prompt: 'hi' },
};

const systemRecord: ObservabilityRecord & SystemAttribution = {
  schemaVersion: 1,
  kind: 'event',
  scope: 'system',
  component: '38',
  driver: 'audit-verifier-scheduler',
  name: 'audit.verification.tick.started',
  payload: {},
};

describe('36.1 — typed, versioned, JSON-safe schema (done gate 1, finding 3)', () => {
  it('accepts a fully attributed tenant record', () => {
    const parsed = observabilityRecordSchema.parse(tenantRecord);
    expect(parsed.name).toBe('model.call');
  });

  it('accepts a system record carrying driver identity', () => {
    const parsed = observabilityRecordSchema.parse(systemRecord);
    expect(parsed.name).toBe('audit.verification.tick.started');
  });

  it('rejects a record whose schema version is not current', () => {
    expect(
      observabilityRecordSchema.safeParse({ ...tenantRecord, schemaVersion: 2 })
        .success,
    ).toBe(false);
  });

  it('rejects an unstructured string payload at the runtime boundary', () => {
    // The type makes this unreachable from typed code; the schema still
    // enforces it for dynamically assembled records.
    expect(
      observabilityRecordSchema.safeParse({ ...tenantRecord, payload: 'nope' })
        .success,
    ).toBe(false);
  });

  it('rejects a bigint payload value at the runtime boundary, loudly', () => {
    const result = observabilityRecordSchema.safeParse({
      ...tenantRecord,
      payload: { costMinorUnits: 17n },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        'cannot survive JSON serialisation',
      );
    }
  });

  it('rejects a circular payload without overflowing the stack', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(
      observabilityRecordSchema.safeParse({ ...tenantRecord, payload: circular })
        .success,
    ).toBe(false);
  });

  it('rejects a missing attribution field on a tenant record (shape, not values)', () => {
    const cases: Record<string, unknown>[] = [];
    for (const field of ['runId', 'nodeId', 'component', 'tenantId'] as const) {
      const copy: Record<string, unknown> = { ...tenantRecord };
      delete copy[field];
      cases.push(copy);
    }
    for (const [index, without] of cases.entries()) {
      expect(
        observabilityRecordSchema.safeParse(without).success,
        `missing ${['runId', 'nodeId', 'component', 'tenantId'][index]} must not parse`,
      ).toBe(false);
    }
  });
});

describe('36.1b — system records cannot fabricate a run (finding 4)', () => {
  it('rejects a system record that names a runId', () => {
    // The type has no runId field; the strict schema rejects the smuggled key
    // for any record assembled dynamically.
    const result = observabilityRecordSchema.safeParse({
      ...systemRecord,
      runId: 'system:worker',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes('runId')),
      ).toBe(true);
    }
  });

  it('rejects a system record that names a nodeId or a tenant', () => {
    expect(
      observabilityRecordSchema.safeParse({ ...systemRecord, nodeId: 'n' })
        .success,
    ).toBe(false);
    expect(
      observabilityRecordSchema.safeParse({ ...systemRecord, tenantId: 't' })
        .success,
    ).toBe(false);
  });

  it('rejects a system record without driver identity', () => {
    const withoutDriver: Record<string, unknown> = { ...systemRecord };
    delete withoutDriver.driver;
    expect(observabilityRecordSchema.safeParse(withoutDriver).success).toBe(
      false,
    );
  });
});

describe('36.2 — failing sink is fail-open and loud (done gate 3)', () => {
  const record: ObservabilityRecord = {
    schemaVersion: 1,
    kind: 'event',
    scope: 'tenant',
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
      sink: (rec) => {
        seen.push(rec);
      },
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

describe('36.3 — redaction seam (done gate 4, finding 5)', () => {
  it('routes every payload through the named redactor before the sink sees it', () => {
    const seen: unknown[] = [];
    const emit = createObserver({
      sink: (record) => {
        seen.push(record);
      },
      redactor: (payload) => ({ redacted: true, original: payload }),
    }).emit;

    emit({
      schemaVersion: 1,
      kind: 'event',
      scope: 'tenant',
      runId: 'r',
      nodeId: 'n',
      component: 'c',
      tenantId: 't',
      name: 'x',
      payload: { secret: 'abc' },
    });

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
