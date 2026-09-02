import { unimplemented } from '@alter/contracts';

export interface InjectionClassificationRequest {
  readonly content: string;
}

/**
 * Phase 2 owns real classifier integration through Model Gateway (26).
 * This deliberately has no rule-based fallback: uncertain safety blocks.
 */
export function classifyInjection(_request: InjectionClassificationRequest): never {
  return unimplemented({
    capability: 'safety.classifyInjection',
    component: 37,
    trackingReference: 'ALTER-37-PHASE-2',
  });
}
