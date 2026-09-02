import { z } from 'zod';
import { resolveRuntimeMode, type RuntimeMode } from './runtime-mode.js';

/**
 * The one module allowed to read the environment.
 *
 * The `unsafe-default` gate forbids `process.env` everywhere else. That rule
 * only works if there is somewhere legitimate to read configuration from —
 * otherwise every boot module either violates the gate or invents its own
 * loader, which is how the previous build ended up with configuration
 * scattered widely enough that a missing variable could silently select a
 * mock in one place and crash at boot in another.
 *
 * Rule 19: safety is what you get by doing nothing. Nothing here defaults to a
 * permissive value. A required setting that is absent throws at startup, by
 * name, before any work begins — a half-configured process must fail loudly
 * rather than run and quietly drop what it was given.
 */

export class ConfigurationError extends Error {
  override readonly name = 'ConfigurationError';
}

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  TEMPORAL_ADDRESS: z.string().min(1),
  REDIS_KEY_PREFIX: z.string().min(1),
});

export interface AlterConfig {
  readonly runtimeMode: RuntimeMode;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly temporalAddress: string;
  readonly redisKeyPrefix: string;
}

/**
 * Reads and validates configuration once, at startup.
 *
 * @param env defaults to the real environment. Tests pass their own, so no
 *        test needs to mutate `process.env` — mutation there is shared state
 *        between test files and a source of failures that look like bugs.
 */
export function loadConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AlterConfig {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => issue.path.join('.'))
      .sort();

    throw new ConfigurationError(
      `Missing or invalid configuration: ${missing.join(', ')}. ` +
        `Copy .env.example to .env in your worktree and fill it in. ` +
        `Nothing is defaulted — an absent setting must never select a ` +
        `permissive value.`,
    );
  }

  return {
    runtimeMode: resolveRuntimeMode(env),
    databaseUrl: parsed.data.DATABASE_URL,
    redisUrl: parsed.data.REDIS_URL,
    temporalAddress: parsed.data.TEMPORAL_ADDRESS,
    redisKeyPrefix: parsed.data.REDIS_KEY_PREFIX,
  };
}
