import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  calmMessage,
  fetchComparison,
  fetchHoldings,
} from './api';

function mockFetchOnce(
  impl: () => Response | Promise<Response> | never,
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => impl()),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_MOCK;
});

describe('fetchComparison', () => {
  it('returns the comparison on success', async () => {
    const body = { disclaimer: 'Past performance.', series: [] };
    mockFetchOnce(
      () => new Response(JSON.stringify(body), { status: 200 }),
    );
    const r = await fetchComparison('lump');
    expect(r.disclaimer).toBe('Past performance.');
  });

  it('maps 401 to unauthorized', async () => {
    mockFetchOnce(() => new Response('no', { status: 401 }));
    await expect(fetchComparison('lump')).rejects.toMatchObject({
      kind: 'unauthorized',
    });
  });

  it('maps 404 to not-found', async () => {
    mockFetchOnce(() => new Response('no', { status: 404 }));
    await expect(fetchComparison('daily')).rejects.toMatchObject({
      kind: 'not-found',
    });
  });

  it('maps a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('down');
      }),
    );
    await expect(fetchComparison('lump')).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('uses the mock with NEXT_PUBLIC_MOCK=1', async () => {
    process.env.NEXT_PUBLIC_MOCK = '1';
    const r = await fetchComparison('lump');
    expect(r.usdc.endNgn).toBe(49_027);
  });
});

describe('fetchHoldings', () => {
  it('returns holdings with initData', async () => {
    const body = {
      displayCurrency: 'NGN',
      ngnPerUsd: 1385,
      totalValueUsd: 1,
      putInUsd: 2,
      waitingUsdc: 1,
      holdings: [],
    };
    mockFetchOnce(
      () => new Response(JSON.stringify(body), { status: 200 }),
    );
    const r = await fetchHoldings('init-data-here');
    expect(r.holdings).toEqual([]);
  });

  it('requires initData', async () => {
    await expect(fetchHoldings(null)).rejects.toMatchObject({
      kind: 'unauthorized',
    });
  });

  it('serves the sample vault without initData in mock mode', async () => {
    process.env.NEXT_PUBLIC_MOCK = '1';
    const r = await fetchHoldings(null);
    expect(r.vault?.stocks).toEqual(['SPYx', 'AAPLx']);
    expect(r.recentBuys?.length).toBeGreaterThan(0);
  });

  it('maps 401/404/network', async () => {
    mockFetchOnce(() => new Response('no', { status: 401 }));
    await expect(fetchHoldings('x')).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    mockFetchOnce(() => new Response('no', { status: 404 }));
    await expect(fetchHoldings('x')).rejects.toMatchObject({
      kind: 'not-found',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('down');
      }),
    );
    await expect(fetchHoldings('x')).rejects.toMatchObject({
      kind: 'network',
    });
  });
});

describe('calmMessage', () => {
  it('never leaks an error', async () => {
    for (const kind of ['unauthorized', 'not-found', 'network', 'server'] as const) {
      const msg = calmMessage(kind);
      expect(msg).not.toMatch(/Error|stack|500/i);
      expect(msg.length).toBeGreaterThan(10);
    }
  });
});

describe('ApiError', () => {
  it('is throwable with a kind', () => {
    expect(new ApiError('network').kind).toBe('network');
  });
});
