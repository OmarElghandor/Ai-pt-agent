import { NextResponse } from 'next/server';
import { isRegistryCharacter } from '@/lib/v2/characters/registry';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import {
  generateCharacterSheet,
  generateStyleAnchor,
  listCharacterImages,
  uploadImageBytes,
  STYLE_ANCHOR_KEY,
  getImageByKey,
} from '@/lib/v2/images';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const characters = await listCharacterImages();
  const styleAnchor = await getImageByKey(STYLE_ANCHOR_KEY);
  return NextResponse.json({
    characters,
    style_anchor: styleAnchor ?? {
      key: STYLE_ANCHOR_KEY,
      kind: 'style_anchor',
      status: 'missing',
    },
  });
}

export async function POST(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const contentType = req.headers.get('content-type') || '';

  // Multipart upload
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const id = String(form.get('id') || '');
    const file = form.get('file');
    if (!id || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'id and file are required' },
        { status: 400 },
      );
    }
    const key =
      id === STYLE_ANCHOR_KEY
        ? STYLE_ANCHOR_KEY
        : isRegistryCharacter(id)
          ? `character.${id}`
          : null;
    if (!key) {
      return NextResponse.json({ error: 'unknown id' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await uploadImageBytes({
      key,
      buffer,
      kind: id === STYLE_ANCHOR_KEY ? 'style_anchor' : 'character_ref',
    });
    return NextResponse.json({ ok: true, image: doc });
  }

  const body = (await req.json().catch(() => null)) as {
    action?: string;
    id?: string;
  } | null;
  if (!body?.action || !body.id) {
    return NextResponse.json(
      { error: 'action and id required' },
      { status: 400 },
    );
  }

  if (body.action === 'generate') {
    if (body.id === STYLE_ANCHOR_KEY) {
      const result = await generateStyleAnchor();
      return NextResponse.json({ ok: true, ...result });
    }
    if (!isRegistryCharacter(body.id)) {
      return NextResponse.json({ error: 'unknown character' }, { status: 400 });
    }
    const result = await generateCharacterSheet(body.id);
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
