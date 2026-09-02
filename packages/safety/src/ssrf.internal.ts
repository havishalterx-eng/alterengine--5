import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, createConnection as createTcpConnection, type Socket } from 'node:net';
import { connect as createTlsConnection } from 'node:tls';

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 1_048_576;
const METADATA_HOSTS = new Set([
  'metadata',
  'metadata.google.internal',
  'metadata.google',
]);

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

interface PinnedConnectionOptions {
  readonly address: string;
  readonly hostname: string;
  readonly port: number;
  readonly protocol: 'http:' | 'https:';
}

interface SsrfDependencies {
  readonly connect: (options: PinnedConnectionOptions) => Socket;
  readonly resolve: (hostname: string) => Promise<readonly ResolvedAddress[]>;
}

export interface SafeFetchResponse {
  readonly body: Buffer;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly statusCode: number;
  readonly url: URL;
}

export class SsrfBlockedError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

class SsrfGuard {
  public constructor(private readonly dependencies: SsrfDependencies) {}

  public async fetch(input: string | URL): Promise<SafeFetchResponse> {
    let url = new URL(input);

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const hostname = validatedHostname(url);
      const address = await resolvePublicAddress(hostname, this.dependencies.resolve);
      const response = await requestPinned(url, hostname, address, this.dependencies.connect);

      if (!isRedirect(response.statusCode)) return response;
      if (redirectCount === MAX_REDIRECTS) {
        throw new SsrfBlockedError(`Too many redirects from ${url.hostname}`);
      }

      const location = response.headers.location;
      if (typeof location !== 'string') {
        throw new SsrfBlockedError(`Redirect from ${url.hostname} has no usable Location header`);
      }
      response.body.fill(0);
      url = new URL(location, url);
    }

    throw new SsrfBlockedError('Redirect handling exhausted unexpectedly');
  }
}

/** Production entry point. No caller can replace resolver or socket behavior. */
export function createSsrfGuard(): { readonly fetch: (input: string | URL) => Promise<SafeFetchResponse> } {
  return new SsrfGuard({
    connect: ({ address, hostname, port, protocol }) =>
      protocol === 'https:'
        ? createTlsConnection({ host: address, port, rejectUnauthorized: true, servername: hostname })
        : createTcpConnection({ host: address, port }),
    resolve: async (hostname) => {
      const addresses = await lookup(hostname, { all: true, verbatim: true });
      return addresses.map(({ address, family }) => ({
        address,
        family: family === 6 ? 6 : 4,
      }));
    },
  });
}

/** Internal test seam. It is intentionally not exported by the package barrel. */
export function createSsrfGuardForTesting(dependencies: SsrfDependencies): {
  readonly fetch: (input: string | URL) => Promise<SafeFetchResponse>;
} {
  return new SsrfGuard(dependencies);
}

function validatedHostname(url: URL): string {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`Unsupported URL protocol: ${url.protocol}`);
  }
  if (url.username !== '' || url.password !== '') {
    throw new SsrfBlockedError('URLs with credentials are not permitted');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname.length === 0 || hostname === 'localhost' || METADATA_HOSTS.has(hostname)) {
    throw new SsrfBlockedError(`Forbidden hostname: ${hostname || '<empty>'}`);
  }
  return hostname;
}

async function resolvePublicAddress(
  hostname: string,
  resolve: SsrfDependencies['resolve'],
): Promise<string> {
  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await resolve(hostname);
  } catch (error: unknown) {
    throw new SsrfBlockedError(`Unable to resolve ${hostname}: ${messageOf(error)}`);
  }

  if (addresses.length === 0) throw new SsrfBlockedError(`No DNS addresses for ${hostname}`);
  for (const address of addresses) assertPublicAddress(address.address);
  return addresses[0]?.address ?? failClosed('No validated DNS address');
}

function assertPublicAddress(address: string): void {
  const family = isIP(address);
  if (family === 4 && isForbiddenIpv4(address)) {
    throw new SsrfBlockedError(`Forbidden IPv4 address: ${address}`);
  }
  if (family === 6 && isForbiddenIpv6(address)) {
    throw new SsrfBlockedError(`Forbidden IPv6 address: ${address}`);
  }
  if (family === 0) throw new SsrfBlockedError(`DNS returned a non-IP address: ${address}`);
}

function isForbiddenIpv4(address: string): boolean {
  const octets = address.split('.').map((segment) => Number.parseInt(segment, 10));
  const [first, second] = octets;
  if (first === undefined || second === undefined || octets.length !== 4) return true;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19 || second === 51)) ||
    (first === 203 && second === 0)
  );
}

function isForbiddenIpv6(address: string): boolean {
  const words = parseIpv6(address);
  if (words === undefined) return true;
  const [first, second, third, fourth, fifth, sixth, seventh, eighth] = words;
  if (
    first === undefined || second === undefined || third === undefined || fourth === undefined ||
    fifth === undefined || sixth === undefined || seventh === undefined || eighth === undefined
  ) {
    return true;
  }

  const firstFiveZero = first === 0 && second === 0 && third === 0 && fourth === 0 && fifth === 0;
  if (firstFiveZero && (sixth === 0 || sixth === 0xffff)) {
    const mapped = `${seventh >> 8}.${seventh & 0xff}.${eighth >> 8}.${eighth & 0xff}`;
    return isForbiddenIpv4(mapped);
  }

  return (
    words.every((word) => word === 0) ||
    (firstFiveZero && sixth === 0 && seventh === 0 && eighth === 1) ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00
  );
}

function parseIpv6(address: string): readonly number[] | undefined {
  const normalized = address.toLowerCase();
  const doubleColon = normalized.indexOf('::');
  if (doubleColon !== normalized.lastIndexOf('::')) return undefined;

  const [headText, tailText] = doubleColon === -1
    ? [normalized, undefined]
    : [normalized.slice(0, doubleColon), normalized.slice(doubleColon + 2)];
  const head = headText === '' ? [] : headText.split(':');
  const tail = tailText === undefined || tailText === '' ? [] : tailText.split(':');
  const raw = [...head, ...tail];
  const words = raw.map((part) => Number.parseInt(part, 16));
  if (raw.some((part, index) => !/^[0-9a-f]{1,4}$/.test(part) || Number.isNaN(words[index]))) {
    return undefined;
  }

  if (doubleColon === -1) return words.length === 8 ? words : undefined;
  const zeroCount = 8 - words.length;
  return zeroCount < 1 ? undefined : [...words.slice(0, head.length), ...Array<number>(zeroCount).fill(0), ...words.slice(head.length)];
}

async function requestPinned(
  url: URL,
  hostname: string,
  address: string,
  connect: SsrfDependencies['connect'],
): Promise<SafeFetchResponse> {
  const protocol = url.protocol as 'http:' | 'https:';
  const port = url.port === '' ? (protocol === 'https:' ? 443 : 80) : Number.parseInt(url.port, 10);
  const request = protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise<SafeFetchResponse>((resolve, reject) => {
    const pending = request(
      {
        createConnection: () => connect({ address, hostname, port, protocol }),
        headers: { host: url.host },
        hostname,
        method: 'GET',
        path: `${url.pathname}${url.search}`,
        port,
        protocol,
      },
      (response) => {
        void readResponse(response)
          .then((body) => resolve({ body, headers: response.headers, statusCode: response.statusCode ?? 0, url }))
          .catch(reject);
      },
    );
    pending.once('error', reject);
    pending.end();
  });
}

async function readResponse(response: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_RESPONSE_BYTES) {
      response.destroy(new SsrfBlockedError('Response exceeds safety limit'));
      throw new SsrfBlockedError('Response exceeds safety limit');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function isRedirect(statusCode: number): boolean {
  return statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308;
}

function failClosed(message: string): never {
  throw new SsrfBlockedError(message);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown resolver failure';
}
