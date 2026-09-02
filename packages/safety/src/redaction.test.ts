import { describe, expect, it } from 'vitest';
import { redact } from './redaction.js';

describe('redact', () => {
  it('removes every named field from nested real payload data', () => {
    const payload = {
      customer: {
        email: 'person@example.com',
        profile: { ssn: '123-45-6789', displayName: 'Ada' },
      },
      event: { requestId: 'req-1' },
    };

    expect(
      redact(payload, [
        { path: 'customer.email' },
        { path: 'customer.profile.ssn' },
      ]),
    ).toEqual({
      customer: { profile: { displayName: 'Ada' } },
      event: { requestId: 'req-1' },
    });
  });

  it('removes named fields from every matching array item', () => {
    const payload = {
      recipients: [
        { email: 'first@example.com', name: 'First' },
        { email: 'second@example.com', name: 'Second' },
      ],
    };

    expect(redact(payload, [{ path: 'recipients.*.email' }])).toEqual({
      recipients: [{ name: 'First' }, { name: 'Second' }],
    });
  });

  it('does not mutate caller-owned payload data', () => {
    const payload = { customer: { email: 'person@example.com' } };

    redact(payload, [{ path: 'customer.email' }]);

    expect(payload).toEqual({ customer: { email: 'person@example.com' } });
  });
});
