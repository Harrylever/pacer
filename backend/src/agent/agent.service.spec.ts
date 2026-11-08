import { AgentService } from './agent.service';

describe('AgentService deterministic parsing', () => {
  const svc = new AgentService();

  it('parses "Put ₦300 a day into Apple and the S&P"', async () => {
    const i = await svc.parseIntent('Put ₦300 a day into Apple and the S&P');
    expect(i).toEqual({
      type: 'set_plan',
      dailyNgn: 300,
      assets: ['AAPLx', 'SPYx'],
    });
  });

  it('parses pause, resume, withdraw and status', async () => {
    await expect(svc.parseIntent('Pause')).resolves.toEqual({ type: 'pause' });
    await expect(svc.parseIntent('resume')).resolves.toEqual({
      type: 'resume',
    });
    await expect(svc.parseIntent('Withdraw everything')).resolves.toEqual({
      type: 'withdraw_all',
    });
    await expect(svc.parseIntent('How am I doing?')).resolves.toEqual({
      type: 'status',
    });
    await expect(
      svc.parseIntent('Is investing worth it for me?'),
    ).resolves.toEqual({ type: 'history' });
  });

  it('prefers the amount next to ₦ or "a day" over the 500 in S&P 500', async () => {
    await expect(
      svc.parseIntent('S&P 500 at ₦300 a day'),
    ).resolves.toEqual({ type: 'set_plan', dailyNgn: 300, assets: ['SPYx'] });
    await expect(
      svc.parseIntent('Put 500 a day into Apple'),
    ).resolves.toEqual({ type: 'set_plan', dailyNgn: 500, assets: ['AAPLx'] });
    await expect(
      svc.parseIntent('₦1,000 a day into Nvidia'),
    ).resolves.toEqual({
      type: 'set_plan',
      dailyNgn: 1000,
      assets: ['NVDAx'],
    });
  });

  it('never turns a returns question into a plan', async () => {
    await expect(svc.parseIntent('Will I make money?')).resolves.toEqual({
      type: 'refuse_prediction',
    });
    await expect(
      svc.parseIntent('Which stock should I buy?'),
    ).resolves.toEqual({ type: 'explain_options' });
  });
});

describe('AgentService FAQ and greeting parsing (deterministic)', () => {
  const svc = new AgentService();
  it.each([
    ['My mainnet solana wallet or devnet?', 'wallet_address'],
    ['which address do I give?', 'wallet_address'],
    ['can I change my address later?', 'change_address'],
    ['do I need SOL?', 'fees'],
    ['is it safe?', 'safety'],
    ['is this real money?', 'network'],
    ['how does Pacer work?', 'how_it_works'],
    ['abeg which address I go give?', 'wallet_address'],
    ['I fit change my address later?', 'change_address'],
  ])('parses %s as faq/%s', (text, topic) => {
    expect(svc.parseDeterministicIntent(text)).toEqual({ type: 'faq', topic });
  });

  it('parses greetings and the # amount form', async () => {
    expect(svc.parseDeterministicIntent('hello')).toEqual({ type: 'greeting' });
    expect(svc.parseDeterministicIntent('how far')).toEqual({ type: 'greeting' });
    await expect(svc.parseIntent('#500 a day into Apple')).resolves.toEqual({
      type: 'set_plan',
      dailyNgn: 500,
      assets: ['AAPLx'],
    });
  });
});

describe('AgentService LLM output validation', () => {
  it('rejects a hallucinated asset from the LLM', async () => {
    const svc = new AgentService(async () =>
      JSON.stringify({ type: 'set_plan', dailyNgn: 300, assets: ['TSLAx'] }),
    );
    await expect(svc.parseIntent('anything')).resolves.toEqual({
      type: 'unknown',
    });
  });

  it('rejects a negative amount from the LLM', async () => {
    const svc = new AgentService(async () =>
      JSON.stringify({ type: 'set_plan', dailyNgn: -5, assets: ['SPYx'] }),
    );
    await expect(svc.parseIntent('anything')).resolves.toEqual({
      type: 'unknown',
    });
  });

  it('accepts valid LLM JSON', async () => {
    const svc = new AgentService(async () =>
      JSON.stringify({ type: 'set_plan', dailyNgn: 500, assets: ['SPYx'] }),
    );
    await expect(svc.parseIntent('anything')).resolves.toEqual({
      type: 'set_plan',
      dailyNgn: 500,
      assets: ['SPYx'],
    });
  });
});
