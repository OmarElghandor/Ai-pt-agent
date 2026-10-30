'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';
import { ImageSlot } from '@/components/v2/ImageSlot';
import { NoteCard } from '@/components/v2/NoteCard';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import type { PackBeat, PracticePackData } from '@/lib/v2/content/pack';
import { toArDigits } from '@/lib/v2/formatAr';
import { ARTIFACT_KIND_AR } from '@/lib/v2/generation/pack/reading';
import { useMicRecorder } from '@/hooks/useMicRecorder';

const ACCENTS = ['ã', 'õ', 'ç', 'á', 'é', 'í', 'ó', 'ú', 'â', 'ê', 'ô', 'à'];

const SKILL_DOT: Record<string, string> = {
  listening: 'bg-v2-primary',
  reading: 'bg-[#6B3FC0]',
  speaking: 'bg-v2-action',
  writing: 'bg-[#C4AA30]',
};

type Bubble = {
  id: string;
  who: 'character' | 'learner' | 'narration';
  text: string;
  say?: string;
  muted?: boolean;
  amber?: boolean;
};

type EndState = {
  skill_counts: Record<string, { correct: number; total: number }>;
  focus?: string;
};

function newAnswerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PracticeSession({
  day,
  pack,
}: {
  day: number;
  pack: PracticePackData;
}) {
  const beats = pack.beats;
  const [index, setIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [writingMode, setWritingMode] = useState(false);
  const [text, setText] = useState('');
  const [coach, setCoach] = useState<string | null>(null);
  const [correction, setCorrection] = useState<{
    wrong: string;
    right: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealAudio, setRevealAudio] = useState(false);
  const [ended, setEnded] = useState<EndState | null>(null);
  const [phase, setPhase] = useState<
    'idle' | 'recording' | 'feedback' | 'correct'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [showCheck, setShowCheck] = useState(false);

  const mic = useMicRecorder({ language: 'pt-PT' });
  const beat: PackBeat | undefined = beats[index];

  const mission = pack.mission_eg ?? 'كمّل المحادثة';
  const charName = pack.character.name_eg ?? pack.character.name_tl;

  const skillDots = useMemo(
    () =>
      beats.map((b, i) => (
        <span key={b.id} className="relative inline-flex items-center">
          <span
            className={[
              'h-2 w-2 rounded-full',
              i <= index
                ? SKILL_DOT[b.skill] ?? 'bg-v2-primary'
                : 'bg-v2-rule',
            ].join(' ')}
          />
          {i < index || (i === index && showCheck) ? (
            <span
              className="absolute -end-0.5 -top-1 text-[9px] leading-none text-v2-success"
              aria-hidden
            >
              ✓
            </span>
          ) : null}
        </span>
      )),
    [beats, index, showCheck],
  );

  async function postAnswer(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/answers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        body: JSON.stringify({
          ...body,
          answer_id: newAnswerId(),
          session_id: sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          data.error === 'unauthorized'
            ? 'مفيش مستخدم — حط DEV_LANGIFY_USER_ID في .env وارجع شغّل npm run dev'
            : data.error || 'failed';
        setError(msg);
        throw new Error(msg);
      }
      if (data.session_id) setSessionId(data.session_id);
      return data as {
        verdict: string;
        correct: boolean;
        advance: boolean;
        character_tl?: string;
        coach_eg?: string;
        corrected_tl?: string;
        accent_note?: string;
        errors?: { wrong: string; right: string }[];
        next_beat_id?: string | null;
        skill_counts?: EndState['skill_counts'];
        items_used_correctly?: string[];
      };
    } finally {
      setBusy(false);
    }
  }

  function applyResult(
    data: Awaited<ReturnType<typeof postAnswer>>,
    learnerText: string,
  ) {
    setBubbles((prev) => [
      ...prev,
      {
        id: `l-${Date.now()}`,
        who: 'learner',
        text: learnerText,
        amber: data.verdict === 'near_miss' || data.verdict === 'wrong',
        muted: data.verdict === 'arabic_only',
      },
    ]);
    setCoach(data.coach_eg ?? data.accent_note ?? null);
    if (data.errors?.[0]) {
      setCorrection({
        wrong: data.errors[0].wrong,
        right: data.errors[0].right,
      });
    } else if (data.corrected_tl && !data.correct) {
      setCorrection({ wrong: learnerText, right: data.corrected_tl });
    } else {
      setCorrection(null);
    }

    if (data.correct || data.advance) {
      setPhase('correct');
      if (data.correct) setShowCheck(true);
      if (data.character_tl) {
        setBubbles((prev) => [
          ...prev,
          {
            id: `c-${Date.now()}`,
            who: 'character',
            text: data.character_tl!,
          },
        ]);
      }
      if (data.advance) {
        window.setTimeout(() => {
          if (data.next_beat_id) {
            const nextIdx = beats.findIndex((b) => b.id === data.next_beat_id);
            setIndex(nextIdx >= 0 ? nextIdx : index + 1);
            setWritingMode(false);
            setText('');
            setCoach(null);
            setCorrection(null);
            setRevealAudio(false);
            setShowCheck(false);
            setPhase('idle');
          } else {
            setEnded({
              skill_counts: data.skill_counts ?? {},
              focus: data.corrected_tl,
            });
          }
        }, 600);
      } else {
        setPhase('feedback');
      }
    } else {
      setPhase('feedback');
    }
  }

  async function submitClosed(optionId: string, label: string) {
    if (!beat || busy) return;
    try {
      const data = await postAnswer({
        kind: 'beat',
        day,
        beat_id: beat.id,
        skill: beat.skill,
        answer_source: 'text',
        option_id: optionId,
        text: label,
      });
      setRevealAudio(true);
      applyResult(data, label);
    } catch {
      // error state already set
    }
  }

  async function submitOpen(source: 'voice' | 'text', value: string) {
    if (!beat || busy || !value.trim()) return;
    const skill = writingMode ? 'writing' : beat.skill;
    try {
      const data = await postAnswer({
        kind: 'beat',
        day,
        beat_id: beat.id,
        skill,
        answer_source: source,
        text: value,
        switched_to_writing: writingMode && beat.skill === 'speaking',
      });
      applyResult(data, value);
      setText('');
    } catch {
      // error state already set
    }
  }

  async function onMic() {
    if (mic.recording) {
      const t = await mic.stopAndTranscribe();
      setPhase('idle');
      if (t) await submitOpen('voice', t);
      return;
    }
    setPhase('recording');
    await mic.start();
  }

  if (ended) {
    const counts = ended.skill_counts;
    const listen = counts.listening ?? { correct: 0, total: 0 };
    const read = counts.reading ?? { correct: 0, total: 0 };
    const speak = counts.speaking ?? { correct: 0, total: 0 };
    const write = counts.writing ?? { correct: 0, total: 0 };
    const understand = listen.correct + read.correct;
    const produce = speak.correct + write.correct;
    return (
      <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-4 py-6">
        <h1 className="font-[family-name:var(--font-v2-arabic)] text-2xl text-v2-primary">
          خلّصت المشهد
        </h1>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            ['🎧 سمع', listen],
            ['📖 قراءة', read],
            ['🎤 كلام', speak],
            ['✍️ كتابة', write],
          ].map(([label, c]) => (
            <div
              key={String(label)}
              className="rounded-v2-card bg-v2-card p-3 shadow-[var(--shadow-v2-soft)]"
            >
              <p className="font-[family-name:var(--font-v2-arabic)] text-sm">
                {label} {(c as { correct: number }).correct}/
                {(c as { total: number }).total}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 font-[family-name:var(--font-v2-arabic)] text-base">
          بتفهم +{understand} · بتقول +{produce}
        </p>
        {ended.focus ? (
          <p className="mt-3 rounded-v2-card bg-v2-highlight-fill px-3 py-2 font-[family-name:var(--font-v2-arabic)] text-sm">
            ركّز بكرة: {ended.focus}
          </p>
        ) : null}
        <Link
          href={`/day/${day}`}
          className="mt-6 inline-flex justify-center rounded-full bg-v2-action px-5 py-3 font-[family-name:var(--font-v2-arabic)] text-white"
        >
          رجوع للمسار
        </Link>
      </main>
    );
  }

  if (!beat) {
    return (
      <main className="px-4 py-8">
        <p>مفيش مشاهد.</p>
        <Link href={`/day/${day}`}>رجوع</Link>
      </main>
    );
  }

  const effectiveSkill =
    writingMode && beat.skill === 'speaking' ? 'writing' : beat.skill;
  const noteText =
    coach ||
    beat.frame_eg ||
    (effectiveSkill === 'listening' || effectiveSkill === 'reading'
      ? beat.question_eg
      : null);
  const showNote = Boolean(noteText || correction);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-[var(--color-v2-paper)] px-4">
      <header className="flex items-center gap-2 py-3">
        <Link
          href={`/day/${day}`}
          className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink"
        >
          إغلاق
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p
            className="truncate font-[family-name:var(--font-v2-target)] text-sm text-v2-primary"
            dir="ltr"
          >
            {pack.situation?.tl ?? `Dia ${day}`}
          </p>
          <p className="font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-ink-muted">
            خطوة {toArDigits(Math.min(index + 1, beats.length))} من{' '}
            {toArDigits(beats.length)}
          </p>
        </div>
      </header>

      <div>
        <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
          المهمة: {mission}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">{skillDots}</div>
      </div>

      <div className="mt-3 flex-1 space-y-3 overflow-y-auto pb-4">
        {beat.narration_eg ? (
          <p className="text-center font-[family-name:var(--font-v2-arabic)] text-sm italic text-v2-ink-muted">
            {beat.narration_eg}
          </p>
        ) : null}

        {beat.prompt_tl && effectiveSkill !== 'listening' ? (
          <CharacterBubble name={charName} text={beat.prompt_tl} />
        ) : null}

        {effectiveSkill === 'listening' && beat.audio_tl ? (
          <div className="max-w-[85%] rounded-2xl bg-white px-3 py-3 shadow-[var(--shadow-v2-soft)]">
            <div className="mb-1 flex items-center gap-2">
              <ImageSlot variant="avatar" size={32} />
              <span className="font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-ink-muted">
                {charName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AudioButton text={beat.audio_tl} />
              <span className="font-[family-name:var(--font-v2-arabic)] text-sm">
                اسمع تاني
              </span>
            </div>
            {revealAudio ? (
              <p
                className="mt-2 font-[family-name:var(--font-v2-target)] text-sm"
                dir="ltr"
              >
                {beat.audio_tl}
              </p>
            ) : null}
          </div>
        ) : null}

        {effectiveSkill === 'reading' && beat.artifact ? (
          <div className="rounded-v2-card border border-v2-rule bg-white p-3">
            <p className="mb-2 font-[family-name:var(--font-v2-arabic)] text-[10px] text-v2-ink-muted">
              {ARTIFACT_KIND_AR[beat.artifact.kind]}
            </p>
            {beat.artifact.lines.map((line, i) => (
              <p
                key={i}
                className="font-[family-name:var(--font-v2-target)] text-base text-v2-primary"
                dir="ltr"
              >
                {line.tl}
              </p>
            ))}
          </div>
        ) : null}

        {bubbles.map((b) =>
          b.who === 'character' ? (
            <CharacterBubble key={b.id} name={charName} text={b.text} amber={b.amber} muted={b.muted} />
          ) : (
            <div
              key={b.id}
              className={[
                'max-w-[85%] rounded-2xl px-3 py-2',
                b.who === 'learner'
                  ? 'ms-auto rounded-br-sm bg-v2-primary text-white'
                  : 'mx-auto bg-transparent',
                b.muted ? 'opacity-60' : '',
              ].join(' ')}
            >
              <p
                className="font-[family-name:var(--font-v2-target)] text-[15px]"
                dir="ltr"
              >
                {b.amber ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-v2-attention" />
                    {b.text}
                  </span>
                ) : (
                  b.text
                )}
              </p>
            </div>
          ),
        )}
      </div>

      <div className="sticky bottom-0 space-y-2 border-t border-v2-rule bg-[var(--color-v2-paper)] py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-attention">
            {error}
          </p>
        ) : null}
        {showNote ? (
          <NoteCard skill={effectiveSkill}>
            <div className="space-y-1">
              {correction ? (
                <p className="font-[family-name:var(--font-v2-arabic)] text-sm">
                  <span className="line-through opacity-60">{correction.wrong}</span>
                  {' → '}
                  <span className="text-v2-attention" dir="ltr">
                    {correction.right}
                  </span>
                </p>
              ) : null}
              {noteText ? (
                <p className="font-[family-name:var(--font-v2-arabic)] text-sm">
                  {noteText}
                </p>
              ) : null}
            </div>
          </NoteCard>
        ) : null}

        {(effectiveSkill === 'listening' || effectiveSkill === 'reading') &&
        phase !== 'correct' ? (
          <div className="space-y-2">
            <div className="flex flex-col gap-2">
              {(beat.options ?? []).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void submitClosed(o.id, o.label)}
                  className="rounded-v2-card border border-v2-rule bg-white px-3 py-3 text-start font-[family-name:var(--font-v2-target)] active:bg-v2-highlight-fill"
                  dir="ltr"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {(effectiveSkill === 'speaking' || effectiveSkill === 'writing') &&
        phase !== 'correct' ? (
          <div className="space-y-2">
            {effectiveSkill === 'writing' || writingMode ? (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  dir="ltr"
                  className="w-full rounded-v2-card border border-v2-rule bg-white px-3 py-2 font-[family-name:var(--font-v2-target)] text-base"
                  placeholder="اكتب هنا…"
                />
                <div className="flex flex-wrap gap-1">
                  {ACCENTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className="rounded bg-v2-card px-2 py-1 font-[family-name:var(--font-v2-target)] text-sm"
                      onClick={() => setText((t) => t + a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <PrimaryButton
                  disabled={busy || !text.trim()}
                  onClick={() => void submitOpen('text', text)}
                >
                  إرسال
                </PrimaryButton>
              </>
            ) : (
              <>
                <PrimaryButton
                  disabled={busy || mic.transcribing}
                  onClick={() => void onMic()}
                >
                  {mic.recording
                    ? 'خلّصت'
                    : mic.transcribing
                      ? '…'
                      : 'اضغط واتكلم'}
                </PrimaryButton>
                {mic.error ? (
                  <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-attention">
                    {mic.error}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted underline"
                  onClick={() => setWritingMode(true)}
                >
                  مش قادر أتكلم دلوقتي
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function CharacterBubble({
  name,
  text,
  amber,
  muted,
}: {
  name: string;
  text: string;
  amber?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={[
        'max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-[var(--shadow-v2-soft)]',
        muted ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="mb-1 flex items-center gap-2">
        <ImageSlot variant="avatar" size={32} />
        <span className="font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-ink-muted">
          {name}
        </span>
      </div>
      <p
        className="font-[family-name:var(--font-v2-target)] text-[15px] text-v2-primary"
        dir="ltr"
      >
        {amber ? (
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-v2-attention" />
            {text}
          </span>
        ) : (
          text
        )}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <AudioButton text={text} />
        <span className="font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-ink-muted">
          معناها؟
        </span>
      </div>
    </div>
  );
}
