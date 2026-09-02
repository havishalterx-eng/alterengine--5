import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadConfig } from './config.js';

const complete = {
  DATABASE_URL: 'postgresql://alter:pw@localhost:5440/alter',
  REDIS_URL: 'redis://localhost:6390',
  TEMPORAL_ADDRESS: 'localhost:7240',
  REDIS_KEY_PREFIX: 'alter:test',
};

describe('loadConfig', () => {
  it('reads a complete environment', () => {
    const config = loadConfig(complete);
    expect(config.databaseUrl).toBe(complete.DATABASE_URL);
    expect(config.redisKeyPrefix).toBe('alter:test');
    expect(config.runtimeMode).toBe('development');
  });

  it('throws on a missing setting rather than defaulting', () => {
    const { DATABASE_URL: _omitted, ...partial } = complete;
    expect(() => loadConfig(partial)).toThrow(ConfigurationError);
  });

  it('names every missing setting, so one boot reveals all of them', () => {
    expect(() => loadConfig({})).toThrow(
      /DATABASE_URL.*REDIS_KEY_PREFIX.*REDIS_URL.*TEMPORAL_ADDRESS/,
    );
  });

  it('carries the runtime mode through, and still refuses a typo', () => {
    expect(loadConfig({ ...complete, ALTER_RUNTIME_MODE: 'production' }).runtimeMode)
      .toBe('production');
    expect(() => loadConfig({ ...complete, ALTER_RUNTIME_MODE: 'prod' })).toThrow();
  });
});
