import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Gate scripts are JavaScript and intentionally have no declaration output.
import { REPO_ROOT } from '../../../scripts/gates/lib.mjs';
// @ts-expect-error Gate scripts are JavaScript and intentionally have no declaration output.
import * as safetyDuplicate from '../../../scripts/gates/safety-duplicate.mjs';

const probe = join(REPO_ROOT, 'apps/api/.safety-duplicate-probe.ts');
const probeFile = 'apps/api/.safety-duplicate-probe.ts';

afterEach(async () => {
  await rm(probe, { force: true });
});

describe('safety-duplicate structural gate', () => {
  it('accepts current source ownership', async () => {
    expect(await safetyDuplicate.run()).toEqual([]);
  });

  it('rejects a second DNS-based SSRF implementation outside canonical Safety package', async () => {
    await writeFile(
      probe,
      "import { lookup } from 'node:dns/promises';\nexport async function checkRemoteUrl() { return lookup('example.com'); }\n",
    );

    const findings = await safetyDuplicate.run();

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: probeFile,
          message: expect.stringContaining('DNS resolution'),
        }),
      ]),
    );
  });

  it('rejects a second redaction primitive outside canonical Safety package', async () => {
    await writeFile(probe, 'export function redact(value: string) { return value; }\n');

    const findings = await safetyDuplicate.run();

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: probeFile,
          message: expect.stringContaining('Safety primitive "redact"'),
        }),
      ]),
    );
  });
});
