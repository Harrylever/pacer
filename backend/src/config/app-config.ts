import { Keypair } from '@solana/web3.js';

/**
 * Signing secrets are parsed here and never exposed: the returned config
 * carries public keys only, so it is safe to log/serialise. Raw Keypairs
 * stay module-private via `loadSigner` (solana module only).
 */
export interface AppConfig {
  keeperPublicKey: string;
  oraclePublicKey: string;
  gasPublicKey: string;
  periodSeconds: number;
  minTradeMicroUsdc: bigint;
  maxSlippageBps: number;
  maxPriceAgeSecs: number;
  demoRepublish: boolean;
  cluster: string;
  rpcUrl: string;
}

function parseKeypair(name: string, raw: string | undefined): Keypair {
  if (!raw) throw new Error(`${name} is required`);
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
  } catch {
    throw new Error(`${name} is not a valid JSON secret key array`);
  }
}

const signers = new Map<string, Keypair>();

function load(env: NodeJS.ProcessEnv): { config: AppConfig } {
  signers.clear();
  const keeper = parseKeypair('KEEPER_SECRET_KEY', env.KEEPER_SECRET_KEY);
  const oracle = parseKeypair('ORACLE_SECRET_KEY', env.ORACLE_SECRET_KEY);
  const gas = parseKeypair('GAS_SECRET_KEY', env.GAS_SECRET_KEY);
  const keys = [keeper, oracle, gas].map((k) => k.publicKey.toBase58());
  if (new Set(keys).size !== keys.length)
    throw new Error('KEEPER_SECRET_KEY, ORACLE_SECRET_KEY and GAS_SECRET_KEY must be three different keys');
  signers.set('keeper', keeper);
  signers.set('oracle', oracle);
  signers.set('gas', gas);
  return {
    config: {
      keeperPublicKey: keeper.publicKey.toBase58(),
      oraclePublicKey: oracle.publicKey.toBase58(),
      gasPublicKey: gas.publicKey.toBase58(),
      periodSeconds: Number(env.PERIOD_SECONDS ?? 86_400),
      minTradeMicroUsdc: BigInt(env.MIN_TRADE_MICRO_USDC ?? '1000000'),
      maxSlippageBps: Number(env.MAX_SLIPPAGE_BPS ?? 100),
      maxPriceAgeSecs: Number(env.MAX_PRICE_AGE_SECS ?? 600),
      demoRepublish: env.DEMO_REPUBLISH === 'true',
      cluster: env.SOLANA_CLUSTER ?? 'devnet',
      rpcUrl: env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
    },
  };
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return load(env).config;
}

/** Only the solana module may call this. Never log the return value. */
export function loadSigner(role: 'keeper' | 'oracle' | 'gas'): Keypair {
  const kp = signers.get(role);
  if (!kp) throw new Error('loadConfig must run before loadSigner');
  return kp;
}
