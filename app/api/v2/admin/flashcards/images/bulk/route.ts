import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import {
  bulkEnqueueFlashcardImages,
  previewBulkFlashcardImages,
  type BulkImagesKind,
} from '@/lib/v2/decks/bulkImages';
import { drainDeckImageJobs } from '@/lib/v2/generation/drainImages';
import { cloudinaryConfigured } from '@/lib/v2/images/storage';

export const runtime = 'nodejs';
export const maxDuration = 300;

function parseKind(v: unknown): BulkImagesKind | null {
  if (v === 'custom' || v === 'official') return v;
  return null;
}

/** Preview missing + cost for selected decks. */
export async function GET(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const url = new URL(req.url);
  const kind = parseKind(url.searchParams.get('kind'));
  const deck_ids = url.searchParams.getAll('deck_id').filter(Boolean);
  if (!kind) {
    return NextResponse.json({ error: 'kind must be custom|official' }, { status: 400 });
  }
  if (!deck_ids.length) {
    return NextResponse.json({ error: 'deck_id required' }, { status: 400 });
  }
  const preview = await previewBulkFlashcardImages({ kind, deck_ids });
  return NextResponse.json(preview);
}

export async function POST(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as {
    kind?: unknown;
    deck_ids?: unknown;
    confirm_over_cap?: boolean;
  } | null;

  const kind = parseKind(body?.kind);
  const deck_ids = Array.isArray(body?.deck_ids)
    ? body.deck_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];

  if (!kind) {
    return NextResponse.json({ error: 'kind must be custom|official' }, { status: 400 });
  }
  if (!deck_ids.length) {
    return NextResponse.json({ error: 'deck_ids required' }, { status: 400 });
  }

  const result = await bulkEnqueueFlashcardImages({
    kind,
    deck_ids,
    confirm_over_cap: Boolean(body?.confirm_over_cap),
  });

  if (!result.ok) {
    const status =
      result.reason === 'needs_confirm_over_cap'
        ? 409
        : result.reason === 'no_decks'
          ? 400
          : 400;
    return NextResponse.json(result, { status });
  }

  const storage = cloudinaryConfigured() ? 'cloudinary' : 'local';
  const started = result.totals.enqueued > 0;
  if (started) {
    void drainDeckImageJobs()
      .then((n) => {
        console.info(
          '[v2-admin flashcards images bulk] drain done',
          `processed=${n}`,
          `enqueued=${result.totals.enqueued}`,
        );
      })
      .catch((err) => {
        console.error(
          '[v2-admin flashcards images bulk] drain failed',
          err instanceof Error ? err.message : err,
        );
      });
  }

  return NextResponse.json({
    ...result,
    started,
    storage,
    message: started
      ? 'Image jobs enqueued. Drain started in background.'
      : 'No images to generate.',
  });
}
