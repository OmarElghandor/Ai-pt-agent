import { CORE_PROMPT } from './core';

/** Stub — not enqueued until GENERATE_IMAGES / later flag. */
export function buildImageSpecsSystemPrompt(): string {
  return `${CORE_PROMPT}

JOB: IMAGE_SPECS
Fill image_spec for items that need new keys. Describe only what is visible. No text on image. Refer to characters by id only.

REQUIRED OUTPUT: { "image_specs": [...] } with item id + visible-only description.
`.trim();
}
