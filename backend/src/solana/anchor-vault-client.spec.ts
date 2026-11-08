import { Logger } from '@nestjs/common';
import { BN } from '@anchor-lang/core';
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AnchorVaultClient,
  VaultProgramError,
  effectiveMultiplier,
  type DeploymentFile,
} from './anchor-vault-client';

const deployment = JSON.parse(
  readFileSync(join(__dirname, 'deployments', 'devnet.json'), 'utf8'),
) as DeploymentFile;

interface Call {
  method: string;
  args: unknown[];
  accounts: Record<string, unknown>;
  signer: Keypair;
}

class FakeProgram {
  calls: Call[] = [];
  vaultAccount: Record<string, unknown> | null = null;
  configAccount: Record<string, unknown> | null = null;

  constructor(
    private readonly signer: Keypair,
    private readonly shared: { calls: Call[]; outer: FakeProgram },
  ) {}

  get methods() {
    const fake = this;
    return new Proxy(
      {},
      {
        get:
          (_t, method: string) =>
          (...args: unknown[]) => ({
            accountsPartial: (accounts: Record<string, unknown>) => ({
              instruction: async () => {
                fake.shared.calls.push({
                  method,
                  args,
                  accounts,
                  signer: fake.signer,
                });
                return new TransactionInstruction({
                  programId: new PublicKey(deployment.programs.pacer_vault),
                  keys: Object.entries(accounts)
                    .filter(([, v]) => v instanceof PublicKey)
                    .map(([name, v]) => ({
                      pubkey: v as PublicKey,
                      isSigner: ['owner', 'keeper', 'oracle', 'payer'].includes(name),
                      isWritable: true,
                    })),
                  data: Buffer.from(method),
                });
              },
            }),
          }),
      },
    );
  }

  get account() {
    const outer = this.shared.outer;
    return {
      userVault: {
        fetch: async () => {
          if (!outer.vaultAccount) throw new Error('not found');
          if (outer.vaultAccount instanceof Error) throw outer.vaultAccount;
          return outer.vaultAccount;
        },
      },
      globalConfig: {
        fetch: async () => outer.configAccount,
      },
      priceAccount: {
        fetch: async () => ({
          priceMicroUsdc: new BN(336470000),
          updatedAt: new BN(123),
        }),
      },
    };
  }
}

class MockConnection {
  sent: Transaction[] = [];
  simulated: Transaction[] = [];
  tokenBalances = new Map<string, string>();
  parsedByOwner: unknown[] = [];
  simError: { err: unknown; logs: string[] } | null = null;

  async getLatestBlockhash() {
    return {
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 999,
    };
  }
  async simulateTransaction(tx: Transaction) {
    this.simulated.push(tx);
    if (this.simError)
      return { value: { err: this.simError.err, logs: this.simError.logs } };
    return { value: { err: null, logs: [] as string[] } };
  }
  async sendRawTransaction() {
    return 'mock-sig';
  }
  async confirmTransaction() {
    return { value: { err: null } };
  }
  async getTokenAccountBalance(ata: PublicKey) {
    const amount = this.tokenBalances.get(ata.toBase58());
    if (amount === undefined) throw new Error('not found');
    return { value: { amount } };
  }
  async getParsedTokenAccountsByOwner() {
    return { value: this.parsedByOwner };
  }
  async getAccountInfo() {
    return null;
  }
}

function setup() {
  const connection = new MockConnection();
  const keeper = Keypair.generate();
  const oracle = Keypair.generate();
  const gas = Keypair.generate();
  const owner = Keypair.generate();
  const shared = { calls: [] as Call[], outer: null as unknown as FakeProgram };
  const outer = new FakeProgram(gas, shared);
  shared.outer = outer;
  // sendRawTransaction needs the tx; capture via simulate (same tx object).
  const client = new AnchorVaultClient({
    connection: connection as never,
    keeper,
    oracle,
    gas,
    ownerKeypair: (pkStr) =>
      pkStr === owner.publicKey.toBase58() ? owner : null,
    deployment,
    programFactory: (signer) => new FakeProgram(signer, shared),
  });
  outer.configAccount = {
    admin: Keypair.generate().publicKey,
    keeper: keeper.publicKey,
    oracleAuthority: oracle.publicKey,
    usdcMint: new PublicKey(deployment.usdc.mint),
    swapProgram: new PublicKey(deployment.programs.mock_swap),
    stockMints: deployment.stocks.map((s) => new PublicKey(s.mint)),
    stockCount: 3,
    periodSeconds: 10,
    minTrade: new BN(100000),
    maxRatePerPeriod: new BN(50000000),
    maxSlippageBps: 100,
    maxPriceAgeSecs: 600,
    maxWithdrawDelaySecs: 604800,
    withdrawWindowSecs: 86400,
    halted: false,
  };
  outer.vaultAccount = {
    owner: owner.publicKey,
    withdrawalDestination: new PublicKey(
      'DestPubkey1111111111111111111111111111111111'.slice(0, 44).padEnd(44, '1'),
    ),
    ratePerPeriod: new BN(500000),
    allowance: new BN(0),
    lastCheckpointTs: new BN(100),
    totalInvested: new BN(0),
    chosenMints: [new PublicKey(deployment.stocks[0].mint)],
    paused: false,
    withdrawDelaySecs: 0,
  };
  // Fix destination to a real generated key for ATA derivation.
  const dest = Keypair.generate().publicKey;
  outer.vaultAccount.withdrawalDestination = dest;
  return { client, connection, keeper, oracle, gas, owner, shared, outer, dest };
}

function signerKeys(tx: Transaction): string[] {
  return tx.signatures.map((s) => s.publicKey.toBase58());
}

describe('effectiveMultiplier (scaled-ui display)', () => {
  it('uses newMultiplier only once its effective time has passed', () => {
    const cfg = { multiplier: 1, newMultiplier: 2, newMultiplierEffectiveTimestamp: 1000 };
    expect(effectiveMultiplier(cfg, 999)).toBe(1);
    expect(effectiveMultiplier(cfg, 1000)).toBe(2);
    expect(effectiveMultiplier({ multiplier: 3 }, 5000)).toBe(3);
  });
});

describe('AnchorVaultClient (mocked connection)', () => {
  it('getVault returns null only when the vault account does not exist', async () => {
    const { client, owner, outer } = setup();
    outer.vaultAccount = null; // harness fetch throws 'not found'
    await expect(
      client.getVault(owner.publicKey.toBase58()),
    ).resolves.toBeNull();
  });

  it('getVault throws on an RPC outage instead of looking like no vault', async () => {
    const { client, owner, outer } = setup();
    outer.vaultAccount = new Error('RPC 429 rate limited') as never;
    await expect(
      client.getVault(owner.publicKey.toBase58()),
    ).rejects.toThrow('RPC 429');
  });

  it('recordIntent sends record_intent signed by keeper + gas', async () => {
    const { client, connection, owner, keeper, gas, shared } = setup();
    await client.recordIntent(
      owner.publicKey.toBase58(),
      new Uint8Array(32).fill(7),
      new Uint8Array(16).fill(3),
    );
    const call = shared.calls.find((c) => c.method === 'recordIntent');
    expect(call).toBeDefined();
    expect(call!.args[0]).toHaveLength(32);
    expect(call!.args[1]).toHaveLength(16);
    expect(String(call!.accounts.keeper)).toBe(keeper.publicKey.toBase58());
    expect(signerKeys(connection.simulated[0])).toEqual(
      expect.arrayContaining([
        gas.publicKey.toBase58(),
        keeper.publicKey.toBase58(),
      ]),
    );
    await expect(
      client.recordIntent(owner.publicKey.toBase58(), new Uint8Array(3), new Uint8Array(16)),
    ).rejects.toThrow('32-byte');
  });

  it('getConfig decodes GlobalConfig with bigint money fields', async () => {
    const { client, keeper } = setup();
    const cfg = await client.getConfig();
    expect(cfg.keeper).toBe(keeper.publicKey.toBase58());
    expect(cfg.minTrade).toBe(100_000n);
    expect(cfg.stockMints).toHaveLength(3);
    expect(cfg.periodSeconds).toBe(10);
  });

  it('createVault sends create_vault signed by owner + gas, with delay arg', async () => {
    const { client, connection, owner, gas, shared, dest } = setup();
    await client.createVault({
      owner: owner.publicKey.toBase58(),
      withdrawalDestination: dest.toBase58(),
      ratePerPeriod: 500_000n,
      mints: ['AAPLx'],
      withdrawDelaySecs: 20,
    });
    const call = shared.calls.find((c) => c.method === 'createVault');
    expect(call).toBeDefined();
    const arg = call!.args[0] as { withdrawDelaySecs: number };
    expect(arg.withdrawDelaySecs).toBe(20);
    expect(String(call!.accounts.payer)).toBe(gas.publicKey.toBase58());
    expect(signerKeys(connection.simulated[0])).toEqual(
      expect.arrayContaining([
        gas.publicKey.toBase58(),
        owner.publicKey.toBase58(),
      ]),
    );
  });

  it('buy sends buy signed by keeper + gas and never by the owner', async () => {
    const { client, connection, owner, keeper, gas, shared } = setup();
    await client.buyAsKeeper({
      owner: owner.publicKey.toBase58(),
      mint: 'AAPLx',
      usdcIn: 250_000n,
      minOut: 700n,
    });
    const call = shared.calls.find((c) => c.method === 'buy');
    expect(call).toBeDefined();
    expect(String(call!.accounts.keeper)).toBe(keeper.publicKey.toBase58());
    expect(String(call!.accounts.payer)).toBe(gas.publicKey.toBase58());
    expect(String(call!.accounts.stockMint)).toBe(deployment.stocks[0].mint);
    const keys = signerKeys(connection.simulated[0]);
    expect(keys).toContain(keeper.publicKey.toBase58());
    expect(keys).not.toContain(owner.publicKey.toBase58());
  });

  it('buy refuses min_out = 0 before touching the chain', async () => {
    const { client, owner, shared } = setup();
    await expect(
      client.buyAsKeeper({
        owner: owner.publicKey.toBase58(),
        mint: 'AAPLx',
        usdcIn: 1n,
        minOut: 0n,
      }),
    ).rejects.toBeInstanceOf(VaultProgramError);
    expect(shared.calls.filter((c) => c.method === 'buy')).toHaveLength(0);
  });

  it('withdraw signs as owner + gas, destination from the vault, never keeper', async () => {
    const { client, connection, owner, keeper, gas, shared, dest } = setup();
    await client.withdrawAsOwner({
      owner: owner.publicKey.toBase58(),
      mint: 'USDC',
      amount: 1_000_000n,
    });
    const call = shared.calls.find((c) => c.method === 'withdraw');
    expect(call).toBeDefined();
    expect(String(call!.accounts.withdrawalDestination)).toBe(
      dest.toBase58(),
    );
    const keys = signerKeys(connection.simulated[0]);
    expect(keys).toContain(owner.publicKey.toBase58());
    expect(keys).toContain(gas.publicKey.toBase58());
    expect(keys).not.toContain(keeper.publicKey.toBase58());
  });

  it('withdrawAll packs every leg into one transaction', async () => {
    const { client, connection, owner } = setup();
    await client.withdrawAllAsOwner({
      owner: owner.publicKey.toBase58(),
      legs: [
        { mint: 'USDC', amount: 1n },
        { mint: 'AAPLx', amount: 2n },
      ],
    });
    expect(
      connection.simulated[0].instructions.length,
    ).toBe(2);
    expect(connection.simulated).toHaveLength(1);
  });

  it('updatePrice signs as oracle + gas, mint as account not argument', async () => {
    const { client, connection, oracle, keeper, shared } = setup();
    await client.updatePriceAsOracle('AAPLx', 336_470_000n);
    const call = shared.calls.find((c) => c.method === 'updatePrice');
    expect(call).toBeDefined();
    expect(call!.args).toHaveLength(1);
    const keys = signerKeys(connection.simulated[0]);
    expect(keys).toContain(oracle.publicKey.toBase58());
    expect(keys).not.toContain(keeper.publicKey.toBase58());
  });

  it('maps a simulated program rejection to VaultProgramError by name', async () => {
    const { client, connection, owner } = setup();
    connection.simError = {
      err: { InstructionError: [0, { Custom: 6015 }] },
      logs: ['Program log: AnchorError: Error Code: StalePrice.'],
    };
    await expect(
      client.deposit({ owner: owner.publicKey.toBase58(), amount: 1n }),
    ).rejects.toMatchObject({ errorName: 'StalePrice' });
  });

  it('logs the real message behind an UnknownProgramError', async () => {
    const { client, connection, owner } = setup();
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      connection.simError = {
        err: new Error('weird chain explosion 12345'),
        logs: ['Program log: something odd happened'],
      };
      await expect(
        client.deposit({ owner: owner.publicKey.toBase58(), amount: 1n }),
      ).rejects.toMatchObject({
        errorName: 'UnknownProgramError',
        message: 'weird chain explosion 12345',
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('weird chain explosion 12345'),
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('something odd happened'),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('no keeper path can reach withdraw: the keeper key never signs one', async () => {
    const { client, connection, owner, keeper } = setup();
    await client.buyAsKeeper({
      owner: owner.publicKey.toBase58(),
      mint: 'AAPLx',
      usdcIn: 250_000n,
      minOut: 700n,
    });
    await client.withdrawAllAsOwner({
      owner: owner.publicKey.toBase58(),
      legs: [{ mint: 'USDC', amount: 1n }],
    });
    for (const tx of connection.simulated) {
      const hasWithdraw = tx.instructions.some(
        (ix) => ix.data.toString() === 'withdraw',
      );
      if (hasWithdraw) {
        expect(signerKeys(tx)).not.toContain(keeper.publicKey.toBase58());
      }
    }
    // The class exposes no keeper-withdraw method at all.
    expect(
      Object.getOwnPropertyNames(AnchorVaultClient.prototype).filter((n) =>
        /keeper/i.test(n),
      ),
    ).toEqual(['buyAsKeeper']);
  });

  it('maps a bare {Custom: code} send error (no logs) through the IDL table', async () => {
    const { client, connection, owner } = setup();
    connection.simError = {
      err: { InstructionError: [0, { Custom: 6015 }] },
      logs: [],
    };
    await expect(
      client.deposit({ owner: owner.publicKey.toBase58(), amount: 1n }),
    ).rejects.toMatchObject({ errorName: 'StalePrice' });
  });

  it('listVaultBalances lists only USDC and allowlisted stocks, never a junk token', async () => {
    const { client, connection } = setup();
    const junk = Keypair.generate().publicKey.toBase58();
    const row = (mint: string, amount: string) => ({
      account: { data: { parsed: { info: { mint, tokenAmount: { amount } } } } },
    });
    connection.parsedByOwner = [
      row(deployment.usdc.mint, '5000000'),
      row(deployment.stocks[0].mint, '123'),
      row(junk, '999'),
    ];
    const balances = await client.listVaultBalances(
      Keypair.generate().publicKey.toBase58(),
    );
    expect(balances.map((b) => b.mint)).not.toContain(junk);
    expect(balances).toContainEqual({ mint: 'USDC', amount: 5_000_000n });
    expect(balances).toContainEqual({ mint: 'AAPLx', amount: 123n });
    // The program refuses a non-allowlisted mint, so the junk must never be a withdraw leg.
    expect(balances.every((b) => !b.mint.includes(junk))).toBe(true);
  });

  it('faucet refuses off devnet', async () => {
    const { owner } = setup();
    const mainnet = new AnchorVaultClient({
      connection: new MockConnection() as never,
      keeper: Keypair.generate(),
      oracle: Keypair.generate(),
      gas: Keypair.generate(),
      ownerKeypair: () => null,
      deployment: { ...deployment, cluster: 'mainnet-beta' },
      cluster: 'mainnet-beta',
      programFactory: () => new FakeProgram(Keypair.generate(), {
        calls: [],
        outer: null as never,
      }),
    });
    await expect(
      mainnet.faucet(owner.publicKey.toBase58(), 1n),
    ).rejects.toThrow(/devnet/);
  });
});
