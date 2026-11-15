import { LINE_RANGE_BY_LEVEL, MAX_NOTES, MIN_SCRIPT_LINES } from '../scriptChecks';
import type { BriefMoment, LibraryType } from '../types';

/**
 * Library script prompt (14d §4, 14 §2.3-2.6, 14c §2).
 * Rules only: no Portuguese or Arabic example content lives here.
 * Bump PROMPT_VERSION on every wording change; it is stored on the episode.
 */
export const PROMPT_VERSION = 'library-script-v1';

export type ScriptPromptCastRow = {
  voice_key: string;
  role_eg: string;
  learner: boolean;
  gender?: 'm' | 'f' | null;
};

export type ScriptPromptBrief = {
  type: LibraryType;
  target_level: number;
  intro_eg: string;
  cast: ScriptPromptCastRow[];
  places: string[];
  beats: string[];
  must_have_phrases: string[];
  moments: Pick<BriefMoment, 'id' | 'eg' | 'direction' | 'must_say'>[];
};

const LEVEL_TARGETS: Record<number, string> = {
  1: 'Level 1 (very easy): about 3 minutes; slow speech; short sentences with one idea each; mostly the 500 most common words; present tense and a few fixed chunks.',
  2: 'Level 2 (easy): about 3-4 minutes; slow-normal speech; short sentences; the top 1000 words; present tense, near future with the going-to construction, and the simple past of a few verbs.',
  3: 'Level 3 (medium): about 4 minutes; normal speech; medium sentences; the top 1000 words plus situation words; adds the simple past and the imperfect in fixed uses.',
  4: 'Level 4 (a bit harder): about 4-5 minutes; normal speech; medium-long sentences; adds less common words; all common tenses, and the conditional for politeness.',
  5: 'Level 5 (hard): about 5 minutes; natural speech; long sentences, interruptions and two topics; natural vocabulary; every tense.',
};

export function levelTargetText(level: number): string {
  return LEVEL_TARGETS[level] ?? LEVEL_TARGETS[3];
}

export function lineRangeText(level: number): string {
  const r = LINE_RANGE_BY_LEVEL[level] ?? LINE_RANGE_BY_LEVEL[3];
  return `${r[0]}-${r[1]}`;
}

/** Static rules; only the level and type vary. */
export function buildSystem(opts: { target_level: number; type: LibraryType }): string {
  const { target_level: level, type } = opts;
  const typeRule =
    type === 'story'
      ? 'This is a STORY: an illustrated real scene with 2-3 people. A short narrator line is allowed only where it helps, and only if a narrator is in the cast. Split the story into scenes (1 to 3) and give every line its scene number. A "heard" moment may use one extra speaker for 1-2 lines only if that speaker is in the cast.'
      : 'This is a PODCAST: audio-first, usually a phone call, a voice-message thread or two friends talking. Use scene 1 for every line. If no cast member is the learner, real-moment directions do not apply.';

  return `You write one complete listening script for a language-learning library of real-life episodes. The target language is European Portuguese (pt-PT). The learners are Arabic speakers.

GOAL
- Real exposure, not a controlled lesson. Words, sentences and facts outside the curriculum are welcome, as long as the level targets below roughly hold.
- The scene goes from start to end, following the beats in order. No cut after the first exchange.
- The other people talk like real people: fast fillers, questions the learner did not expect, small misunderstandings and repairs.

${typeRule}

LEVEL TARGET
${levelTargetText(level)}
Aim for about ${lineRangeText(level)} lines in total. Never fewer than ${MIN_SCRIPT_LINES}.

LINES
- Every line has: "speaker" (a voice_key copied exactly from the cast list; never invent one), "tl" (the target-language line), "ar" (its meaning), "scene" (integer starting at 1), "moment" (the id of the real moment the line belongs to, or an empty string for the main flow).
- "tl" is written in correct pt-PT as people in Portugal really speak. Plain text only: no "/" characters (no slash alternatives), no stage directions, no speaker names inside the text.
- "ar" is a simple Modern Standard Arabic meaning of the line, one sentence per line, no dialect. It must be present on every line.
- Formality: use the polite forms with strangers, shop staff, pharmacists, landlords and older people. Informal forms are normal between friends, people of the same age, and in places such as a gym. Stay consistent for each pair of speakers.
- The learner is a character (the cast row with learner=true). Write the learner's lines in the masculine form in "tl". Add "tl_f" (the feminine-speaker version) only on learner lines where the form differs by the speaker's gender; otherwise omit it.
- No real brand, shop, company or person names. Keep places generic.
- Each line is something one person can say in one breath. Do not pack several turns into one line.

REAL MOMENTS
- The brief lists real moments. Each is a short exchange of 1-4 lines inside the main flow, about something practical that really happens in that place. It is not a new scene and it does not stop the story.
- Every moment in the brief MUST appear: tag each of its lines with the moment id. A moment's lines are normally consecutive.
- The moment is described in Egyptian Arabic as a situation. You write the target-language lines the way people in Portugal would really say it.
- Directions: "learner asks" means the learner asks the question; "learner is asked" means someone asks the learner; "learner hears" means a short exchange between two other people that the learner understands from context. Mix the directions as the brief states them.
- If a moment has a "must_say" phrase, use it word for word, unchanged, in one of that moment's lines.

LANGUAGE NOTES
- Optionally add 0 to ${MAX_NOTES} notes: short Egyptian Arabic remarks placed between lines about how people really use something, or a small cultural fact. They never interrupt the audio.
- Each note has "after_line" (the 0-based index of the line it comes after), "eg" (1-2 sentences of Egyptian Arabic as an array of segments) and an optional "focus" (an array of target-language words or phrases the note is about; each must appear in the line at after_line, exactly as written there).
- Segments: {"text": string, "lang": "eg" or "tl", "bold": optional true}. Egyptian words use lang "eg"; target-language words use lang "tl". Never mix two languages inside one segment.
- Do not compare European and Brazilian Portuguese.

OUTPUT
Reply with one JSON object only:
{
  "title_tl": "<short episode title in the target language>",
  "title_ar": "<the same title in simple Modern Standard Arabic>",
  "lines": [
    {"speaker": "<voice_key>", "tl": "<line>", "tl_f": "<optional>", "ar": "<meaning>", "scene": 1, "moment": ""}
  ],
  "notes": [
    {"after_line": 0, "eg": [{"text": "<Egyptian text>", "lang": "eg"}], "focus": ["<target-language words>"]}
  ]
}`;
}

/** The brief, as data. Egyptian text is passed through untouched. */
export function buildUser(brief: ScriptPromptBrief): string {
  const payload = {
    type: brief.type,
    target_level: brief.target_level,
    setup_eg: brief.intro_eg,
    cast: brief.cast.map((c) => ({
      voice_key: c.voice_key,
      role_eg: c.role_eg,
      learner: c.learner,
      gender: c.gender ?? null,
    })),
    places: brief.places,
    beats_in_order: brief.beats,
    must_have_phrases: brief.must_have_phrases,
    real_moments: brief.moments.map((m) => ({
      id: m.id,
      situation_eg: m.eg,
      direction: m.direction,
      must_say: m.must_say || null,
    })),
  };
  return `Write the script for this episode brief.

BRIEF (JSON)
${JSON.stringify(payload, null, 2)}

Follow every beat in order, include every real moment with its id on its lines, and use every must-have phrase and every must_say word for word. Speakers must be voice_keys from the cast.`;
}

/** Rough size of a full call, for the admin button tooltip. Placeholder maths. */
export function estimateTokens(brief: ScriptPromptBrief): {
  input_tokens: number;
  output_tokens: number;
} {
  const chars =
    buildSystem({ target_level: brief.target_level, type: brief.type }).length +
    buildUser(brief).length;
  const r = LINE_RANGE_BY_LEVEL[brief.target_level] ?? LINE_RANGE_BY_LEVEL[3];
  const lines = Math.round((r[0] + r[1]) / 2);
  return {
    input_tokens: Math.ceil(chars / 4),
    // ~60 output tokens per line (tl + ar + keys) plus notes and title.
    output_tokens: lines * 60 + 300,
  };
}
