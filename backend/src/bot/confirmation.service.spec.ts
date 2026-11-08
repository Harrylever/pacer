import { ConfirmationService } from './confirmation.service';

describe('ConfirmationService', () => {
  it('executes nothing until confirm, then exactly once', async () => {
    let calls = 0;
    const svc = new ConfirmationService();
    const card = svc.propose('user1', {
      kind: 'set_plan',
      summary: '₦300/day into AAPLx, SPYx',
      execute: async () => {
        calls++;
        return 'sig-1';
      },
    });
    expect(card.text).toContain('₦300/day');
    expect(card.buttons).toEqual(['Confirm', 'Cancel']);
    await expect(svc.confirm('user1', card.id)).resolves.toBe('sig-1');
    expect(calls).toBe(1);
    await expect(svc.confirm('user1', card.id)).rejects.toThrow(
      /no pending/,
    );
    expect(calls).toBe(1);
  });

  it('cancel discards without executing', async () => {
    let calls = 0;
    const svc = new ConfirmationService();
    const card = svc.propose('user1', {
      kind: 'pause',
      summary: 'Pause?',
      execute: async () => {
        calls++;
        return 'x';
      },
    });
    expect(svc.cancel('user1', card.id)).toBe(true);
    expect(calls).toBe(0);
    await expect(svc.confirm('user1', card.id)).rejects.toThrow(
      /no pending/,
    );
  });

  it('a card belongs to its user only', async () => {
    const svc = new ConfirmationService();
    const card = svc.propose('user1', {
      kind: 'pause',
      summary: 'Pause?',
      execute: async () => 'x',
    });
    await expect(svc.confirm('user2', card.id)).rejects.toThrow(
      /no pending/,
    );
  });
});

describe('ConfirmationService expiry', () => {
  it('refuses a card tapped after it expired, without executing', async () => {
    let t = 0;
    let calls = 0;
    const svc = new ConfirmationService();
    svc.now = () => t;
    const card = svc.propose('user1', {
      kind: 'withdraw_all',
      summary: 'Withdraw?',
      execute: async () => {
        calls++;
        return 'x';
      },
    });
    t = 16 * 60 * 1000;
    await expect(svc.confirm('user1', card.id)).rejects.toThrow(/no pending/);
    expect(calls).toBe(0);
  });
});
