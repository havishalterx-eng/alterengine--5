import { UnimplementedCapabilityError } from './unimplemented.js';
import type { InputOf, Operation, OutputOf, Registry } from './operation.js';

/**
 * Both sides of every call, derived from the registry.
 *
 * This is derivation at the type level rather than code generation, and the
 * distinction matters for done-gate item 5. A codegen step produces files that
 * can go stale between runs; a mapped type cannot. Delete an operation from the
 * registry and its client method stops existing at compile time — every call
 * site fails to typecheck immediately, with no generator to remember to re-run.
 *
 * "A client method with no matching server operation is unrepresentable" is
 * therefore true by construction, not by test.
 */

export type ClientOf<R extends Registry> = {
  readonly [K in keyof R]: (input: InputOf<R[K]>) => Promise<OutputOf<R[K]>>;
};

/**
 * The handlers a server must supply. Exhaustive: omit one and the object does
 * not satisfy the type, so an unimplemented route is a compile error rather
 * than a 404 discovered in production.
 */
export type ServerOf<R extends Registry, Ctx = unknown> = {
  readonly [K in keyof R]: (
    input: InputOf<R[K]>,
    context: Ctx,
  ) => Promise<OutputOf<R[K]>>;
};

export type Transport = (
  operation: Operation,
  input: unknown,
) => Promise<unknown>;

/**
 * Builds a client from the registry and a transport.
 *
 * Input is validated before the call and output after it. An operation whose
 * status is not `implemented` throws {@link UnimplementedCapabilityError}
 * without touching the transport — absence surfaces as a 501-shaped failure at
 * the boundary rather than as a confusing network error deeper in.
 */
export function createClient<R extends Registry>(
  registry: R,
  transport: Transport,
): ClientOf<R> {
  const client = {} as Record<string, (input: unknown) => Promise<unknown>>;

  for (const [name, operation] of Object.entries(registry)) {
    client[name] = async (input: unknown): Promise<unknown> => {
      if (operation.status !== 'implemented') {
        throw new UnimplementedCapabilityError({
          component: operation.component,
          capability: operation.capability,
          trackingReference: operation.trackingReference,
        });
      }

      const parsedInput = operation.input.parse(input);
      const result = await transport(operation, parsedInput);
      return operation.output.parse(result);
    };
  }

  return client as ClientOf<R>;
}

export interface Route {
  readonly name: string;
  readonly method: string;
  readonly path: string;
  readonly operation: Operation;
}

/**
 * The route table a server mounts. Derived from the same registry the client
 * is derived from, so the two cannot disagree about what exists.
 */
export function routesOf<R extends Registry>(registry: R): readonly Route[] {
  return Object.entries(registry).map(([name, operation]) => ({
    name,
    method: operation.method,
    path: operation.path,
    operation,
  }));
}

export class DuplicateRouteError extends Error {
  override readonly name = 'DuplicateRouteError';
}

/**
 * Done-gate item 1, at the route level: exactly one definition per primitive.
 *
 * Registry keys are unique because they are object keys, but two keys can
 * still claim the same method and path. Which one a request reaches would then
 * depend on mount order — the same shape as the previous build's two ID
 * validators, where which one a boundary imported decided what it accepted.
 */
export function assertNoDuplicateRoutes(registry: Registry): void {
  const seen = new Map<string, string>();

  for (const [name, operation] of Object.entries(registry)) {
    const key = `${operation.method} ${operation.path}`;
    const existing = seen.get(key);

    if (existing !== undefined) {
      throw new DuplicateRouteError(
        `Operations "${existing}" and "${name}" both define ${key}. ` +
          `Which one a request reaches would depend on mount order.`,
      );
    }

    seen.set(key, name);
  }
}
