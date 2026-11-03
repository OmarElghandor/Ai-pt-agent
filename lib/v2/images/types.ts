import { z } from 'zod';

export const ImageLinkSchema = z.object({
  key: z.string().min(1),
  url: z.string().min(1),
});

export type ImageLink = z.infer<typeof ImageLinkSchema>;

export const V2_IMAGE_STATUSES = [
  'missing',
  'queued',
  'generating',
  'ready',
  'flagged',
  'failed',
  'blocked',
] as const;

export type V2ImageStatus = (typeof V2_IMAGE_STATUSES)[number];
