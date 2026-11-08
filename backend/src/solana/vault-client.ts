/**
 * The single seam to the vault program. Built against SPEC.md's vault
 * interface until CONTRACT.md / the devnet IDL land (Sonnet stages 1–2);
 * only an Anchor adapter implementing this port changes then.
 *
 * There is deliberately no keeper withdraw method: the keeper can never
 * sign any withdrawal (SPEC "Values that are already decided").
 */
export interface VaultState {
  owner: string;
  withdrawalDestination: string;
  ratePerPeriod: bigint;
  allowance: bigint;
  lastCheckpointTs: number;
  totalInvested: bigint;
  chosenMints: string[];
  paused: boolean;
  withdrawDelaySecs?: number;
}

export interface PriceState {
  priceMicroUsdc: bigint;
  updatedAt: number;
}

/** The on-chain `GlobalConfig` account, decoded. */
export interface ChainConfig {
  admin: string;
  keeper: string;
  oracleAuthority: string;
  usdcMint: string;
  swapProgram: string;
  /** Allowlisted stock mints (first `stock_count` on chain). */
  stockMints: string[];
  periodSeconds: number;
  minTrade: bigint;
  maxRatePerPeriod: bigint;
  maxSlippageBps: number;
  maxPriceAgeSecs: number;
  maxWithdrawDelaySecs: number;
  withdrawWindowSecs: number;
  halted: boolean;
}

export type SignerRole = 'keeper' | 'oracle' | 'gas' | 'owner';

export interface VaultClient {
  /** Owner signs, gas wallet pays. `withdrawDelaySecs` defaults to 0 (no delay). */
  createVault(args: {
    owner: string;
    withdrawalDestination: string;
    ratePerPeriod: bigint;
    mints: string[];
    withdrawDelaySecs?: number;
  }): Promise<string>;
  /** Reads the on-chain `GlobalConfig`. No signer. */
  getConfig(): Promise<ChainConfig>;
  deposit(args: { owner: string; amount: bigint }): Promise<string>;
  setRules(args: {
    owner: string;
    ratePerPeriod: bigint;
    mints: string[];
    paused: boolean;
  }): Promise<string>;
  /** Keeper only. The program enforces allowance, allowlist, pace, slippage. */
  buyAsKeeper(args: {
    owner: string;
    mint: string;
    usdcIn: bigint;
    minOut: bigint;
  }): Promise<string>;
  /**
   * Owner only. The program pays only to the vault's fixed
   * withdrawal_destination; there is no destination argument by design,
   * and no keeper variant of this method exists.
   */
  withdrawAsOwner(args: {
    owner: string;
    mint: string;
    amount: bigint;
  }): Promise<string>;
  /**
   * Owner only. One `withdraw` instruction per leg, packed into a single
   * transaction (SPEC: "Withdraw everything" is one transaction). Paid only
   * to the fixed withdrawal_destination.
   */
  withdrawAllAsOwner(args: {
    owner: string;
    legs: { mint: string; amount: bigint }[];
  }): Promise<string>;
  /**
   * Devnet only. The gas wallet (or the USDC-dev mint authority it controls)
   * mints USDC-dev into the owner's deposit wallet; the normal deposit sweep
   * then moves it into the vault.
   */
  faucet(owner: string, amountMicroUsdc: bigint): Promise<string>;
  /** Oracle only (separate key from the keeper). */
  updatePriceAsOracle(mint: string, priceMicroUsdc: bigint): Promise<string>;
  getVault(owner: string): Promise<VaultState | null>;
  getPrice(mint: string): Promise<PriceState | null>;
  /** The vault's own on-chain address (a PDA derived from the owner), for explorer links. */
  getVaultAddress(owner: string): string;
  getDepositWalletBalance(owner: string): Promise<bigint>;
  getVaultBalance(owner: string, mint: string): Promise<bigint>;
  /**
   * Every non-zero token balance the vault holds (USDC and any stock),
   * including stocks the user is no longer choosing, so nothing is stranded.
   */
  listVaultBalances(owner: string): Promise<{ mint: string; amount: bigint }[]>;
  getMintMeta(
    mint: string,
  ): Promise<{ decimals: number; multiplier: number } | null>;
  /**
   * Keeper only (gas pays): records the hash of a confirmed intent and a
   * 16-byte model id on chain. Audit trail only; never moves money.
   */
  recordIntent(
    owner: string,
    intentHash: Uint8Array,
    modelId: Uint8Array,
  ): Promise<string>;
}
