import { Keypair } from '@solana/web3.js';
import { BotService, slashCommand } from './bot.service';
import { ConfirmationService } from './confirmation.service';
import { AgentService } from '../agent/agent.service';
import { WalletsService } from '../wallets/wallets.service';
import { VaultsService } from '../vaults/vaults.service';
import { FakeVaultClient } from '../solana/fake-vault-client';
import { HistoryService } from '../history/history.service';

const USER = '424242';
const DEST = Keypair.generate().publicKey.toBase58();

function setup() {
  const client = new FakeVaultClient();
  const vaults = new VaultsService(client);
  const wallets = new WalletsService('ab'.repeat(32));
  const confirmations = new ConfirmationService();
  const realHistory = new HistoryService();
  const bot = new BotService(
    new AgentService(),
    confirmations,
    wallets,
    vaults,
    {
      latestNgnPerUsd: () => 1000,
      compareLumpSum: (a: { amountNgn: number }) =>
        realHistory.compareLumpSum(a),
    } as never,
  );
  return { client, vaults, wallets, confirmations, bot };
}

async function onboard(bot: BotService) {
  const reply = await bot.handleText(USER, DEST);
  expect(reply.text).toContain('withdrawal wallet');
  expect(reply.cardId).toBeDefined();
  const confirmations = (bot as never as { confirmations: ConfirmationService })
    .confirmations;
  await confirmations.confirm(USER, reply.cardId!);
  return botOwner(bot);
}

async function botOwner(bot: BotService): Promise<string> {
  // The owner key is created on first plan/address message.
  return (
    await (bot as never as { wallets: WalletsService }).wallets.createWallet(
      USER,
    )
  ).ownerPublicKey;
}

describe('BotService real vault wiring', () => {
  it('asks for a withdrawal address before proposing a plan', async () => {
    const { bot } = setup();
    const reply = await bot.handleText(
      USER,
      'Put ₦300 a day into Apple and the S&P',
    );
    expect(reply.cardId).toBeUndefined();
    expect(reply.text).toContain('personal Solana wallet');
  });

  it('creates the vault only on Confirm, with converted rate and chosen mints', async () => {
    const { client, confirmations, bot } = setup();
    const owner = await onboard(bot);
    const reply = await bot.handleText(
      USER,
      'Put ₦300 a day into Apple and the S&P',
    );
    expect(reply.cardId).toBeDefined();
    expect(await client.getVault(owner)).toBeNull();

    const sig = await confirmations.confirm(USER, reply.cardId!);
    expect(sig).toBe('fake-create-sig');
    const vault = await client.getVault(owner);
    expect(vault?.ratePerPeriod).toBe(300_000n);
    expect(vault?.chosenMints).toEqual(['AAPLx', 'SPYx']);
    expect(vault?.withdrawalDestination).toBe(DEST);
  });

  it('updates rules instead of recreating on a second confirmed plan', async () => {
    const { client, confirmations, bot } = setup();
    const owner = await onboard(bot);
    const first = await bot.handleText(USER, 'Put ₦300 a day into Apple');
    await confirmations.confirm(USER, first.cardId!);
    const second = await bot.handleText(USER, 'Put ₦500 a day into Nvidia');
    const sig = await confirmations.confirm(USER, second.cardId!);
    expect(sig).toBe('fake-set-rules-sig');
    const vault = await client.getVault(owner);
    expect(vault?.ratePerPeriod).toBe(500_000n);
    expect(vault?.chosenMints).toEqual(['NVDAx']);
  });

  it('pauses and resumes through confirmed set_rules calls', async () => {
    const { client, confirmations, bot } = setup();
    const owner = await onboard(bot);
    const plan = await bot.handleText(USER, 'Put ₦300 a day into Apple');
    await confirmations.confirm(USER, plan.cardId!);

    const pause = await bot.handleText(USER, 'Pause');
    expect(await client.getVault(owner)).toMatchObject({ paused: false });
    await confirmations.confirm(USER, pause.cardId!);
    expect(await client.getVault(owner)).toMatchObject({ paused: true });

    const resume = await bot.handleText(USER, 'resume');
    await confirmations.confirm(USER, resume.cardId!);
    expect(await client.getVault(owner)).toMatchObject({ paused: false });
  });

  it('withdraw-everything executes owner withdraws to the fixed destination', async () => {
    const { client, confirmations, bot } = setup();
    const owner = await onboard(bot);
    const plan = await bot.handleText(USER, 'Put ₦300 a day into Apple');
    await confirmations.confirm(USER, plan.cardId!);
    client.creditVault(owner, 'USDC', 2_000_000n);
    client.creditVault(owner, 'AAPLx', 50_000n);

    const reply = await bot.handleText(USER, 'Withdraw everything');
    expect(client.withdrawals).toHaveLength(0);
    await confirmations.confirm(USER, reply.cardId!);
    expect(client.withdrawals.map((w) => w.mint).sort()).toEqual([
      'AAPLx',
      'USDC',
    ]);
    expect(client.withdrawals.every((w) => w.destination === DEST)).toBe(true);
    expect(await client.getVaultBalance(owner, 'USDC')).toBe(0n);
  });

  it('status reports real holdings from the vault', async () => {
    const { client, confirmations, bot } = setup();
    const owner = await onboard(bot);
    const plan = await bot.handleText(USER, 'Put ₦300 a day into Apple');
    await confirmations.confirm(USER, plan.cardId!);
    client.creditVault(owner, 'USDC', 1_500_000n);
    const reply = await bot.handleText(USER, 'How am I doing?');
    expect(reply.text).toContain('USDC');
    expect(reply.text).toContain('1.5');
  });

  it('asks to confirm the withdrawal address, then never lets it change', async () => {
    const { bot, wallets } = setup();
    const first = await bot.handleText(USER, DEST);
    expect(wallets.getWithdrawalAddress(USER)).toBeUndefined();
    expect(await bot.confirmReply(USER, first.cardId!)).toContain('How much');
    const other = Keypair.generate().publicKey.toBase58();
    const second = await bot.handleText(USER, other);
    expect(second.cardId).toBeUndefined();
    expect(second.text).toContain('can never be changed');
    expect(wallets.getWithdrawalAddress(USER)).toBe(DEST);
  });

  it('reports a failed confirmed action instead of hiding it', async () => {
    const { client, confirmations, bot } = setup();
    const owner = await onboard(bot);
    const plan = await bot.handleText(USER, 'Put ₦300 a day into Apple');
    await confirmations.confirm(USER, plan.cardId!);
    client.creditVault(owner, 'USDC', 1_000_000n);
    const reply = await bot.handleText(USER, 'Withdraw everything');
    client.withdrawAllAsOwner = async () => {
      throw new Error('SlippageTooHigh');
    };
    expect(await bot.confirmReply(USER, reply.cardId!)).toContain(
      "didn't go through",
    );
  });

  it('says so when there is nothing to withdraw', async () => {
    const { confirmations, bot } = setup();
    await onboard(bot);
    const plan = await bot.handleText(USER, 'Put ₦300 a day into Apple');
    await confirmations.confirm(USER, plan.cardId!);
    const reply = await bot.handleText(USER, 'Withdraw everything');
    expect(await bot.confirmReply(USER, reply.cardId!)).toContain(
      'nothing to withdraw',
    );
  });
});

describe('BotService /faucet (devnet only)', () => {
  function faucetSetup(cluster: string) {
    const base = setup();
    const bot = new BotService(
      new AgentService(),
      base.confirmations,
      base.wallets,
      base.vaults,
      { latestNgnPerUsd: () => 1000 } as never,
      undefined,
      undefined,
      { cluster } as never,
    );
    return { ...base, bot };
  }

  it('mints USDC-dev to the deposit wallet, swept into the vault on the next sweep', async () => {
    const { client, vaults, bot } = faucetSetup('devnet');
    const reply = await bot.handleText(USER, '/faucet');
    expect(reply.text).toContain("isn't real money");
    const owner = await botOwner(bot);
    expect(await client.getDepositWalletBalance(owner)).toBe(10_000_000n);
    await vaults.sweepDeposits(owner);
    expect(await client.getVaultBalance(owner, 'USDC')).toBe(10_000_000n);
  });

  it('limits faucet to one use per user per 10 minutes', async () => {
    const { client, bot } = faucetSetup('devnet');
    await bot.handleText(USER, '/faucet');
    const owner = await botOwner(bot);
    const second = await bot.handleText(USER, '/faucet');
    expect(second.text).toContain('wait');
    expect(await client.getDepositWalletBalance(owner)).toBe(10_000_000n);
    (bot as never as { faucetNow: () => number }).faucetNow = () =>
      Date.now() + 11 * 60 * 1000;
    await bot.handleText(USER, '/faucet');
    expect(await client.getDepositWalletBalance(owner)).toBe(20_000_000n);
  });

  it('refuses on non-devnet clusters', async () => {
    const { client, bot } = faucetSetup('mainnet-beta');
    const reply = await bot.handleText(USER, '/faucet');
    expect(reply.text).toContain('devnet');
    const owner = await botOwner(bot);
    expect(await client.getDepositWalletBalance(owner)).toBe(0n);
  });
});

describe('BotService conversation completion (task 3)', () => {
  it('onboarding asks the currency question and saves the answer', async () => {
    const { wallets, bot } = setup();
    const start = await bot.handleStart(USER);
    expect(start.text).toContain('what currency');
    const reply = await bot.handleText(USER, 'Naira');
    expect(wallets.getSettings(USER).displayCurrency).toBe('NGN');
    expect(reply.text).toContain('personal Solana wallet');
  });

  it('offers Naira/Dollars buttons on the currency step and saves a tap', async () => {
    const { wallets, bot } = setup();
    const start = await bot.handleStart(USER);
    expect(start.currencyKeyboard).toBe(true);
    const reply = await bot.handleCurrencyChoice(USER, 'USD');
    expect(wallets.getSettings(USER).displayCurrency).toBe('USD');
    expect(reply.text).toContain('US dollars');
    expect(reply.text).toContain('personal Solana wallet');
    // the step is closed: a later typed amount is no longer a currency answer
    const start2 = await bot.handleStart(USER);
    expect(start2.currencyKeyboard).toBe(true);
    const tapped = await bot.handleCurrencyChoice(USER, 'NGN');
    expect(wallets.getSettings(USER).displayCurrency).toBe('NGN');
    expect(tapped.currencyKeyboard).toBeUndefined();
  });

  it('keeps the buttons when a currency answer is not understood', async () => {
    const { bot } = setup();
    await bot.handleStart(USER);
    const reply = await bot.handleText(USER, 'YEN');
    expect(reply.currencyKeyboard).toBe(true);
  });

  it('saves USD when the user picks dollars', async () => {
    const { wallets, bot } = setup();
    await bot.handleStart(USER);
    await bot.handleText(USER, 'Dollars please');
    expect(wallets.getSettings(USER).displayCurrency).toBe('USD');
  });

  it('says plainly when the currency is not supported, and keeps the question open', async () => {
    const { wallets, bot } = setup();
    await bot.handleStart(USER);
    for (const [text, name] of [
      ['YEN', 'Japanese yen'],
      ['ZAR', 'South African rand'],
      ['CAD', 'Canadian dollar'],
    ]) {
      const reply = await bot.handleText(USER, text);
      expect(reply.text).toContain(`can't show amounts in ${name}`);
      expect(reply.text).toContain('naira or US dollars');
      expect(reply.text).not.toContain('First: what currency');
    }
    // nothing was saved, and the step is still waiting
    expect(wallets.getSettings(USER).displayCurrency).toBe('NGN');
    const ok = await bot.handleText(USER, 'US dollars');
    expect(wallets.getSettings(USER).displayCurrency).toBe('USD');
    expect(ok.text).toContain('personal Solana wallet');
  });

  it('never saves a qualified dollar as US dollars', async () => {
    const { wallets, bot } = setup();
    await bot.handleStart(USER);
    await bot.handleText(USER, 'Canadian dollars');
    // still on the question: the default is untouched and the step not finished
    const next = await bot.handleText(USER, 'dollars');
    expect(wallets.getSettings(USER).displayCurrency).toBe('USD');
    expect(next.text).toContain('personal Solana wallet');
  });

  it('asks again with the real options when the answer is unclear', async () => {
    const { bot } = setup();
    await bot.handleStart(USER);
    const reply = await bot.handleText(USER, 'hmm not sure');
    expect(reply.text).toContain("didn't catch that");
    expect(reply.text).toContain('naira or US dollars');
  });

  it('a live-price question gets an honest answer, never a plan card', async () => {
    // Live bug: this exact message produced a "Please confirm your plan"
    // card for ₦500 a day (the 500 in "S&P 500").
    const { bot } = setup();
    await onboard(bot);
    const reply = await bot.handleText(
      USER,
      'What is the current dollar value of the S&P 500?',
    );
    expect(reply.cardId).toBeUndefined();
    expect(reply.text).not.toContain('confirm your plan');
    expect(reply.text).toContain("can't give live prices");
  });

  it('"how did Apple perform over the past 5 years" is a history answer, not a plan', async () => {
    const { bot } = setup();
    await onboard(bot);
    const reply = await bot.handleText(
      USER,
      'How did Apple perform over the past 5 years',
    );
    expect(reply.cardId).toBeUndefined();
    expect(reply.text).toContain('You asked about Apple');
    expect(reply.text).toContain('In Apple');
    expect(reply.text).toContain('In Nvidia');
    expect(reply.text).not.toContain('confirm your plan');
  });

  it('shows the pace note before the first plan card only', async () => {
    const { confirmations, bot } = setup();
    await onboard(bot);
    const first = await bot.handleText(USER, 'Put ₦300 a day into Apple');
    expect(first.text).toContain('buys once about $1 has unlocked');
    expect(first.text).toContain('about every 4 days');
    await confirmations.confirm(USER, first.cardId!);
    const second = await bot.handleText(USER, 'Put ₦400 a day into Apple');
    expect(second.text).not.toContain('buys once about');
  });

  it('status shows value, put-in and waiting USDC in the display currency', async () => {
    const { client, confirmations, bot } = setup();
    const owner = await onboard(bot);
    const plan = await bot.handleText(USER, 'Put ₦300 a day into Apple');
    await confirmations.confirm(USER, plan.cardId!);
    client.creditVault(owner, 'USDC', 1_500_000n);
    (await client.getVault(owner))!.totalInvested = 5_000_000n;
    const reply = await bot.handleText(USER, 'How am I doing?');
    expect(reply.text).toContain('Value now');
    expect(reply.text).toContain('Put in so far');
    expect(reply.text).toContain('Waiting to be invested');
  });

  it("replays Dean's conversation: plan, address ask, then the devnet question", async () => {
    const { bot } = setup();
    const plan = await bot.handleText(USER, '#500 a day into Apple');
    expect(plan.cardId).toBeUndefined();
    expect(plan.text).toContain('personal Solana wallet');
    const answer = await bot.handleText(
      USER,
      'My mainnet solana wallet or devnet?',
    );
    expect(answer.text).toContain('One address works on every Solana network');
    expect(answer.text).toContain('paste your Solana wallet address');
    expect(answer.text).not.toContain("didn't get that");
  });

  it('answers an unrecognised message at the address step with step help', async () => {
    const { bot } = setup();
    await bot.handleText(USER, '#500 a day into Apple');
    const reply = await bot.handleText(USER, 'blah blah nonsense');
    expect(reply.text).toContain('32 to 44');
    expect(reply.text).toContain('You can ask me about it');
  });

  it('greets a new user and reminds them of the pending step', async () => {
    const { bot } = setup();
    await bot.handleStart(USER);
    const reply = await bot.handleText(USER, 'hello');
    expect(reply.text).toContain("I'm Pacer");
    expect(reply.text).toContain('naira or US dollars');
  });

  it.each([
    ['which address do I give?', 'wallet you control'],
    ['is this real money?', 'test money'],
    ['can I change my address later?', 'fixed once you confirm it'],
    ['do I need SOL?', 'never need SOL'],
    ['is it safe?', "agent can't withdraw"],
    ['how does Pacer work?', 'You send USDC once'],
  ])('answers FAQ %s', async (text, phrase) => {
    const { bot } = setup();
    const reply = await bot.handleText(USER, text);
    expect(reply.text).toContain(phrase);
  });

  it('history shows real numbers with both worst drops', async () => {
    const { bot } = setup();
    const reply = await bot.handleText(USER, 'Is investing worth it for me?');
    expect(reply.text).toContain('49,027');
    expect(reply.text).toContain('86,256');
    expect(reply.text).toContain('22.4%');
    expect(reply.text).toContain('19.8%');
    expect(reply.text).toContain(
      'Past performance. Not a prediction or a promise.',
    );
  });

  it('history reply carries the comparison button only when MINIAPP_URL is set', async () => {
    const { bot } = setup();
    const saved = process.env.MINIAPP_URL;
    try {
      delete process.env.MINIAPP_URL;
      const noButton = await bot.handleText(
        USER,
        'Is investing worth it for me?',
      );
      expect(noButton.webApp).toBeUndefined();
      process.env.MINIAPP_URL = 'https://mini.example';
      const withButton = await bot.handleText(
        USER,
        'Is investing worth it for me?',
      );
      expect(withButton.webApp).toEqual({
        url: 'https://mini.example',
        label: 'Open the comparison',
      });
    } finally {
      if (saved === undefined) delete process.env.MINIAPP_URL;
      else process.env.MINIAPP_URL = saved;
    }
  });

  it('buy alerts on/off saves the setting', async () => {
    const { wallets, bot } = setup();
    const on = await bot.handleText(USER, 'buy alerts on');
    expect(on.text).toContain('on');
    expect(wallets.getSettings(USER).notifyBuys).toBe(true);
    await bot.handleText(USER, 'buy alerts off');
    expect(wallets.getSettings(USER).notifyBuys).toBe(false);
  });
});

describe('BotService /faucet fail-closed store', () => {
  it('refuses to mint when the rate-limit store cannot be read', async () => {
    const base = setup();
    const bot = new BotService(
      new AgentService(),
      base.confirmations,
      base.wallets,
      base.vaults,
      { latestNgnPerUsd: () => 1000 } as never,
      undefined,
      undefined,
      { cluster: 'devnet' } as never,
      {
        enabled: true,
        nudgeLog: {
          findFirst: async () => {
            throw new Error('db down');
          },
          create: async () => ({}),
        },
      } as never,
    );
    const reply = await bot.handleText(USER, '/faucet');
    expect(reply.text).toContain("won't send test money");
    const owner = await botOwner(bot);
    expect(await base.client.getDepositWalletBalance(owner)).toBe(0n);
  });
});

describe('BotService setup questions (the first live test)', () => {
  it('answers "mainnet or devnet?" at the address step and keeps the step in view', async () => {
    const { bot } = setup();
    const first = await bot.handleText(USER, '#500 a day into Apple');
    expect(first.text).toContain('Paste your Solana address');
    const reply = await bot.handleText(
      USER,
      'My mainnet solana wallet or devnet?',
    );
    expect(reply.text).toContain('One address works on every Solana network');
    expect(reply.text).toContain('paste your Solana wallet address');
    expect(reply.text).not.toContain("Sorry, I didn't get that");
  });

  it('greets, with the address reminder for a new user', async () => {
    const { bot } = setup();
    const reply = await bot.handleText(USER, 'hello');
    expect(reply.text).toContain("I'm Pacer");
    expect(reply.text).toContain('paste your Solana wallet address');
  });

  it('says what the address step needs when the message is not understood', async () => {
    const { bot } = setup();
    const reply = await bot.handleText(USER, 'blah blah blah');
    expect(reply.text).toContain(
      "I'm still waiting for your Solana wallet address",
    );
  });

  it('drops the reminder, and the stuck reply, once the address is confirmed', async () => {
    const { bot } = setup();
    await onboard(bot);
    const faq = await bot.handleText(USER, 'do I need SOL?');
    expect(faq.text).toContain('You never need SOL');
    expect(faq.text).not.toContain('paste your Solana wallet address');
    const unknown = await bot.handleText(USER, 'blah blah blah');
    expect(unknown.text).toContain("Sorry, I didn't get that");
  });

  it('changing the address is answered with a firm no', async () => {
    const { bot } = setup();
    await onboard(bot);
    const reply = await bot.handleText(USER, 'can I change my address later?');
    expect(reply.text).toContain('fixed once you confirm it');
  });
});

describe('BotService deposit address', () => {
  it("/deposit shows the user's own address and says it is not the withdrawal address", async () => {
    const { bot } = setup();
    const owner = await botOwner(bot);
    const reply = await bot.handleText(USER, '/deposit');
    expect(reply.text).toContain(owner);
    expect(reply.text).toContain('where money comes in');
    expect(reply.text).toContain('This is not your withdrawal address');
  });

  it('answers "what is my deposit address" with the same text, plus the address-step reminder for a new user', async () => {
    const { bot } = setup();
    const owner = await botOwner(bot);
    const reply = await bot.handleText(USER, "what's my deposit address");
    expect(reply.text).toContain(owner);
    expect(reply.text).toContain('paste your Solana wallet address');
  });

  it('the withdrawal prompt says it differs from the deposit address', async () => {
    const { bot } = setup();
    const reply = await bot.handleText(USER, '#500 a day into Apple');
    expect(reply.text).toContain('different from your deposit address');
  });

  it('an empty vault points to /deposit', async () => {
    const { bot } = setup();
    await onboard(bot);
    const reply = await bot.handleText(USER, 'how am I doing');
    expect(reply.text).toContain('/deposit');
  });

  it('the deposit address never equals the withdrawal address', async () => {
    const { bot } = setup();
    const owner = await onboard(bot);
    const reply = await bot.handleText(USER, '/deposit');
    expect(reply.text).toContain(owner);
    expect(owner).not.toBe(DEST);
    expect(reply.text).not.toContain(DEST);
  });
});

describe('BotService status change and /balance', () => {
  async function fundedVault() {
    const ctx = setup();
    const owner = await onboard(ctx.bot);
    const plan = await ctx.bot.handleText(USER, 'Put ₦300 a day into Apple');
    await ctx.confirmations.confirm(USER, plan.cardId!);
    const mint = 'AAPLx';
    ctx.client.setMintMeta(mint, { decimals: 8, multiplier: 1 });
    ctx.client.setPriceAt(mint, 120_000_000n, Math.floor(Date.now() / 1000));
    // $10 deposited, $1 bought (worth $1.20 now): idle cash must not count as profit.
    ctx.client.creditVault(owner, 'USDC', 10_000_000n);
    ctx.client.creditVault(owner, mint, 1_000_000n); // 0.01 token x $120 = $1.20
    (await ctx.client.getVault(owner))!.totalInvested = 1_000_000n;
    return { ...ctx, owner };
  }

  it('change since the start ignores USDC still waiting to be invested', async () => {
    const { bot } = await fundedVault();
    const reply = await bot.handleText(USER, 'How am I doing?');
    // Stocks $1.20 against $1.00 put in is +20%, not +1,000% from idle cash.
    expect(reply.text).toContain('(+20.0%)');
    expect(reply.text).not.toContain('+1');
  });

  it('/balance shows the deposit wallet and the vault separately, with explorer links', async () => {
    const { client, bot, owner } = await fundedVault();
    client.creditDepositWallet(owner, 3_000_000n);
    const reply = await bot.handleText(USER, '/balance');
    expect(reply.text).toContain('Deposit wallet (money on its way in)');
    expect(reply.text).toContain('3 USDC');
    expect(reply.text).toContain('This moves into your vault');
    expect(reply.text).toContain('USDC waiting to be invested: 10');
    expect(reply.text).toContain('AAPLx');
    expect(reply.text).toContain(`explorer.solana.com/address/${owner}`);
    expect(reply.text).toContain(
      `explorer.solana.com/address/fake-vault-${owner}`,
    );
  });

  it('/balance for an empty new user is calm', async () => {
    const { bot } = setup();
    const reply = await bot.handleText(USER, '/balance');
    expect(reply.text).toContain('Nothing in the vault yet');
    expect(reply.text).toContain('0 USDC');
  });
});

describe('BotService slash commands', () => {
  async function withPlan() {
    const ctx = setup();
    const owner = await onboard(ctx.bot);
    const plan = await ctx.bot.handleText(USER, 'Put ₦300 a day into Apple');
    await ctx.confirmations.confirm(USER, plan.cardId!);
    return { ...ctx, owner };
  }

  it('parses the command word, with or without @botname', () => {
    expect(slashCommand('/pause')).toBe('pause');
    expect(slashCommand('/Pause@PacerFinanceBot now')).toBe('pause');
    expect(slashCommand('pause')).toBeNull();
    expect(slashCommand('/')).toBeNull();
  });

  it('/pause and /resume propose the same Confirm cards as the plain words', async () => {
    const { client, confirmations, bot, owner } = await withPlan();
    const pause = await bot.handleText(USER, '/pause');
    expect(pause.cardId).toBeDefined();
    expect(await client.getVault(owner)).toMatchObject({ paused: false });
    await confirmations.confirm(USER, pause.cardId!);
    expect(await client.getVault(owner)).toMatchObject({ paused: true });
    const resume = await bot.handleText(USER, '/resume');
    expect(resume.cardId).toBeDefined();
    await confirmations.confirm(USER, resume.cardId!);
    expect(await client.getVault(owner)).toMatchObject({ paused: false });
  });

  it('/withdraw proposes withdraw-everything and moves nothing until Confirm', async () => {
    const { client, confirmations, bot, owner } = await withPlan();
    client.creditVault(owner, 'USDC', 2_000_000n);
    const reply = await bot.handleText(USER, '/withdraw');
    expect(reply.cardId).toBeDefined();
    expect(client.withdrawals).toHaveLength(0);
    await confirmations.confirm(USER, reply.cardId!);
    expect(client.withdrawals.every((w) => w.destination === DEST)).toBe(true);
  });

  it('/status shows the vault report', async () => {
    const { client, bot, owner } = await withPlan();
    client.creditVault(owner, 'USDC', 1_500_000n);
    const reply = await bot.handleText(USER, '/status');
    expect(reply.text).toContain('Value now');
  });

  it('works with @botname and does not call the language model', async () => {
    const { bot } = await withPlan();
    const parse = jest.fn();
    (bot as never as { agent: { parseIntent: unknown } }).agent.parseIntent =
      parse;
    const reply = await bot.handleText(USER, '/pause@PacerFinanceBot');
    expect(reply.cardId).toBeDefined();
    expect(parse).not.toHaveBeenCalled();
  });

  it('/help lists every command and /about has the small print', async () => {
    const { bot } = setup();
    const help = await bot.handleText(USER, '/help');
    for (const c of [
      '/deposit',
      '/balance',
      '/status',
      '/pause',
      '/resume',
      '/withdraw',
      '/faucet',
      '/about',
    ])
      expect(help.text).toContain(c);
    const about = await bot.handleText(USER, '/about');
    expect(about.text).toContain('not a financial adviser');
    expect(about.text).toContain('Backed Finance');
    expect(about.text).toContain('devnet');
  });

  it('commands still work in the middle of the currency question', async () => {
    const { bot } = setup();
    await bot.handleStart(USER);
    const help = await bot.handleText(USER, '/help');
    expect(help.text).toContain("Here's what I can do");
    const status = await bot.handleText(USER, '/status');
    expect(status.text).not.toBe(help.text);
    expect(status.text).toContain('empty');
  });

  it('the generic reply points to /help', async () => {
    const { bot } = setup();
    await onboard(bot);
    const reply = await bot.handleText(USER, 'blah blah blah');
    expect(reply.text).toContain('Type /help');
  });

  it('the command menu lists exactly the commands the bot handles', () => {
    const { BOT_COMMANDS } =
      require('./messages') as typeof import('./messages');
    expect(BOT_COMMANDS.map((c) => c.command).sort()).toEqual([
      'about',
      'balance',
      'deposit',
      'faucet',
      'help',
      'pause',
      'resume',
      'start',
      'status',
      'withdraw',
    ]);
    for (const c of BOT_COMMANDS) {
      expect(c.description.length).toBeGreaterThanOrEqual(3);
      expect(c.description.length).toBeLessThanOrEqual(256);
    }
  });
});
