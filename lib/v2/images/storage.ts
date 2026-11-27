import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import {
  isCharacterKey,
  safeImageFilename,
  STYLE_ANCHOR_KEY,
  STYLE_ANCHOR_OBJECT_KEY,
} from './keys';

export type UploadResult = {
  url: string;
  public_id: string;
  version?: number;
};

const LOCAL_DIR = path.join(process.cwd(), 'data', 'v2-images');

function cloudinaryConfigured(): boolean {
  return Boolean(process.env.CLOUDINARY_URL?.trim());
}

function ensureCloudinary(): void {
  // CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
  // cloudinary.v2.config reads it automatically when set.
  if (!cloudinaryConfigured()) {
    throw new Error('CLOUDINARY_URL is not set');
  }
  cloudinary.config(true);
}

/** New uploads use az-talkie/v2/…; legacy assets may still live under langify/v2/…. */
function folderForKey(key: string): string {
  if (key.startsWith('avatar.')) {
    return 'az-talkie/v2/avatars';
  }
  if (
    isCharacterKey(key) ||
    key === STYLE_ANCHOR_KEY ||
    key === STYLE_ANCHOR_OBJECT_KEY
  ) {
    return 'az-talkie/v2/characters';
  }
  return 'az-talkie/v2/images';
}

/** Legacy Cloudinary folders (pre-rename). Prefer URLs already stored on docs. */
export const LEGACY_CLOUDINARY_FOLDERS = [
  'langify/v2/avatars',
  'langify/v2/characters',
  'langify/v2/images',
] as const;

/** public_id without folder prefix — Cloudinary folder option adds it. */
function publicIdForKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._/-]/g, '_');
}

function localPublicUrl(filename: string): string {
  return `/api/v2/dev/local-images/${filename}`;
}

export function localImagePath(key: string): string {
  return path.join(LOCAL_DIR, safeImageFilename(key));
}

export async function uploadImage(opts: {
  key: string;
  buffer: Buffer;
  contentType?: string;
}): Promise<UploadResult> {
  if (cloudinaryConfigured()) {
    ensureCloudinary();
    const folder = folderForKey(opts.key);
    const publicId = publicIdForKey(opts.key);
    const uploaded = await new Promise<{
      secure_url: string;
      public_id: string;
      version?: number;
    }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          overwrite: true,
          invalidate: true,
          resource_type: 'image',
          format: 'png',
        },
        (err, result) => {
          if (err || !result) {
            reject(err ?? new Error('Cloudinary upload returned empty'));
            return;
          }
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
            version: result.version,
          });
        },
      );
      stream.end(opts.buffer);
    });
    return {
      url: uploaded.secure_url,
      public_id: uploaded.public_id,
      version: uploaded.version,
    };
  }

  // Local disk (dev) — URLs only work where /api/v2/dev/local-images is reachable
  console.warn(
    `[v2-images] CLOUDINARY_URL unset — saving ${opts.key} to local disk (${LOCAL_DIR}). ` +
      'Set CLOUDINARY_URL for production-usable URLs.',
  );
  mkdirSync(LOCAL_DIR, { recursive: true });
  const filename = safeImageFilename(opts.key);
  const out = path.join(LOCAL_DIR, filename);
  writeFileSync(out, opts.buffer);
  // Bust browser/CDN-less caches after overwrite (same path every time).
  const version = Date.now();
  return {
    url: `${localPublicUrl(filename)}?v=${version}`,
    public_id: opts.key,
    version,
  };
}

export function isLocalImageUrl(url: string): boolean {
  return url.startsWith('/api/v2/dev/local-images/');
}

export function resolveLocalPathFromUrl(url: string): string | null {
  if (!isLocalImageUrl(url)) return null;
  const pathPart = url
    .replace('/api/v2/dev/local-images/', '')
    .split('?')[0]!
    .split('#')[0]!;
  const filename = pathPart;
  if (!filename || filename.includes('..') || filename.includes('/')) return null;
  const full = path.join(LOCAL_DIR, filename);
  return existsSync(full) ? full : null;
}

export { cloudinaryConfigured };
