import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
} from "railway/iac";

/**
 * Pacer on Railway: the NestJS backend (Telegram bot, keeper, price updater,
 * HTTP API for the Mini App) and its Postgres.
 *
 * - The image is built from the repo root with Dockerfile.backend, because
 *   the backend reads data/history/ from outside backend/.
 * - Exactly ONE replica: the bot uses Telegram long polling, and a second
 *   instance would fight the first over getUpdates (HTTP 409).
 * - Secrets are `preserve()`: they are never written in source. Set them in
 *   Railway (dashboard or `railway variable set`) before the first deploy.
 * - `railway config apply` is manual. Always run `railway config plan` first.
 */
export default defineRailway(() => {
  const db = postgres("postgres");

  const backend = service("backend", {
    source: github("Harrylever/pacer", { branch: "main" }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile.backend",
      // Redeploy only when something the backend image uses changes.
      watchPatterns: ["backend/**", "data/history/**", "Dockerfile.backend"],
    },
    // Apply database migrations before each release.
    preDeploy: "node_modules/.bin/prisma migrate deploy",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    replicas: 1,
    env: {
      DATABASE_URL: db.env.DATABASE_URL,

      // Public configuration. These must match the on-chain config
      // (devnet.json): the backend refuses to boot if they disagree.
      SOLANA_CLUSTER: "devnet",
      SOLANA_RPC_URL: "https://api.devnet.solana.com",
      PERIOD_SECONDS: "10",
      MIN_TRADE_MICRO_USDC: "100000",
      MAX_SLIPPAGE_BPS: "100",
      MAX_PRICE_AGE_SECS: "600",
      DEMO_REPUBLISH: "false",
      MAINNET_PRICE_MINTS:
        "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp:E7wjvbCA2Nkybck3TX8UWHRikMEfEtdDmRnRDjce58rB," +
        "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh:9NVPUdetoqkQfhWKJnoAm1LoxdRadL2KQ8eqbbZMqztC," +
        "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W:HwjCBrhRkjfifM7aQ4eP4vj7h9mQsVELXjDxmdv5nk6M",

      // Secrets and per-deployment values: set in Railway, never here.
      KEEPER_SECRET_KEY: preserve(),
      ORACLE_SECRET_KEY: preserve(),
      GAS_SECRET_KEY: preserve(),
      WALLET_ENCRYPTION_KEY: preserve(),
      TELEGRAM_BOT_TOKEN: preserve(),
      JUPITER_API_KEY: preserve(),
      GEMINI_API_KEY: preserve(),
      LLM_MODEL: preserve(),
      MINIAPP_URL: preserve(),
      MINIAPP_ORIGIN: preserve(),
    },
  });

  return project("pacer", {
    resources: [db, backend],
  });
});
