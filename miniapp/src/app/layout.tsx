import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Mono, Schibsted_Grotesk } from 'next/font/google';
import './tokens.css';
import './globals.css';

// Fonts follow ../lander/app/layout.tsx (copied, not imported: no workspace).
const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['opsz'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-fraunces',
});

const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-schibsted',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'Pacer',
  description:
    'What your savings would have become — past performance, not a prediction.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${schibsted.variable} ${plexMono.variable}`}
    >
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" defer />
      </head>
      <body>{children}</body>
    </html>
  );
}
