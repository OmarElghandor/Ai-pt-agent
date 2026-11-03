import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ImageSize } from './templates';
import { imageModelId } from '@/lib/v2/images/pricing';

const OUT_DIR = path.join(process.cwd(), 'data', 'v2-images');

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  return key;
}

export type ImageRefInput =
  | { path: string }
  | { buffer: Buffer; filename?: string }
  | { url: string };

async function materializeRef(
  ref: ImageRefInput,
): Promise<{ blob: Blob; filename: string }> {
  if ('path' in ref) {
    if (!existsSync(ref.path)) {
      throw new Error(`Reference image missing: ${ref.path}`);
    }
    const buf = readFileSync(ref.path);
    return {
      blob: new Blob([new Uint8Array(buf)], { type: 'image/png' }),
      filename: path.basename(ref.path),
    };
  }
  if ('buffer' in ref) {
    return {
      blob: new Blob([new Uint8Array(ref.buffer)], { type: 'image/png' }),
      filename: ref.filename ?? 'ref.png',
    };
  }
  const res = await fetch(ref.url);
  if (!res.ok) {
    throw new Error(`Failed to fetch reference image (${res.status}): ${ref.url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const nameFromUrl = ref.url.split('/').pop()?.split('?')[0] || 'ref.png';
  return {
    blob: new Blob([new Uint8Array(buf)], { type: 'image/png' }),
    filename: nameFromUrl.endsWith('.png') ? nameFromUrl : `${nameFromUrl}.png`,
  };
}

/**
 * Call OpenAI images edits endpoint with one or more reference images.
 */
export async function editImage(opts: {
  prompt: string;
  references: ImageRefInput[];
  size: ImageSize;
  quality?: 'medium' | 'high' | 'low';
}): Promise<Buffer> {
  if (!opts.references.length) {
    throw new Error('editImage requires at least one reference');
  }
  const apiKey = getApiKey();
  const model = imageModelId();
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', opts.prompt);
  form.append('size', opts.size);
  form.append('quality', opts.quality ?? 'medium');
  form.append('n', '1');

  // Multi-ref edits require image[] (repeating `image` returns duplicate_parameter).
  const imageField = opts.references.length > 1 ? 'image[]' : 'image';
  for (const ref of opts.references) {
    const { blob, filename } = await materializeRef(ref);
    form.append(imageField, blob, filename);
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

  return parseImageResponse(await res.json());
}

/**
 * OpenAI images generations — used to bootstrap character sheets / style anchor
 * when no reference exists yet.
 */
export async function generateImage(opts: {
  prompt: string;
  size: ImageSize;
  quality?: 'medium' | 'high' | 'low';
}): Promise<Buffer> {
  const apiKey = getApiKey();
  const model = imageModelId();
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: opts.prompt,
      size: opts.size,
      quality: opts.quality ?? 'high',
      n: 1,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `OpenAI image generations failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }

  return parseImageResponse(await res.json());
}

async function parseImageResponse(json: unknown): Promise<Buffer> {
  const data = json as {
    data?: { b64_json?: string; url?: string }[];
  };
  const first = data.data?.[0];
  if (first?.b64_json) {
    return Buffer.from(first.b64_json, 'base64');
  }
  if (first?.url) {
    const imgRes = await fetch(first.url);
    if (!imgRes.ok) throw new Error('Failed to download generated image URL');
    return Buffer.from(await imgRes.arrayBuffer());
  }
  throw new Error('OpenAI image API returned no image data');
}

/** @deprecated Prefer Cloudinary/local storage adapter. Kept for legacy pack path. */
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
