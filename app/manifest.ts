import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'A-Z Talkie',
    short_name: 'Talkie',
    description: 'تعلّم البرتغالي الأوروبي مع مواقف الشارع',
    start_url: '/path',
    display: 'standalone',
    background_color: '#FFF8F2',
    theme_color: '#14545A',
    lang: 'ar',
    dir: 'rtl',
    icons: [
      {
        src: '/v2/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/v2/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
