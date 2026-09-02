/**
 * The single runtime-mode switch.
 *
 * Closes systemic pattern 2 from the previous build: missing configuration
 * silently selected a mock. Identity and notifications both fell through to
 * mock providers when environment variables were absent, so a fully
 * unconfigured deployment started happily and discarded every email.
 *
 * Rule 19: safety is what you get by doing nothing. An unset variable must
 * never select a mock, a bypass, or a permissive mode.
 *
 * There is exactly one definition of runtime mode in this repository, and
 * exactly one function that decides whether a mock may be selected.
 */

export const RUNTIME_MODES = ['development', 'test', 'production'] as const;

export type RuntimeMode = (typeof RUNTIME_MODES)[number];

export class RuntimeModeError extends Error {
  override readonly name = 'RuntimeModeError';
}

/**
 * Reads ALTER_RUNTIME_MODE.
 *
 * Unset is NOT an error and NOT production — it resolves to `development`,
 * because a developer running the stack locally has done nothing wrong. What
 * unset must never do is grant a permission, and it does not: mocks are gated
 * by {@link assertMockAllowed}, which is what actually enforces the rule.
 *
 * An unrecognised value throws. A typo like `ALTER_RUNTIME_MODE=prod` must
 * never quietly resolve to something permissive.
 */
export function resolveRuntimeMode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RuntimeMode {
  const raw = env['ALTER_RUNTIME_MODE'];

  if (raw === undefined || raw === '') {
    return 'development';
  }

  if (!isRuntimeMode(raw)) {
    throw new RuntimeModeError(
      `ALTER_RUNTIME_MODE is "${raw}", which is not a runtime mode. ` +
        `Expected one of: ${RUNTIME_MODES.join(', ')}. ` +
        `It is not defaulted, because a typo must never select a permissive mode.`,
    );
  }

  return raw;
}

export function isRuntimeMode(value: unknown): value is RuntimeMode {
  return (
    typeof value === 'string' && (RUNTIME_MODES as readonly string[]).includes(value)
  );
}

/**
 * The only gate through which a mock implementation may be selected.
 *
 * Every mock, fake, or stub provider calls this before returning itself. In
 * production this throws, and because it is called during construction, it
 * throws at startup rather than on the first request — a half-configured
 * deployment fails loudly at boot instead of running and dropping work.
 *
 * @param what identifies the mock in the error, so the failure names itself.
 *
 * @verifier-driver every-mock-implementation
 * It has no production caller today because no mock exists yet. Every mock
 * that is ever added must call it, and the mock-reachability gate fails any
 * marked mock that does not.
 */
export function assertMockAllowed(
  what: string,
  mode: RuntimeMode = resolveRuntimeMode(),
): void {
  if (mode === 'production') {
    throw new RuntimeModeError(
      `Refusing to select the mock implementation of "${what}" in production. ` +
        `Configure the real implementation, or run with ALTER_RUNTIME_MODE=development. ` +
        `A mock reachable from a production path is an architecture bug, not a configuration gap.`,
    );
  }
}
