import { z } from 'zod';
import { defineOperation, defineRegistry } from './operation.js';

/**
 * The registry — the single source every cross-component call is derived from.
 *
 * It is deliberately small. Operations are added by the component that owns
 * them, as that component is built, so the inventory always describes what
 * exists rather than what was planned. An operation declared here before its
 * component is built must carry status `unimplemented` and a tracking
 * reference, so its absence is legible from day one.
 */

export const registry = defineRegistry({
  health: defineOperation({
    component: 48,
    method: 'GET',
    path: '/health',
    capability: 'platform.health',
    status: 'implemented',
    input: z.object({}),
    output: z.object({
      status: z.literal('ok'),
      runtimeMode: z.enum(['development', 'test', 'production']),
    }),
  }),

  /**
   * Genuinely unbuilt. Component 46 is Phase 3.
   *
   * It is declared now on purpose: done-gate item 7 requires the
   * absence-visible protocol to be proved end to end on a capability that is
   * actually missing, not on a fixture pretending to be missing.
   */
  listWorkflows: defineOperation({
    component: 46,
    method: 'GET',
    path: '/workflows',
    capability: 'workspace.listWorkflows',
    status: 'unimplemented',
    trackingReference: 'ALTER-46',
    input: z.object({ workspaceId: z.string().min(1) }),
    output: z.object({
      workflows: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  }),

  /**
   * Deferred by decision, not by omission — pricing is undecided. Deferred
   * components are bound by the same rule: their absence must be legible.
   */
  getSubscription: defineOperation({
    component: 43,
    method: 'GET',
    path: '/billing/subscription',
    capability: 'billing.getSubscription',
    status: 'deferred',
    trackingReference: 'ALTER-43',
    input: z.object({ accountId: z.string().min(1) }),
    output: z.object({ plan: z.string(), status: z.string() }),
  }),
});

export type AlterRegistry = typeof registry;
