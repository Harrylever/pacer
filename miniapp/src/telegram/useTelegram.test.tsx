import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTelegram } from './useTelegram';

function setTelegram(webApp: unknown) {
  (window as unknown as { Telegram?: unknown }).Telegram =
    webApp === undefined ? undefined : { WebApp: webApp };
}

function stubSystemScheme(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark && query.includes('dark'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  setTelegram(undefined);
  vi.unstubAllGlobals();
  document.documentElement.className = '';
  document.documentElement.style.cssText = '';
});

describe('useTelegram outside Telegram', () => {
  it('returns null initData and follows prefers-color-scheme', async () => {
    setTelegram(undefined);
    stubSystemScheme(true);
    const { result } = renderHook(() => useTelegram());
    await waitFor(() => expect(result.current.ready).toBe(false));
    expect(result.current.initData).toBeNull();
    expect(result.current.colorScheme).toBe('dark');
    expect(document.documentElement.classList.contains('ground-dark')).toBe(
      true,
    );
  });

  it('uses the paper ground in a light system scheme', async () => {
    setTelegram(undefined);
    stubSystemScheme(false);
    const { result } = renderHook(() => useTelegram());
    await waitFor(() =>
      expect(result.current.colorScheme).toBe('light'),
    );
    expect(document.documentElement.classList.contains('ground-paper')).toBe(
      true,
    );
  });
});

describe('useTelegram inside Telegram', () => {
  it('exposes initData, calls ready/expand and matches Telegram bars to the ground', async () => {
    const ready = vi.fn();
    const expand = vi.fn();
    const setHeaderColor = vi.fn();
    const setBackgroundColor = vi.fn();
    setTelegram({
      initData: 'query_id=AAE&user=%7B%7D&hash=abc',
      colorScheme: 'dark',
      ready,
      expand,
      setHeaderColor,
      setBackgroundColor,
    });
    // jsdom does not load tokens.css; stand in for the computed token.
    document.documentElement.style.setProperty('--primary-deep', '#0e1513');
    const { result } = renderHook(() => useTelegram());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(ready).toHaveBeenCalled();
    expect(expand).toHaveBeenCalled();
    expect(result.current.initData).toContain('query_id=AAE');
    expect(result.current.colorScheme).toBe('dark');
    expect(document.documentElement.classList.contains('ground-dark')).toBe(
      true,
    );
    expect(setHeaderColor).toHaveBeenCalledWith('#0e1513');
    expect(setBackgroundColor).toHaveBeenCalledWith('#0e1513');
  });

  it('ignores themeParams colours: the ground comes from colorScheme alone', async () => {
    setTelegram({
      initData: 'x',
      colorScheme: 'light',
      themeParams: { bg_color: '#0e1621', button_color: '#2aabee' },
      ready: vi.fn(),
      expand: vi.fn(),
    });
    document.documentElement.style.setProperty('--surface', '#f6f4ee');
    const { result } = renderHook(() => useTelegram());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.colorScheme).toBe('light');
    expect(document.documentElement.classList.contains('ground-paper')).toBe(
      true,
    );
    // No Telegram-blue variable is ever written.
    expect(
      document.documentElement.style.getPropertyValue('--pacer-button'),
    ).toBe('');
  });
});
