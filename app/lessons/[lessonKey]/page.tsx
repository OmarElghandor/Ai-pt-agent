'use client';

/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect */

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatScreen } from '@/components/ChatScreen';
import { warmSceneWordAudio } from '@/components/SceneWordCard';
import { VoiceScreen } from '@/components/VoiceScreen';
import type { OrbMode } from '@/components/SpeakingOrb';
import { ttsSegmentsFor } from '@/components/TypedBubble';
import { useMicRecorder } from '@/hooks/useMicRecorder';
import { useSegmentAudio } from '@/hooks/useSegmentAudio';
import type { LearnerView } from '@/lib/learnerView';
import type { AuthoredSegment } from '@/lib/lessons/types';
import type { Segment } from '@/lib/parseTaggedMessage';
import type { CefrLevel } from '@/lib/prompts';
import type { Chip, TurnAction, TypedMessage } from '@/lib/progressTypes';

const LEARNER_KEY = 'pt-learner-id';

function learnerIdFromStorage(): string {
  const existing = localStorage.getItem(LEARNER_KEY);
  if (existing && /^[\w-]{8,80}$/.test(existing)) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(LEARNER_KEY, id);
  return id;
}

function toSegments(authored: AuthoredSegment[]): Segment[] {
  return authored.map((s) =>
    s.lang === 'ar'
      ? { lang: 'ar' as const, text: s.text, ttsText: s.pronunciation }
      : { lang: 'pt' as const, text: s.text },
  );
}

async function fetchLearner(id: string) {
  const res = await fetch(
    `/api/learner?id=${encodeURIComponent(id)}&localHour=${new Date().getHours()}&skipOpener=1`,
  );
  return (await res.json()) as LearnerView;
}

export default function PracticeLessonPage() {
  return (
    <Suspense
      fallback={
        <div className="app-shell flex items-center justify-center text-muted">جاري التحميل…</div>
      }
    >
      <PracticeLessonInner />
    </Suspense>
  );
}

function PracticeLessonInner() {
  const params = useParams();
  const lessonKey = decodeURIComponent(String(params.lessonKey || ''));
  const booted = useRef(false);

  const [viewMode, setViewMode] = useState<'voice' | 'text'>('voice');
  const [learnerId, setLearnerId] = useState('pending');
  const [view, setView] = useState<LearnerView | null>(null);
  const [level] = useState<CefrLevel>('A0');
  const [input, setInput] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  /** Keep the learner's last typed/spoken answer visible while the turn is in flight. */
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [preparing, setPreparing] = useState<string | null>('بنجهّز الموقف…');
  const [prepareError, setPrepareError] = useState<string | null>(null);
  /** Scroll target for «كلمات المشهد» reopen (no popup). */
  const [scrollToSceneId, setScrollToSceneId] = useState<string | null>(null);
  const actionRef = useRef<TurnAction>({ type: 'message' });
  const awaiting = useRef(false);
  const lastPlayedKey = useRef<string | null>(null);
  const warmedWordsRef = useRef<string | null>(null);
  const levelRef = useRef(level);
  const sessionRef = useRef(learnerId);

  const { playSegments, stop: stopAudio, playing, activeSegments, activeIndex } =
    useSegmentAudio();
  const mic = useMicRecorder();

  useEffect(() => {
    const id = learnerIdFromStorage();
    setLearnerId(id);
    sessionRef.current = id;
    void fetchLearner(id).then(setView);
  }, []);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);
  useEffect(() => {
    sessionRef.current = learnerId;
  }, [learnerId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest({ messages }) {
          const action = actionRef.current;
          actionRef.current = { type: 'message' };
          return {
            body: {
              message: messages[messages.length - 1],
              sessionId: sessionRef.current,
              level: levelRef.current,
              action,
            },
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const isBusy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    if (!awaiting.current || isBusy || !messages.length) return;
    awaiting.current = false;
    void fetchLearner(learnerId).then((data) => {
      if (data.messages) setView(data);
      setPendingUserText(null);
      setVoiceTranscript('');
    });
  }, [isBusy, messages, learnerId]);

  const unlockAudio = useCallback(() => setAudioUnlocked(true), []);

  // Play new assistant messages in order (reaction, then next prompt) — not only the last.
  useEffect(() => {
    if (!view || isBusy || !audioUnlocked || playing) return;
    const assistants = view.messages.filter((m) => m.role === 'assistant');
    if (!assistants.length) return;
    let start = 0;
    if (lastPlayedKey.current) {
      const idx = assistants.findIndex((m) => m.id === lastPlayedKey.current);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const next = assistants[start];
    if (!next) return;
    lastPlayedKey.current = next.id;
    void playSegments(toSegments(ttsSegmentsFor(next)));
  }, [view, isBusy, playing, audioUnlocked, playSegments]);

  const sendText = useCallback(
    (text: string, action: TurnAction = { type: 'message' }) => {
      if (isBusy || learnerId === 'pending') return;
      if (action.type === 'message' && !text.trim()) return;
      unlockAudio();
      actionRef.current = action;
      awaiting.current = true;
      const trimmed = text.trim();
      if (action.type === 'message' && trimmed) {
        setPendingUserText(trimmed);
        setView((prev) => {
          if (!prev) return prev;
          const optimistic: TypedMessage = {
            id: `pending-user-${Date.now()}`,
            role: 'user',
            type: 'chat',
            at: Date.now(),
            segments: [{ lang: 'pt', text: trimmed }],
          };
          return { ...prev, messages: [...prev.messages, optimistic] };
        });
      }
      const outbound =
        action.type === 'start-practice' ||
        action.type === 'show-grammar-card' ||
        action.type === 'show-coach-tip' ||
        action.type === 'dismiss-scene-word-card'
          ? ' '
          : trimmed || action.type;
      void sendMessage({ text: outbound });
    },
    [isBusy, learnerId, sendMessage, unlockAudio],
  );

  const insertWord = useCallback((pt: string) => {
    setViewMode('text');
    setInput((prev) => (prev.trim() ? `${prev.trim()} ${pt}` : pt));
  }, []);

  useEffect(() => {
    if (!view || isBusy || learnerId === 'pending' || !lessonKey || booted.current) return;
    booted.current = true;
    setPreparing('بنجهّز الموقف…');
    void (async () => {
      try {
        const statusRes = await fetch(
          `/api/lessons/${encodeURIComponent(lessonKey)}/generation`,
        );
        const status = (await statusRes.json()) as {
          hasPack?: boolean;
          jsonLesson?: boolean;
          error?: string;
          sceneWordWarmPt?: string[];
        };
        if (!status.jsonLesson && !status.hasPack) {
          const gen = await fetch(`/api/lessons/${encodeURIComponent(lessonKey)}/generate`, {
            method: 'POST',
          });
          const body = (await gen.json()) as { hasPack?: boolean; error?: string };
          if (!gen.ok || !body.hasPack) {
            setPrepareError(body.error || 'فشل التوليد');
            setPreparing(null);
            return;
          }
          // After inline generation, refresh metadata (incl. scene-word warm list).
          const refreshed = await fetch(
            `/api/lessons/${encodeURIComponent(lessonKey)}/generation`,
          );
          const meta = (await refreshed.json()) as { sceneWordWarmPt?: string[] };
          if (meta.sceneWordWarmPt?.length) {
            warmSceneWordAudio(meta.sceneWordWarmPt);
            warmedWordsRef.current = lessonKey;
          }
        } else if (status.sceneWordWarmPt?.length) {
          warmSceneWordAudio(status.sceneWordWarmPt);
          warmedWordsRef.current = lessonKey;
        }
        setPreparing(null);
        sendText('', { type: 'start-practice', lessonId: lessonKey });
      } catch (err) {
        setPrepareError(err instanceof Error ? err.message : 'فشل التوليد');
        setPreparing(null);
      }
    })();
  }, [view, isBusy, learnerId, lessonKey, sendText]);

  // Also warm from learner view if generation metadata was empty (e.g. after resume).
  useEffect(() => {
    if (!view?.sceneWordWarmPt?.length) return;
    if (warmedWordsRef.current === lessonKey) return;
    warmSceneWordAudio(view.sceneWordWarmPt);
    warmedWordsRef.current = lessonKey;
  }, [view?.sceneWordWarmPt, lessonKey]);

  // Scene word gate lives in the chat thread — switch to text so the card is visible.
  useEffect(() => {
    if (view?.sceneWordCard?.mode === 'blocking') setViewMode('text');
  }, [view?.sceneWordCard?.mode, view?.sceneWordCard?.sceneId]);

  useEffect(() => {
    if (!scrollToSceneId) return;
    const t = window.setTimeout(() => setScrollToSceneId(null), 800);
    return () => window.clearTimeout(t);
  }, [scrollToSceneId]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text) return;
      setInput('');
      sendText(text);
    },
    [input, sendText],
  );

  const onChip = (chip: Chip) => sendText(chip.label, chip.action);

  const endPractice = () => {
    sendText('إنهاء التمرين', { type: 'end-practice' });
    window.location.href = '/lessons';
  };

  const sceneWordBlocking = view?.sceneWordCard?.mode === 'blocking';
  const gateSceneId =
    sceneWordBlocking && view?.sceneWordCard?.sceneId ? view.sceneWordCard.sceneId : null;

  const handleMic = async () => {
    if (sceneWordBlocking) return;
    unlockAudio();
    if (playing) stopAudio();
    const text = await mic.toggle();
    if (text) {
      setVoiceTranscript(text);
      sendText(text);
    }
  };

  const dismissSceneWords = () => {
    if (sceneWordBlocking) sendText('', { type: 'dismiss-scene-word-card' });
  };

  const openSceneWordsInChat = () => {
    const sceneId = view?.sceneWordCard?.sceneId;
    if (!sceneId) return;
    setViewMode('text');
    setScrollToSceneId(sceneId);
  };

  const displayTranscript = pendingUserText || voiceTranscript;

  const orbMode: OrbMode = playing
    ? 'speaking'
    : mic.transcribing
      ? 'transcribing'
      : mic.recording
        ? 'listening'
        : displayTranscript && isBusy
          ? 'idle' // keep showing their answer, not "بيحوّل لصوت…"
          : isBusy
            ? 'transcribing'
            : 'idle';

  const chips = useMemo(
    () =>
      (view?.chips ?? []).filter(
        (c) =>
          c.action.type !== 'end-practice' &&
          c.action.type !== 'start-practice' &&
          c.action.type !== 'resume-practice',
      ),
    [view],
  );

  const typedMessages: TypedMessage[] = view?.messages ?? [];
  const lastAssistant = [...(view?.messages ?? [])]
    .reverse()
    .find((m) => m.role === 'assistant');
  const showHear =
    !audioUnlocked && !playing && orbMode === 'idle' && !displayTranscript && Boolean(lastAssistant);

  return (
    <div className="app-shell flex justify-center">
      <div className="relative flex h-dvh w-full max-w-[430px] flex-col">
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
          <Link
            href="/lessons"
            aria-label="الخطة"
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/80"
          >
            →
          </Link>
          <div className="flex-1 text-center">
            <h1 className="text-lg font-semibold">تمرين</h1>
            <p className="text-xs text-muted truncate px-2">{lessonKey}</p>
          </div>
          {view?.canEndPractice ? (
            <button
              type="button"
              onClick={endPractice}
              className="text-xs text-zinc-400 underline"
            >
              إنهاء
            </button>
          ) : (
            <span className="w-10" />
          )}
        </header>

        {preparing || prepareError ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
            {prepareError ?? preparing}
          </div>
        ) : viewMode === 'voice' ? (
          <VoiceScreen
            mode={orbMode}
            segments={activeSegments}
            activeIndex={activeIndex}
            transcript={displayTranscript}
            error={mic.error}
            recording={mic.recording}
            speaking={playing}
            onMic={() => void handleMic()}
            onOpenText={() => setViewMode('text')}
            wordBank={view?.wordBank ?? null}
            sentenceFrame={view?.sentenceFrame ?? null}
            onCancel={() => {
              mic.cancel();
              setVoiceTranscript('');
              stopAudio();
            }}
            onStopSpeaking={stopAudio}
            chips={chips}
            onChip={onChip}
            onInsertWord={insertWord}
            hearLabel={showHear ? 'اضغط لتسمع' : null}
            onHear={() =>
              lastAssistant && void playSegments(toSegments(ttsSegmentsFor(lastAssistant)))
            }
            caption={
              showHear && lastAssistant ? toSegments(ttsSegmentsFor(lastAssistant)) : []
            }
            controlsDisabled={Boolean(sceneWordBlocking) || isBusy}
            showSceneWordChip={Boolean(view?.showSceneWordChip)}
            onOpenSceneWords={openSceneWordsInChat}
          />
        ) : (
          <ChatScreen
            messages={typedMessages}
            status={status}
            error={error}
            input={input}
            setInput={setInput}
            onSubmit={handleSubmit}
            onStop={() => stop()}
            onPlaySegments={(segs) => {
              void playSegments(toSegments(segs));
            }}
            onOpenVoice={() => setViewMode('voice')}
            isBusy={isBusy}
            booted={view !== null}
            chips={chips}
            onChip={onChip}
            practiceHeader={view?.practiceHeader ?? null}
            assessmentHeader={null}
            wordBank={view?.wordBank ?? null}
            sentenceFrame={view?.sentenceFrame ?? null}
            canEndPractice={false}
            controlsDisabled={Boolean(sceneWordBlocking)}
            showSceneWordChip={Boolean(view?.showSceneWordChip)}
            onOpenSceneWords={openSceneWordsInChat}
            sceneWordGateSceneId={gateSceneId}
            onDismissSceneWords={dismissSceneWords}
            scrollToSceneId={scrollToSceneId}
          />
        )}
      </div>
    </div>
  );
}
