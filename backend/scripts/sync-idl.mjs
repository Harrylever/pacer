#!/usr/bin/env node
/**
 * Copies the generated IDL and deployment manifest from ../programs/
 * (Sonnet's folder, source of truth) into src/solana/, so the backend
 * deploys on its own. Run with `bun run sync:idl` (Node runs it).
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const programs = resolve(backend, '..', 'programs');

const copies = [
  ['idl/pacer_vault.json', 'src/solana/idl/pacer_vault.json'],
  ['idl/mock_swap.json', 'src/solana/idl/mock_swap.json'],
  ['deployments/devnet.json', 'src/solana/deployments/devnet.json'],
];

// Preflight every source first, so a missing file never leaves a
// partially refreshed, mixed-generation set of copies behind.
let failed = false;
for (const [from] of copies) {
  const src = join(programs, from);
  if (!existsSync(src)) {
    console.error(`missing source: ${src}`);
    failed = true;
  }
}
if (failed) process.exit(1);
for (const [from, to] of copies) {
  const dst = join(backend, to);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(join(programs, from), dst);
  console.log(`synced ${to}`);
}
