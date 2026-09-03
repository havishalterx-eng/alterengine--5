import { createServer, type Server } from 'node:http';
import { createConnection } from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSsrfGuardForTesting,
  SsrfBlockedError,
} from './ssrf.internal.js';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => close(server)));
});

describe('SSRF guard', () => {
  it('pins a DNS-rebound hostname to its validated address for a real HTTP request', async () => {
    const server = await listen(createServer((_request, response) => response.end('pinned')));
    const destination = addressOf(server);
    const pinnedAddresses: string[] = [];
    let lookupCount = 0;

    const guard = createSsrfGuardForTesting({
      resolve: async () => {
        lookupCount += 1;
        return [{ address: lookupCount === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }];
      },
      connect: ({ address, port }) => {
        pinnedAddresses.push(address);
        return createConnection({ host: '127.0.0.1', port });
      },
    });

    const response = await guard.fetch(`http://rebind.test:${destination.port}/`);

    expect(response.body.toString()).toBe('pinned');
    expect(lookupCount).toBe(1);
    expect(pinnedAddresses).toEqual(['93.184.216.34']);
  });

  it('revalidates every redirect target before opening its socket', async () => {
    const server = await listen(
      createServer((_request, response) => {
        response.writeHead(302, { location: 'http://metadata.google.internal/latest' });
        response.end();
      }),
    );
    const destination = addressOf(server);
    const requestedHosts: string[] = [];

    const guard = createSsrfGuardForTesting({
      resolve: async (hostname) => {
        requestedHosts.push(hostname);
        return [{ address: '93.184.216.34', family: 4 }];
      },
      connect: ({ port }) => createConnection({ host: '127.0.0.1', port }),
    });

    await expect(guard.fetch(`http://public.test:${destination.port}/`)).rejects.toThrow(
      SsrfBlockedError,
    );
    expect(requestedHosts).toEqual(['public.test']);
  });

  it.each([
    '10.0.0.8',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    'fc00::1',
    'fe80::1',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ])('blocks forbidden address %s before connecting', async (address) => {
    let connected = false;
    const guard = createSsrfGuardForTesting({
      resolve: async () => [{ address, family: address.includes(':') ? 6 : 4 }],
      connect: () => {
        connected = true;
        throw new Error('must not connect');
      },
    });

    await expect(guard.fetch('http://attack.test/')).rejects.toThrow(SsrfBlockedError);
    expect(connected).toBe(false);
  });

  it('carries method, headers and body through the guard — the usable safe path', async () => {
    const seen: { body: string; headers: Record<string, string | string[] | undefined>; method: string | undefined }[] = [];
    const server = await listen(
      createServer((request, response) => {
        let body = '';
        request.on('data', (chunk) => {
          body += chunk;
        });
        request.on('end', () => {
          seen.push({ body, headers: request.headers, method: request.method });
          response.end('ok');
        });
      }),
    );
    const destination = addressOf(server);
    const guard = publicGuard();

    const response = await guard.fetch(`http://api.model.test:${destination.port}/v1/chat`, {
      method: 'POST',
      headers: { authorization: 'Bearer sk-test-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'test', prompt: 'hi' }),
    });

    expect(response.body.toString()).toBe('ok');
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.headers.authorization).toBe('Bearer sk-test-key');
    expect(seen[0]?.headers['content-type']).toBe('application/json');
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({ model: 'test', prompt: 'hi' });
  });

  it('never forwards credentials to a different origin on redirect — the guard owns this, not the caller', async () => {
    // Two servers, two ports: two origins. The first is the intended
    // destination and sees the Authorization header; the redirect target is
    // a DIFFERENT host and must not see it, ever.
    const secondSeen: { headers: Record<string, string | string[] | undefined>; method: string | undefined }[] = [];
    const second = await listen(
      createServer((request, response) => {
        secondSeen.push({ headers: request.headers, method: request.method });
        response.end('redirected');
      }),
    );
    const secondAddress = addressOf(second);
    const firstSeen: Record<string, string | string[] | undefined>[] = [];
    const first = await listen(
      createServer((request, response) => {
        firstSeen.push(request.headers);
        response.writeHead(302, {
          location: `http://evil.redirect.test:${secondAddress.port}/steal`,
        });
        response.end();
      }),
    );
    const firstAddress = addressOf(first);
    const guard = publicGuard();

    const response = await guard.fetch(`http://api.model.test:${firstAddress.port}/v1/chat`, {
      method: 'POST',
      headers: { authorization: 'Bearer sk-test-key' },
      body: '{}',
    });

    // The request completed — against the redirect host, fail-open on
    // functionality, fail-closed on credentials.
    expect(response.body.toString()).toBe('redirected');
    // The intended host saw the credentials.
    expect(firstSeen[0]?.authorization).toBe('Bearer sk-test-key');
    // The redirect host did not. This is the assertion that matters.
    expect(secondSeen[0]?.headers.authorization).toBeUndefined();
    expect(secondSeen[0]?.method).toBe('GET'); // 302 rewrote POST to GET
  });

  it('keeps credentials on a same-origin redirect', async () => {
    const seen: Record<string, string | string[] | undefined>[] = [];
    const server = await listen(
      createServer((request, response) => {
        seen.push(request.headers);
        if (request.url === '/first') {
          response.writeHead(303, { location: '/second' });
          response.end();
          return;
        }
        response.end('same-origin ok');
      }),
    );
    const destination = addressOf(server);
    const guard = publicGuard();

    const response = await guard.fetch(`http://api.model.test:${destination.port}/first`, {
      headers: { authorization: 'Bearer sk-test-key' },
    });

    expect(response.body.toString()).toBe('same-origin ok');
    expect(seen[0]?.authorization).toBe('Bearer sk-test-key');
    expect(seen[1]?.authorization).toBe('Bearer sk-test-key');
  });

  it('preserves method and body on 307 but still strips credentials cross-origin', async () => {
    const seen: { body: string; headers: Record<string, string | string[] | undefined>; method: string | undefined }[] = [];
    const target = await listen(
      createServer((request, response) => {
        let body = '';
        request.on('data', (chunk) => {
          body += chunk;
        });
        request.on('end', () => {
          seen.push({ body, headers: request.headers, method: request.method });
          response.end('307 landed');
        });
      }),
    );
    const targetAddress = addressOf(target);
    const origin = await listen(
      createServer((_request, response) => {
        response.writeHead(307, { location: `http://other.host.test:${targetAddress.port}/forward` });
        response.end();
      }),
    );
    const originAddress = addressOf(origin);
    const guard = publicGuard();

    const response = await guard.fetch(`http://api.model.test:${originAddress.port}/submit`, {
      method: 'PUT',
      headers: { authorization: 'Bearer sk-test-key' },
      body: 'payload-body',
    });

    expect(response.body.toString()).toBe('307 landed');
    expect(seen[0]?.method).toBe('PUT');
    expect(seen[0]?.body).toBe('payload-body');
    expect(seen[0]?.headers.authorization).toBeUndefined();
  });

  it('cuts off an oversized response instead of buffering it', async () => {
    const server = await listen(
      createServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'text/plain' });
        // Far larger than the 64-byte limit the test sets: written in one
        // go, so buffering it would mean reading all of it.
        response.end('x'.repeat(10_000));
      }),
    );
    const destination = addressOf(server);
    const guard = publicGuard();

    await expect(
      guard.fetch(`http://big.response.test:${destination.port}/`, { maxResponseBytes: 64 }),
    ).rejects.toThrow('Response exceeds safety limit');
  });

  it.each([
    ['0', 0],
    ['-1', -1],
    ['1.5', 1.5],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['above the ceiling', 1_048_577],
  ])('rejects maxResponseBytes %s before any socket opens', async (_label, limit) => {
    let connected = false;
    const guard = createSsrfGuardForTesting({
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      connect: () => {
        connected = true;
        throw new Error('must not connect');
      },
    });

    await expect(
      guard.fetch('http://limit.test/', { maxResponseBytes: limit }),
    ).rejects.toThrow(SsrfBlockedError);
    expect(connected).toBe(false);
  });

  it('times out a request that never answers', async () => {
    const server = await listen(
      createServer(() => {
        // Never responds, never ends: the only way out is the guard's timer.
      }),
    );
    const destination = addressOf(server);
    const guard = publicGuard();

    await expect(
      guard.fetch(`http://silent.host.test:${destination.port}/`, { timeoutMs: 100 }),
    ).rejects.toThrow('Request timed out after 100ms');
  });
});

async function listen(server: Server): Promise<Server> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

/** A guard whose resolver always answers a public IP and whose socket goes to the local test server. */
function publicGuard() {
  return createSsrfGuardForTesting({
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    connect: ({ port: targetPort }) => createConnection({ host: '127.0.0.1', port: targetPort }),
  });
}

function addressOf(server: Server): AddressInfo {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
  return address;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}
