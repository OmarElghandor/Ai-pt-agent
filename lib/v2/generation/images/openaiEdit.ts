import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ImageSize } from './templates';

const OUT_DIR = path.join(process.cwd(), 'data', 'v2-images');

function getImageModel(): string {
  return (
    process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2.5-flare-2026-09-08'
  );
}

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  return key;
}

/**
 * Call OpenAI images edits endpoint with one or more reference images.
 * Uses multipart form via fetch (no openai SDK dependency).
 */
export async function editImage(opts: {
  prompt: string;
  referencePaths: string[];
  size: ImageSize;
  quality?: 'medium' | 'high';
}): Promise<Buffer> {
  const apiKey = getApiKey();
  const model = getImageModel();
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', opts.prompt);
  form.append('size', opts.size);
  form.append('quality', opts.quality ?? 'medium');
  form.append('n', '1');

  for (const refPath of opts.referencePaths) {
    if (!existsSync(refPath)) {
      throw new Error(`Reference image missing: ${refPath}`);
    }
    const buf = readFileSync(refPath);
    const blob = new Blob([new Uint8Array(buf)], { type: 'image/png' });
    // OpenAI edits: repeat `image` for multiple reference files
    form.append('image', blob, path.basename(refPath));
  }

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI image edits failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const first = json.data?.[0];
  if (first?.b64_json) {
    return Buffer.from(first.b64_json, 'base64');
  }
  if (first?.url) {
    const imgRes = await fetch(first.url);
    if (!imgRes.ok) throw new Error('Failed to download generated image URL');
    return Buffer.from(await imgRes.arrayBuffer());
  }
  throw new Error('OpenAI image edits returned no image data');
}

export function saveGeneratedImage(key: string, buffer: Buffer): string {
  mkdirSync(OUT_DIR, { recursive: true });
  const safe = key.replace(/[^a-z0-9._-]/gi, '_');
  const out = path.join(OUT_DIR, `${safe}.png`);
  writeFileSync(out, buffer);
  return out;
}

export function generatedImagePath(key: string): string {
  const safe = key.replace(/[^a-z0-9._-]/gi, '_');
  return path.join(OUT_DIR, `${safe}.png`);
}
