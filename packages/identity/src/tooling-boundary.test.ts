import { expectTypeOf, describe, it } from 'vitest';
import type { IdentityStore } from '@alter/identity';

describe('internal tooling boundary', () => {
  it('does not expose name lookup to the request-facing store', () => {
    expectTypeOf<IdentityStore>().not.toHaveProperty('findAccountByName');
  });
});
