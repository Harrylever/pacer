#!/usr/bin/env node
/**
 * One-off devnet setup (CONTRACT.md "Setup (admin)" and "Mint recipes").
 *
 *   NODE_PATH=../../backend/node_modules node programs/scripts/setup-devnet.cjs [--dry-run]
 *
 * Creates USDC-dev and three Token-2022 stand-in stocks with the xStocks
 * extensions, then calls init_config, init_price (per stock) and creates the
 * mock_swap treasury ATA. Refuses to run if the config PDA already exists.
 * Writes programs/deployments/devnet.json (public addresses only).
 * Secrets are read from backend/.env and ~/.config/solana and never printed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction,
  sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} = require('@solana/web3.js');
const spl = require('@solana/spl-token');

const dry = process.argv.includes('--dry-run');
const repo = path.resolve(__dirname, '..', '..');
const ENV_FILE = process.env.BACKEND_ENV || path.resolve(repo, '..', 'Pacer-eco', 'backend', '.env');

const VAULT_ID = new PublicKey('Bj6PUUzuupGFKhLdDpVEakW4NQp3z9VXjSmekmx1yHC4');
const SWAP_ID = new PublicKey('E3fu6bCTnhotjprKFa5kaCgF1avv3n7J1nuB9iPrUFgY');
const RPC = 'https://api.devnet.solana.com';

// Demo parameters: immutable after init_config (CONTRACT.md decision 4). Same as the tested constants.
const CFG = {
  periodSeconds: 10, minTrade: 100_000n, maxRate: 50_000_000n, slippageBps: 100,
  maxAge: 600, maxDelay: 604_800, window: 86_400,
};
const STOCKS = ['AAPLx', 'NVDAx', 'SPYx'];
const MULTIPLIER = 1.003;

function readEnv() {
  const out = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const kpFrom = (json) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(json)));
const kpFile = (p) => kpFrom(fs.readFileSync(p, 'utf8'));

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
function u64(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }

(async () => {
  const env = readEnv();
  const admin = kpFile(path.join(os.homedir(), '.config/solana/id.json'));
  const keeper = kpFrom(env.KEEPER_SECRET_KEY);
  const oracle = kpFrom(env.ORACLE_SECRET_KEY);
  const gas = kpFrom(env.GAS_SECRET_KEY);
  const issuerPath = path.join(os.homedir(), '.config/solana/pacer-issuer.json');
  if (!fs.existsSync(issuerPath)) {
    fs.writeFileSync(issuerPath, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
  }
  const issuer = kpFile(issuerPath);
  const conn = new Connection(RPC, 'confirmed');
  const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], VAULT_ID);
  const [mockAuthority] = PublicKey.findProgramAddressSync([Buffer.from('mock_authority')], SWAP_ID);

  console.log('admin  ', admin.publicKey.toBase58());
  console.log('keeper ', keeper.publicKey.toBase58());
  console.log('oracle ', oracle.publicKey.toBase58());
  console.log('gas    ', gas.publicKey.toBase58());
  console.log('issuer ', issuer.publicKey.toBase58());
  console.log('config ', config.toBase58());
  if (await conn.getAccountInfo(config)) throw new Error('config PDA already exists: refusing to run twice');
  for (const id of [VAULT_ID, SWAP_ID]) {
    const a = await conn.getAccountInfo(id);
    if (!a || !a.executable) throw new Error(`program ${id.toBase58()} is not deployed`);
  }
  if (dry) { console.log('dry run ok'); return; }

  const send = (ixs, signers) => sendAndConfirmTransaction(conn, new Transaction().add(...ixs), signers, { commitment: 'confirmed' });

  // 1. Fund the service wallets from the admin wallet.
  const fund = [[gas, 1.5], [oracle, 0.5], [keeper, 0.5], [issuer, 0.05]];
  await send(
    fund.map(([k, sol]) => SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: k.publicKey, lamports: Math.round(sol * LAMPORTS_PER_SOL) })),
    [admin],
  );
  console.log('funded service wallets');

  // 2. USDC-dev: legacy Token, 6 decimals, mint authority = gas wallet (the /faucet minter).
  const usdc = Keypair.generate();
  await send([
    SystemProgram.createAccount({
      fromPubkey: admin.publicKey, newAccountPubkey: usdc.publicKey,
      lamports: await conn.getMinimumBalanceForRentExemption(spl.MINT_SIZE), space: spl.MINT_SIZE, programId: spl.TOKEN_PROGRAM_ID,
    }),
    spl.createInitializeMint2Instruction(usdc.publicKey, 6, gas.publicKey, null, spl.TOKEN_PROGRAM_ID),
  ], [admin, usdc]);
  console.log('USDC-dev', usdc.publicKey.toBase58());

  // 3. Stand-in stocks: Token-2022 with the real xStocks extensions; mint authority = mock_authority PDA.
  const T22 = spl.TOKEN_2022_PROGRAM_ID;
  const kinds = [
    spl.ExtensionType.PermanentDelegate, spl.ExtensionType.PausableConfig, spl.ExtensionType.ScaledUiAmountConfig,
    spl.ExtensionType.TransferHook, spl.ExtensionType.DefaultAccountState, spl.ExtensionType.MetadataPointer,
  ];
  const space = spl.getMintLen(kinds);
  const lamports = await conn.getMinimumBalanceForRentExemption(space);
  const stocks = [];
  for (const symbol of STOCKS) {
    const mint = Keypair.generate();
    const m = mint.publicKey;
    await send([
      SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: m, lamports, space, programId: T22 }),
      spl.createInitializePermanentDelegateInstruction(m, issuer.publicKey, T22),
      spl.createInitializePausableConfigInstruction(m, issuer.publicKey, T22),
      spl.createInitializeScaledUiAmountConfigInstruction(m, issuer.publicKey, MULTIPLIER, T22),
      spl.createInitializeTransferHookInstruction(m, issuer.publicKey, PublicKey.default, T22),
      spl.createInitializeDefaultAccountStateInstruction(m, spl.AccountState.Initialized, T22),
      spl.createInitializeMetadataPointerInstruction(m, issuer.publicKey, null, T22),
      spl.createInitializeMint2Instruction(m, 8, mockAuthority, issuer.publicKey, T22),
    ], [admin, mint]);
    const [price] = PublicKey.findProgramAddressSync([Buffer.from('price'), m.toBuffer()], VAULT_ID);
    stocks.push({ symbol: `${symbol}-dev`, mint: m, price });
    console.log(`${symbol}-dev`, m.toBase58());
  }

  // 4. init_config in the same run as the deploy, so nobody else can claim admin.
  const args = Buffer.concat([
    keeper.publicKey.toBuffer(), oracle.publicKey.toBuffer(), SWAP_ID.toBuffer(),
    u32(CFG.periodSeconds), u64(CFG.minTrade), u64(CFG.maxRate), u16(CFG.slippageBps),
    u32(CFG.maxAge), u32(CFG.maxDelay), u32(CFG.window),
    u32(stocks.length), ...stocks.map((s) => s.mint.toBuffer()),
  ]);
  const meta = (pubkey, isSigner, isWritable) => ({ pubkey, isSigner, isWritable });
  await send([new TransactionInstruction({
    programId: VAULT_ID,
    data: Buffer.concat([Buffer.from([23, 235, 115, 232, 168, 96, 1, 231]), args]),
    keys: [meta(admin.publicKey, true, false), meta(admin.publicKey, true, true), meta(config, false, true),
      meta(usdc.publicKey, false, false), meta(SystemProgram.programId, false, false)],
  })], [admin]);
  console.log('init_config done');

  // 5. init_price for each stock.
  for (const s of stocks) {
    await send([new TransactionInstruction({
      programId: VAULT_ID,
      data: Buffer.from([91, 249, 77, 233, 247, 185, 76, 111]),
      keys: [meta(admin.publicKey, true, false), meta(admin.publicKey, true, true), meta(config, false, false),
        meta(s.mint, false, false), meta(s.price, false, true), meta(SystemProgram.programId, false, false)],
    })], [admin]);
  }
  console.log('init_price done');

  // 6. mock_swap treasury: USDC-dev ATA owned by the mock_authority PDA (off-curve).
  const treasury = spl.getAssociatedTokenAddressSync(usdc.publicKey, mockAuthority, true, spl.TOKEN_PROGRAM_ID);
  await send([spl.createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, treasury, mockAuthority, usdc.publicKey, spl.TOKEN_PROGRAM_ID)], [admin]);

  // 7. Record public addresses.
  const out = {
    cluster: 'devnet',
    programs: { pacer_vault: VAULT_ID.toBase58(), mock_swap: SWAP_ID.toBase58() },
    config: config.toBase58(),
    mockAuthority: mockAuthority.toBase58(),
    treasuryUsdc: treasury.toBase58(),
    admin: admin.publicKey.toBase58(),
    keeper: keeper.publicKey.toBase58(),
    oracleAuthority: oracle.publicKey.toBase58(),
    gas: gas.publicKey.toBase58(),
    issuer: issuer.publicKey.toBase58(),
    usdc: { symbol: 'USDC-dev', mint: usdc.publicKey.toBase58(), decimals: 6, tokenProgram: spl.TOKEN_PROGRAM_ID.toBase58(), mintAuthority: gas.publicKey.toBase58() },
    stocks: stocks.map((s) => ({ symbol: s.symbol, mint: s.mint.toBase58(), price: s.price.toBase58(), decimals: 8, tokenProgram: T22.toBase58(), scaledUiMultiplier: MULTIPLIER })),
    params: { periodSeconds: CFG.periodSeconds, minTrade: CFG.minTrade.toString(), maxRatePerPeriod: CFG.maxRate.toString(), maxSlippageBps: CFG.slippageBps, maxPriceAgeSecs: CFG.maxAge, maxWithdrawDelaySecs: CFG.maxDelay, withdrawWindowSecs: CFG.window },
  };
  const dir = path.join(repo, 'programs', 'deployments');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'devnet.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('wrote programs/deployments/devnet.json');
})().catch((e) => { console.error('FAILED:', e.message); if (e.logs) console.error(e.logs.join('\n')); process.exit(1); });
