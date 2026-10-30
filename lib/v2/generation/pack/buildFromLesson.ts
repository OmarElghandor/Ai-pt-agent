import type { Item } from '@/lib/v2/content/items';
import type { LessonPack } from '@/lib/v2/content/lesson';
import type { PackBeat, PracticePackData } from '@/lib/v2/content/pack';
import { skillMixCounts } from '@/lib/v2/content/validatePack';
import { buildAcceptedVariants, expectedTlFromIds } from './accepted';
import { pickCharacterTl } from './characterTl';
import { buildMeaningOptions } from './options';
import { buildReadingQuestion } from './reading';

const CHARACTERS: Record<
  string,
  { id: string; name_tl: string; name_eg: string; role_eg: string }
> = {
  rita: {
    id: 'rita',
    name_tl: 'Rita',
    name_eg: 'ريتا',
    role_eg: 'موظفة في السوبر ماركت',
  },
  ines: {
    id: 'ines',
    name_tl: 'Inês',
    name_eg: 'إنِس',
    role_eg: 'صاحبة برتغالية',
  },
};

function phraseItems(items: Item[], role: 'heard' | 'said'): Item[] {
  return items.filter(
    (i) =>
      i.type === 'phrase' &&
      (i as { role?: string }).role === role &&
      !(i as { derived?: boolean }).derived,
  );
}

/** Non-phrase bank items safe for prompt_ids (not "said" phrases). */
function wordItems(items: Item[]): Item[] {
  return items.filter(
    (i) => i.type === 'word' && !(i as { derived?: boolean }).derived,
  );
}

/** Items allowed on character / prompt side: heard phrases + words. */
function promptBank(items: Item[]): Item[] {
  return [...phraseItems(items, 'heard'), ...wordItems(items)];
}

/**
 * Deterministic pack from a published lesson (pilot / assemble fallback).
 * Uses day items only — no new ids.
 */
export function buildPackFromLesson(opts: {
  day: number;
  lesson: LessonPack;
  chatCharacter?: string;
  targetLang?: string;
  beatCount?: number;
}): PracticePackData {
  const day = opts.day;
  const ns = `pack.d${String(day).padStart(2, '0')}`;
  const items = opts.lesson.items ?? [];
  const heard = phraseItems(items, 'heard');
  const said = phraseItems(items, 'said');
  const words = wordItems(items);
  const prompts = promptBank(items);
  const byId = new Map(items.map((i) => [i.id, i]));

  const total = opts.beatCount ?? 10;
  const mix = skillMixCounts(total);
  const charKey = (opts.chatCharacter ?? 'rita').toLowerCase();
  const character = CHARACTERS[charKey] ?? CHARACTERS.rita!;

  const situation = opts.lesson.lesson.situation;
  const beats: PackBeat[] = [];
  let bi = 0;

  const take = <T>(arr: T[], i: number): T | undefined =>
    arr.length ? arr[i % arr.length] : undefined;

  const nextHeardTl = (i: number) => {
    const h = take(heard, i + 1);
    const preferred =
      h && 'tl' in h ? String((h as { tl?: string }).tl ?? '') : undefined;
    return pickCharacterTl(preferred, items, i);
  };

  const pushListening = (n: number) => {
    for (let i = 0; i < n; i++) {
      const h = take(prompts, i);
      if (!h) continue;
      const tl = 'tl' in h ? String(h.tl) : '';
      beats.push({
        id: `${ns}.b${String(++bi).padStart(2, '0')}`,
        skill: 'listening',
        prompt_ids: [h.id],
        expected_ids: [],
        audio_tl: tl,
        question_eg: 'سمعت إيه؟',
        options: buildMeaningOptions(h.id, items, 3),
        coach_fallback_eg: 'اسمع تاني وجرّب.',
        next_character_tl: nextHeardTl(i),
      });
    }
  };

  const pushReading = (n: number) => {
    const kinds = ['first', 'last', 'missing'] as const;
    for (let i = 0; i < n; i++) {
      const start = i % Math.max(words.length, 1);
      const lineItems = words.slice(start, start + 3);
      const use = lineItems.length
        ? lineItems
        : words.length
          ? words.slice(0, Math.min(3, words.length))
          : prompts.slice(0, Math.min(2, prompts.length));
      if (!use.length) continue;
      const artifact = {
        kind: (i % 2 === 0 ? 'receipt' : 'label') as 'receipt' | 'label',
        lines: use.map((u) => ({
          tl: 'tl' in u ? String(u.tl) : u.id,
          ids: [u.id],
        })),
      };
      const qKind = kinds[i % kinds.length]!;
      const built = buildReadingQuestion({
        kind: qKind,
        artifact,
        bank: items,
        optionCount: 3,
      });
      if (!built) continue;
      beats.push({
        id: `${ns}.b${String(++bi).padStart(2, '0')}`,
        skill: 'reading',
        prompt_ids: use.map((u) => u.id),
        expected_ids: [],
        artifact,
        question_eg: built.question_eg,
        options: built.options,
        coach_fallback_eg: 'بص تاني على اللي مكتوب.',
        next_character_tl: pickCharacterTl(undefined, items, i),
      });
    }
  };

  const pushSpeakWrite = (skill: 'speaking' | 'writing', n: number) => {
    for (let i = 0; i < n; i++) {
      const s = take(said, i) ?? take(words, i);
      if (!s) continue;
      const prompt = take(prompts, i);
      const expectedIds = [s.id];
      const expected_tl =
        expectedTlFromIds(expectedIds, byId) || String(s.tl);
      beats.push({
        id: `${ns}.b${String(++bi).padStart(2, '0')}`,
        skill,
        prompt_ids: prompt ? [prompt.id] : [],
        expected_ids: expectedIds,
        prompt_tl: prompt && 'tl' in prompt ? String(prompt.tl) : undefined,
        expected_tl,
        accepted: buildAcceptedVariants(expected_tl),
        frame_eg: skill === 'speaking' ? 'قول الجملة' : 'اكتب الرد',
        coach_fallback_eg: 'جرّب تاني بالبرتغالي.',
        next_character_tl: nextHeardTl(i),
      });
    }
  };

  pushListening(mix.listening);
  pushReading(mix.reading);
  pushSpeakWrite('speaking', mix.speaking);
  pushSpeakWrite('writing', mix.writing);

  // Ensure 8–14
  while (beats.length < 8 && said.length + heard.length > 0) {
    pushSpeakWrite('speaking', 1);
  }
  const trimmed = beats.slice(0, 14);

  return {
    day,
    target_lang: opts.targetLang ?? 'pt-PT',
    character,
    situation: situation
      ? { tl: situation.tl, eg: situation.eg }
      : undefined,
    mission_eg: 'كمّل المحادثة في السوبر ماركت',
    skill_mix: {
      speaking: 0.3,
      listening: 0.3,
      reading: 0.2,
      writing: 0.2,
    },
    beats: trimmed,
  };
}
