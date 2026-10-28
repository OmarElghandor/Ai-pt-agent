import type { ReactNode } from 'react';
import { Inter, Newsreader, Noto_Sans_Arabic } from 'next/font/google';
import { V2Unavailable } from '@/components/v2/V2Unavailable';
import { isV2Enabled } from '@/lib/v2/flags';
import './v2.css';

const MATERIAL_SYMBOLS_HREF =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0&display=block';

const newsreader = Newsreader({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-v2-newsreader',
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
