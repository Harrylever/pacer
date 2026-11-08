import { useEffect, useState } from 'react';

export type ColorScheme = 'light' | 'dark';

export interface TelegramState {
  /** Raw initData string, or null outside Telegram. */
  initData: string | null;
  colorScheme: ColorScheme;
  /** True once Telegram's WebApp object was found. */
  ready: boolean;
}

interface WebAppLike {
  initData?: string;
  colorScheme?: string;
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  openLink?: (url: string) => void;
  onEvent?: (event: string, handler: () => void) => void;
}

export function telegramWebApp(): WebAppLike | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Telegram?: { WebApp?: WebAppLike } }).Telegram
    ?.WebApp;
}

function systemScheme(): ColorScheme {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function readScheme(): ColorScheme {
  const WebApp = telegramWebApp();
  if (WebApp) return WebApp.colorScheme === 'dark' ? 'dark' : 'light';
  return systemScheme();
}

/** Applies the brand ground for the scheme and matches Telegram's own bars to it. */
export function applyGround(scheme: ColorScheme): void {
  const root = document.documentElement;
  root.classList.toggle('ground-paper', scheme === 'light');
  root.classList.toggle('ground-dark', scheme === 'dark');
  root.dataset.colorScheme = scheme;
  const WebApp = telegramWebApp();
  if (!WebApp) return;
  // The ground colour lives in tokens.css; read it back rather than
  // repeating a hex value here (the token test forbids that).
  const ground = getComputedStyle(root)
    .getPropertyValue(scheme === 'dark' ? '--primary-deep' : '--surface')
    .trim();
  if (!ground) return;
  try {
    WebApp.setHeaderColor?.(ground);
    WebApp.setBackgroundColor?.(ground);
  } catch {
    // Older Telegram clients may reject a colour; the in-page ground stands.
  }
}

function readState(): TelegramState {
  const WebApp = telegramWebApp();
  return {
    initData: WebApp?.initData || null,
    colorScheme: readScheme(),
    ready: Boolean(WebApp),
  };
}

/**
 * Single hook for everything Telegram: ready()/expand(), the brand ground
 * from colorScheme (system scheme outside Telegram), and initData (null
 * outside Telegram so the comparison still renders in a plain browser).
 */
export function useTelegram(): TelegramState {
  const [state, setState] = useState<TelegramState>(() => ({
    initData: null,
    colorScheme: 'light',
    ready: false,
  }));

  useEffect(() => {
    const WebApp = telegramWebApp();
    try {
      WebApp?.ready?.();
      WebApp?.expand?.();
    } catch {
      // Outside Telegram or blocked script: fall back silently.
    }
    const apply = () => {
      const next = readState();
      applyGround(next.colorScheme);
      setState(next);
    };
    apply();
    try {
      WebApp?.onEvent?.('themeChanged', apply);
    } catch {
      // Theme stays as first read.
    }
  }, []);

  return state;
}

/** Opens a link with Telegram's browser inside Telegram, a normal tab outside. */
export function openExternalLink(url: string): void {
  const WebApp = telegramWebApp();
  if (WebApp?.openLink) {
    WebApp.openLink(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
