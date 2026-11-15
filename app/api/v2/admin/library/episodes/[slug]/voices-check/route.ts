import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured, connectMongo } from '@/lib/mongo';
import {
  V2LibraryEpisodeModel,
  V2LibraryVoiceModel,
} from '@/lib/v2/mongo/libraryModels';
import {
  ensureUniquePoolVoices,
  refreshEpisodeVoicesCheck,
} from '@/lib/v2/library/voiceAdmin';
import { LIBRARY_LANG } from '@/lib/v2/library/types';
import { isPlaceholderVoiceId } from '@/lib/v2/library/elevenlabs';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  await connectMongo();
  const { slug } = await ctx.params;
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: LIBRARY_LANG, slug })
    .sort({ version: -1 })
    .lean();
  if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const voices = await V2LibraryVoiceModel().find({ target_lang: LIBRARY_LANG }).lean();
  const cast = ((episode.cast as { voice_key: string; role_eg?: string }[]) ?? []).map(
    (c) => {
      const v = voices.find((x) => x.key === c.voice_key);
      return {
        ...c,
        elevenlabs_voice_id: v?.elevenlabs_voice_id ?? null,
        placeholder: isPlaceholderVoiceId(v?.elevenlabs_voice_id),
        approved: !!v?.approved,
        gender: v?.gender ?? null,
      };
    },
  );
  return NextResponse.json({
    cast,
    stages: episode.stages,
    pool: voices.filter((v) => v.kind === 'pool'),
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  await connectMongo();
  const { slug } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: 'refresh' | 'swap' | 'assign_pools';
    from_key?: string;
    to_key?: string;
  };
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: LIBRARY_LANG, slug })
    .sort({ version: -1 });
  if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (body.action === 'swap' && body.from_key && body.to_key) {
    const cast = (episode.cast as { voice_key: string }[]).map((c) =>
      c.voice_key === body.from_key ? { ...c, voice_key: body.to_key! } : c,
    );
    episode.cast = cast;
    episode.markModified('cast');
    await episode.save();
  }
  if (body.action === 'assign_pools') {
    const voices = await V2LibraryVoiceModel()
      .find({ target_lang: LIBRARY_LANG, kind: 'pool' })
      .lean();
    const pool = voices.map((v) => ({
      key: v.key,
      gender: (v.gender as 'm' | 'f') ?? 'm',
    }));
    episode.cast = ensureUniquePoolVoices(
      (episode.cast as { voice_key: string; role_eg: string; learner: boolean }[]) ??
        [],
      pool,
    );
    episode.markModified('cast');
    await episode.save();
  }
  const status = await refreshEpisodeVoicesCheck(slug);
  return NextResponse.json({ ok: true, status });
}
