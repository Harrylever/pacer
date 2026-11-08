#!/usr/bin/env node
/**
 * Demo proof (SPEC "Demo script", step 5): "The AI agent only holds the
 * keeper key." Using only that key, try three things the agent must never
 * be able to do, and show the vault program refusing each one ON CHAIN:
 *
 *   1. buy faster than the pace   -> ExceedsAllowance
 *   2. accept almost any price    -> SlippageTooHigh (min_out = 1 base unit)
 *   3. withdraw to its own wallet -> refused (signer is not the owner)
 *
 * then make one ordinary buy (one day's amount, fair price) that goes through.
 *
 * The refused attempts are sent WITHOUT simulation, so each one lands on
 * devnet as a failed transaction with an Explorer link a judge can open.
 * Accounts are built by the backend's own AnchorVaultClient (the same code
 * the keeper uses); only the final send step is swapped.
 *
 *   bun run build && bun run prove:keeper            # live, on devnet
 *   bun run build && bun run prove:keeper --dry-run  # read-only checks
 *
 * Uses a fresh owner and vault ($1 a "day", Apple + S&P 500, $10 from the
 * faucet) so a running backend can't interfere. Never prints a key.
 * Exit 0 only if all three attempts are refused for the expected reason
 * and the ordinary buy succeeds.
 */
import 'reflect-metadata';
import 'dotenv/config';

const { AnchorVaultClient } = await import('../dist/solana/anchor-vault-client.js');
const { loadDeployment } = await import('../dist/solana/solana.module.js');
const { loadConfig, loadSigner } = await import('../dist/config/app-config.js');
const { slippageFloor } = await import('../dist/common/money.js');
const { settledAllowance } = await import('../dist/common/pace.js');
const web3 = await import('@solana/web3.js');

const DRY_RUN = process.argv.includes('--dry-run');
const STOCKS = ['AAPLx', 'SPYx'];
const RATE = 1_000_000n; // $1 a "day"
const FAUCET = 10_000_000n; // $10

const tty = process.stdout.isTTY;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = paint('32');
const red = paint('31');
const dim = paint('2');
const bold = paint('1');
const usd = (micro) => `$${(Number(micro) / 1e6).toFixed(2)}`;
const link = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const short = (s) => `${s.slice(0, 4)}…${s.slice(-4)}`;

function fail(message) {
  throw new Error(`CHECK FAILED: ${message}`);
}

async function main() {
  const appConfig = loadConfig(process.env);
  const keeper = loadSigner('keeper');
  const oracle = loadSigner('oracle');
  const gas = loadSigner('gas');
  const deployment = loadDeployment();
  const connection = new web3.Connection(appConfig.rpcUrl, 'confirmed');

  const owner = web3.Keypair.generate();
  const withdrawal = web3.Keypair.generate();
  const ownerStr = owner.publicKey.toBase58();

  console.log(bold("Pacer: what the AI agent's key can and cannot do"));
  console.log(dim(`agent (keeper) key: ${keeper.publicKey.toBase58()}`));

  const client = new AnchorVaultClient({
    connection,
    keeper,
    oracle,
    gas,
    ownerKeypair: (pkStr) => (pkStr === ownerStr ? owner : null),
    deployment,
    cluster: 'devnet',
  });

  const chain = await client.getConfig();
  if (chain.halted) fail('program is halted');
  if (chain.keeper !== keeper.publicKey.toBase58()) fail('KEEPER_SECRET_KEY is not the configured keeper');
  if (chain.oracleAuthority !== oracle.publicKey.toBase58()) fail('ORACLE_SECRET_KEY is not the configured oracle');
  if (RATE > chain.maxRatePerPeriod) fail(`rate ${usd(RATE)} is above the program's ceiling`);
  console.log(dim(`program: a "day" is ${chain.periodSeconds}s, minimum buy ${usd(chain.minTrade)}, max slippage ${chain.maxSlippageBps / 100}%`));

  const prices = new Map();
  for (const symbol of STOCKS) {
    const price = await client.getPrice(symbol);
    if (!price) fail(`no price account for ${symbol}; run verify:devnet once to initialise prices`);
    prices.set(symbol, price);
  }
  const gasSol = (await connection.getBalance(gas.publicKey, 'confirmed')) / 1e9;
  console.log(dim(`gas wallet: ${gasSol.toFixed(4)} SOL`));
  if (gasSol < 0.05) fail('gas wallet is low on devnet SOL (top it up at faucet.solana.com)');

  if (DRY_RUN) {
    for (const [symbol, price] of prices) {
      const age = Math.floor(Date.now() / 1000) - price.updatedAt;
      console.log(dim(`${symbol}: price ${usd(price.priceMicroUsdc)}, last written ${age}s ago`));
    }
    console.log('PROVE-KEEPER: DRY RUN OK (nothing sent)');
    return;
  }

  // ---------- setup: a fresh vault, owned by a fresh wallet ----------
  console.log(`\n${bold('Setup')} ${dim('(signed by the owner, not the agent)')}`);
  await client.faucet(ownerStr, FAUCET);
  await client.createVault({
    owner: ownerStr,
    withdrawalDestination: withdrawal.publicKey.toBase58(),
    ratePerPeriod: RATE,
    mints: STOCKS,
    withdrawDelaySecs: 0,
  });
  await client.deposit({ owner: ownerStr, amount: await client.getDepositWalletBalance(ownerStr) });
  console.log(`  vault for owner ${short(ownerStr)}: ${usd(await client.getVaultBalance(ownerStr, 'USDC'))} USDC, pace ${usd(RATE)} a day, Apple + S&P 500`);
  console.log(`  withdrawals can only go to ${short(withdrawal.publicKey.toBase58())}`);

  // Re-publish the current prices (same values, fresh timestamps) so no
  // attempt is refused for a stale price instead of the reason it tests.
  for (const [symbol, price] of prices) await client.updatePriceAsOracle(symbol, price.priceMicroUsdc);
  console.log(dim(`  waiting one "day" (${chain.periodSeconds + 3}s) for the first allowance to unlock…`));
  await new Promise((r) => setTimeout(r, (chain.periodSeconds + 3) * 1000));

  const vault = await client.getVault(ownerStr);
  const allowance = settledAllowance(vault, Math.floor(Date.now() / 1000), chain.periodSeconds, chain.minTrade);
  if (allowance < RATE) fail(`allowance ${usd(allowance)} did not unlock`);
  console.log(`  unlocked so far: ${usd(allowance)}`);

  const floorFor = async (symbol, usdcIn) => {
    const meta = await client.getMintMeta(symbol);
    if (!meta) fail(`no mint metadata for ${symbol}`);
    return slippageFloor({
      usdcIn,
      priceMicroUsdc: (await client.getPrice(symbol)).priceMicroUsdc,
      stockDecimals: meta.decimals,
      maxSlippageBps: chain.maxSlippageBps,
    });
  };

  // ---------- the agent's key, sending straight to the chain ----------
  // Same accounts as the real keeper (built by AnchorVaultClient); only
  // the send is swapped: no simulation, so a refusal lands on chain.
  const agent = new AnchorVaultClient({
    connection,
    keeper,
    oracle,
    gas,
    ownerKeypair: () => keeper,
    deployment,
    cluster: 'devnet',
  });
  agent.sendIxs = async (signer, ixs) => {
    const tx = new web3.Transaction().add(...ixs);
    tx.feePayer = gas.publicKey;
    const latest = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latest.blockhash;
    tx.sign(gas, signer);
    const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    const conf = await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
    if (!conf.value.err) return signature;
    let logs = [];
    for (let i = 0; i < 5 && logs.length === 0; i++) {
      const got = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      logs = got?.meta?.logMessages ?? [];
      if (logs.length === 0) await new Promise((r) => setTimeout(r, 800));
    }
    const named = logs.join('\n').match(/Error Code: (\w+)/);
    const err = new Error(named ? named[1] : JSON.stringify(conf.value.err));
    err.signature = signature;
    err.errorName = named ? named[1] : 'UnknownError';
    throw err;
  };

  const attempts = [];
  async function attempt(title, detail, expected, run) {
    console.log(`\n${bold(title)}\n  ${dim(detail)}`);
    try {
      const sig = await run();
      console.log(`  ${red('ALLOWED (this should never happen)')} ${link(sig)}`);
      attempts.push({ title, ok: false });
    } catch (err) {
      if (!err.signature) throw err; // a setup problem, not a refusal
      const ok = expected === null || err.errorName === expected;
      console.log(`  ${ok ? green('REFUSED by the program') : red('refused, but not for the expected reason')}: ${err.errorName}`);
      console.log(`  ${link(err.signature)}`);
      attempts.push({ title, ok });
    }
  }

  console.log(`\n${bold("Using only the AI agent's key")}`);

  const tooMuch = 5n * RATE;
  await attempt(
    '1. Buy faster than the pace',
    `spend ${usd(tooMuch)} (five days at once) when only ${usd(allowance)} has unlocked`,
    'ExceedsAllowance',
    async () =>
      agent.buyAsKeeper({ owner: ownerStr, mint: 'AAPLx', usdcIn: tooMuch, minOut: await floorFor('AAPLx', tooMuch) }),
  );

  const fairFloor = await floorFor('AAPLx', chain.minTrade);
  await attempt(
    '2. Accept almost any price',
    `buy ${usd(chain.minTrade)} of Apple with min_out = 1 base unit (a fair floor is ${fairFloor})`,
    'SlippageTooHigh',
    async () => agent.buyAsKeeper({ owner: ownerStr, mint: 'AAPLx', usdcIn: chain.minTrade, minOut: 1n }),
  );

  const vaultUsdc = await client.getVaultBalance(ownerStr, 'USDC');
  await attempt(
    "3. Withdraw to the agent's own wallet",
    `move all ${usd(vaultUsdc)} USDC to ${short(keeper.publicKey.toBase58())} (the agent's address)`,
    null, // any refusal counts; the program reports which check stopped it
    async () => {
      const ix = await agent.withdrawIx(keeper, ownerStr, 'USDC', vaultUsdc, keeper.publicKey);
      return agent.sendIxs(keeper, [ix]);
    },
  );

  // ---------- and the one thing it is allowed to do ----------
  console.log(`\n${bold('4. An ordinary buy: one day\'s amount, at a fair price')}`);
  const buySig = await client.buyAsKeeper({
    owner: ownerStr,
    mint: 'AAPLx',
    usdcIn: RATE,
    minOut: await floorFor('AAPLx', RATE),
  });
  console.log(`  ${green('ALLOWED')}: bought ${usd(RATE)} of Apple`);
  console.log(`  ${link(buySig)}`);

  const refused = attempts.filter((a) => a.ok).length;
  if (refused !== attempts.length) fail(`${attempts.length - refused} attempt(s) were not refused as expected`);
  console.log(`\n${green('PROVE-KEEPER: PASS')} ${dim(`(${refused} refused on chain, 1 allowed)`)}`);
}

// web3.js keeps a websocket open after confirming transactions, which would
// keep Node alive forever; exit explicitly. A watchdog turns a stuck RPC
// call into a clear failure instead of a silent hang.
const watchdog = setTimeout(() => {
  console.error('PROVE-KEEPER: FAIL: timed out after 5 minutes (a stuck RPC call?)');
  process.exit(1);
}, 5 * 60 * 1000);

main()
  .then(() => {
    clearTimeout(watchdog);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`PROVE-KEEPER: FAIL: ${err.errorName ?? ''} ${err.message}`);
    if (err.logs) console.error(err.logs.join('\n'));
    process.exit(1);
  });
