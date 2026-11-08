import { config } from 'dotenv';

/**
 * Loads backend/.env into process.env. Imported first in main.ts so every
 * module sees the values. Real environment variables (e.g. on Railway) win
 * over the file.
 *
 * A blank value (`MIN_TRADE_MICRO_USDC=` as in .env.example) is treated as
 * unset, so code defaults apply. Otherwise `env.X ?? default` keeps the empty
 * string: Number('') is 0 and BigInt('') is 0n, which would silently mean a
 * zero minimum trade or zero slippage allowance.
 */
config({ quiet: true });
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined && value.trim() === '') delete process.env[key];
}
