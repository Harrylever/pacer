import { Logger } from '@nestjs/common';
import {
  AnchorProvider,
  BN,
  Program,
  Wallet,
} from '@anchor-lang/core';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getMint,
  getOrCreateAssociatedTokenAccount,
  getScaledUiAmountConfig,
  mintTo,
  unpackMint,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import type {
  ChainConfig,
  PriceState,
  VaultClient,
  VaultState,
} from './vault-client';
// The generated IDL, copied from ../programs/ (`bun run sync:idl`).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pacerVaultIdl = require('./idl/pacer_vault.json') as Record<
  string,
  unknown
> & { address?: string };

/** A program rejection, carrying the Anchor error name (e.g. StalePrice). */
export class VaultProgramError extends Error {
  constructor(
    readonly errorName: string,
    message?: string,
  ) {
    super(message ?? `program error: ${errorName}`);
    this.name = 'VaultProgramError';
  }
}

/** Program errors the keeper treats as "skip this vault this tick". */
export const KEEPER_SKIP_ERRORS = new Set([
  'BelowMinTrade',
  'ExceedsAllowance',
  'StalePrice',
  'MintNotChosen',
  'VaultPaused',
  'Halted',
]);

export interface DeploymentFile {
  cluster: string;
  programs: { pacer_vault: string; mock_swap: string };
  config: string;
  mockAuthority: string;
  treasuryUsdc: string;
  usdc: { mint: string };
  stocks: { symbol: string; mint: string; price: string }[];
}

export interface AnchorVaultClientDeps {
  connection: Connection;
  /** Role signers from loadSigner (solana module only). Never logged. */
  keeper: Keypair;
  oracle: Keypair;
  gas: Keypair;
  /** Owner public key -> server-held owner keypair (WalletsService). */
  ownerKeypair: (ownerPublicKey: string) => Keypair | null;
  deployment: DeploymentFile;
  cluster?: string;
  /** Test seam: replaces the Anchor Program construction. */
  programFactory?: (signer: Keypair) => unknown;
  idl?: Record<string, unknown>;
}

type ProgramLike = {
  programId: PublicKey;
  methods: Record<
    string,
    (...args: unknown[]) => {
      accountsPartial: (a: Record<string, unknown>) => {
        instruction: () => Promise<TransactionInstruction>;
      };
    }
  >;
  account: Record<
    string,
    { fetch: (pk: PublicKey) => Promise<Record<string, unknown>> }
  >;
};

/** Display multiplier: the scheduled newMultiplier once its time has passed. */
export function effectiveMultiplier(
  cfg: {
    multiplier: number;
    newMultiplier?: number;
    newMultiplierEffectiveTimestamp?: bigint | number;
  },
  nowSecs: number,
): number {
  const ts = Number(cfg.newMultiplierEffectiveTimestamp ?? 0);
  if (cfg.newMultiplier !== undefined && ts > 0 && nowSecs >= ts)
    return Number(cfg.newMultiplier);
  return Number(cfg.multiplier);
}

const pk = (s: string) => new PublicKey(s);
const bn = (v: bigint) => new BN(v.toString());
const toBig = (v: unknown): bigint => BigInt(String(v));

/**
 * Real VaultClient against the deployed pacer_vault program (Anchor 1.x
 * TS client, web3.js v1, legacy transactions, `confirmed` everywhere).
 *
 * Signers: gas pays every fee (and is `payer` where the instruction has
 * one); each method additionally signs only as its own role — keeper for
 * buy, oracle for update_price, the user's owner for vault writes. There
 * is no keeper-signed withdraw path anywhere in this class.
 */
export class AnchorVaultClient implements VaultClient {
  private readonly logger = new Logger(AnchorVaultClient.name);
  private readonly connection: Connection;
  private readonly keeper: Keypair;
  private readonly oracle: Keypair;
  private readonly gas: Keypair;
  private readonly ownerKeypair: AnchorVaultClientDeps['ownerKeypair'];
  private readonly deployment: DeploymentFile;
  private readonly cluster: string;
  private readonly programFactory?: AnchorVaultClientDeps['programFactory'];
  private readonly idl: Record<string, unknown>;
  readonly programId: PublicKey;
  private readonly mockSwapId: PublicKey;

  constructor(deps: AnchorVaultClientDeps) {
    this.connection = deps.connection;
    this.keeper = deps.keeper;
    this.oracle = deps.oracle;
    this.gas = deps.gas;
    this.ownerKeypair = deps.ownerKeypair;
    this.deployment = deps.deployment;
    this.cluster = deps.cluster ?? deps.deployment.cluster;
    this.programFactory = deps.programFactory;
    this.idl = deps.idl ?? pacerVaultIdl;
    this.programId = pk(deps.deployment.programs.pacer_vault);
    this.mockSwapId = pk(deps.deployment.programs.mock_swap);
  }

  // ---------- addressing ----------

  private configPda(): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      this.programId,
    )[0];
  }
  private vaultPda(owner: string): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), pk(owner).toBuffer()],
      this.programId,
    )[0];
  }
  private pricePda(mint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('price'), mint.toBuffer()],
      this.programId,
    )[0];
  }
  private mockAuthorityPda(): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('mock_authority')],
      this.mockSwapId,
    )[0];
  }

  /** 'USDC' | 'AAPLx' | 'AAPLx-dev' | raw pubkey -> mint pubkey. */
  resolveMint(input: string): PublicKey {
    if (input === 'USDC') return pk(this.deployment.usdc.mint);
    const stock = this.deployment.stocks.find(
      (s) => s.symbol === input || s.symbol === `${input}-dev`,
    );
    if (stock) return pk(stock.mint);
    return pk(input);
  }

  /** Mint pubkey -> display symbol ('AAPLx'), or the pubkey itself. */
  displayMint(mint: string): string {
    if (mint === this.deployment.usdc.mint) return 'USDC';
    const stock = this.deployment.stocks.find((s) => s.mint === mint);
    return stock ? stock.symbol.replace(/-dev$/, '') : mint;
  }

  private tokenProgramFor(mint: PublicKey): PublicKey {
    return mint.equals(pk(this.deployment.usdc.mint))
      ? TOKEN_PROGRAM_ID
      : TOKEN_2022_PROGRAM_ID;
  }
  private ata(owner: PublicKey, mint: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(
      mint,
      owner,
      true,
      this.tokenProgramFor(mint),
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
  }

  // ---------- program / sending ----------

  private programFor(signer: Keypair): ProgramLike {
    if (this.programFactory)
      return this.programFactory(signer) as ProgramLike;
    const provider = new AnchorProvider(
      this.connection,
      new Wallet(signer),
      { commitment: 'confirmed' },
    );
    return new Program(
      this.idl as never,
      provider,
    ) as unknown as ProgramLike;
  }

  private ownerSigner(owner: string): Keypair {
    const kp = this.ownerKeypair(owner);
    if (!kp) throw new Error(`no owner keypair for ${owner}`);
    return kp;
  }

  /** Builds one instruction through the Anchor builder for `signer`. */
  private async buildIx(
    signer: Keypair,
    method: string,
    args: unknown[],
    accounts: Record<string, unknown>,
  ): Promise<TransactionInstruction> {
    const builder = this.programFor(signer).methods[method](...args);
    return builder.accountsPartial(accounts).instruction();
  }

  /**
   * Sends instructions as ONE legacy transaction: fee payer is always
   * gas, plus the role signer. Simulates first and surfaces program logs
   * (mapped to VaultProgramError) instead of sending a doomed transaction.
   * No blind retries: a timeout after send is reported, never resent.
   */
  private async sendIxs(
    signer: Keypair,
    ixs: TransactionInstruction[],
  ): Promise<string> {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = this.gas.publicKey;
    const latest = await this.connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latest.blockhash;
    const signers = [this.gas];
    if (!signer.publicKey.equals(this.gas.publicKey)) signers.push(signer);
    tx.sign(...signers);

    const sim = await this.connection.simulateTransaction(tx);
    if (sim.value.err) {
      throw this.mapError(sim.value.err, sim.value.logs ?? []);
    }
    const raw = tx.serialize();
    const signature = await this.connection.sendRawTransaction(raw, {
      preflightCommitment: 'confirmed',
    });
    const conf = await this.connection.confirmTransaction(
      { signature, ...latest },
      'confirmed',
    );
    if (conf.value.err) throw this.mapError(conf.value.err, []);
    return signature;
  }

  /** Finds an Anchor custom error code in strings or nested err objects. */
  private customCode(err: unknown, logs: string[]): number | null {
    const fromText = [...logs].join('\n').match(/custom program error: 0x([0-9a-f]+)/i);
    if (fromText) return parseInt(fromText[1], 16);
    const seen = new Set<unknown>();
    const walk = (v: unknown): number | null => {
      if (v === null || typeof v !== 'object' || seen.has(v)) return null;
      seen.add(v);
      const rec = v as Record<string, unknown>;
      for (const key of ['Custom', 'custom']) {
        if (typeof rec[key] === 'number') return rec[key] as number;
      }
      for (const value of Object.values(rec)) {
        const found = walk(value);
        if (found !== null) return found;
      }
      return null;
    };
    return walk(err);
  }

  private namedError(name: string): VaultProgramError {
    if (name === 'WithdrawWindowClosed') {
      return new VaultProgramError(
        name,
        'WithdrawWindowClosed: the withdrawal window is closed; request a withdrawal first',
      );
    }
    return new VaultProgramError(name, `program error: ${name}`);
  }

  private mapError(err: unknown, logs: string[]): VaultProgramError {
    const text = [...logs, err instanceof Error ? err.message : ''].join('\n');
    const named = text.match(/Error Code: (\w+)/);
    if (named) return this.namedError(named[1]);
    const code = this.customCode(err, logs);
    if (code !== null) {
      const byCode = (this.idl as { errors?: { code: number; name: string }[] })
        .errors?.find((e) => e.code === code);
      if (byCode) return this.namedError(byCode.name);
    }
    const realMessage =
      err instanceof Error ? err.message : text.slice(0, 300);
    // Never let an unmapped rejection collapse to just the label: the
    // underlying message and program logs are the only clue on devnet.
    this.logger.warn(
      `UnknownProgramError: ${realMessage}${logs.length ? ` | logs: ${logs.join(' | ').slice(0, 500)}` : ''}`,
    );
    return new VaultProgramError('UnknownProgramError', realMessage);
  }

  private async sendIx(
    signer: Keypair,
    method: string,
    args: unknown[],
    accounts: Record<string, unknown>,
  ): Promise<string> {
    const ix = await this.buildIx(signer, method, args, accounts);
    return this.sendIxs(signer, [ix]);
  }

  // ---------- reads ----------

  async getConfig(): Promise<ChainConfig> {
    const c = await this.programFor(this.gas).account.globalConfig.fetch(
      this.configPda(),
    );
    const stockCount = Number(c.stockCount ?? 0);
    const stockMints = (c.stockMints as PublicKey[]).slice(0, stockCount);
    return {
      admin: String(c.admin),
      keeper: String(c.keeper),
      oracleAuthority: String(c.oracleAuthority),
      usdcMint: String(c.usdcMint),
      swapProgram: String(c.swapProgram),
      stockMints: stockMints.map(String),
      periodSeconds: Number(c.periodSeconds),
      minTrade: toBig(c.minTrade),
      maxRatePerPeriod: toBig(c.maxRatePerPeriod),
      maxSlippageBps: Number(c.maxSlippageBps),
      maxPriceAgeSecs: Number(c.maxPriceAgeSecs),
      maxWithdrawDelaySecs: Number(c.maxWithdrawDelaySecs),
      withdrawWindowSecs: Number(c.withdrawWindowSecs),
      halted: Boolean(c.halted),
    };
  }

  async getVault(owner: string): Promise<VaultState | null> {
    try {
      const v = await this.programFor(this.gas).account.userVault.fetch(
        this.vaultPda(owner),
      );
      return {
        owner: String(v.owner),
        withdrawalDestination: String(v.withdrawalDestination),
        ratePerPeriod: toBig(v.ratePerPeriod),
        allowance: toBig(v.allowance),
        lastCheckpointTs: Number(v.lastCheckpointTs),
        totalInvested: toBig(v.totalInvested),
        chosenMints: (v.chosenMints as PublicKey[]).map((m) =>
          this.displayMint(String(m)),
        ),
        paused: Boolean(v.paused),
        withdrawDelaySecs: Number(v.withdrawDelaySecs ?? 0),
      };
    } catch (err) {
      // Null only when the account truly does not exist; an RPC outage or
      // rate limit must throw so it never looks like "no vault".
      const m = err instanceof Error ? err.message : String(err);
      if (/account does not exist|could not find account|not found/i.test(m))
        return null;
      throw err;
    }
  }

  async getPrice(mintInput: string): Promise<PriceState | null> {
    const mint = this.resolveMint(mintInput);
    try {
      const p = await this.programFor(this.gas).account.priceAccount.fetch(
        this.pricePda(mint),
      );
      return {
        priceMicroUsdc: toBig(p.priceMicroUsdc),
        updatedAt: Number(p.updatedAt),
      };
    } catch {
      return null;
    }
  }

  async getMintMeta(
    mintInput: string,
  ): Promise<{ decimals: number; multiplier: number } | null> {
    try {
      const mint = this.resolveMint(mintInput);
      const info = await this.connection.getAccountInfo(mint, 'confirmed');
      if (!info) return null;
      const programId = info.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
      const parsed = unpackMint(mint, info, programId);
      if (!parsed) return null;
      let multiplier = 1;
      if (programId.equals(TOKEN_2022_PROGRAM_ID)) {
        const cfg = getScaledUiAmountConfig(parsed);
        if (cfg) multiplier = effectiveMultiplier(cfg, Math.floor(Date.now() / 1000));
      }
      return { decimals: parsed.decimals, multiplier };
    } catch {
      return null; // unreadable mint: the keeper skips, never guesses
    }
  }

  getVaultAddress(owner: string): string {
    return this.vaultPda(owner).toBase58();
  }

  async getDepositWalletBalance(owner: string): Promise<bigint> {
    const usdc = pk(this.deployment.usdc.mint);
    const ata = this.ata(pk(owner), usdc);
    try {
      const bal = await this.connection.getTokenAccountBalance(
        ata,
        'confirmed',
      );
      return BigInt(bal.value.amount);
    } catch {
      return 0n; // account does not exist yet
    }
  }

  async getVaultBalance(owner: string, mintInput: string): Promise<bigint> {
    const mint = this.resolveMint(mintInput);
    const ata = this.ata(this.vaultPda(owner), mint);
    // 0 only when the account truly does not exist; RPC failures throw,
    // so callers never mistake an outage for an empty vault.
    const info = await this.connection.getAccountInfo(ata, 'confirmed');
    if (!info) return 0n;
    const bal = await this.connection.getTokenAccountBalance(
      ata,
      'confirmed',
    );
    return BigInt(bal.value.amount);
  }

  /**
   * What the vault holds that Pacer manages: USDC (legacy Token program)
   * and the allowlisted stocks (Token-2022). Anyone can send any token to
   * a vault's address, but the program refuses to withdraw a mint outside
   * that set, so a junk token in this list would revert every
   * "withdraw everything" transaction. Junk is therefore never listed.
   */
  async listVaultBalances(
    owner: string,
  ): Promise<{ mint: string; amount: bigint }[]> {
    const vault = this.vaultPda(owner);
    const managed: [PublicKey, Set<string>][] = [
      [TOKEN_PROGRAM_ID, new Set([this.deployment.usdc.mint])],
      [
        TOKEN_2022_PROGRAM_ID,
        new Set(this.deployment.stocks.map((s) => s.mint)),
      ],
    ];
    const out: { mint: string; amount: bigint }[] = [];
    for (const [programId, allowed] of managed) {
      const res = await this.connection.getParsedTokenAccountsByOwner(
        vault,
        { programId },
        'confirmed',
      );
      for (const { account } of res.value) {
        const info = (
          account.data as {
            parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string } } };
          }
        ).parsed?.info;
        if (!info?.mint || !info.tokenAmount?.amount) continue;
        if (!allowed.has(info.mint)) continue;
        const amount = BigInt(info.tokenAmount.amount);
        if (amount > 0n)
          out.push({ mint: this.displayMint(info.mint), amount });
      }
    }
    return out;
  }

  // ---------- writes ----------

  async createVault(args: {
    owner: string;
    withdrawalDestination: string;
    ratePerPeriod: bigint;
    mints: string[];
    withdrawDelaySecs?: number;
  }): Promise<string> {
    const owner = this.ownerSigner(args.owner);
    const usdc = pk(this.deployment.usdc.mint);
    const vault = this.vaultPda(args.owner);
    return this.sendIx(owner, 'createVault', [
      {
        withdrawalDestination: pk(args.withdrawalDestination),
        ratePerPeriod: bn(args.ratePerPeriod),
        mints: args.mints.map((m) => this.resolveMint(m)),
        withdrawDelaySecs: args.withdrawDelaySecs ?? 0,
      },
    ], {
      owner: owner.publicKey,
      payer: this.gas.publicKey,
      config: this.configPda(),
      vault,
      usdcMint: usdc,
      usdcVaultAta: this.ata(vault, usdc),
      usdcTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });
  }

  async deposit(args: { owner: string; amount: bigint }): Promise<string> {
    const owner = this.ownerSigner(args.owner);
    const usdc = pk(this.deployment.usdc.mint);
    const vault = this.vaultPda(args.owner);
    return this.sendIx(owner, 'deposit', [bn(args.amount)], {
      owner: owner.publicKey,
      config: this.configPda(),
      vault,
      usdcMint: usdc,
      ownerUsdc: this.ata(owner.publicKey, usdc),
      usdcVaultAta: this.ata(vault, usdc),
      usdcTokenProgram: TOKEN_PROGRAM_ID,
    });
  }

  async setRules(args: {
    owner: string;
    ratePerPeriod: bigint;
    mints: string[];
    paused: boolean;
  }): Promise<string> {
    const owner = this.ownerSigner(args.owner);
    return this.sendIx(
      owner,
      'setRules',
      [bn(args.ratePerPeriod), args.mints.map((m) => this.resolveMint(m)), args.paused],
      {
        owner: owner.publicKey,
        config: this.configPda(),
        vault: this.vaultPda(args.owner),
      },
    );
  }

  async buyAsKeeper(args: {
    owner: string;
    mint: string;
    usdcIn: bigint;
    minOut: bigint;
  }): Promise<string> {
    if (args.minOut === 0n) throw new VaultProgramError('SlippageTooHigh');
    const stockMint = this.resolveMint(args.mint);
    const usdc = pk(this.deployment.usdc.mint);
    const vault = this.vaultPda(args.owner);
    const config = await this.getConfig().catch(() => null);
    return this.sendIx(this.keeper, 'buy', [bn(args.usdcIn), bn(args.minOut)], {
      keeper: this.keeper.publicKey,
      payer: this.gas.publicKey,
      config: this.configPda(),
      vault,
      price: this.pricePda(stockMint),
      usdcMint: usdc,
      stockMint,
      usdcVaultAta: this.ata(vault, usdc),
      stockVaultAta: this.ata(vault, stockMint),
      swapProgram: config ? pk(config.swapProgram) : this.mockSwapId,
      treasuryUsdc: pk(this.deployment.treasuryUsdc),
      mockAuthority: this.mockAuthorityPda(),
      usdcTokenProgram: TOKEN_PROGRAM_ID,
      stockTokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });
  }

  private async withdrawIx(
    owner: Keypair,
    ownerStr: string,
    mintInput: string,
    amount: bigint,
    destination: PublicKey,
  ): Promise<TransactionInstruction> {
    const mint = this.resolveMint(mintInput);
    const vault = this.vaultPda(ownerStr);
    return this.buildIx(owner, 'withdraw', [bn(amount)], {
      owner: owner.publicKey,
      payer: this.gas.publicKey,
      config: this.configPda(),
      vault,
      withdrawalDestination: destination,
      mint,
      vaultAta: this.ata(vault, mint),
      destinationAta: this.ata(destination, mint),
      tokenProgram: this.tokenProgramFor(mint),
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });
  }

  /** Owner only; destination read from the vault, never an argument. */
  async withdrawAsOwner(args: {
    owner: string;
    mint: string;
    amount: bigint;
  }): Promise<string> {
    const owner = this.ownerSigner(args.owner);
    const vault = await this.getVault(args.owner);
    if (!vault) throw new Error('vault not found');
    const ix = await this.withdrawIx(
      owner,
      args.owner,
      args.mint,
      args.amount,
      pk(vault.withdrawalDestination),
    );
    return this.sendIxs(owner, [ix]);
  }

  /** Owner only; every leg packed into ONE transaction (never split). */
  async withdrawAllAsOwner(args: {
    owner: string;
    legs: { mint: string; amount: bigint }[];
  }): Promise<string> {
    const owner = this.ownerSigner(args.owner);
    const vault = await this.getVault(args.owner);
    if (!vault) throw new Error('vault not found');
    const destination = pk(vault.withdrawalDestination);
    const ixs: TransactionInstruction[] = [];
    for (const leg of args.legs) {
      ixs.push(
        await this.withdrawIx(owner, args.owner, leg.mint, leg.amount, destination),
      );
    }
    return this.sendIxs(owner, ixs);
  }

  /** Keeper only (gas pays): records a confirmed intent hash on chain. */
  async recordIntent(
    owner: string,
    intentHash: Uint8Array,
    modelId: Uint8Array,
  ): Promise<string> {
    if (intentHash.length !== 32 || modelId.length !== 16)
      throw new Error('recordIntent needs a 32-byte hash and 16-byte model id');
    return this.sendIx(
      this.keeper,
      'recordIntent',
      [Array.from(intentHash), Array.from(modelId)],
      {
        keeper: this.keeper.publicKey,
        config: this.configPda(),
        vault: this.vaultPda(owner),
      },
    );
  }

  /** Oracle only (separate key from the keeper); gas pays. */
  async updatePriceAsOracle(
    mintInput: string,
    priceMicroUsdc: bigint,
  ): Promise<string> {
    const mint = this.resolveMint(mintInput);
    return this.sendIx(this.oracle, 'updatePrice', [bn(priceMicroUsdc)], {
      oracle: this.oracle.publicKey,
      config: this.configPda(),
      price: this.pricePda(mint),
    });
  }

  /**
   * Devnet only: gas (the USDC-dev mint authority) creates the owner's
   * USDC token account if missing, then mints. The deposit sweep does
   * the rest.
   */
  async faucet(owner: string, amountMicroUsdc: bigint): Promise<string> {
    if (this.cluster !== 'devnet')
      throw new Error('faucet is devnet only');
    const usdc = pk(this.deployment.usdc.mint);
    const ata = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.gas,
      usdc,
      pk(owner),
      false,
      'confirmed',
      { commitment: 'confirmed' },
      TOKEN_PROGRAM_ID,
    );
    return mintTo(
      this.connection,
      this.gas,
      usdc,
      ata.address,
      this.gas,
      amountMicroUsdc,
      [],
      { commitment: 'confirmed' },
      TOKEN_PROGRAM_ID,
    );
  }
}
