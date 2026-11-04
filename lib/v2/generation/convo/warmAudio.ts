import { readCachedAudio, storeCachedAudio } from '@/lib/audioCache';
import { speakSegment, TTSNotConfiguredError } from '@/lib/tts';
import type { ConvoPackData } from '@/lib/v2/convo/pack/schema';

export type WarmConvoAudioResult = {
  cached: number;
  skipped: number;
  failed: number;
  /** Character (pt) lines failed. */
  failed_pt: number;
  /** Coach (ar) lines failed — often RunPod paused. */
  failed_ar: number;
};

type Segment = { lang: 'pt' | 'ar'; text: string };

function collectConvoSegments(pack: ConvoPackData): Segment[] {
  const out: Segment[] = [];
  const seen = new Set<string>();
  const add = (lang: 'pt' | 'ar', text: string | undefined) => {
    const t = text?.trim();
    if (!t) return;
    const key = `${lang}\0${t}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ lang, text: t });
  };

  add('pt', pack.opening.tl);
  add('ar', pack.opening.say);
  add('pt', pack.closing.tl);
  add('ar', pack.closing.say);
  add('pt', pack.bridge.tl);
  add('ar', pack.bridge.say);

  for (const q of pack.recap.questions) {
    add('pt', q.tl);
  }

  for (const bank of Object.values(pack.items)) {
    add('ar', bank.coach_intro_eg);
    if (bank.memory_trick_eg) add('ar', bank.memory_trick_eg);
    for (const q of bank.choice_questions) add('pt', q.tl);
    for (const q of bank.open_questions) {
      add('pt', q.tl);
      if (q.help_ladder) {
        add('pt', q.help_ladder.step1_reask_tl);
        add('ar', q.help_ladder.step2_hint_eg);
      }
    }
    for (const m of bank.common_mistakes) {
      add('ar', m.coach_note_eg);
    }
  }

  return out;
}

/** Warm TTS cache for every fixed convo line (character pt + coach eg). */
export async function warmConvoPackAudio(
  pack: ConvoPackData,
): Promise<WarmConvoAudioResult> {
  let cached = 0;
  let skipped = 0;
  let failed = 0;
  let failed_pt = 0;
  let failed_ar = 0;

  for (const seg of collectConvoSegments(pack)) {
    if (readCachedAudio(seg.lang, seg.text)) {
      skipped += 1;
      continue;
    }
    try {
      const result = await speakSegment({ lang: seg.lang, text: seg.text });
      storeCachedAudio(seg.lang, seg.text, result);
      cached += 1;
    } catch (err) {
      failed += 1;
      if (seg.lang === 'pt') failed_pt += 1;
      else failed_ar += 1;
      if (!(err instanceof TTSNotConfiguredError)) {
        console.warn('[v2-convo-warm]', seg.lang, seg.text.slice(0, 40), err);
      }
    }
  }

  return { cached, skipped, failed, failed_pt, failed_ar };
}
