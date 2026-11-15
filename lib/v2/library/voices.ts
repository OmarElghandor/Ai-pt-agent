import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2LibraryVoiceModel } from '@/lib/v2/mongo/libraryModels';
import { LIBRARY_LANG } from './types';

export type RegistryVoice = {
  key: string;
  who: string;
  gender: 'm' | 'f' | null;
  kind: string;
  approved: boolean;
};

/** Registry for the cast dropdown. Never exposes ElevenLabs ids. */
export async function listVoiceRegistry(
  lang: string = LIBRARY_LANG,
): Promise<RegistryVoice[]> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const docs = await V2LibraryVoiceModel()
    .find({ target_lang: lang })
    .sort({ kind: 1, key: 1 })
    .lean();
  return docs.map((v) => ({
    key: v.key,
    who: v.who ?? '',
    gender: (v.gender as 'm' | 'f' | undefined) ?? null,
    kind: v.kind,
    approved: Boolean(v.approved),
  }));
}
