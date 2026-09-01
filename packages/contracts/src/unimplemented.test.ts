import { describe, expect, it } from 'vitest';
import { UnimplementedCapabilityError, unimplemented } from './unimplemented.js';

const args = {
  component: 27,
  capability: 'tool-gateway.invoke',
  trackingReference: 'ALTER-27',
};

describe('unimplemented', () => {
  it('throws rather than returning a placeholder', () => {
    expect(() => unimplemented(args)).toThrow(UnimplementedCapabilityError);
  });

  it('carries 501, never a success status', () => {
    try {
      unimplemented(args);
    } catch (error) {
      expect((error as UnimplementedCapabilityError).status).toBe(501);
    }
  });

  it('names the component, the capability, and a tracking reference', () => {
    try {
      unimplemented(args);
    } catch (error) {
      const body = (error as UnimplementedCapabilityError).toResponseBody();
      expect(body).toEqual({
        error: 'unimplemented',
        component: 27,
        capability: 'tool-gateway.invoke',
        trackingReference: 'ALTER-27',
        message: expect.stringContaining('not implemented'),
      });
    }
  });
});
