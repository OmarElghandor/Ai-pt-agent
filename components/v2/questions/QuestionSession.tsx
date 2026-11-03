'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { SkillChip } from '@/components/v2/SkillChip';
import type { Item } from '@/lib/v2/content/items';
import type { Question, Skill } from '@/lib/v2/content/lesson';
import {
  isClosedQuestionType,
  isOpenWriteType,
  isSpeakingType,
} from '@/lib/v2/generation/lesson/questionTypes';
import { BuildSentenceQuestion } from './BuildSentenceQuestion';
import { ChoiceQuestion } from './ChoiceQuestion';
import {
  ListenPickImage,
  listenPickImageCorrect,
} from './ListenPickImage';
import { SessionEnd } from './SessionEnd';
import { SpeakQuestion } from './SpeakQuestion';
import {
  easternDigits,
  type QuestionAnswerMeta,
  type QuestionGradeResult,
  type SessionStats,
} from './types';
import { WriteQuestion } from './WriteQuestion';

function newAnswerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function postAnswer(body: Record<string, unknown>): void {
  void fetch('/api/v2/answers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-timezone':
        typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : 'UTC',
    },
    body: JSON.stringify(body),
  }).catch(() => {});
}

function skillFor(q: Question): Skill {
  return (q.skill ?? 'reading') as Skill;
}

function realWorldItemId(
  question: Question,
  items: ReadonlyMap<string, Item>,
): string | null {
  const id = Array.isArray(question.tests)
    ? String(question.tests[0] ?? '')
    : '';
  if (!id) return null;
  if (id.startsWith('phrase.rw.')) return id;
  const item = items.get(id);
  if (item && (item as { real_world?: boolean }).real_world) return id;
  return null;
}

type Props = {
  day: number;
  questions: Question[];
  items: Item[];
  onComplete: () => void;
};

export function QuestionSession({
  day,
  questions,
  items,
  onComplete,
}: Props) {
  const itemMap = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [graded, setGraded] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [lastCorrect, setLastCorrect] = useState(false);
  const [cardAdded, setCardAdded] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [stats, setStats] = useState<SessionStats>({
    correct: 0,
    total: 0,
    bySkill: {},
    usedCorrectly: [],
    focusNote: null,
  });

  const q = questions[index];
  const total = questions.length;
  const progress = total ? ((index + (graded ? 1 : 0)) / total) * 100 : 0;
  const rwItemId = q ? realWorldItemId(q, itemMap) : null;

  function bumpStats(
    question: Question,
    correct: boolean,
    meta?: QuestionAnswerMeta,
  ) {
    const skill = skillFor(question);
    const tests = Array.isArray(question.tests)
      ? question.tests.map(String)
      : [];
    setStats((prev) => {
      const prevSkill = prev.bySkill[skill] ?? { correct: 0, total: 0 };
      const used =
        correct && tests[0] && !prev.usedCorrectly.includes(tests[0])
          ? [...prev.usedCorrectly, tests[0]]
          : prev.usedCorrectly;
      let focusNote = prev.focusNote;
      if (!focusNote && !correct && skill === 'grammar') {
        const rawNm = (question as Record<string, unknown>).near_miss;
        const nmList = Array.isArray(rawNm) ? rawNm : [];
        const nm0 = nmList[0] as { tl?: string; feedback_eg?: string } | undefined;
        const right =
          Array.isArray(question.accepted) &&
          typeof question.accepted[0] === 'string'
            ? question.accepted[0]
            : tests[0] ?? '';
        if (nm0 && typeof nm0.tl === 'string') {
          focusNote = {
            wrong: nm0.tl,
            right,
            why_eg:
              typeof nm0.feedback_eg === 'string'
                ? nm0.feedback_eg
                : 'القاعدة دي هتظهرلك بكرة في كروت المراجعة.',
          };
        }
      }
      void meta;
      return {
        correct: prev.correct + (correct ? 1 : 0),
        total: prev.total + 1,
        bySkill: {
          ...prev.bySkill,
          [skill]: {
            correct: prevSkill.correct + (correct ? 1 : 0),
            total: prevSkill.total + 1,
          },
        },
        usedCorrectly: used,
        focusNote,
      };
    });
  }

  function persistAnswer(
    question: Question,
    optionIndex: number,
    correct: boolean,
    meta?: QuestionAnswerMeta,
  ) {
    const skill = skillFor(question);
    const itemId = Array.isArray(question.tests)
      ? String(question.tests[0] ?? '')
      : undefined;
    const type = String(question.type ?? '');

    if (meta?.skip_srs || meta?.self_rated) return;
    if (isSpeakingType(type) && !meta?.text) return;

    if (isOpenWriteType(type) || (isSpeakingType(type) && meta?.text && !meta.self_rated)) {
      postAnswer({
        kind: 'open',
        answer_id: newAnswerId(),
        day,
        skill: skill === 'grammar' ? 'writing' : skill === 'speaking' ? 'writing' : skill,
        text: meta?.text ?? '',
        item_id: itemId || undefined,
        question_id: question.id,
        question_type: type,
        accepted: Array.isArray(question.accepted) ? question.accepted : undefined,
        near_miss: (() => {
          const raw = (question as Record<string, unknown>).near_miss;
          if (!Array.isArray(raw)) return undefined;
          return raw.filter(
            (n): n is { tl: string; feedback_eg?: string } =>
              !!n &&
              typeof n === 'object' &&
              typeof (n as { tl?: unknown }).tl === 'string',
          );
        })(),
      });
      return;
    }

    if (isClosedQuestionType(type) || type === 'build_sentence') {
      const closedSkill =
        skill === 'listening' ||
        skill === 'reading' ||
        skill === 'grammar' ||
        skill === 'writing'
          ? skill
          : 'reading';
      let correctIndex =
        type === 'build_sentence'
          ? 1
          : typeof question.answer === 'number'
            ? question.answer
            : 0;
      if (type === 'listen_pick_image') {
        // Server compares option_index === correct_index
        correctIndex = correct ? optionIndex : optionIndex === 0 ? 1 : 0;
      }
      postAnswer({
        kind: 'closed',
        answer_id: newAnswerId(),
        day,
        skill: closedSkill,
        option_index: optionIndex < 0 ? 0 : optionIndex,
        correct_index: correctIndex,
        item_id: itemId || undefined,
        question_id: question.id,
        question_type: type,
      });
    }
  }

  function applyGrade(
    question: Question,
    optionIndex: number,
    correct: boolean,
    meta?: QuestionAnswerMeta,
  ) {
    persistAnswer(question, optionIndex, correct, meta);
    bumpStats(question, correct, meta);
    setLastCorrect(correct);
    setCardAdded(false);
    setGraded(true);
    setSelectedIndex(optionIndex);
  }

  async function onAddRwCard() {
    if (!rwItemId || cardAdded || addingCard) return;
    setAddingCard(true);
    try {
      const res = await fetch(
        `/api/v2/cards/${encodeURIComponent(rwItemId)}/add`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day }),
        },
      );
      if (res.ok) setCardAdded(true);
    } finally {
      setAddingCard(false);
    }
  }

  function handleImmediateGrade(result: QuestionGradeResult) {
    if (!q || graded) return;
    applyGrade(q, result.optionIndex, result.correct, result.meta);
  }

  function confirmSelection() {
    if (!q || graded || selectedIndex === null) return;
    const type = String(q.type ?? '');
    let correct = false;
    if (type === 'listen_pick_image') {
      correct = listenPickImageCorrect(q, itemMap, selectedIndex);
    } else {
      correct =
        typeof q.answer === 'number' && selectedIndex === q.answer;
    }
    applyGrade(q, selectedIndex, correct);
  }

  function goNext() {
    if (index + 1 >= total) {
      setFinished(true);
      onComplete();
      return;
    }
    setIndex((i) => i + 1);
    setSelectedIndex(null);
    setGraded(false);
    setLastCorrect(false);
    setCardAdded(false);
    setDraftText('');
  }

  if (finished) {
    return <SessionEnd day={day} stats={stats} />;
  }

  if (!q) {
    return (
      <main className="p-4">
        <p className="font-[family-name:var(--font-v2-arabic)]">مفيش أسئلة.</p>
      </main>
    );
  }

  const type = String(q.type ?? '');
  const needsConfirm =
    !isSpeakingType(type) &&
    type !== 'build_sentence' &&
    !isOpenWriteType(type);
  // write/speak/tiles grade themselves via onGrade
  const shellOwnsFooter = needsConfirm || graded;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-v2-paper">
      <header className="px-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/day/${day}`}
            className="flex h-9 w-9 items-center justify-center rounded-full text-v2-ink"
            aria-label="إغلاق"
          >
            ✕
          </Link>
          <div className="text-center">
            <h1 className="font-[family-name:var(--font-v2-arabic)] text-base font-bold text-v2-primary">
              أسئلة اليوم
            </h1>
            <p className="font-[family-name:var(--font-v2-ui)] text-[10px] text-v2-ink-muted">
              Sessão de Perguntas
            </p>
          </div>
          <span className="w-9" />
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-v2-paper-deep">
          <div
            className="h-full rounded-full bg-v2-action transition-[width] duration-300"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <SkillChip skill={skillFor(q)} />
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
            السؤال {easternDigits(index + 1)} من {easternDigits(total)}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {type === 'listen_pick_image' ? (
          <ListenPickImage
            question={q}
            items={itemMap}
            graded={graded}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />
        ) : type === 'build_sentence' ? (
          <BuildSentenceQuestion
            key={q.id}
            question={q}
            items={itemMap}
            graded={graded}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onGrade={handleImmediateGrade}
          />
        ) : isOpenWriteType(type) ? (
          <WriteQuestion
            key={q.id}
            question={q}
            items={itemMap}
            graded={graded}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            draftText={draftText}
            onDraftText={setDraftText}
            onGrade={handleImmediateGrade}
          />
        ) : isSpeakingType(type) ? (
          <SpeakQuestion
            key={q.id}
            question={q}
            items={itemMap}
            graded={graded}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            draftText={draftText}
            onDraftText={setDraftText}
            onGrade={handleImmediateGrade}
          />
        ) : (
          <ChoiceQuestion
            question={q}
            items={itemMap}
            graded={graded}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />
        )}
      </div>

      {shellOwnsFooter ? (
        <footer className="border-t border-v2-rule bg-v2-paper px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {graded ? (
            <div className="space-y-3">
              {!lastCorrect && rwItemId ? (
                <button
                  type="button"
                  disabled={cardAdded || addingCard}
                  onClick={() => void onAddRwCard()}
                  className="w-full rounded-v2-row bg-v2-paper-deep py-2.5 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-attention"
                >
                  {cardAdded ? '✓ في الكروت' : 'ضيفها للكروت'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={goNext}
                className="flex w-full items-center justify-center gap-2 rounded-v2-pill bg-v2-action py-3.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white shadow-[var(--shadow-v2-soft)]"
              >
                التالي ←
              </button>
            </div>
          ) : needsConfirm ? (
            <button
              type="button"
              disabled={selectedIndex === null}
              onClick={confirmSelection}
              className="flex w-full items-center justify-center gap-2 rounded-v2-pill bg-v2-action py-3.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white shadow-[var(--shadow-v2-soft)] disabled:opacity-40"
            >
              تأكيد
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="flex w-full items-center justify-center gap-2 rounded-v2-pill bg-v2-action py-3.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white shadow-[var(--shadow-v2-soft)]"
            >
              التالي ←
            </button>
          )}
        </footer>
      ) : null}
    </main>
  );
}
