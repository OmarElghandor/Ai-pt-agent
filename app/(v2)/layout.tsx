import type { ReactNode } from 'react';
import {
  Barlow_Condensed,
  IBM_Plex_Sans_Arabic,
  Lalezar,
  Newsreader,
  Work_Sans,
} from 'next/font/google';
import { V2Unavailable } from '@/components/v2/V2Unavailable';
import { isV2Enabled } from '@/lib/v2/flags';
import './v2.css';

const barlow = Barlow_Condensed({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-v2-barlow',
});

const lalezar = Lalezar({
  subsets: ['arabic'],
  weight: ['400'],
  display: 'swap',
  variable: '--font-v2-lalezar',
});

const newsreader = Newsreader({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-v2-newsreader',
});

const ibmPlexAr = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-v2-ibm-plex-ar',
});

const workSans = Work_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600'],
  display: 'swap',
  variable: '--font-v2-work-sans',
});

export default function V2Layout({ children }: { children: ReactNode }) {
  const enabled = isV2Enabled();

  return (
    <div
      className={[
        'v2-shell',
        barlow.variable,
        lalezar.variable,
        newsreader.variable,
        ibmPlexAr.variable,
        workSans.variable,
      ].join(' ')}
    >
      <div className="v2-app-column">
        {enabled ? children : <V2Unavailable />}
      </div>
    </div>
  );
}
