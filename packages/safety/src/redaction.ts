export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface RedactionRule {
  /** Dot-separated object path. `*` matches every item in an array. */
  readonly path: string;
}

export class RedactionRuleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RedactionRuleError';
  }
}

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Returns a deep copy with every field named by a rule removed. This is the
 * one Phase 1 redaction boundary; callers must not mutate payloads in place.
 */
export function redact<T extends JsonValue>(payload: T, rules: readonly RedactionRule[]): T {
  const copy = structuredClone(payload) as T;

  for (const rule of rules) {
    removeAtPath(copy, parsePath(rule));
  }

  return copy;
}

function parsePath(rule: RedactionRule): readonly string[] {
  const segments = rule.path.split('.');
  if (
    rule.path.length === 0 ||
    segments.some((segment) => segment.length === 0 || FORBIDDEN_SEGMENTS.has(segment))
  ) {
    throw new RedactionRuleError(`Invalid redaction path: ${rule.path}`);
  }
  return segments;
}

function removeAtPath(value: JsonValue, segments: readonly string[]): void {
  const [segment, ...remaining] = segments;
  if (segment === undefined) return;

  if (Array.isArray(value)) {
    if (segment !== '*') return;
    for (const item of value) removeAtPath(item, remaining);
    return;
  }

  if (value === null || typeof value !== 'object' || segment === '*') return;
  const object = value as Record<string, JsonValue>;

  if (remaining.length === 0) {
    delete object[segment];
    return;
  }

  const child = object[segment];
  if (child !== undefined) removeAtPath(child, remaining);
}
