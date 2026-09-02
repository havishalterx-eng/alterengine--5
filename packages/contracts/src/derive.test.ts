import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import { defineOperation, defineRegistry } from './operation.js';
import {
  DuplicateRouteError,
  assertNoDuplicateRoutes,
  createClient,
  routesOf,
  type ClientOf,
  type ServerOf,
} from './derive.js';
import { registry } from './registry.js';
import { UnimplementedCapabilityError } from './unimplemented.js';

const full = defineRegistry({
  alpha: defineOperation({
    component: 1,
    method: 'GET',
    path: '/alpha',
    capability: 'test.alpha',
    status: 'implemented',
    input: z.object({ id: z.string() }),
    output: z.object({ value: z.number() }),
  }),
  beta: defineOperation({
    component: 1,
    method: 'POST',
    path: '/beta',
    capability: 'test.beta',
    status: 'implemented',
    input: z.object({ name: z.string() }),
    output: z.object({ ok: z.boolean() }),
  }),
});

/** The same registry with `beta` removed — done-gate item 5. */
const trimmed = defineRegistry({ alpha: full.alpha });

describe('done gate 5 — a client method with no server operation is unrepresentable', () => {
  it('derives a method for every operation', () => {
    expectTypeOf<ClientOf<typeof full>>().toHaveProperty('alpha');
    expectTypeOf<ClientOf<typeof full>>().toHaveProperty('beta');
  });

  it('the method disappears when its operation is deleted from the schema', () => {
    // Deleting `beta` from the registry removes the client method at the type
    // level. There is no generator to re-run and no stale file to go out of
    // date: every call site stops compiling immediately.
    expectTypeOf<ClientOf<typeof trimmed>>().toHaveProperty('alpha');
    expectTypeOf<ClientOf<typeof trimmed>>().not.toHaveProperty('beta');

    const client = createClient(trimmed, async () => ({ value: 1 }));
    expect(Object.keys(client)).toEqual(['alpha']);
  });

  it('derives the server side from the same source, exhaustively', () => {
    expectTypeOf<ServerOf<typeof full>>().toHaveProperty('alpha');
    expectTypeOf<ServerOf<typeof full>>().toHaveProperty('beta');

    // A handler object missing `beta` does not satisfy ServerOf, so an
    // unimplemented route is a compile error rather than a runtime 404.
    const incomplete = { alpha: async () => ({ value: 1 }) };
    expectTypeOf(incomplete).not.toMatchTypeOf<ServerOf<typeof full>>();
  });

  it('routes and client come from one source, so they cannot disagree', () => {
    const routeNames = routesOf(full).map((route) => route.name);
    const clientNames = Object.keys(createClient(full, async () => ({})));
    expect(routeNames.sort()).toEqual(clientNames.sort());
  });
});

describe('client validation', () => {
  it('validates input before calling the transport', async () => {
    const transport = vi.fn(async () => ({ value: 1 }));
    const client = createClient(full, transport);

    await expect(
      // @ts-expect-error id must be a string — the schema is the source
      client.alpha({ id: 42 }),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it('validates output after the transport returns', async () => {
    const client = createClient(full, async () => ({ value: 'not a number' }));
    await expect(client.alpha({ id: 'x' })).rejects.toThrow();
  });
});

describe('done gate 7 — absence is visible, never invisible', () => {
  it('an unimplemented capability throws 501 without reaching the transport', async () => {
    const transport = vi.fn(async () => ({ workflows: [] }));
    const client = createClient(registry, transport);

    await expect(client.listWorkflows({ workspaceId: 'w1' })).rejects.toThrow(
      UnimplementedCapabilityError,
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it('carries 501 and the tracking reference, not a 404 or an empty success', async () => {
    const client = createClient(registry, async () => ({ workflows: [] }));

    try {
      await client.listWorkflows({ workspaceId: 'w1' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const failure = error as UnimplementedCapabilityError;
      expect(failure.status).toBe(501);
      expect(failure.toResponseBody()).toMatchObject({
        error: 'unimplemented',
        component: 46,
        capability: 'workspace.listWorkflows',
        trackingReference: 'ALTER-46',
      });
    }
  });

  it('a deferred capability is equally loud', async () => {
    const client = createClient(registry, async () => ({}));
    await expect(client.getSubscription({ accountId: 'a1' })).rejects.toThrow(
      /ALTER-43/,
    );
  });
});

describe('done gate 1 — one definition per primitive, at the route level', () => {
  it('accepts a registry with distinct routes', () => {
    expect(() => assertNoDuplicateRoutes(full)).not.toThrow();
    expect(() => assertNoDuplicateRoutes(registry)).not.toThrow();
  });

  it('rejects two operations claiming the same method and path', () => {
    const collision = defineRegistry({
      alpha: full.alpha,
      alphaAgain: defineOperation({
        component: 2,
        method: 'GET',
        path: '/alpha',
        capability: 'test.alphaAgain',
        status: 'implemented',
        input: z.object({}),
        output: z.object({}),
      }),
    });

    expect(() => assertNoDuplicateRoutes(collision)).toThrow(
      DuplicateRouteError,
    );
    expect(() => assertNoDuplicateRoutes(collision)).toThrow(/mount order/);
  });
});
