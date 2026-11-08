import { createHmac } from 'node:crypto';
import { verifyTelegramInitData } from './telegram-init-data';

const TOKEN = '123456:test-bot-token';
const NOW = 1_800_000_000;

function buildInitData(userId: number, authDate = NOW - 60): string {
  const fields: Record<string, string> = {
    auth_date: String(authDate),
    query_id: 'AAE1',
    user: JSON.stringify({ id: userId, first_name: 'Test' }),
  };
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe('verifyTelegramInitData', () => {
  it('accepts correctly signed initData and returns the user id', () => {
    expect(
      verifyTelegramInitData(buildInitData(424242), TOKEN, {
        nowSeconds: NOW,
      }),
    ).toEqual({ userId: '424242' });
  });

  it('rejects a tampered user id', () => {
    const tampered = buildInitData(424242).replace('424242', '999999');
    expect(
      verifyTelegramInitData(tampered, TOKEN, { nowSeconds: NOW }),
    ).toBeNull();
  });

  it('rejects missing data, wrong token and stale auth_date', () => {
    expect(verifyTelegramInitData(undefined, TOKEN)).toBeNull();
    expect(
      verifyTelegramInitData(buildInitData(1), 'wrong-token', {
        nowSeconds: NOW,
      }),
    ).toBeNull();
    expect(
      verifyTelegramInitData(buildInitData(1, NOW - 90_000), TOKEN, {
        nowSeconds: NOW,
      }),
    ).toBeNull();
  });
});
