'use client';

/* Client chat controller: refs are read only when sending; storage bootstrap is one-shot. */
/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect */

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatScreen } from '@/components/ChatScreen';
import { AssessmentHeaderBar } from '@/components/LessonChrome';
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

const LEVELS: CefrLevel[] = ['A0', 'A1', 'A2', 'B1'];
const LEARNER_KEY = 'pt-learner-id';

type AgentChoice = 'friend' | 'assessment';

function agentFromParam(value: string | null): AgentChoice {
  if (value === 'assessment') return 'assessment';
  return 'friend';
}

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

async function fetchLearner(
  id: string,
  action?: 'new' | 'dismiss' | 'level',
  extra?: Record<string, unknown>,
) {
  if (action) {
    const res = await fetch('/api/learner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        action,
        localHour: new Date().getHours(),
        ...extra,
      }),
    });
    return (await res.json()) as LearnerView;
  }
  const res = await fetch(
    `/api/learner?id=${encodeURIComponent(id)}&localHour=${new Date().getHours()}`,
  );
  return (await res.json()) as LearnerView;
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="app-shell flex items-center justify-center text-muted">جاري التحميل…</div>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawAgent = searchParams.get('agent');
  const lessonParam = searchParams.get('lesson');
  const agent = agentFromParam(rawAgent);
  const agentBooted = useRef<string | null>(null);

  // Legacy practice agent → lessons runtime
  useEffect(() => {
    if (rawAgent === 'practice') {
      if (lessonParam) {
        router.replace(`/lessons/${encodeURIComponent(lessonParam)}`);
      } else {
        router.replace('/lessons');
      }
    }
  }, [rawAgent, lessonParam, router]);

  const [viewMode, setViewMode] = useState<'voice' | 'text'>('voice');
  const [learnerId, setLearnerId] = useState('pending');
  const [view, setView] = useState<LearnerView | null>(null);
  const [level, setLevel] = useState<CefrLevel>('A0');
  const [input, setInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [levelOpen, setLevelOpen] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const lastPlayedKey = useRef<string | null>(null);
  const levelRef = useRef(level);
  const sessionRef = useRef(learnerId);
  const actionRef = useRef<TurnAction>({ type: 'message' });
  const awaiting = useRef(false);

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

  const { sendMessage, status, stop, error } = useChat({
    id: learnerId,
    transport,
  });

  const { playing, activeIndex, activeSegments, playSegments, stop: stopAudio } =
    useSegmentAudio();
  const mic = useMicRecorder();
  const isBusy = status === 'submitted' || status === 'streaming';

  const unlockAudio = useCallback(() => {
    sessionStorage.setItem('pt-audio-unlocked', '1');
    setAudioUnlocked(true);
  }, []);

  const playAuthored = useCallback(
    (segs: AuthoredSegment[]) => {
      const converted = toSegments(segs).filter((s) => s.text.trim());
      if (converted.length) void playSegments(converted);
    },
    [playSegments],
  );

  useEffect(() => {
    // Client-only bootstrap from storage (avoid SSR hydration mismatch).
    setLearnerId(learnerIdFromStorage());
    setAudioUnlocked(sessionStorage.getItem('pt-audio-unlocked') === '1');
    setDevOpen(localStorage.getItem('pt-dev-panel') === '1');
  }, []);

  useEffect(() => {
    if (learnerId === 'pending') return;
    let cancel = false;
    void fetchLearner(learnerId).then((data) => {
      if (cancel || !data.messages) return;
      setView(data);
      setLevel(data.level);
      const last = data.messages.at(-1);
      if (last) lastPlayedKey.current = last.id;
    });
    return () => {
      cancel = true;
    };
  }, [learnerId]);

  useEffect(() => {
    if (isBusy || learnerId === 'pending' || !awaiting.current) return;
    awaiting.current = false;
    void fetchLearner(learnerId).then((data) => {
      if (!data.messages) return;
      setView(data);
      setPendingUserText(null);
      setVoiceTranscript('');
    });
  }, [isBusy, learnerId]);

  // Autoplay new assistant messages in order (reaction, then next prompt).
  useEffect(() => {
    if (isBusy || !view || !audioUnlocked || !autoplay || playing) return;
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
    playAuthored(ttsSegmentsFor(next));
  }, [view, isBusy, autoplay, playing, audioUnlocked, playAuthored]);

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
      void sendMessage({ text: trimmed || action.type });
    },
    [isBusy, learnerId, sendMessage, unlockAudio],
  );

  // Enter the chosen agent once after the learner view loads.
  useEffect(() => {
    if (!view || isBusy || learnerId === 'pending') return;
    const bootKey = `${learnerId}:${agent}`;
    if (agentBooted.current === bootKey) return;
    if (view.mode !== 'friend') {
      agentBooted.current = bootKey;
      return;
    }

    if (agent === 'assessment') {
      if (lessonParam) {
        agentBooted.current = bootKey;
        sendText(lessonParam, { type: 'start-assessment', lessonId: lessonParam });
        return;
      }
      const assess = view.chips.find((c) => c.action.type === 'start-assessment');
      if (assess) {
        agentBooted.current = bootKey;
        sendText(assess.label, assess.action);
      } else {
        agentBooted.current = bootKey;
      }
    } else {
      agentBooted.current = bootKey;
    }
  }, [view, agent, isBusy, learnerId, sendText, lessonParam]);

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

  const onChip = (chip: Chip) => {
    sendText(chip.label, chip.action);
  };

  const resetConversation = () => {
    if (learnerId === 'pending') return;
    stopAudio();
    mic.cancel();
    setVoiceTranscript('');
    setMenuOpen(false);
    void fetchLearner(learnerId, 'new').then((data) => {
      if (!data.messages) return;
      setView(data);
      lastPlayedKey.current = audioUnlocked ? null : (data.messages.at(-1)?.id ?? null);
    });
  };

  const handleMic = async () => {
    unlockAudio();
    if (playing) stopAudio();
    const text = await mic.toggle();
    if (text) {
      setVoiceTranscript(text);
      sendText(text);
    }
  };

  const handleVoiceCancel = () => {
    mic.cancel();
    setVoiceTranscript('');
    stopAudio();
  };

  const changeLevel = (next: CefrLevel) => {
    setLevel(next);
    setLevelOpen(false);
    if (learnerId === 'pending') return;
    void fetchLearner(learnerId, 'level', { level: next });
  };

  const toggleDev = () => {
    setDevOpen((open) => {
      const next = !open;
      localStorage.setItem('pt-dev-panel', next ? '1' : '0');
      return next;
    });
  };

  const displayTranscript =
    pendingUserText ||
    voiceTranscript ||
    (viewMode === 'voice' && isBusy
      ? ([...(view?.messages ?? [])].reverse().find((m) => m.role === 'user')?.segments
          .map((s) => s.text)
          .join(' ') ?? '')
      : '');

  const orbMode: OrbMode = playing
    ? 'speaking'
    : mic.transcribing
      ? 'transcribing'
      : mic.recording
        ? 'listening'
        : displayTranscript && isBusy
          ? 'idle'
          : isBusy
            ? 'transcribing'
            : 'idle';

  const lastAssistant = [...(view?.messages ?? [])]
    .reverse()
    .find((m) => m.role === 'assistant');
  const showHear = !audioUnlocked && !playing && orbMode === 'idle' && Boolean(lastAssistant);
  const caption = showHear && lastAssistant ? toSegments(ttsSegmentsFor(lastAssistant)) : [];

  const chips = useMemo(() => {
    const all = view?.chips ?? [];
    if (view?.mode !== 'friend') return all;
    if (agent === 'assessment') {
      return all.filter((c) => c.action.type === 'start-assessment');
    }
    // Friend: hide practice start chips — practice lives under /lessons
    return all.filter(
      (c) =>
        c.action.type !== 'start-practice' &&
        c.action.type !== 'resume-practice' &&
        c.action.type !== 'end-practice',
    );
  }, [view, agent]);

  const typedMessages: TypedMessage[] = view?.messages ?? [];

  const agentTitle = agent === 'assessment' ? 'اختبار' : 'صديق';

  return (
    <div className="app-shell flex justify-center">
      <div className="flex h-dvh w-full max-w-[430px] flex-col">
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
          <Link
            href="/"
            aria-label="اختيار الشريك"
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/80"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="scale-x-[-1]">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>

          <div className="flex flex-1 flex-col items-center gap-1">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">{agentTitle}</h1>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLevelOpen((v) => !v)}
                  className="rounded-full border border-border bg-surface/80 px-3 py-1 text-xs font-medium text-accent-mint backdrop-blur"
                  suppressHydrationWarning
                >
                  {level}
                </button>
                {levelOpen && (
                  <div className="absolute start-1/2 top-full z-20 mt-2 w-28 -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-xl">
                    {LEVELS.map((l) => (
                      <button
                        key={l}
                        type="button"
                        className={`block w-full px-3 py-2 text-start text-sm hover:bg-white/5 ${
                          l === level ? 'text-accent-mint' : 'text-white/80'
                        }`}
                        onClick={() => changeLevel(l)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {agent === 'friend' && view?.mode === 'friend' ? (
              <p className="text-xs text-muted">كلام حر</p>
            ) : null}
          </div>

          <div className="relative">
            <button
              type="button"
              aria-label="المزيد"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white/80"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute end-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-xl">
                <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-white/5">
                  <span>تشغيل الصوت تلقائيًا</span>
                  <input
                    type="checkbox"
                    checked={autoplay}
                    onChange={(e) => setAutoplay(e.target.checked)}
                    className="accent-[#17B9A0]"
                  />
                </label>
                <button
                  type="button"
                  className="block w-full px-4 py-3 text-start text-sm hover:bg-white/5"
                  onClick={toggleDev}
                >
                  {devOpen ? 'إخفاء سجل التقدم' : 'سجل التقدم'}
                </button>
                <button
                  type="button"
                  className="block w-full px-4 py-3 text-start text-sm text-red-300 hover:bg-white/5"
                  onClick={resetConversation}
                >
                  محادثة جديدة
                </button>
              </div>
            )}
          </div>
        </header>

        {viewMode === 'voice' && view?.assessmentHeader ? (
          <div className="border-b border-border px-3 py-2">
            <AssessmentHeaderBar header={view.assessmentHeader} />
          </div>
        ) : null}

        {viewMode === 'voice' ? (
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
            onCancel={handleVoiceCancel}
            onStopSpeaking={stopAudio}
            chips={chips}
            onChip={onChip}
            hearLabel={showHear ? 'اضغط لتسمع' : null}
            onHear={() => lastAssistant && playAuthored(ttsSegmentsFor(lastAssistant))}
            caption={caption}
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
            onPlaySegments={playAuthored}
            onOpenVoice={() => setViewMode('voice')}
            isBusy={isBusy}
            booted={view !== null}
            chips={chips}
            onChip={onChip}
            practiceHeader={null}
            assessmentHeader={view?.assessmentHeader ?? null}
            wordBank={view?.wordBank ?? null}
            sentenceFrame={view?.sentenceFrame ?? null}
            canEndPractice={false}
          />
        )}

        {devOpen && view && (
          <pre
            dir="ltr"
            className="max-h-48 overflow-auto border-t border-border bg-black/40 p-3 text-left text-[11px] leading-snug text-white/80"
          >
            {view.dev.lastLogLine}
            {'\n'}
            {JSON.stringify(view.dev.lastTurnLog, null, 2)}
            {'\n'}
            {JSON.stringify(view.dev.progress, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
