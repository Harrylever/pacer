import { Inject, Injectable, Logger } from '@nestjs/common';
import type { VaultClient } from '../solana/vault-client';
import { VAULT_CLIENT } from '../vaults/vaults.service';

type FetchFn = (url: string, init?: unknown) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

interface JupiterResponse {
  data?: Record<
    string,
    { usdPrice?: number; scaledUiConfig?: { usdPricePrescaled?: number } }
  >;
}

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);
  private lastGood = new Map<string, bigint>();
  private alerted = new Set<string>();
  private lastRefreshAt: Date | null = null;

  /** When the last refresh attempt finished (for /health). */
  get lastPriceRefreshAt(): Date | null {
    return this.lastRefreshAt;
  }

  /** Alerts once per mint while its price source keeps failing. */
  private alertOnce(mint: string): void {
    if (this.alerted.has(mint)) return;
    this.alerted.add(mint);
    this.logger.error(
      `price source failing for ${mint}; keeping the last good price`,
    );
  }

  constructor(
    @Inject(VAULT_CLIENT) private readonly client: VaultClient,
    private readonly mainnetMints: string[] = [],
    private readonly fetchFn: FetchFn = (url, init) =>
      fetch(url, init as RequestInit) as never,
    private readonly demoRepublish = false,
    private readonly apiKey?: string,
  ) {}

  /**
   * Publishes scaledUiConfig.usdPricePrescaled (never usdPrice) as
   * price_micro_usdc via the oracle key. A failed/omitted mint keeps its
   * last good price; DEMO_REPUBLISH republishes it (demo only, SPEC).
   */
  /**
   * Each MAINNET_PRICE_MINTS entry is `mainnetMint:devnetMint` (or just
   * `mint` when they're the same). The price is fetched for the mainnet xStock
   * and published to the devnet stand-in's price account.
   */
  private pairs(): { source: string; target: string }[] {
    return this.mainnetMints.map((entry) => {
      const [source, target] = entry.split(':');
      return { source, target: target || source };
    });
  }

  async refreshPrices(): Promise<{ published: string[]; kept: string[] }> {
    const published: string[] = [];
    const kept: string[] = [];
    const pairs = this.pairs();
    if (pairs.length === 0) return { published, kept };
    let data: JupiterResponse['data'];
    try {
      const url = `https://api.jup.ag/price/v3?ids=${pairs.map((p) => p.source).join(',')}`;
      const res = await this.fetchFn(url, {
        headers: this.apiKey ? { 'x-api-key': this.apiKey } : {},
      });
      // Jupiter Price API v3 returns `{ "<mint>": {...} }` at the top level
      // (verified Nov 4, 2026). Accept a `data` wrapper too, for safety.
      const body = (await res.json()) as JupiterResponse & JupiterResponse['data'];
      data = body?.data ?? (body as JupiterResponse['data']);
    } catch {
      data = undefined;
    }
    for (const { source, target: mint } of pairs) {
      // Each mint publishes on its own: one failed update_price must not
      // skip the other mints.
      try {
        const prescaled = data?.[source]?.scaledUiConfig?.usdPricePrescaled;
        if (prescaled !== undefined && Number.isFinite(prescaled) && prescaled > 0) {
          const micro = BigInt(Math.round(prescaled * 1_000_000));
          await this.client.updatePriceAsOracle(mint, micro);
          this.lastGood.set(mint, micro);
          this.alerted.delete(mint);
          published.push(mint);
          continue;
        }
        const last = this.lastGood.get(mint);
        if (this.demoRepublish && last !== undefined) {
          this.logger.warn(
            `DEMO_REPUBLISH: republishing last good price for ${mint} (demo only)`,
          );
          await this.client.updatePriceAsOracle(mint, last);
          published.push(mint);
        } else {
          // Never publish 0: the last good price stays, alert once per mint.
          this.alertOnce(mint);
          kept.push(mint);
        }
      } catch {
        this.alertOnce(mint);
        kept.push(mint);
      }
    }
    this.lastRefreshAt = new Date();
    return { published, kept };
  }
}
