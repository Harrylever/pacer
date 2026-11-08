/**
 * CORS for the Mini App only. Origins come from MINIAPP_ORIGIN
 * (comma-separated); blank means no cross-origin access. Never `*`:
 * the holdings endpoint is authorised by Telegram initData.
 */
export function miniappOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.MINIAPP_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function miniappCorsOptions(env: NodeJS.ProcessEnv = process.env) {
  const origins = miniappOrigins(env);
  if (origins.length === 0) return null;
  return {
    origin: origins,
    methods: ['GET'],
    allowedHeaders: ['x-telegram-init-data'],
  };
}
