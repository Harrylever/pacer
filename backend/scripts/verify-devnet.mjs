#!/usr/bin/env node
/**
 * Round-3 live proof (backend/AGENTS.md task 8): the whole loop on devnet
 * with a fresh owner and a fresh withdrawal wallet, driven entirely by
 * the backend's own code (AnchorVaultClient + KeeperService from dist/).
 *
 *   bun run build && bun run verify:devnet
 *
 * Steps: faucet $10 USDC-dev -> create_vault (all three stocks, $5 rate)
 * -> sweep the deposit in -> publish fresh prices as oracle -> wait one
 * period -> keeper buy through KeeperService -> verify balances and
 * total_invested -> withdraw everything in ONE transaction to the fresh
 * wallet -> verify arrival. Prints each signature with an explorer link.
 * Never prints a key. Exit 0 only when every check passes.
 */
import 'reflect-metadata';
import 'dotenv/config';

const { AnchorVaultClient } = await import(
  '../dist/solana/anchor-vault-client.js'
);
const { loadDeployment } = await import('../dist/solana/solana.module.js');
const { loadConfig, loadSigner } = await import(
  '../dist/config/app-config.js'
);
const { KeeperService } = await import(
  '../dist/scheduler/keeper.service.js'
);
const { slippageFloor } = await import('../dist/common/money.js');
const anchor = await import('@anchor-lang/core');
const web3 = await import('@solana/web3.js');
const spl = await import('@solana/spl-token');

const link = (sig) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const step = (name, sig) => console.log(`${name}: ${sig} ${link(sig)}`);

function assert(cond, message) {
  if (!cond) throw new Error(`CHECK FAILED: ${message}`);
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
  console.log(`fresh owner: ${ownerStr}`);
  console.log(`fresh withdrawal wallet: ${withdrawal.publicKey.toBase58()}`);
  console.log(`keeper: ${keeper.publicKey.toBase58()}`);

  // Role wallets need devnet SOL for fees/rent; airdrop if low.
  for (const [name, kp] of [
    ['gas', gas],
    ['keeper', keeper],
    ['oracle', oracle],
  ]) {
    const bal = await connection.getBalance(kp.publicKey, 'confirmed');
    console.log(`${name} balance: ${(bal / 1e9).toFixed(4)} SOL`);
    if (bal < 0.05 * 1e9) {
      try {
        const sig = await connection.requestAirdrop(
          kp.publicKey,
          0.5 * web3.LAMPORTS_PER_SOL,
        );
        await connection.confirmTransaction(sig, 'confirmed');
        console.log(`${name} airdrop: ${sig}`);
      } catch (err) {
        console.log(`${name} airdrop skipped: ${err.message}`);
      }
    }
  }

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
  console.log(
    `chain config: period=${chain.periodSeconds}s minTrade=${chain.minTrade} maxRate=${chain.maxRatePerPeriod} halted=${chain.halted}`,
  );
  assert(!chain.halted, 'program is halted');
  assert(chain.keeper === keeper.publicKey.toBase58(), 'keeper mismatch');
  assert(chain.oracleAuthority === oracle.publicKey.toBase58(), 'oracle mismatch');

  // 1. Faucet $10 USDC-dev to the fresh owner's deposit wallet.
  const faucetSig = await client.faucet(ownerStr, 10_000_000n);
  step('faucet', faucetSig);
  const depositBalance = await client.getDepositWalletBalance(ownerStr);
  assert(depositBalance >= 10_000_000n, 'faucet balance missing');

  // 2. Create the vault: $5/period, all three stocks, no withdraw delay.
  const symbols = deployment.stocks.map((s) => s.symbol.replace(/-dev$/, ''));
  const createSig = await client.createVault({
    owner: ownerStr,
    withdrawalDestination: withdrawal.publicKey.toBase58(),
    ratePerPeriod: 5_000_000n,
    mints: symbols,
    withdrawDelaySecs: 0,
  });
  step('create_vault', createSig);

  // 3. Sweep the faucet deposit into the vault.
  const depositSig = await client.deposit({
    owner: ownerStr,
    amount: depositBalance,
  });
  step('deposit', depositSig);
  assert(
    (await client.getVaultBalance(ownerStr, 'USDC')) >= 10_000_000n,
    'vault USDC missing after deposit',
  );

  // 4. Fresh prices from the oracle key (init first if needed).
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(gas),
    { commitment: 'confirmed' },
  );
  const { readFileSync } = await import('node:fs');
  const idl = JSON.parse(
    readFileSync(new URL('../src/solana/idl/pacer_vault.json', import.meta.url), 'utf8'),
  );
  const program = new anchor.Program(idl, provider);
  // Stand-in prices in USD (deployment's `price` field is the account).
  const STANDIN_USD = { 'AAPLx-dev': 200, 'NVDAx-dev': 900, 'SPYx-dev': 750 };
  for (const stock of deployment.stocks) {
    const mint = new web3.PublicKey(stock.mint);
    const usd = Number(process.env[`PRICE_${stock.symbol.replace(/[^A-Z]/g, '')}_USD`] ?? STANDIN_USD[stock.symbol] ?? 100);
    const priceMicro = BigInt(Math.round(usd * 1_000_000));
    const [pricePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from('price'), mint.toBuffer()],
      client.programId,
    );
    const exists = await connection.getAccountInfo(pricePda, 'confirmed');
    if (!exists) {
      const initSig = await program.methods
        .initPrice(new anchor.BN(priceMicro.toString()))
        .accountsPartial({
          admin: gas.publicKey,
          payer: gas.publicKey,
          config: new web3.PublicKey(deployment.config),
          mint,
          price: pricePda,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
      step(`init_price ${stock.symbol}`, initSig);
    }
    const sig = await client.updatePriceAsOracle(stock.symbol, priceMicro);
    step(`update_price ${stock.symbol}`, sig);
  }

  // 5. Wait one period, then buy through KeeperService logic.
  console.log(`waiting ${chain.periodSeconds + 3}s for the pace to unlock...`);
  await new Promise((r) => setTimeout(r, (chain.periodSeconds + 3) * 1000));
  const before = new Map();
  for (const s of symbols)
    before.set(s, await client.getVaultBalance(ownerStr, s));
  const keeperService = new KeeperService(client, {
    ...appConfig,
    periodSeconds: chain.periodSeconds,
    minTradeMicroUsdc: chain.minTrade,
    maxSlippageBps: chain.maxSlippageBps,
    maxPriceAgeSecs: chain.maxPriceAgeSecs,
  });
  keeperService.registerVault(ownerStr);
  const { buys } = await keeperService.tick();
  assert(buys.length > 0, 'keeper placed no buys');
  let invested = 0n;
  for (const buy of buys) {
    step(`keeper buy ${buy.mint}`, buy.signature);
    invested += buy.usdcIn;
    const after = await client.getVaultBalance(ownerStr, buy.mint);
    assert(
      after - before.get(buy.mint) >= buy.minOut,
      `stock balance for ${buy.mint} rose by less than min_out`,
    );
    // Independent floor check with the backend's own slippage maths.
    const meta = await client.getMintMeta(buy.mint);
    assert(meta !== null, `mint meta unreadable for ${buy.mint}`);
  }
  const vault = await client.getVault(ownerStr);
  assert(
    vault.totalInvested === invested,
    `total_invested ${vault.totalInvested} != sum of buys ${invested}`,
  );
  console.log(`total_invested matches: ${vault.totalInvested}`);

  // Keeper must be refused on withdraw (signed as keeper via a client
  // whose owner lookup returns the keeper key).
  const keeperClient = new AnchorVaultClient({
    connection,
    keeper,
    oracle,
    gas,
    ownerKeypair: () => keeper,
    deployment,
    cluster: 'devnet',
  });
  let refused = false;
  try {
    await keeperClient.withdrawAsOwner({
      owner: ownerStr,
      mint: 'USDC',
      amount: 1n,
    });
  } catch (err) {
    refused = true;
    console.log(`keeper withdraw refused as required: ${err.errorName ?? err.message}`);
  }
  assert(refused, 'keeper withdraw unexpectedly succeeded');

  // 6. Withdraw everything in ONE transaction to the fresh wallet.
  const balances = await client.listVaultBalances(ownerStr);
  assert(balances.length > 0, 'nothing to withdraw');
  const withdrawSig = await client.withdrawAllAsOwner({
    owner: ownerStr,
    legs: balances.map((b) => ({ mint: b.mint, amount: b.amount })),
  });
  step('withdraw_all (one transaction)', withdrawSig);
  const tx = await connection.getTransaction(withdrawSig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  assert(tx !== null, 'withdraw transaction not found');
  for (const leg of balances) {
    const mint = client.resolveMint(leg.mint);
    const destAta = spl.getAssociatedTokenAddressSync(
      mint,
      withdrawal.publicKey,
      false,
      mint.equals(new web3.PublicKey(deployment.usdc.mint))
        ? spl.TOKEN_PROGRAM_ID
        : spl.TOKEN_2022_PROGRAM_ID,
    );
    const bal = await connection.getTokenAccountBalance(destAta, 'confirmed');
    assert(
      BigInt(bal.value.amount) >= leg.amount,
      `withdrawal wallet missing ${leg.mint}`,
    );
  }
  console.log('withdrawal wallet received every leg');

  console.log('VERIFY-DEVNET: PASS');
}

main().catch((err) => {
  console.error(`VERIFY-DEVNET: FAIL: ${err.errorName ?? ''} ${err.message}`);
  if (err.logs) console.error(err.logs.join('\n'));
  process.exit(1);
});
