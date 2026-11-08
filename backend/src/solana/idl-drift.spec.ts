import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The committed IDL/deployment copies under src/solana/ must match the
 * source of truth in ../programs/. When that folder doesn't exist (a
 * standalone backend checkout), the check skips quietly; refresh copies
 * with `bun run sync:idl`.
 */
const programsDir = resolve(__dirname, '..', '..', '..', 'programs');
const backendDir = resolve(__dirname, '..', '..');

const PAIRS: [string, string][] = [
  ['idl/pacer_vault.json', 'src/solana/idl/pacer_vault.json'],
  ['idl/mock_swap.json', 'src/solana/idl/mock_swap.json'],
  ['deployments/devnet.json', 'src/solana/deployments/devnet.json'],
];

const describeDrift = existsSync(programsDir) ? describe : describe.skip;

describeDrift('committed IDL copies match ../programs/', () => {
  for (const [source, copy] of PAIRS) {
    it(`${copy} is identical to programs/${source}`, () => {
      expect(
        readFileSync(join(backendDir, copy)).equals(
          readFileSync(join(programsDir, source)),
        ),
      ).toBe(true);
    });
  }
});
