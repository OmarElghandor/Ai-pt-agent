import { createHash } from 'node:crypto';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2LibraryEpisodeModel,
  V2LibrarySettingsModel,
  V2LibraryVoiceModel,
  V2LibraryVoiceTestModel,
} from '@/lib/v2/mongo/libraryModels';
import {
  isPlaceholderVoiceId,
  settingsCacheKey,
  stubElevenLabsClient,
  type ElevenLabsClient,
  type ElevenLabsSettings,
} from './elevenlabs';
import { LIBRARY_LANG, type BriefCastRow, type EpisodeStages } from './types';

function requireMongo() {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
}

export async function listVoicesAdmin(lang = LIBRARY_LANG) {
  requireMongo();
  await connectMongo();
  const voices = await V2LibraryVoiceModel()
    .find({ target_lang: lang })
    .sort({ kind: 1, key: 1 })
    .lean();
  const settings = await V2LibrarySettingsModel()
    .findOne({ target_lang: lang })
    .lean();
  return { voices, settings };
}

export async function updateVoice(
  key: string,
  patch: {
    elevenlabs_voice_id?: string;
    stability?: unknown;
    similarity?: unknown;
    style?: unknown;
    who?: string;
  },
  opts: { lang?: string; by?: string } = {},
) {
  const lang = opts.lang ?? LIBRARY_LANG;
  requireMongo();
  await connectMongo();
  const voice = await V2LibraryVoiceModel().findOne({ target_lang: lang, key });
  if (!voice) throw new Error('voice not found');
  const settingsChanged =
    patch.stability !== undefined ||
    patch.similarity !== undefined ||
    patch.style !== undefined ||
    patch.elevenlabs_voice_id !== undefined;
  Object.assign(voice, patch, { admin_edited: true, approved: false });
  await voice.save();
  if (settingsChanged) {
    await markEpisodesAudioStaleForVoice(key, lang);
  }
  return voice.toObject();
}

export async function updateLibrarySettings(
  patch: {
    model?: unknown;
    output_format?: unknown;
    monthly_char_limit?: unknown;
    speed_by_level?: Record<string, unknown>;
    check_script_text?: string;
  },
  opts: { lang?: string } = {},
) {
  const lang = opts.lang ?? LIBRARY_LANG;
  requireMongo();
  await connectMongo();
  const prev = await V2LibrarySettingsModel().findOne({ target_lang: lang });
  const modelChanged =
    patch.model !== undefined &&
    String(patch.model) !== String(prev?.model ?? '');
  await V2LibrarySettingsModel().findOneAndUpdate(
    { target_lang: lang },
    { $set: { ...patch, target_lang: lang } },
    { upsert: true },
  );
  if (modelChanged) {
    await V2LibraryEpisodeModel().updateMany(
      { target_lang: lang, 'stages.audio.status': { $ne: 'none' } },
      {
        $set: {
          'stages.audio.stale': true,
          'stages.audio.stale_reason': 'موديل الصوت اتغير، الصوت محتاج يتعمل تاني',
        },
      },
    );
  }
}

async function markEpisodesAudioStaleForVoice(voiceKey: string, lang: string) {
  const episodes = await V2LibraryEpisodeModel()
    .find({ target_lang: lang })
    .select('cast stages')
    .lean();
  const ids: string[] = [];
  for (const ep of episodes) {
    const cast = (ep.cast ?? []) as { voice_key?: string }[];
    if (cast.some((c) => c.voice_key === voiceKey)) {
      ids.push(String(ep._id));
    }
  }
  if (!ids.length) return;
  await V2LibraryEpisodeModel().updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        'stages.audio.stale': true,
        'stages.audio.stale_reason': `إعدادات صوت ${voiceKey} اتغيرت`,
      },
    },
  );
}

export async function setVoiceApproved(
  key: string,
  approved: boolean,
  opts: { lang?: string } = {},
) {
  const lang = opts.lang ?? LIBRARY_LANG;
  requireMongo();
  await connectMongo();
  await V2LibraryVoiceModel().updateOne(
    { target_lang: lang, key },
    {
      $set: {
        approved,
        approved_at: approved ? new Date() : null,
      },
    },
  );
}

/**
 * Play / cache the pt-PT check script for a voice.
 * Second call with same voice+model+settings hits cache (no ElevenLabs call).
 */
export async function testVoice(
  key: string,
  opts: {
    lang?: string;
    client?: ElevenLabsClient;
    upload?: (buf: Buffer, publicId: string) => Promise<string>;
  } = {},
): Promise<{ url: string; cached: boolean; calls: number }> {
  const lang = opts.lang ?? LIBRARY_LANG;
  requireMongo();
  await connectMongo();
  const voice = await V2LibraryVoiceModel()
    .findOne({ target_lang: lang, key })
    .lean();
  if (!voice) throw new Error('voice not found');
  if (isPlaceholderVoiceId(voice.elevenlabs_voice_id)) {
    throw new Error('voice id is still a placeholder');
  }
  const settingsDoc = await V2LibrarySettingsModel()
    .findOne({ target_lang: lang })
    .lean();
  const modelId = String(
    settingsDoc?.model ?? process.env.LIBRARY_TTS_MODEL ?? 'eleven_multilingual_v2',
  );
  const checkText = String(settingsDoc?.check_script_text ?? '').trim();
  if (!checkText) throw new Error('check script text is empty — enter it on the voices page');

  const settings: ElevenLabsSettings = {
    stability: Number(voice.stability) || 0.5,
    similarity_boost: Number(voice.similarity) || 0.75,
    style: Number(voice.style) || 0,
  };
  const settingsHash = createHash('sha1')
    .update(settingsCacheKey(key, modelId, settings) + '|' + checkText)
    .digest('hex');
  const existing = await V2LibraryVoiceTestModel()
    .findOne({
      target_lang: lang,
      voice_key: key,
      model: modelId,
      settings_hash: settingsHash,
    })
    .lean();
  if (existing?.audio_url) {
    return { url: existing.audio_url, cached: true, calls: 0 };
  }

  const client = opts.client ?? stubElevenLabsClient();
  const result = await client.textToSpeechWithTimestamps({
    voiceId: String(voice.elevenlabs_voice_id),
    text: checkText,
    modelId,
    settings,
  });
  const publicId = `langify/v2/library/voice-tests/${key}-${settingsHash.slice(0, 10)}`;
  const url = opts.upload
    ? await opts.upload(result.audio, publicId)
    : `stub://${publicId}`;
  await V2LibraryVoiceTestModel().findOneAndUpdate(
    {
      target_lang: lang,
      voice_key: key,
      model: modelId,
      settings_hash: settingsHash,
    },
    {
      $set: {
        target_lang: lang,
        voice_key: key,
        model: modelId,
        settings_hash: settingsHash,
        audio_url: url,
        chars: checkText.length,
      },
    },
    { upsert: true },
  );
  return { url, cached: false, calls: 1 };
}

/** Assign unused pool voices of the right gender; never reuse within one cast. */
export function assignPoolVoices(
  cast: BriefCastRow[],
  pool: { key: string; gender: 'm' | 'f'; approved: boolean }[],
  genderByKey: Map<string, 'm' | 'f' | undefined>,
): BriefCastRow[] {
  const used = new Set(cast.map((c) => c.voice_key));
  return cast.map((row) => {
    if (!row.voice_key.startsWith('pool_')) return row;
    if (!row.voice_key.match(/^pool_[mf]_\d+$/) && used.has(row.voice_key)) {
      return row;
    }
    // If already a concrete pool_* key that's unique, keep it.
    if (/^pool_[mf]_\d+$/.test(row.voice_key) && used.has(row.voice_key)) {
      // ensure uniqueness later
    }
    const want =
      genderByKey.get(row.voice_key) ??
      (row.voice_key.includes('_f_') ? 'f' : 'm');
    const pick = pool.find(
      (p) => p.gender === want && p.approved && !used.has(p.key),
    );
    if (!pick) return row;
    used.delete(row.voice_key);
    used.add(pick.key);
    return { ...row, voice_key: pick.key };
  });
}

/** Ensure no two cast rows share the same pool voice. */
export function ensureUniquePoolVoices(
  cast: BriefCastRow[],
  pool: { key: string; gender: 'm' | 'f' }[],
): BriefCastRow[] {
  const seen = new Set<string>();
  const next = [...cast];
  for (let i = 0; i < next.length; i++) {
    const key = next[i].voice_key;
    if (!key.startsWith('pool_')) {
      seen.add(key);
      continue;
    }
    if (!seen.has(key)) {
      seen.add(key);
      continue;
    }
    const gender = key.includes('_f_') ? 'f' : 'm';
    const alt = pool.find((p) => p.gender === gender && !seen.has(p.key));
    if (alt) {
      next[i] = { ...next[i], voice_key: alt.key };
      seen.add(alt.key);
    }
  }
  return next;
}

export function voicesCheckStatus(
  cast: { voice_key: string }[],
  voices: {
    key: string;
    elevenlabs_voice_id?: string | null;
    approved: boolean;
  }[],
): 'ok' | 'missing' {
  const byKey = new Map(voices.map((v) => [v.key, v]));
  for (const c of cast) {
    const v = byKey.get(c.voice_key);
    if (!v || isPlaceholderVoiceId(v.elevenlabs_voice_id) || !v.approved) {
      return 'missing';
    }
  }
  return 'ok';
}

export async function refreshEpisodeVoicesCheck(
  slug: string,
  opts: { lang?: string } = {},
) {
  const lang = opts.lang ?? LIBRARY_LANG;
  requireMongo();
  await connectMongo();
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 });
  if (!episode) throw new Error('not found');
  const voices = await V2LibraryVoiceModel().find({ target_lang: lang }).lean();
  const status = voicesCheckStatus(
    (episode.cast as { voice_key: string }[]) ?? [],
    voices as {
      key: string;
      elevenlabs_voice_id?: string | null;
      approved: boolean;
    }[],
  );
  episode.stages = {
    ...episode.stages,
    voices: {
      status,
      stale: false,
      updated_at: new Date(),
    },
  } as EpisodeStages;
  episode.markModified('stages');
  await episode.save();
  return status;
}
