export type ImageAspect = '1:1' | '4:3' | '16:9';

/**
 * Build a display URL with Cloudinary transforms.
 * Local/dev urls (non-Cloudinary) are returned unchanged.
 */
export function cloudinaryDisplayUrl(
  url: string | null | undefined,
  opts: { aspect: ImageAspect; width: number },
): string | null {
  if (!url) return null;
  if (!isCloudinaryUrl(url)) return url;

  const transform = [
    'c_fill',
    `ar_${opts.aspect.replace(':', ':')}`,
    'f_auto',
    'q_auto',
    `w_${Math.max(1, Math.round(opts.width))}`,
  ].join(',');

  // Keep Cloudinary version when present so overwrite regenerates bust the CDN cache.
  const version = url.match(/\/upload\/(v\d+)\//)?.[1];
  const after = version ? `${transform}/${version}/` : `${transform}/`;
  return url.replace(/\/upload\/(?:v\d+\/)?/, `/upload/${after}`);
}

export function isCloudinaryUrl(url: string): boolean {
  return /res\.cloudinary\.com\//.test(url) || /cloudinary\.com\/.*\/upload\//.test(url);
}

export function aspectForVariant(
  variant: 'word' | 'example' | 'scene' | 'cover' | 'flashcard',
): ImageAspect {
  switch (variant) {
    case 'word':
      return '1:1';
    case 'example':
    case 'flashcard':
      return '4:3';
    case 'scene':
    case 'cover':
      return '16:9';
  }
}
