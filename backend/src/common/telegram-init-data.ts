import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies Telegram Mini App initData (Telegram's documented algorithm):
 * secret = HMAC_SHA256(key "WebAppData", bot token), then the hash is
 * HMAC_SHA256(secret, data-check-string) over every field except `hash`,
 * sorted by key. Returns the Telegram user id, or null when invalid,
 * tampered, or older than maxAgeSeconds.
 */
export function verifyTelegramInitData(
  initData: string | undefined,
  botToken: string | undefined,
  opts: { nowSeconds?: number; maxAgeSeconds?: number } = {},
): { userId: string } | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    // Code-unit ordering, as Telegram specifies; localeCompare is
    // locale-dependent and must not decide the signed string.
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const computed = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');
  const a = Buffer.from(computed);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const maxAge = opts.maxAgeSeconds ?? 86_400;
  const authDate = Number(params.get('auth_date') ?? 0);
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > maxAge) return null;

  try {
    const user = JSON.parse(params.get('user') ?? '') as { id?: number };
    if (!user.id) return null;
    return { userId: String(user.id) };
  } catch {
    return null;
  }
}
