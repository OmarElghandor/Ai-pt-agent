import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/v2/auth';
import { getCurrentV2User, requireV2User } from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import { uploadImage } from '@/lib/v2/images/storage';

export const runtime = 'nodejs';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const result = await requireV2User();
  if (result.error) return result.error;

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'multipart form required' },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'file must be jpeg, png, or webp' },
      { status: 400 },
    );
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'file must be between 1 byte and 2MB' },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `avatar.${result.user.id}`;
  let uploaded;
  try {
    uploaded = await uploadImage({
      key,
      buffer,
      contentType: file.type,
    });
  } catch (err) {
    console.error('[v2/me/avatar] upload failed', err);
    return NextResponse.json({ error: 'upload failed' }, { status: 500 });
  }

  await auth.api.updateUser({
    body: { image: uploaded.url },
    headers: await headers(),
  });

  const user = await getCurrentV2User();
  return NextResponse.json({
    user: {
      image: user?.image ?? uploaded.url,
    },
  });
}
