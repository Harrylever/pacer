import type {
  ChainConfig,
  PriceState,
  VaultClient,
  VaultState,
} from './vault-client';

export const DEMO_CHAIN_CONFIG: ChainConfig = {
  admin: 'AdminPubkey111111111111111111111111111111111',
  keeper: 'KeeperPubkey11111111111111111111111111111111',
  oracleAuthority: 'OraclePubkey11111111111111111111111111111111',
  usdcMint: 'USDC',
  swapProgram: 'MockSwap1111111111111111111111111111111111',
  stockMints: ['SPY', 'AAPL', 'NVDA', 'SPYx', 'AAPLx', 'NVDAx'],
  periodSeconds: 10,
  minTrade: 100_000n,
  maxRatePerPeriod: 50_000_000n,
  maxSlippageBps: 100,
  maxPriceAgeSecs: 600,
  maxWithdrawDelaySecs: 604_800,
  withdrawWindowSecs: 86_400,
  halted: false,
};
import { settledAllowance } from '../common/pace';

/** In-memory VaultClient for tests and local dev. No keys, no network. */
export class FakeVaultClient implements VaultClient {
  private chainConfig: ChainConfig;

  constructor(config: Partial<ChainConfig> = {}) {
    this.chainConfig = { ...DEMO_CHAIN_CONFIG, ...config };
    this.periodSeconds = this.chainConfig.periodSeconds;
    this.minTrade = this.chainConfig.minTrade;
  }

  intentRecords: {
    owner: string;
    intentHash: Uint8Array;
    modelId: Uint8Array;
  }[] = [];

  async recordIntent(
    owner: string,
    intentHash: Uint8Array,
    modelId: Uint8Array,
  ): Promise<string> {
    if (intentHash.length !== 32 || modelId.length !== 16)
      throw new Error('recordIntent needs a 32-byte hash and 16-byte model id');
    this.intentRecords.push({
      owner,
      intentHash: new Uint8Array(intentHash),
      modelId: new Uint8Array(modelId),
    });
    return 'fake-record-intent-sig';
  }

  async getConfig(): Promise<ChainConfig> {
    return {
      ...this.chainConfig,
      stockMints: [...this.chainConfig.stockMints],
    };
  }
  private vaults = new Map<string, VaultState>();
  private prices = new Map<string, PriceState>();
  private depositBalances = new Map<string, bigint>();
  private vaultBalances = new Map<string, bigint>();
  private mintMeta = new Map<
    string,
    { decimals: number; multiplier: number }
  >();
  failNextDeposit = false;
  /** Mirrors the program: buy and set_rules settle first. Tests may override. */
  periodSeconds = 10;
  minTrade = 100_000n;
  clock = (): number => Math.floor(Date.now() / 1000);

  private settle(v: VaultState): void {
    const now = this.clock();
    if (v.paused) {
      v.lastCheckpointTs = now;
      return;
    }
    const periods = Math.floor((now - v.lastCheckpointTs) / this.periodSeconds);
    v.allowance = settledAllowance(v, now, this.periodSeconds, this.minTrade);
    v.lastCheckpointTs += Math.max(0, periods) * this.periodSeconds;
  }
  buys: { owner: string; mint: string; usdcIn: bigint; minOut: bigint }[] =
    [];
  withdrawals: {
    owner: string;
    mint: string;
    amount: bigint;
    destination: string;
  }[] = [];

  // --- test helpers (not part of the port) ---
  creditDepositWallet(owner: string, amount: bigint): void {
    this.depositBalances.set(
      owner,
      (this.depositBalances.get(owner) ?? 0n) + amount,
    );
  }
  creditVault(owner: string, mint: string, amount: bigint): void {
    this.vaultBalances.set(
      `${owner}:${mint}`,
      (this.vaultBalances.get(`${owner}:${mint}`) ?? 0n) + amount,
    );
  }
  setPriceAt(mint: string, priceMicroUsdc: bigint, updatedAt: number): void {
    this.prices.set(mint, { priceMicroUsdc, updatedAt });
  }
  setMintMeta(
    mint: string,
    meta: { decimals: number; multiplier: number },
  ): void {
    this.mintMeta.set(mint, meta);
  }
  setAllowance(owner: string, allowance: bigint): void {
    const v = this.vaults.get(owner);
    if (v) v.allowance = allowance;
  }
  setPaused(owner: string, paused: boolean): void {
    const v = this.vaults.get(owner);
    if (v) v.paused = paused;
  }
  private withdrawWindows = new Map<
    string,
    { unlockTs: number; expiresTs: number }
  >();
  /** Test helper mirroring request_withdraw: opens the window after the delay. */
  requestWithdraw(owner: string): void {
    const v = this.vaults.get(owner);
    if (!v) throw new Error('vault not found');
    const delay = v.withdrawDelaySecs ?? 0;
    if (delay <= 0) throw new Error('DelayNotEnabled');
    const unlockTs = this.clock() + delay;
    this.withdrawWindows.set(owner, {
      unlockTs,
      expiresTs: unlockTs + this.chainConfig.withdrawWindowSecs,
    });
  }
  private assertWithdrawWindow(owner: string, v: VaultState): void {
    const delay = v.withdrawDelaySecs ?? 0;
    if (delay <= 0) return;
    const w = this.withdrawWindows.get(owner);
    const now = this.clock();
    if (!w || now < w.unlockTs || now > w.expiresTs)
      throw new Error('WithdrawWindowClosed');
  }

  // --- port ---
  async createVault(args: {
    owner: string;
    withdrawalDestination: string;
    ratePerPeriod: bigint;
    mints: string[];
    withdrawDelaySecs?: number;
  }): Promise<string> {
    this.vaults.set(args.owner, {
      owner: args.owner,
      withdrawalDestination: args.withdrawalDestination,
      ratePerPeriod: args.ratePerPeriod,
      allowance: 0n,
      lastCheckpointTs: Math.floor(Date.now() / 1000),
      totalInvested: 0n,
      chosenMints: [...args.mints],
      paused: false,
      withdrawDelaySecs: args.withdrawDelaySecs ?? 0,
    });
    return 'fake-create-sig';
  }

  async deposit(args: { owner: string; amount: bigint }): Promise<string> {
    if (this.failNextDeposit) {
      this.failNextDeposit = false;
      throw new Error('simulated deposit failure');
    }
    const bal = this.depositBalances.get(args.owner) ?? 0n;
    if (bal < args.amount) throw new Error('insufficient deposit balance');
    this.depositBalances.set(args.owner, bal - args.amount);
    this.creditVault(args.owner, 'USDC', args.amount);
    return 'fake-deposit-sig';
  }

  async setRules(args: {
    owner: string;
    ratePerPeriod: bigint;
    mints: string[];
    paused: boolean;
  }): Promise<string> {
    const v = this.vaults.get(args.owner);
    if (!v) throw new Error('vault not found');
    this.settle(v);
    v.ratePerPeriod = args.ratePerPeriod;
    v.chosenMints = [...args.mints];
    v.paused = args.paused;
    return 'fake-set-rules-sig';
  }

  async buyAsKeeper(args: {
    owner: string;
    mint: string;
    usdcIn: bigint;
    minOut: bigint;
  }): Promise<string> {
    const v = this.vaults.get(args.owner);
    if (!v) throw new Error('vault not found');
    if (!this.chainConfig.stockMints.includes(args.mint))
      throw new Error('MintNotAllowed');
    this.settle(v);
    if (v.paused) throw new Error('Paused');
    if (args.usdcIn < this.minTrade) throw new Error('BelowMinTrade');
    if (args.minOut === 0n) throw new Error('SlippageTooHigh');
    if (args.usdcIn > v.allowance) throw new Error('ExceedsAllowance');
    this.buys.push({ ...args });
    v.allowance -= args.usdcIn;
    v.totalInvested += args.usdcIn;
    // The mock swap mints the quoted amount (which is >= min_out).
    const price = this.prices.get(args.mint);
    const meta = await this.getMintMeta(args.mint);
    const out = price
      ? (args.usdcIn * 10n ** BigInt(meta?.decimals ?? 8)) /
        price.priceMicroUsdc
      : args.minOut;
    this.creditVault(args.owner, args.mint, out);
    return 'fake-buy-sig';
  }

  async withdrawAsOwner(args: {
    owner: string;
    mint: string;
    amount: bigint;
  }): Promise<string> {
    const v = this.vaults.get(args.owner);
    if (!v) throw new Error('vault not found');
    this.assertWithdrawWindow(args.owner, v);
    const bal = await this.getVaultBalance(args.owner, args.mint);
    if (bal < args.amount) throw new Error('insufficient vault balance');
    this.vaultBalances.set(
      `${args.owner}:${args.mint}`,
      bal - args.amount,
    );
    this.withdrawals.push({
      ...args,
      destination: v.withdrawalDestination,
    });
    return 'fake-withdraw-sig';
  }

  withdrawAllTxs: { owner: string; destination: string; legs: { mint: string; amount: bigint }[] }[] = [];

  async withdrawAllAsOwner(args: {
    owner: string;
    legs: { mint: string; amount: bigint }[];
  }): Promise<string> {
    const v = this.vaults.get(args.owner);
    if (!v) throw new Error('vault not found');
    this.assertWithdrawWindow(args.owner, v);
    for (const leg of args.legs) {
      const bal = await this.getVaultBalance(args.owner, leg.mint);
      if (bal < leg.amount) throw new Error('insufficient vault balance');
    }
    for (const leg of args.legs) {
      const key = `${args.owner}:${leg.mint}`;
      this.vaultBalances.set(key, (this.vaultBalances.get(key) ?? 0n) - leg.amount);
      this.withdrawals.push({ owner: args.owner, ...leg, destination: v.withdrawalDestination });
    }
    this.withdrawAllTxs.push({ owner: args.owner, destination: v.withdrawalDestination, legs: [...args.legs] });
    return 'fake-withdraw-all-sig';
  }

  async listVaultBalances(owner: string): Promise<{ mint: string; amount: bigint }[]> {
    const out: { mint: string; amount: bigint }[] = [];
    for (const [key, amount] of this.vaultBalances) {
      const [o, mint] = key.split(':');
      if (o === owner && amount > 0n) out.push({ mint, amount });
    }
    return out;
  }

  faucets: { owner: string; amountMicroUsdc: bigint }[] = [];

  async faucet(owner: string, amountMicroUsdc: bigint): Promise<string> {
    this.faucets.push({ owner, amountMicroUsdc });
    this.creditDepositWallet(owner, amountMicroUsdc);
    return 'fake-faucet-sig';
  }

  async updatePriceAsOracle(
    mint: string,
    priceMicroUsdc: bigint,
  ): Promise<string> {
    this.prices.set(mint, {
      priceMicroUsdc,
      updatedAt: Math.floor(Date.now() / 1000),
    });
    return 'fake-price-sig';
  }

  async getVault(owner: string): Promise<VaultState | null> {
    return this.vaults.get(owner) ?? null;
  }
  async getPrice(mint: string): Promise<PriceState | null> {
    return this.prices.get(mint) ?? null;
  }
  getVaultAddress(owner: string): string {
    return `fake-vault-${owner}`;
  }
  async getDepositWalletBalance(owner: string): Promise<bigint> {
    return this.depositBalances.get(owner) ?? 0n;
  }
  async getVaultBalance(owner: string, mint: string): Promise<bigint> {
    return this.vaultBalances.get(`${owner}:${mint}`) ?? 0n;
  }
  async getMintMeta(
    mint: string,
  ): Promise<{ decimals: number; multiplier: number } | null> {
    return this.mintMeta.get(mint) ?? null;
  }
}
