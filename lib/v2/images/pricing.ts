/**
 * OpenAI image price table (USD). One place for cost_usd accounting.
 * Tuned to gpt-image-1 public list prices; used for gpt-image-2.5-flare until
 * a separate list is published.
 */

export type ImageQuality = 'low' | 'medium' | 'high';
export type ImageSizeKey = '1024x1024' | '1536x1024' | '1024x1536';

/** model → size → quality → USD per image */
export const IMAGE_PRICE_USD: Record<
  string,
  Partial<Record<ImageSizeKey, Partial<Record<ImageQuality, number>>>>
> = {
  'gpt-image-2.5-flare-2026-09-08': {
    '1024x1024': { low: 0.011, medium: 0.042, high: 0.167 },
    '1536x1024': { low: 0.016, medium: 0.063, high: 0.25 },
    '1024x1536': { low: 0.016, medium: 0.063, high: 0.25 },
  },
  'gpt-image-1': {
    '1024x1024': { low: 0.011, medium: 0.042, high: 0.167 },
    '1536x1024': { low: 0.016, medium: 0.063, high: 0.25 },
    '1024x1536': { low: 0.016, medium: 0.063, high: 0.25 },
  },
};

const DEFAULT_MODEL = 'gpt-image-2.5-flare-2026-09-08';

export function imageModelId(): string {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_MODEL;
}

export function estimateImageCostUsd(opts: {
  model?: string;
  size: ImageSizeKey | string;
  quality: ImageQuality | string;
}): number {
  const model = opts.model || imageModelId();
  const size = opts.size as ImageSizeKey;
  const quality = opts.quality as ImageQuality;
  const byModel = IMAGE_PRICE_USD[model] ?? IMAGE_PRICE_USD[DEFAULT_MODEL];
  const bySize = byModel?.[size] ?? byModel?.['1024x1024'];
  const price = bySize?.[quality] ?? bySize?.medium ?? 0.042;
  return price;
}
