import { PricesService } from './prices.service';
import type { VaultClient } from '../solana/vault-client';

function fakeClient() {
  const published: { mint: string; priceMicroUsdc: bigint }[] = [];
  const client = {
    published,
    async updatePriceAsOracle(mint: string, priceMicroUsdc: bigint) {
      published.push({ mint, priceMicroUsdc });
      return 'sig';
    },
  };
  return client as unknown as VaultClient & typeof client;
}

const jup = (body: unknown) => async () => ({
  ok: true,
  json: async () => body,
});

describe('PricesService', () => {
  it('publishes usdPricePrescaled, never usdPrice', async () => {
    const client = fakeClient();
    const svc = new PricesService(
      client,
      ['MINT_AAPL'],
      jup({
        data: {
          MINT_AAPL: {
            usdPrice: 335.37,
            scaledUiConfig: { usdPricePrescaled: 336.47 },
          },
        },
      }),
    );
    const r = await svc.refreshPrices();
    expect(r.published).toEqual(['MINT_AAPL']);
    expect(client.published[0].priceMicroUsdc).toBe(336_470_000n);
  });

  it('keeps the last good price when a fetch fails', async () => {
    const client = fakeClient();
    const svc = new PricesService(client, ['MINT_AAPL'], async () => {
      throw new Error('network');
    });
    const r = await svc.refreshPrices();
    expect(r).toEqual({ published: [], kept: ['MINT_AAPL'] });
    expect(client.published).toHaveLength(0);
  });

  it('keeps a mint Jupiter omits and still publishes the others', async () => {
    const client = fakeClient();
    const svc = new PricesService(
      client,
      ['MINT_AAPL', 'MINT_SPY'],
      jup({
        data: {
          MINT_SPY: {
            usdPrice: 750,
            scaledUiConfig: { usdPricePrescaled: 751.5 },
          },
        },
      }),
    );
    const r = await svc.refreshPrices();
    expect(r.published).toEqual(['MINT_SPY']);
    expect(r.kept).toEqual(['MINT_AAPL']);
  });

  it('republishes last good only under DEMO_REPUBLISH', async () => {
    const client = fakeClient();
    let fail = false;
    const svc = new PricesService(
      client,
      ['MINT_AAPL'],
      async () => {
        if (fail) throw new Error('down');
        return {
          ok: true,
          json: async () => ({
            data: {
              MINT_AAPL: {
                usdPrice: 1,
                scaledUiConfig: { usdPricePrescaled: 2 },
              },
            },
          }),
        };
      },
      true,
    );
    await svc.refreshPrices();
    fail = true;
    const r = await svc.refreshPrices();
    expect(r.published).toEqual(['MINT_AAPL']);
    expect(client.published).toHaveLength(2);
    expect(client.published[1].priceMicroUsdc).toBe(2_000_000n);
  });
});

describe('PricesService per-mint failure isolation', () => {
  it('one failed update_price does not skip the other mints', async () => {
    const published: string[] = [];
    const client = {
      updatePriceAsOracle: async (mint: string) => {
        if (mint === 'BAD') throw new Error('update_price failed');
        published.push(mint);
        return 'sig';
      },
    };
    const svc = new PricesService(
      client as never,
      ['BAD', 'GOOD'],
      async () => ({
        ok: true,
        json: async () => ({
          BAD: { scaledUiConfig: { usdPricePrescaled: 10 } },
          GOOD: { scaledUiConfig: { usdPricePrescaled: 20 } },
        }),
      }),
    );
    const r = await svc.refreshPrices();
    expect(r.published).toEqual(['GOOD']);
    expect(r.kept).toEqual(['BAD']);
    expect(published).toEqual(['GOOD']);
    expect(svc.lastPriceRefreshAt).toBeInstanceOf(Date);
  });
});

describe('PricesService mainnet → devnet mapping', () => {
  it('fetches the mainnet xStock and publishes to the devnet stand-in', async () => {
    const published: [string, bigint][] = [];
    const client = {
      updatePriceAsOracle: async (mint: string, p: bigint) => {
        published.push([mint, p]);
        return 'sig';
      },
    };
    let fetchedUrl = '';
    const svc = new PricesService(
      client as never,
      ['XsbMAINNET:AAPLxDEV'],
      async (url) => {
        fetchedUrl = url;
        return {
          ok: true,
          json: async () => ({ XsbMAINNET: { usdPrice: 335.37, scaledUiConfig: { usdPricePrescaled: 336.47 } } }),
        };
      },
    );
    await svc.refreshPrices();
    expect(fetchedUrl).toContain('ids=XsbMAINNET');
    expect(published).toEqual([['AAPLxDEV', 336_470_000n]]);
  });

  it('keeps the last price and alerts once when the source keeps failing', async () => {
    const { Logger } = await import('@nestjs/common');
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      const published: bigint[] = [];
      let fail = false;
      const client = {
        updatePriceAsOracle: async (_mint: string, price: bigint) => {
          published.push(price);
          return 'sig';
        },
      };
      const svc = new PricesService(
        client as never,
        ['AAPLxDEV'],
        async () => {
          if (fail) throw new Error('jupiter down');
          return {
            ok: true,
            json: async () => ({
              AAPLxDEV: {
                usdPrice: 336.47,
                scaledUiConfig: { usdPricePrescaled: 336.47 },
              },
            }),
          };
        },
      );
      await svc.refreshPrices();
      expect(published).toEqual([336_470_000n]);
      fail = true;
      const r1 = await svc.refreshPrices();
      const r2 = await svc.refreshPrices();
      expect(r1.kept).toEqual(['AAPLxDEV']);
      expect(r2.kept).toEqual(['AAPLxDEV']);
      // Nothing new published (never 0), alert fired exactly once.
      expect(published).toEqual([336_470_000n]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
