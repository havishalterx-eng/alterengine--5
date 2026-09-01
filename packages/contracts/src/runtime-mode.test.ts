import { describe, expect, it } from 'vitest';
import {
  assertMockAllowed,
  RuntimeModeError,
  resolveRuntimeMode,
} from './runtime-mode.js';

describe('resolveRuntimeMode', () => {
  it('resolves each valid mode', () => {
    expect(resolveRuntimeMode({ ALTER_RUNTIME_MODE: 'development' })).toBe('development');
    expect(resolveRuntimeMode({ ALTER_RUNTIME_MODE: 'test' })).toBe('test');
    expect(resolveRuntimeMode({ ALTER_RUNTIME_MODE: 'production' })).toBe('production');
  });

  it('resolves unset and empty to development', () => {
    expect(resolveRuntimeMode({})).toBe('development');
    expect(resolveRuntimeMode({ ALTER_RUNTIME_MODE: '' })).toBe('development');
  });

  it('throws on an unrecognised value rather than defaulting', () => {
    // A typo must never quietly resolve to something permissive.
    expect(() => resolveRuntimeMode({ ALTER_RUNTIME_MODE: 'prod' })).toThrow(
      RuntimeModeError,
    );
    expect(() => resolveRuntimeMode({ ALTER_RUNTIME_MODE: 'PRODUCTION' })).toThrow(
      RuntimeModeError,
    );
  });
});

describe('assertMockAllowed', () => {
  it('permits mocks outside production', () => {
    expect(() => assertMockAllowed('notifications', 'development')).not.toThrow();
    expect(() => assertMockAllowed('notifications', 'test')).not.toThrow();
  });

  it('refuses any mock in production', () => {
    expect(() => assertMockAllowed('notifications', 'production')).toThrow(
      RuntimeModeError,
    );
  });

  it('names the mock in the error, so the failure identifies itself', () => {
    expect(() => assertMockAllowed('identity-provider', 'production')).toThrow(
      /identity-provider/,
    );
  });
});
