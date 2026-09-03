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

  it('rejects every unsafe shape in the exhaustive table — one rule, not cases', () => {
    // PR #5 round 3: the validator was REPLACED with a descriptor walk
    // (Reflect.ownKeys + Object.getOwnPropertyDescriptor, never reading a
    // property before its descriptor is confirmed plain enumerable data).
    // This table is the proof it is exhaustive rather than reactive: every
    // shape the Adversary found across three review rounds, plus cases found
    // while building this list that no review had tried yet.
    //
    // A rejected entry may either fail validation or throw inside zod's
    // record parse (a throwing getter) — both count as rejected, because
    // emit() contains the throw (proven in the fail-open describe below).
    const unsafeShapes: ReadonlyArray<readonly [string, () => unknown]> = [
      // --- the original Map repro (PR #5 finding 1) ---
      ['Map', () => new Map([['minorUnits', '17']])],
      // --- round 2 findings ---
      ['Set', () => new Set(['a'])],
      ['symbol key', () => ({ [Symbol('secret')]: 'v' })],
      ['sparse array via constructor', () => new Array(1)],
      ['sparse array via delete', () => {
        const array = ['x', 'y'];
        Reflect.deleteProperty(array, '0');
        return array;
      }],
      ['array with extra property', () => {
        const array = ['x'];
        Object.defineProperty(array, 'hidden', {
          value: 'lost', enumerable: true, writable: true, configurable: true,
        });
        return array;
      }],
      ['array with symbol key', () => {
        const array = ['x'];
        Object.defineProperty(array, Symbol('s'), {
          value: 'v', enumerable: true, writable: true, configurable: true,
        });
        return array;
      }],
      ['array with a getter index', () => {
        const array = ['x'];
        Object.defineProperty(array, '0', { get: () => 'y', enumerable: true, configurable: true });
        return array;
      }],
      ['object with a throwing getter', () => ({
        get cost() {
          throw new Error('boom');
        },
      })],
      // --- round 3 prompt table ---
      ['WeakMap', () => new WeakMap()],
      ['WeakSet', () => new WeakSet()],
      ['class instance', () => new (class Money {
        public readonly minorUnits = '17';
      })()],
      ['class instance with toJSON()', () => new (class WithToJson {
        public toJSON(): Record<string, never> {
          return {};
        }
      })()],
      ['object with a non-throwing getter (accessor)', () => ({
        get cost() {
          return '17';
        },
      })],
      ['object with a setter-only property', () => {
        const object: Record<string, unknown> = {};
        Object.defineProperty(object, 'x', { set: () => {}, enumerable: true, configurable: true });
        return object;
      }],
      ['object with a non-enumerable property', () => {
        const object = { visible: 1 };
        Object.defineProperty(object, 'hidden', {
          value: 'x', enumerable: false, writable: true, configurable: true,
        });
        return object;
      }],
      ['Proxy whose get trap lies (descriptor says string, trap returns bigint)', () =>
        new Proxy({ cost: '17' }, {
          get(target, key) {
            return key === 'cost' ? 17n : Reflect.get(target, key);
          },
        })],
      ['Proxy over an array whose get trap lies', () =>
        new Proxy(['17'], {
          get(target, key) {
            return key === '0' ? 17n : Reflect.get(target, key);
          },
        })],
      ['Proxy whose get trap throws', () =>
        new Proxy({ cost: '17' }, {
          get(_target, key) {
            if (key === 'cost') throw new Error('trap boom');
            return undefined;
          },
        })],
      ['bigint nested three levels deep', () => ({ a: { b: { c: 17n } } })],
      ['frozen object containing a Map', () => Object.freeze({ m: new Map() })],
      // --- cases found while building this table, no review had tried these ---
      ['symbol value', () => ({ tag: Symbol('v') })],
      ['Date (parity with the type level)', () => new Date('2026-09-03T00:00:00Z')],
      ['RegExp', () => /probe/],
      ['Promise (thenable)', () => Promise.resolve(1)],
      ['boxed String', () => new String('x')],
      ['Uint8Array', () => new Uint8Array([1])],
      ['non-finite number NaN', () => Number.NaN],
      ['non-finite number Infinity', () => Number.POSITIVE_INFINITY],
      ['undefined value', () => ({ missing: undefined })],
      ['function value', () => ({ callback: () => {} })],
      ['circular object', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        return circular;
      }],
      ['circular array', () => {
        const circular: unknown[] = [];
        circular.push(circular);
        return circular;
      }],
      ['Map nested inside a plain object', () => ({ totals: { cost: new Map() } })],
      ['Set nested inside an array', () => ({ entries: [new Set(['x'])] })],
    ];

    for (const [label, make] of unsafeShapes) {
      let rejected: boolean;
      try {
        rejected = !observabilityRecordSchema.safeParse({
          ...tenantRecord,
          payload: { probe: make() },
        }).success;
      } catch {
        // A throw inside zod's parse is contained by emit() — rejected.
        rejected = true;
      }
      expect(rejected, `${label} must be rejected, not silently mangled`).toBe(true);
    }
  });

  it('accepts the safe shapes — the guard rejects abnormality, not data', () => {
    const safeShapes: ReadonlyArray<readonly [string, unknown]> = [
      ['plain nested object and array mix', { a: [1, 'two', true, null], b: { c: { d: [] } } }],
      ['empty object', {}],
      ['empty array', []],
      ['object with null prototype', Object.assign(Object.create(null), { a: '1' })],
      ['frozen plain object of primitives', Object.freeze({ a: '1', b: 2 })],
      ['deep string/number/boolean/null values', { s: 'x', n: 0, b: false, z: null }],
    ];
    for (const [label, value] of safeShapes) {
      expect(
        observabilityRecordSchema.safeParse({
          ...tenantRecord,
          payload: { probe: value },
        }).success,
        `${label} must be accepted`,
      ).toBe(true);
    }
  });

  it('accepts a Proxy with no traps — indistinguishable from its target', () => {
    // ECMAScript designs proxies to be transparent: a trap-free proxy over a
    // plain object cannot be detected by ANY code, and JSON.stringify emits
    // exactly what it would emit for the target. The dangerous proxies are
    // the divergent ones — traps that lie or throw — and the table above
    // proves those are rejected. Accepting the transparent one is correct,
    // not a hole; rejecting it is impossible.
    expect(
      observabilityRecordSchema.safeParse({
        ...tenantRecord,
        payload: { probe: new Proxy({ a: '1' }, {}) },
      }).success,
    ).toBe(true);
  });

  it('cost encoding round-trip: bigint in, decimal string, BigInt() out, equal', () => {
    // Documentation of the ENCODING decision in schema.ts, nothing more:
    // this proves the string format is reversible (17n emits '17', and
    // BigInt('17') reconstructs the exact integer). It does NOT exercise
    // emit() or the sink — no consumer parses cost records yet, and the
    // reader that will (Model Gateway, Phase 2) does not exist.
    const minorUnits = 17n;
    const encoded: ObservabilityRecord = {
      ...tenantRecord,
      payload: { costMinorUnits: minorUnits.toString() },
    };
    const parsed = observabilityRecordSchema.parse(encoded);
    const value = parsed.payload.costMinorUnits;
    expect(typeof value).toBe('string');
    if (typeof value === 'string') {
      expect(BigInt(value)).toBe(minorUnits);
    }
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

  it('does not crash when a payload getter throws inside zod parse', () => {
    // PR #5 round 2 finding 3: a throwing getter crashed emit(), because zod's
    // safeParse does not contain arbitrary exceptions from record parsing.
    // The descriptor walk never reads a getter, but zod's own parse does — so
    // emit() guards the parse itself. The caller never asked to run arbitrary
    // code by logging; neither success nor a crash is an acceptable outcome
    // for them, only containment.
    const seen: unknown[] = [];
    const loudLogs: unknown[] = [];
    const emit = createObserver({
      sink: (rec) => {
        seen.push(rec);
      },
      redactor: passThroughRedactor,
      onSinkError: (error) => {
        loudLogs.push(error);
      },
    }).emit;

    expect(() =>
      emit({
        ...record,
        payload: {
          get cost(): never {
            throw new Error('boom');
          },
        },
      }),
    ).not.toThrow();
    expect(seen).toHaveLength(0);
    expect(loudLogs).toHaveLength(1);
    expect((loudLogs[0] as Error).message).toBe('boom');
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
