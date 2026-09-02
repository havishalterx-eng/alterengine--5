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
});

async function listen(server: Server): Promise<Server> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
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
