import type { ReactNode } from 'react';
import { Inter, Manrope, Noto_Sans_Arabic } from 'next/font/google';
import localFont from 'next/font/local';
import { V2Unavailable } from '@/components/v2/V2Unavailable';
import { isV2Enabled } from '@/lib/v2/flags';
import './v2.css';

const MATERIAL_SYMBOLS_HREF =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0&display=block';

const newsreader = localFont({
  src: [
    {
      path: '../fonts/newsreader/Newsreader-VariableLatin.woff2',
      weight: '400 700',
      style: 'normal',
    },
    {
      path: '../fonts/newsreader/Newsreader-Italic-VariableLatin.woff2',
      weight: '400 700',
      style: 'italic',
    },
  ],
  display: 'swap',
  variable: '--font-v2-newsreader',
  fallback: ['ui-serif', 'Georgia', 'serif'],
});

const notoAr = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-v2-noto-ar',
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-v2-inter',
});

/** Calm Kit UI chrome for Module C free talk only. */
const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-v2-manrope',
});

export default function V2Layout({ children }: { children: ReactNode }) {
  const enabled = isV2Enabled();

  return (
    <div
      dir="rtl"
      lang="ar"
      className={[
        'v2-shell',
        newsreader.variable,
        notoAr.variable,
        inter.variable,
        manrope.variable,
      ].join(' ')}
    >
      {/* Material Symbols — not available via next/font */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={MATERIAL_SYMBOLS_HREF} />
      <div className="v2-app-column">
        {enabled ? children : <V2Unavailable />}
      </div>
    </div>
  );
}
