'use client';

import { useCallback, useState } from 'react';
import { InsertionCarousel } from '@/components/InsertionCarousel';
import { useSegmentAudio } from '@/hooks/useSegmentAudio';
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

function SceneWordsBubble({
  message,
  gateActive,
  onDismiss,
}: {
  message: TypedMessage;
  gateActive: boolean;
  onDismiss?: () => void;
}) {
  const card = message.sceneWordCard!;
  const { playSegments, playing, stop } = useSegmentAudio();
  const [activePt, setActivePt] = useState<string | null>(null);

  const playWord = useCallback(
    async (pt: string) => {
      stop();
      setActivePt(pt);
      await playSegments([{ lang: 'pt', text: pt }]);
      setActivePt(null);
    },
    [playSegments, stop],
  );

  const playAll = useCallback(async () => {
    stop();
    setActivePt('__all__');
    await playSegments(card.words.map((w) => ({ lang: 'pt' as const, text: w.pt })));
    setActivePt(null);
  }, [card.words, playSegments, stop]);

  return (
    <div
      id={`scene-words-${card.sceneId}`}
      className="w-full max-w-full rounded-2xl border border-border bg-surface/90 px-3 py-3 text-sm"
    >
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-accent-mint">
        {message.label ?? 'كلمات هنحتاجها'}
      </div>
      {card.titleAr ? <p className="mb-3 text-xs text-muted">{card.titleAr}</p> : null}
      <InsertionCarousel
        words={card.words.map((w) => ({
          pt: w.pt,
          meaning: w.arz?.trim() || w.ar,
          emoji: w.emoji,
        }))}
        onPlay={(pt) => void playWord(pt)}
        activePt={activePt}
        playing={playing}
      />
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void playAll()}
          disabled={playing && activePt === '__all__'}
          className="rounded-full border border-accent-mint/40 px-4 py-2 text-sm text-accent-mint disabled:opacity-50"
        >
          اسمع الكل
        </button>
        {gateActive && onDismiss ? (
          <button
            type="button"
            onClick={() => {
              stop();
              onDismiss();
            }}
            className="accent-gradient rounded-full px-4 py-2.5 text-sm font-semibold text-[#04100e]"
          >
            يلا نبدأ
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function TypedBubble({
  message,
  onPlay,
  onInsertWord,
  onWhy,
  sceneWordGateActive = false,
  onDismissSceneWords,
}: {
  message: TypedMessage;
  onPlay?: (segments: AuthoredSegment[]) => void;
  /** Tap a hint-card / word-bank piece — inserts into the input, does not send. */
  onInsertWord?: (pt: string) => void;
  /** Inline ليه؟ under a coach tip. */
  onWhy?: () => void;
  /** Show «يلا نبدأ» when this scene-words card matches the open gate. */
  sceneWordGateActive?: boolean;
  onDismissSceneWords?: () => void;
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
          ليه كده؟
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
        {message.contrastAr ? (
          <div className="mt-3 rounded-xl border border-amber-700/40 bg-amber-950/20 px-2 py-1.5 text-xs text-amber-100/90">
            {message.contrastAr}
          </div>
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
        {message.examples && message.examples.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {message.examples.map((ex, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-2 rounded-xl bg-zinc-800/70 px-2 py-1.5"
              >
                <div>
                  <div className="text-emerald-300" dir="ltr">
                    {ex.pt}
                  </div>
                  {ex.meaningAr ? (
                    <div className="text-zinc-400 text-xs">{ex.meaningAr}</div>
                  ) : null}
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
        {message.showWhyChip && onWhy ? (
          <button
            type="button"
            onClick={onWhy}
            className="mt-2 rounded-full border border-amber-500/50 bg-amber-900/30 px-2.5 py-0.5 text-xs text-amber-200"
          >
            ليه؟
          </button>
        ) : null}
      </div>
    );
  }

  if (message.type === 'teach') {
    const beatTeach = message.beatTeach;
    const meaning = message.teachMeaning;
    const example = message.teachExample;
    const explanation = message.teachExplanation;
    const playSegs: AuthoredSegment[] = [];
    if (beatTeach) {
      if (beatTeach.examplePt) playSegs.push({ lang: 'pt', text: beatTeach.examplePt });
    } else {
      if (explanation) {
        playSegs.push({
          lang: 'ar',
          text: explanation.text,
          pronunciation: explanation.pronunciation,
        });
      }
      if (meaning?.pt) playSegs.push({ lang: 'pt', text: meaning.pt });
      if (example?.pt) playSegs.push({ lang: 'pt', text: example.pt });
    }
    return (
      <div className="rounded-2xl border border-amber-600/40 bg-amber-950/20 p-3 text-sm">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-amber-300/90">
          المدرب
        </div>
        {beatTeach ? (
          <>
            {beatTeach.momentAr ? (
              <div className="leading-relaxed text-zinc-100">{beatTeach.momentAr}</div>
            ) : null}
            {beatTeach.rulePt ? (
              <div className="mt-3 rounded-xl bg-zinc-800/70 px-2.5 py-2">
                <div className="text-emerald-300 text-base font-medium" dir="ltr">
                  {beatTeach.rulePt}
                </div>
                {beatTeach.ruleAr ? (
                  <div className="mt-0.5 text-xs text-zinc-400">{beatTeach.ruleAr}</div>
                ) : null}
              </div>
            ) : null}
            {beatTeach.examplePt ? (
              <div className="mt-2 flex items-start justify-between gap-2 rounded-xl border border-zinc-700/80 px-2.5 py-2">
                <div>
                  <div className="text-[11px] text-zinc-500 mb-1">مثال</div>
                  <div className="text-emerald-300" dir="ltr">
                    {beatTeach.examplePt}
                  </div>
                  {beatTeach.exampleAr ? (
                    <div className="text-zinc-400 text-xs">{beatTeach.exampleAr}</div>
                  ) : null}
                </div>
                {onPlay ? (
                  <button
                    type="button"
                    className="text-xs text-zinc-400 hover:text-white"
                    onClick={() => onPlay([{ lang: 'pt', text: beatTeach.examplePt }])}
                  >
                    ▶
                  </button>
                ) : null}
              </div>
            ) : null}
            {beatTeach.askAr ? (
              <div className="mt-2 leading-relaxed text-zinc-100">{beatTeach.askAr}</div>
            ) : null}
          </>
        ) : (
          <>
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
          </>
        )}
        {message.showWhyChip && onWhy ? (
          <button
            type="button"
            onClick={onWhy}
            className="mt-2 rounded-full border border-amber-500/50 bg-amber-900/30 px-2.5 py-0.5 text-xs text-amber-200"
          >
            ليه؟
          </button>
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

  if (message.type === 'info-card' && message.infoCard) {
    const card = message.infoCard;
    return (
      <div className="w-full rounded-2xl border border-sky-700/40 bg-sky-950/30 px-3 py-3 text-sm">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-sky-300">
          {card.titleAr || message.label || 'معلومة'}
        </div>
        <ul className="space-y-2">
          {card.rows.map((row, i) => (
            <li
              key={i}
              className="flex items-start justify-between gap-2 rounded-xl bg-zinc-800/60 px-2.5 py-1.5"
            >
              <div>
                <div className="text-emerald-300" dir="ltr">
                  {row.pt}
                </div>
                {row.ar ? <div className="text-xs text-zinc-400">{row.ar}</div> : null}
              </div>
              {onPlay ? (
                <button
                  type="button"
                  className="text-xs text-zinc-400 hover:text-white"
                  onClick={() => onPlay([{ lang: 'pt', text: row.pt }])}
                >
                  ▶
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {card.noteAr ? (
          <p className="mt-2 text-xs text-zinc-300">{card.noteAr}</p>
        ) : null}
      </div>
    );
  }

  if (message.type === 'script-replay' && message.scriptReplay) {
    const turns = message.scriptReplay;
    const playAll = () => {
      if (!onPlay) return;
      onPlay(turns.map((t) => ({ lang: 'pt' as const, text: t.pt })));
    };
    return (
      <div className="w-full rounded-2xl border border-emerald-800/40 bg-zinc-900/80 px-3 py-3 text-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-400/80">
            {message.label ?? 'المحادثة كاملة'}
          </div>
          {onPlay ? (
            <button
              type="button"
              className="rounded-full border border-accent-mint/40 px-3 py-1 text-xs text-accent-mint"
              onClick={playAll}
            >
              اسمع الكل
            </button>
          ) : null}
        </div>
        <ul className="flex flex-col gap-2.5">
          {turns.map((turn, i) => {
            const isEu = /^eu$/i.test(turn.speaker.trim());
            return (
              <li
                key={i}
                className={`flex ${isEu ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3 py-2 ${
                    isEu ? 'bg-sky-700/40' : 'bg-zinc-800/90'
                  }`}
                >
                  {!isEu ? (
                    <div className="mb-0.5 text-[11px] font-medium text-emerald-400/80">
                      {turn.speaker}
                    </div>
                  ) : (
                    <div className="mb-0.5 text-[11px] font-medium text-sky-300/80">أنت</div>
                  )}
                  <div className="text-emerald-300" dir="ltr">
                    {turn.pt}
                  </div>
                  {turn.ar ? (
                    <div className="mt-0.5 text-xs text-zinc-400">{turn.ar}</div>
                  ) : null}
                  {onPlay ? (
                    <button
                      type="button"
                      className="mt-1 text-[11px] text-zinc-500 hover:text-white"
                      onClick={() => onPlay([{ lang: 'pt', text: turn.pt }])}
                    >
                      ▶
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (message.type === 'summary' && message.lessonSummary) {
    const summary = message.lessonSummary;
    return (
      <div className="w-full rounded-2xl border border-zinc-700 bg-zinc-900/80 px-3 py-3 text-sm">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          {message.label ?? 'ملخص'}
        </div>
        {summary.words.length > 0 ? (
          <div className="mb-3">
            <div className="mb-1.5 text-xs text-zinc-500">كلمات</div>
            <ul className="space-y-1.5">
              {summary.words.map((w, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-xl bg-zinc-800/70 px-2.5 py-1.5"
                >
                  <div>
                    <span className="text-emerald-300" dir="ltr">
                      {w.pt}
                    </span>
                    {w.ar ? <span className="ms-2 text-xs text-zinc-400">{w.ar}</span> : null}
                  </div>
                  {onPlay ? (
                    <button
                      type="button"
                      className="text-xs text-zinc-400 hover:text-white"
                      onClick={() => onPlay([{ lang: 'pt', text: w.pt }])}
                    >
                      ▶
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {summary.rules.length > 0 ? (
          <div>
            <div className="mb-1.5 text-xs text-zinc-500">قواعد</div>
            <ul className="space-y-2">
              {summary.rules.map((rule, i) => (
                <li key={i} className="rounded-xl border border-zinc-700/80 px-2.5 py-2">
                  <div className="text-emerald-300 font-medium" dir="ltr">
                    {rule.pt}
                  </div>
                  {rule.ar ? <div className="text-xs text-zinc-400 mt-0.5">{rule.ar}</div> : null}
                  {rule.examplePt ? (
                    <div className="mt-2 flex items-start justify-between gap-2 rounded-lg bg-zinc-800/60 px-2 py-1.5">
                      <div>
                        <div className="text-emerald-300 text-sm" dir="ltr">
                          {rule.examplePt}
                        </div>
                        {rule.exampleAr ? (
                          <div className="text-xs text-zinc-500">{rule.exampleAr}</div>
                        ) : null}
                      </div>
                      {onPlay ? (
                        <button
                          type="button"
                          className="text-xs text-zinc-400 hover:text-white"
                          onClick={() => onPlay([{ lang: 'pt', text: rule.examplePt }])}
                        >
                          ▶
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
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

  if (message.type === 'scene-words' && message.sceneWordCard) {
    return (
      <SceneWordsBubble
        message={message}
        gateActive={sceneWordGateActive}
        onDismiss={onDismissSceneWords}
      />
    );
  }

  if (message.type === 'hint' && message.hintCard) {
    const card = message.hintCard;
    return (
      <div className="rounded-2xl border border-amber-600/50 bg-amber-950/30 px-3 py-3 text-sm">
        {message.label ? (
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-amber-400">
            {message.label}
          </div>
        ) : null}
        {card.frame ? (
          <div className="mb-3 text-center text-xs text-zinc-300" dir="ltr">
            {card.frame}
          </div>
        ) : null}
        <InsertionCarousel words={card.words} onInsert={onInsertWord} />
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
    const out: AuthoredSegment[] = arabic.length ? [...arabic] : [...message.segments];
    for (const ex of message.examples ?? []) {
      if (ex.pt) out.push({ lang: 'pt', text: ex.pt });
    }
    return out;
  }
  if (message.type === 'hint' && message.hintCard) {
    return [];
  }
  if (message.type === 'scene-words') {
    return [];
  }
  if (message.type === 'explanation') {
    const out: AuthoredSegment[] = [...message.segments];
    for (const ex of message.examples ?? []) {
      if (ex.pt) out.push({ lang: 'pt', text: ex.pt });
    }
    return out;
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
    if (message.beatTeach) {
      if (message.beatTeach.momentAr) {
        out.push({
          lang: 'ar',
          text: message.beatTeach.momentAr,
          pronunciation: message.beatTeach.momentAr,
        });
      }
      if (message.beatTeach.examplePt) {
        out.push({ lang: 'pt', text: message.beatTeach.examplePt });
      }
      if (message.beatTeach.askAr) {
        out.push({
          lang: 'ar',
          text: message.beatTeach.askAr,
          pronunciation: message.beatTeach.askAr,
        });
      }
      return out;
    }
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
  if (message.type === 'info-card' && message.infoCard) {
    return message.infoCard.rows.map((r) => ({ lang: 'pt' as const, text: r.pt }));
  }
  if (message.type === 'script-replay' && message.scriptReplay) {
    return message.scriptReplay.map((t) => ({ lang: 'pt' as const, text: t.pt }));
  }
  if (message.type === 'summary' && message.lessonSummary) {
    const out: AuthoredSegment[] = [];
    for (const w of message.lessonSummary.words) {
      if (w.pt) out.push({ lang: 'pt', text: w.pt });
    }
    for (const r of message.lessonSummary.rules) {
      if (r.examplePt) out.push({ lang: 'pt', text: r.examplePt });
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
