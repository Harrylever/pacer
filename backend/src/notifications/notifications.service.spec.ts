import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('delivers through the registered sender', async () => {
    const svc = new NotificationsService();
    const sent: [string, string][] = [];
    svc.registerSender(async (id, text) => { sent.push([id, text]); });
    await expect(svc.send('42', 'hello')).resolves.toBe(true);
    expect(sent).toEqual([['42', 'hello']]);
  });

  it('returns false without a sender and never throws when sending fails', async () => {
    const svc = new NotificationsService();
    await expect(svc.send('42', 'hi')).resolves.toBe(false);
    svc.registerSender(async () => { throw new Error('telegram down'); });
    await expect(svc.send('42', 'hi')).resolves.toBe(false);
  });
});
