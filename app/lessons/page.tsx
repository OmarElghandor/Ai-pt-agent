'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
type LessonRow = {
  lessonKey: string;
  titleAr: string;
  situationAr: string | null;
  chipLabel: string;
  cefrLevel: string;
  uiStatus: 'locked' | 'available' | 'updating' | 'done' | 'assessment_due';
  hasPack: boolean;
  status: string | null;
  generationStage: string | null;
  missingCells: string[];
  missingWords: string[];
  source?: 'generated' | 'hand' | 'json' | null;
};

const LEARNER_KEY = 'pt-learner-id';

function learnerId(): string {
  if (typeof window === 'undefined') return '';
  // Migrate old key if present
  const legacy = localStorage.getItem('learner-id');
  let id = localStorage.getItem(LEARNER_KEY);
  if (!id && legacy && /^[\w-]{8,80}$/.test(legacy)) {
    id = legacy;
    localStorage.setItem(LEARNER_KEY, id);
  }
  if (!id || !/^[\w-]{8,80}$/.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(LEARNER_KEY, id);
  }
  return id;
}

export default function LessonsPage() {
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [stageLabel, setStageLabel] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [devUserId, setDevUserId] = useState('');
  /** Avoid SSR/client mismatch (browser extensions inject attrs onto inputs). */
  const [clientReady, setClientReady] = useState(false);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = learnerId();
      const res = await fetch(`/api/lessons/plan?id=${encodeURIComponent(id)}`);
      const json = (await res.json()) as { lessons?: LessonRow[]; error?: string };
      if (!res.ok) throw new Error(json.error || 'فشل تحميل الخطة');
      setLessons(json.lessons ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setClientReady(true);
    const stored = localStorage.getItem(LEARNER_KEY) || '';
    if (/^[a-fA-F0-9]{24}$/.test(stored)) setDevUserId(stored);
    void loadPlan();
  }, [loadPlan]);

  async function generateLesson(row: LessonRow, force: boolean) {
    setGenError(null);
    setGeneratingKey(row.lessonKey);
    setStageLabel(force ? 'بنعيد التوليد…' : 'بنجهّز الموقف…');
    try {
      const start = await fetch(
        `/api/lessons/${encodeURIComponent(row.lessonKey)}/generate${force ? '?force=1' : ''}`,
        { method: 'POST' },
      );
      const startJson = (await start.json()) as {
        alreadyLive?: boolean;
        hasPack?: boolean;
        stageLabel?: string;
        error?: string;
      };
      if (startJson.alreadyLive || (start.ok && startJson.hasPack)) {
        window.location.href = `/lessons/${encodeURIComponent(row.lessonKey)}`;
        return;
      }
      if (!start.ok) {
        setGenError(startJson.error || 'فشل التوليد');
        setGeneratingKey(null);
        return;
      }
      setGenError('التوليد خلص من غير باك — حاول تاني');
      setGeneratingKey(null);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'فشل التوليد');
      setGeneratingKey(null);
    }
  }

  function openLesson(row: LessonRow) {
    if (row.hasPack) {
      window.location.href = `/lessons/${encodeURIComponent(row.lessonKey)}`;
      return;
    }
    void generateLesson(row, false);
  }

  return (
    <div className="app-shell flex justify-center">
      <main className="flex h-dvh w-full max-w-[430px] flex-col px-4 pb-8 pt-4">
        <header className="mb-4 flex items-center gap-3">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/80"
            aria-label="رجوع"
          >
            →
          </Link>
          <div className="flex-1 text-center">
            <h1 className="text-lg font-semibold">خطة الدروس</h1>
            <p className="text-xs text-muted">تمرين على اللي اتعلّمته</p>
          </div>
          <span className="w-10" />
        </header>

        {clientReady && process.env.NODE_ENV !== 'production' ? (
          <div className="mb-3 rounded-xl border border-border/60 bg-surface/50 p-2">
            <label className="block text-[10px] text-muted">Dev Langify user id</label>
            <div className="mt-1 flex gap-2">
              <input
                dir="ltr"
                className="min-w-0 flex-1 rounded-lg border border-border bg-black/30 px-2 py-1 text-xs"
                value={devUserId}
                onChange={(e) => setDevUserId(e.target.value.trim())}
                placeholder="24-char ObjectId"
                suppressHydrationWarning
              />
              <button
                type="button"
                className="shrink-0 text-xs text-accent-mint"
                onClick={() => {
                  if (/^[a-fA-F0-9]{24}$/.test(devUserId)) {
                    localStorage.setItem(LEARNER_KEY, devUserId);
                    void loadPlan();
                  }
                }}
                suppressHydrationWarning
              >
                طبّق
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="py-12 text-center text-muted">جاري التحميل…</p>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="text-red-300">{error}</p>
            <button
              type="button"
              className="mt-3 text-sm text-accent-mint"
              onClick={() => void loadPlan()}
            >
              حاول تاني
            </button>
          </div>
        ) : lessons.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted">مفيش دروس في الخطة دلوقتي.</p>
            <button
              type="button"
              className="mt-3 text-sm text-accent-mint"
              onClick={() => void loadPlan()}
            >
              حاول تاني
            </button>
          </div>
        ) : (
          <ul className="flex-1 space-y-3 overflow-y-auto pb-4">
            {lessons.map((row) => (
                <li key={row.lessonKey}>
                  <div className="rounded-2xl border border-border bg-surface/80 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openLesson(row)}
                      className="w-full text-start"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{row.titleAr}</div>
                          {row.situationAr ? (
                            <div className="mt-1 text-xs text-muted">{row.situationAr}</div>
                          ) : null}
                        </div>
                        <StatusBadge status={row.uiStatus} />
                      </div>
                    </button>
                    {row.source !== 'hand' ? (
                      <button
                        type="button"
                        onClick={() => void generateLesson(row, true)}
                        className="mt-2 text-xs text-accent-mint"
                      >
                        ولّد تاني
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
          </ul>
        )}

        {generatingKey ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center">
              <p className="text-lg font-medium">{stageLabel ?? 'بنجهّز الدرس…'}</p>
              <p className="mt-2 text-sm text-muted">بنكلم الـ AI دلوقتي — استنى شوية</p>
            </div>
          </div>
        ) : null}

        {genError ? (
          <div className="fixed inset-x-0 bottom-8 z-50 flex justify-center px-4">
            <div className="rounded-2xl border border-red-500/40 bg-zinc-900 px-4 py-3 text-center">
              <p className="text-sm text-red-200">{genError}</p>
              <button
                type="button"
                className="mt-2 text-sm text-accent-mint"
                onClick={() => setGenError(null)}
              >
                حاول تاني
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: LessonRow['uiStatus'] }) {
  const map: Record<LessonRow['uiStatus'], string> = {
    locked: 'مقفول',
    available: '',
    updating: 'تحديث',
    done: '✓',
    assessment_due: 'اختبر نفسك',
  };
  if (status === 'locked' || status === 'updating') return null;
  const label = map[status];
  if (!label) return null;
  if (status === 'assessment_due') {
    return (
      <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-200">
        {label}
      </span>
    );
  }
  if (status === 'done') {
    return <span className="shrink-0 text-emerald-400">{label}</span>;
  }
  return <span className="shrink-0 text-[11px] text-white/35">{label}</span>;
}
