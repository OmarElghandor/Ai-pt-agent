'use client';

import { useState } from 'react';
import type { AuthoredSegment } from '@/lib/lessons/types';
import type { TypedMessage } from '@/lib/progressTypes';
import { parseTaggedMessage } from '@/lib/parseTaggedMessage';

function SegmentSpan({ seg }: { seg: AuthoredSegment }) {
  if (seg.lang === 'pt') {
    return (
      <span className="text-emerald-300" dir="ltr">
        {seg.text}
      </span>
    );
  }
  return <span>{seg.text}</span>;
}

function MixedText({ segments }: { segments: AuthoredSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => (
        <SegmentSpan key={i} seg={seg} />
      ))}
    </>
  );
}

export function TypedBubble({
  message,
  onPlay,
}: {
  message: TypedMessage;
  onPlay?: (segments: AuthoredSegment[]) => void;
}) {
  const [showTranslation, setShowTranslation] = useState(false);

  if (message.type === 'legacy' && message.legacyContent) {
    const segs = parseTaggedMessage(message.legacyContent);
    return (
      <div className="rounded-2xl bg-zinc-800/90 px-3 py-2 text-sm leading-relaxed">
        {segs.map((s, i) =>
          s.lang === 'pt' ? (
            <span key={i} className="text-emerald-300" dir="ltr">
              {s.text}
            </span>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>
    );
  }

  if (message.type === 'praise') {
    return (
      <button
        type="button"
        onClick={() => setShowTranslation((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-sm text-emerald-300"
      >
        <span aria-hidden>✓</span>
        <span dir="ltr">{message.segments.map((s) => s.text).join(' ')}</span>
        {showTranslation && message.translation ? (
          <span className="text-zinc-300">· {message.translation.map((s) => s.text).join(' ')}</span>
        ) : null}
      </button>
    );
  }

  if (message.type === 'help') {
    return (
      <div className="rounded-2xl border border-sky-700/50 bg-sky-950/40 p-3 text-sm">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-sky-300">
          شرح
        </div>
        <div className="leading-relaxed">
          <MixedText segments={message.segments} />
        </div>
        {onPlay ? (
          <button
            type="button"
            className="mt-2 text-xs text-zinc-400 hover:text-white"
            onClick={() => onPlay(message.segments)}
          >
            ▶ اسمع
          </button>
        ) : null}
      </div>
    );
  }

  if (message.type === 'explanation') {
    return (
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-3 text-sm">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          تذكير
        </div>
        <div className="leading-relaxed">
          <MixedText segments={message.segments} />
        </div>
        {message.examples && message.examples.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {message.examples.map((ex, i) => (
              <li key={i} className="flex items-start justify-between gap-2 rounded-xl bg-zinc-800/70 px-2 py-1.5">
                <div>
                  <div className="text-emerald-300" dir="ltr">
                    {ex.pt}
                  </div>
                  <div className="text-zinc-400 text-xs">{ex.meaningAr}</div>
                </div>
                {onPlay ? (
                  <button
                    type="button"
                    className="text-xs text-zinc-400 hover:text-white"
                    onClick={() => onPlay([{ lang: 'pt', text: ex.pt }])}
                  >
                    ▶
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {onPlay ? (
          <button
            type="button"
            className="mt-2 text-xs text-zinc-400 hover:text-white"
            onClick={() => onPlay(message.segments)}
          >
            ▶ اسمع الشرح
          </button>
        ) : null}
      </div>
    );
  }

  if (message.type === 'intro') {
    return (
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-3 text-sm leading-relaxed">
        <MixedText segments={message.segments} />
      </div>
    );
  }

  if (message.type === 'narration') {
    return (
      <div className="px-1 text-sm italic leading-relaxed text-zinc-400">
        <MixedText segments={message.segments} />
      </div>
    );
  }

  if (message.type === 'character') {
    return (
      <div className="rounded-2xl bg-zinc-800/90 px-3 py-2 text-sm leading-relaxed">
        {message.speaker ? (
          <div className="mb-1 text-[11px] font-medium text-emerald-400/80">{message.speaker}</div>
        ) : null}
        <div className="text-emerald-300" dir="ltr">
          {message.segments.map((s) => s.text).join(' ')}
        </div>
        {message.translation && message.translation.length > 0 ? (
          <div className="mt-1">
            {showTranslation ? (
              <div className="text-zinc-300">{message.translation.map((s) => s.text).join(' ')}</div>
            ) : null}
            <button
              type="button"
              className="mt-1 text-[11px] text-zinc-500 hover:text-zinc-300"
              onClick={() => setShowTranslation((v) => !v)}
            >
              {showTranslation ? 'إخفاء الترجمة' : 'ترجمة'}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (message.type === 'coach') {
    return (
      <div className="rounded-2xl border border-amber-600/40 bg-amber-950/20 px-3 py-2 text-sm leading-relaxed">
        <div className="mb-1 text-[11px] font-medium text-amber-300/90">المدرّب</div>
        <MixedText segments={message.segments} />
      </div>
    );
  }

  if (message.type === 'teach') {
    const meaning = message.teachMeaning;
    const example = message.teachExample;
    const explanation = message.teachExplanation;
    const playSegs: AuthoredSegment[] = [];
    if (explanation) {
      playSegs.push({
        lang: 'ar',
        text: explanation.text,
        pronunciation: explanation.pronunciation,
      });
    }
    if (meaning?.pt) playSegs.push({ lang: 'pt', text: meaning.pt });
    if (example?.pt) playSegs.push({ lang: 'pt', text: example.pt });
    return (
      <div className="rounded-2xl border border-emerald-800/50 bg-zinc-900/80 p-3 text-sm">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-400/80">
          تعلّم
        </div>
        {explanation ? (
          <div className="leading-relaxed text-zinc-100">{explanation.text}</div>
        ) : (
          <div className="leading-relaxed">
            <MixedText segments={message.segments} />
          </div>
        )}
        {meaning ? (
          <div className="mt-3 flex items-start justify-between gap-2 rounded-xl bg-zinc-800/70 px-2 py-1.5">
            <div>
              <div className="text-emerald-300 text-base" dir="ltr">
                {meaning.pt}
              </div>
              <div className="text-zinc-400 text-xs">{meaning.meaningAr}</div>
            </div>
            {onPlay ? (
              <button
                type="button"
                className="text-xs text-zinc-400 hover:text-white"
                onClick={() => onPlay([{ lang: 'pt', text: meaning.pt }])}
              >
                ▶
              </button>
            ) : null}
          </div>
        ) : null}
        {example ? (
          <div className="mt-2 rounded-xl border border-zinc-700/80 px-2 py-1.5">
            <div className="text-[11px] text-zinc-500 mb-1">مثال</div>
            <div className="text-emerald-300" dir="ltr">
              {example.pt}
            </div>
            <div className="text-zinc-400 text-xs">{example.meaningAr}</div>
            {onPlay ? (
              <button
                type="button"
                className="mt-1 text-xs text-zinc-400 hover:text-white"
                onClick={() => onPlay([{ lang: 'pt', text: example.pt }])}
              >
                ▶ اسمع المثال
              </button>
            ) : null}
          </div>
        ) : null}
        {onPlay && playSegs.length ? (
          <button
            type="button"
            className="mt-2 text-xs text-zinc-400 hover:text-white"
            onClick={() => onPlay(playSegs)}
          >
            ▶ اسمع
          </button>
        ) : null}
      </div>
    );
  }

  if (message.type === 'repeat') {
    return (
      <div className="rounded-2xl border border-sky-800/60 bg-zinc-900/80 p-3 text-sm">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-sky-300">
          كرّر
        </div>
        <div className="leading-relaxed">
          <MixedText segments={message.segments} />
        </div>
        {message.translation?.length ? (
          <div className="mt-1 text-xs text-zinc-400">
            {message.translation.map((s) => s.text).join(' ')}
          </div>
        ) : null}
        {onPlay && message.playablePt ? (
          <button
            type="button"
            className="mt-2 text-xs text-zinc-400 hover:text-white"
            onClick={() => onPlay([{ lang: 'pt', text: message.playablePt! }])}
          >
            ▶ اسمع وكرّر
          </button>
        ) : null}
      </div>
    );
  }

  if (message.type === 'task' && message.prompt?.shape === 'translate') {
    return (
      <div className="rounded-2xl border border-sky-800/60 bg-zinc-900/80 p-3 text-sm">
        <div className="text-emerald-300" dir="ltr">
          {message.prompt.labelPt}
        </div>
        <div className="mt-1 text-base">{message.prompt.arSentence}</div>
      </div>
    );
  }

  if (
    message.type === 'hint' ||
    message.type === 'correction' ||
    message.type === 'near-miss' ||
    message.type === 'reveal' ||
    message.type === 'results'
  ) {
    return (
      <div className="rounded-2xl border border-amber-600/50 bg-amber-950/30 px-3 py-2 text-sm leading-relaxed">
        {message.label ? (
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-amber-400">
            {message.label}
          </div>
        ) : null}
        <MixedText segments={message.segments} />
        {message.playablePt ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-emerald-300" dir="ltr">
              {message.playablePt}
            </span>
            {onPlay ? (
              <button
                type="button"
                className="text-xs text-zinc-400 hover:text-white"
                onClick={() => onPlay([{ lang: 'pt', text: message.playablePt! }])}
              >
                ▶
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  // chat (and question prompts stored as chat)
  return (
    <div className="rounded-2xl bg-zinc-800/90 px-3 py-2 text-sm leading-relaxed">
      <div className="text-emerald-300" dir="ltr">
        {message.segments.map((s) => s.text).join(' ')}
      </div>
      {message.translation && message.translation.length > 0 ? (
        <div className="mt-1">
          {showTranslation ? (
            <div className="text-zinc-300">{message.translation.map((s) => s.text).join(' ')}</div>
          ) : null}
          <button
            type="button"
            className="mt-1 text-[11px] text-zinc-500 hover:text-zinc-300"
            onClick={() => setShowTranslation((v) => !v)}
          >
            {showTranslation ? 'إخفاء الترجمة' : 'ترجمة'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function UserBubble({ message }: { message: TypedMessage }) {
  const text =
    message.segments.map((s) => s.text).join(' ') ||
    message.legacyContent ||
    '';
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="rounded-2xl bg-sky-700/40 px-3 py-2 text-sm" dir="auto">
        {text}
      </div>
      {message.learnerVerdict ? (
        <span className="text-[11px] text-zinc-400">{message.learnerVerdict}</span>
      ) : null}
    </div>
  );
}

/** TTS segments for a typed message, respecting speak rules. */
export function ttsSegmentsFor(message: TypedMessage): AuthoredSegment[] {
  if (message.type === 'legacy' && message.legacyContent) {
    return parseTaggedMessage(message.legacyContent).map((s) =>
      s.lang === 'ar'
        ? { lang: 'ar' as const, text: s.text, pronunciation: s.ttsText ?? s.text }
        : { lang: 'pt' as const, text: s.text },
    );
  }
  if (message.type === 'narration') return [];
  if (message.type === 'coach' || message.type === 'intro') {
    const arabic = message.segments.filter((s) => s.lang === 'ar');
    return arabic.length ? arabic : message.segments;
  }
  if (message.type === 'character' || message.type === 'chat' || message.type === 'praise') {
    // Portuguese only — never speak translations
    return message.segments.filter((s) => s.lang === 'pt');
  }
  if (message.type === 'task' && message.prompt?.shape === 'translate') {
    return [
      { lang: 'pt', text: message.prompt.labelPt },
      {
        lang: 'ar',
        text: message.prompt.arSentence,
        pronunciation: message.prompt.arSentence,
      },
    ];
  }
  if (message.type === 'teach') {
    const out: AuthoredSegment[] = [];
    if (message.teachExplanation) {
      out.push({
        lang: 'ar',
        text: message.teachExplanation.text,
        pronunciation: message.teachExplanation.pronunciation,
      });
    } else {
      out.push(...message.segments);
    }
    if (message.teachMeaning?.pt) {
      out.push({ lang: 'pt', text: message.teachMeaning.pt });
    }
    if (message.teachExample?.pt) {
      out.push({ lang: 'pt', text: message.teachExample.pt });
    }
    return out;
  }
  if (message.type === 'repeat') {
    if (message.playablePt) {
      return [{ lang: 'pt', text: message.playablePt }];
    }
    return message.segments.filter((s) => s.lang === 'pt');
  }
  // correction / hint / reveal / explanation / help / results — both languages in order
  return message.segments;
}
