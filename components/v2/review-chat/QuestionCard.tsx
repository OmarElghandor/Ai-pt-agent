'use client';

import { AudioButton } from '@/components/v2/AudioButton';
import { ImageSlot } from '@/components/v2/ImageSlot';
import { toArDigits } from '@/lib/v2/formatAr';
import type { ReviewQuestion } from '@/lib/v2/review-chat/types';
import { CoachMessage } from './CoachMessage';
import { AudioPrompt } from './AudioPrompt';
import { BlankSentence } from './BlankSentence';
import { ImageGrid } from './ImageGrid';
import { QuotedMessage } from './QuotedMessage';
import { ReadingCard } from './ReadingCard';
import { SituationBox } from './SituationBox';
import { SlotLine } from './SlotLine';

const SKILL_AR: Record<string, string> = {
  listening: 'استماع',
  reading: 'قراءة',
  writing: 'كتابة',
  speaking: 'كلام',
  grammar: 'قواعد',
};

function optionList(q: ReviewQuestion): Array<{ ar?: string; tl?: string }> {
  const raw = q.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((o) =>
    o && typeof o === 'object'
      ? (o as { ar?: string; tl?: string })
      : { ar: String(o) },
  );
}

type Props = {
  question?: ReviewQuestion;
  lessonDay?: number;
  stepInRound?: number;
  stepsInRound?: number;
  compact?: boolean;
  audioText?: string;
};

export function QuestionCard({
  question,
  lessonDay,
  stepInRound,
  stepsInRound,
  compact,
  audioText,
}: Props) {
  if (!question) return null;
  const type = String(question.type ?? '');
  const skill = SKILL_AR[String(question.skill ?? 'reading')] ?? 'مراجعة';
  const opts = optionList(question);
  const promptEg = String(question.prompt_eg ?? '');
  const promptTl = String(question.prompt_tl ?? '');
  const reading = question.reading as
    | { kind?: string; lines?: { tl?: string; price?: string }[]; total?: string }
    | undefined;

  const body = (
    <div
      className={[
        'w-full space-y-3 rounded-[28px] rounded-tr-sm border border-v2-line bg-v2-paper p-4 shadow-sm',
        compact ? 'opacity-95' : '',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-v2-panel px-2.5 py-1 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-primary">
          {skill}
        </span>
        {lessonDay ? (
          <span
            className="rounded-full border border-v2-line px-2.5 py-1 font-[family-name:var(--font-v2-ui)] text-xs text-v2-ink-muted"
            dir="ltr"
          >
            Dia {lessonDay}
          </span>
        ) : null}
        {stepInRound && stepsInRound ? (
          <span className="ms-auto font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-meta">
            السؤال {toArDigits(stepInRound)} من {toArDigits(stepsInRound)}
          </span>
        ) : null}
      </div>

      {(type === 'listen_meaning' ||
        type === 'listen_pick_tl' ||
        type === 'dictation') &&
      (audioText || question.accepted?.[0]) ? (
        <AudioPrompt text={audioText ?? String(question.accepted?.[0])} />
      ) : null}

      {type === 'listen_pick_image' && compact ? (
        <ImageGrid
          cells={opts.map((o, i) => ({
            id: String(i),
            label: o.tl ?? o.ar ?? '',
          }))}
          disabled
        />
      ) : null}

      {type === 'situation_choice' && question.situation_eg ? (
        <SituationBox text={String(question.situation_eg)} />
      ) : null}

      {type === 'read_meaning' && reading ? (
        <ReadingCard
          kind={reading.kind}
          lines={reading.lines}
          total={reading.total}
        />
      ) : null}

      {type === 'pick_meaning' && question.prompt_tl ? (
        <div className="flex items-center justify-between rounded-xl bg-v2-panel p-3">
          <div className="flex items-center gap-2" dir="ltr">
            <AudioButton text={String(question.prompt_tl)} size="chip" />
            <span className="font-[family-name:var(--font-v2-target)] text-base font-semibold">
              {String(question.prompt_tl)}
            </span>
          </div>
          <span className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            معناها إيه؟
          </span>
        </div>
      ) : null}

      {type === 'pick_tl' && question.prompt_ar ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-v2-ink">
          {String(question.prompt_ar)}
          <span className="mt-1 block text-sm font-normal text-v2-ink-muted">
            بالبرتغالي تكون؟
          </span>
        </p>
      ) : null}

      {(type === 'choose_article' || type === 'complete_phrase' || type === 'fill_blank_choice') &&
      promptTl ? (
        <BlankSentence template={promptTl.includes('___') ? promptTl : `${promptTl.replace(/_$/, '')} ___`} />
      ) : null}

      {type === 'fill_blank_choice' && question.rule_chip ? (
        <span className="inline-flex rounded-full bg-v2-panel px-2.5 py-1 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
          {String(question.rule_chip)}
        </span>
      ) : null}

      {type === 'build_sentence' ? (
        <>
          {promptEg ? (
            <p className="font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-v2-ink">
              {promptEg}
            </p>
          ) : null}
          <SlotLine labels={['…', '…', '…', '…']} />
        </>
      ) : null}

      {(type === 'fill_blank_write' || type === 'dictation') && promptTl ? (
        <BlankSentence template={promptTl} />
      ) : null}
      {type === 'fill_blank_write' && question.rule_chip ? (
        <span className="inline-flex rounded-full bg-v2-panel px-2.5 py-1 text-xs text-v2-ink-muted">
          {String(question.rule_chip)}
        </span>
      ) : null}
      {type === 'fill_blank_write' && question.think_eg ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
          فكّر: {String(question.think_eg)}
        </p>
      ) : null}

      {type === 'translate_write' && question.situation_eg ? (
        <SituationBox text={String(question.situation_eg)} />
      ) : null}

      {type === 'reply_write' && question.character ? (
        <QuotedMessage
          name={String((question.character as { name?: string }).name ?? '')}
          tl={String((question.character as { tl?: string }).tl ?? '')}
        />
      ) : null}
      {type === 'reply_write' ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink">
          رد عليه
        </p>
      ) : null}

      {(type === 'describe_image_write' || type === 'describe_image_speak') ? (
        <>
          <ImageSlot variant="flashcard" src={question.image_url as string | undefined} alt="" />
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink">
            {type === 'describe_image_write'
              ? 'اكتب جملة واحدة عن الصورة'
              : 'قول جملة عن الصورة'}
          </p>
        </>
      ) : null}

      {type === 'say_it' && question.situation_eg ? (
        <>
          <p className="font-[family-name:var(--font-v2-ui)] text-[10px] font-bold text-v2-meta">
            سياق الموقف
          </p>
          <SituationBox text={String(question.situation_eg)} />
        </>
      ) : null}

      {type === 'reply_speak' ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink">
          رد عليه
        </p>
      ) : null}

      {type === 'read_aloud' && question.prompt_tl ? (
        <div className="space-y-2">
          <AudioButton text={String(question.prompt_tl)} showSlow />
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted" dir="rtl">
            {question.say ? String(question.say) : null}
          </p>
        </div>
      ) : null}

      {promptEg &&
      !['read_meaning', 'build_sentence', 'translate_write', 'say_it'].includes(type) ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink">
          {promptEg}
        </p>
      ) : null}

      {type === 'read_meaning' && promptEg ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink">
          {promptEg}
        </p>
      ) : null}

      {compact && opts.length ? (
        <div className="flex flex-wrap gap-2">
          {opts.map((o, i) => (
            <span
              key={i}
              className="rounded-lg bg-v2-panel px-2.5 py-1 text-xs text-v2-ink-muted"
              dir={o.tl ? 'ltr' : undefined}
            >
              {o.ar ?? o.tl}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  return <CoachMessage>{body}</CoachMessage>;
}