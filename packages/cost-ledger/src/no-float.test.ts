import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Gate scripts are JavaScript and intentionally have no declaration output.
import { REPO_ROOT } from '../../../scripts/gates/lib.mjs';
// @ts-expect-error Gate scripts are JavaScript and intentionally have no declaration output.
import * as noFloat from '../../../scripts/gates/cost-no-float.mjs';

const probe = join(REPO_ROOT, 'packages/cost-ledger/src/.cost-float-probe.ts');

afterEach(async () => {
  await rm(probe, { force: true });
});

describe('cost-no-float structural gate', () => {
  it('rejects floating point code in the Ledger package', async () => {
    await writeFile(probe, 'const cost: number = 0.1;\n');

    expect(await noFloat.run()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'packages/cost-ledger/src/.cost-float-probe.ts',
          message: expect.stringContaining('Floating-point'),
        }),
      ]),
    );
  });
});
