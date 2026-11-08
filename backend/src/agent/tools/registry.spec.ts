import { Keypair } from '@solana/web3.js';
import { TOOLS, executeTool, toolByName, type ToolContext } from './index';
import { FakeVaultClient } from '../../solana/fake-vault-client';
import { VaultsService } from '../../vaults/vaults.service';
import { WalletsService } from '../../wallets/wallets.service';
import { ConfirmationService } from '../../bot/confirmation.service';
import { HistoryService } from '../../history/history.service';

const USER = '424242';
const DEST = Keypair.generate().publicKey.toBase58();

async function makeCtx() {
  const client = new FakeVaultClient();
  const vaults = new VaultsService(client);
  const wallets = new WalletsService('ab'.repeat(32));
  const confirmations = new ConfirmationService();
  const owner = (await wallets.createWallet(USER)).ownerPublicKey;
  await wallets.setWithdrawalAddress(USER, DEST).catch(() => undefined);
  const c: ToolContext = {
    userId: USER,
    owner,
    step: { awaiting: null, hasVault: false },
    wallets,
    vaults,
    history: new HistoryService(),
    confirmations,
    source: () => 'parser',
  };
  return { client, vaults, wallets, confirmations, ctx: c, owner };
}

describe('tool registry shape', () => {
  it('has exactly the briefed tools, in order', () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      'get_status',
      'compare_history',
      'answer_faq',
      'show_options',
      'refuse_prediction',
      'greet',
      'clarify',
      'propose_plan',
      'propose_pause',
      'propose_resume',
      'propose_withdraw_all',
    ]);
  });

  it('no tool schema contains an address, key or send-amount parameter', () => {
    const propNames = (v: unknown, out: string[] = []): string[] => {
      if (!v || typeof v !== 'object') return out;
      const rec = v as Record<string, unknown>;
      if (rec.properties && typeof rec.properties === 'object') {
        out.push(...Object.keys(rec.properties as object));
      }
      for (const x of Object.values(rec)) {
        if (x && typeof x === 'object') propNames(x, out);
      }
      return out;
    };
    for (const t of TOOLS) {
      for (const name of propNames(t.inputSchema)) {
        expect(name.toLowerCase()).not.toMatch(
          /address|destination|private|secret|key|send|recipient|wallet/,
        );
      }
    }
  });

  it('marks read-only tools readOnlyHint and proposals not', () => {
    for (const name of [
      'get_status',
      'compare_history',
      'answer_faq',
      'show_options',
      'refuse_prediction',
      'greet',
      'clarify',
    ]) {
      expect(toolByName(name)?.annotations.readOnlyHint).toBe(true);
      expect(toolByName(name)?.annotations.destructiveHint).toBe(false);
    }
    for (const name of [
      'propose_plan',
      'propose_pause',
      'propose_resume',
      'propose_withdraw_all',
    ]) {
      expect(toolByName(name)?.annotations.readOnlyHint).toBe(false);
    }
  });

  it('rejects bad arguments with zod (foreign asset, negative amount)', async () => {
    const { ctx } = await makeCtx();
    await expect(
      executeTool('propose_plan', { dailyNgn: 500, assets: ['TSLAx'] }, ctx),
    ).rejects.toThrow();
    await expect(
      executeTool('propose_plan', { dailyNgn: -5, assets: ['SPYx'] }, ctx),
    ).rejects.toThrow();
    await expect(executeTool('nope_tool', {}, ctx)).rejects.toThrow();
  });
});

describe('answer_faq tool (mocked tool call path)', () => {
  it.each([
    ['wallet_address', 'no separate devnet or mainnet address'],
    ['network', 'test money'],
    ['change_address', 'fixed once you confirm it'],
    ['fees', 'never need SOL'],
    ['safety', "agent can't withdraw"],
    ['how_it_works', 'You send USDC once'],
    ['withdraw_how', 'stock tokens'],
    ['live_price', "can't give live prices"],
  ])('topic %s answers with its template', async (topic, phrase) => {
    const { ctx } = await makeCtx();
    const r = await executeTool('answer_faq', { topic }, ctx);
    expect(r.reply.text).toContain(phrase);
    expect(r.modelResult).toBe('done');
  });
});

describe('answer_faq deposit_address (merged with the deposit-address work)', () => {
  it("shows the user's own deposit address and says it is not the withdrawal address", async () => {
    const { ctx, owner } = await makeCtx();
    const r = await executeTool(
      'answer_faq',
      { topic: 'deposit_address' },
      ctx,
    );
    expect(r.reply.text).toContain(owner);
    expect(r.reply.text).toContain('This is not your withdrawal address');
    expect(r.modelResult).toBe('done');
  });

  it('adds the address-step reminder while the withdrawal address is pending', async () => {
    const { ctx } = await makeCtx();
    const pending = {
      ...ctx,
      step: { awaiting: 'withdrawal_address' as const, hasVault: false },
    };
    const r = await executeTool('answer_faq', { topic: 'fees' }, pending);
    expect(r.reply.text).toContain('paste your Solana wallet address');
  });
});

describe('proposal tools only propose', () => {
  it('propose_plan leaves the vault untouched until the Confirm tap', async () => {
    const { client, ctx, confirmations, owner } = await makeCtx();
    const r = await executeTool(
      'propose_plan',
      { dailyNgn: 300, assets: ['AAPLx'] },
      ctx,
    );
    expect(r.reply.cardId).toBeDefined();
    expect(r.modelResult).not.toContain(DEST);
    expect(await client.getVault(owner)).toBeNull();
    await confirmations.confirm(USER, r.reply.cardId!);
    expect(await client.getVault(owner)).not.toBeNull();
  });

  it('propose_withdraw_all leaves balances untouched until confirm', async () => {
    const { client, ctx, vaults, owner } = await makeCtx();
    await vaults.applyPlan(owner, {
      dailyNgn: 300,
      ngnPerUsd: 1000,
      assets: ['AAPLx'],
      withdrawalDestination: DEST,
    });
    client.creditVault(owner, 'USDC', 2_000_000n);
    const r = await executeTool('propose_withdraw_all', {}, ctx);
    expect(r.reply.cardId).toBeDefined();
    expect(await client.getVaultBalance(owner, 'USDC')).toBe(2_000_000n);
  });

  it('the withdraw card says stocks arrive as tokens, only when the vault holds stocks', async () => {
    const { client, ctx, vaults, owner } = await makeCtx();
    await vaults.applyPlan(owner, {
      dailyNgn: 300,
      ngnPerUsd: 1000,
      assets: ['AAPLx'],
      withdrawalDestination: DEST,
    });
    client.creditVault(owner, 'USDC', 2_000_000n);
    const usdcOnly = await executeTool('propose_withdraw_all', {}, ctx);
    expect(usdcOnly.reply.text).not.toContain('stock tokens');

    client.setMintMeta('AAPLx', { decimals: 8, multiplier: 1 });
    client.creditVault(owner, 'AAPLx', 100_000_000n);
    const withStocks = await executeTool('propose_withdraw_all', {}, ctx);
    expect(withStocks.reply.text).toContain(
      'Your stocks arrive as stock tokens, not cash',
    );
    expect(withStocks.reply.text).toContain('Swap screen');
  });
});

describe('compare_history shows every option side by side', () => {
  it('lists naira, USDC and all three stocks, each stock with its worst drop', async () => {
    const { ctx } = await makeCtx();
    const r = await executeTool('compare_history', {}, ctx);
    const t = r.reply.text;
    // the real figures from data/history (the same ones the Mini App shows)
    for (const s of [
      '₦20,000',
      '₦49,027',
      '22.4%',
      '₦86,256',
      '19.8%',
      '₦115,639',
      '26.3%',
      '₦394,140',
      '51.2%',
    ]) {
      expect(t).toContain(s);
    }
    for (const label of [
      'Kept in naira',
      'Kept in USDC',
      'In the S&P 500',
      'In Apple',
      'In Nvidia',
    ]) {
      expect(t).toContain(label);
    }
    // every stock row carries its drop: no gain without its risk
    expect(t.match(/but at its worst point it was [\d.]+% down/g)).toHaveLength(
      4,
    );
    expect(t).toContain('Past performance. Not a prediction or a promise.');
    expect(t).not.toContain('You asked about');
  });

  it('a question about one stock still shows every option, with a lead-in', async () => {
    const { ctx } = await makeCtx();
    const r = await executeTool('compare_history', { focus: 'AAPLx' }, ctx);
    expect(r.reply.text).toContain(
      'You asked about Apple. Here it is next to the other options',
    );
    expect(r.reply.text).toContain('In Nvidia');
    expect(r.reply.text).toContain('In the S&P 500');
  });

  it('never says which stock is best', async () => {
    const { ctx } = await makeCtx();
    for (const focus of ['SPYx', 'AAPLx', 'NVDAx'] as const) {
      const t = (await executeTool('compare_history', { focus }, ctx)).reply
        .text;
      expect(t).not.toMatch(
        /\b(best|better|winner|should (buy|pick)|recommend)/i,
      );
    }
  });

  it('rejects an unknown focus before anything runs', async () => {
    const { ctx } = await makeCtx();
    await expect(
      executeTool('compare_history', { focus: 'TSLAx' }, ctx),
    ).rejects.toThrow();
  });
});
