import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Langify',
    short_name: 'Langify',
    description: 'تعلّم البرتغالي الأوروبي مع مواقف الشارع',
    start_url: '/path',
    display: 'standalone',
    background_color: '#FBF7EE',
    theme_color: '#12235A',
    lang: 'ar',
    dir: 'rtl',
    icons: [
      {
        src: '/v2/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/v2/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
