'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatScreen } from '@/components/ChatScreen';
import { VoiceScreen } from '@/components/VoiceScreen';
import type { OrbMode } from '@/components/SpeakingOrb';
import { useMicRecorder } from '@/hooks/useMicRecorder';
import { useSegmentAudio } from '@/hooks/useSegmentAudio';
import {
  parseTaggedMessage,
  stripLanguageTags,
} from '@/lib/parseTaggedMessage';
import type { CefrLevel } from '@/lib/prompts';

const LEVELS: CefrLevel[] = ['A0', 'A1', 'A2', 'B1'];

function messageText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function newSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function ChatPage() {
  const [viewMode, setViewMode] = useState<'voice' | 'text'>('voice');
  // Stable on SSR; assign a real id only on the client to avoid hydration drift
  const [sessionId, setSessionId] = useState('pending');
  useEffect(() => {
    setSessionId((id) => (id === 'pending' ? newSessionId() : id));
  }, []);
  const [level, setLevel] = useState<CefrLevel>('A0');
  const [input, setInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [levelOpen, setLevelOpen] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const lastPlayedId = useRef<string | null>(null);
  const lastLoggedId = useRef<string | null>(null);
  const levelRef = useRef(level);
  const sessionRef = useRef(sessionId);

  levelRef.current = level;
  sessionRef.current = sessionId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest({ messages, id }) {
          return {
            body: {
              message: messages[messages.length - 1],
              id,
              sessionId: sessionRef.current,
              level: levelRef.current,
            },
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, stop, setMessages, error } = useChat({
    id: sessionId,
    transport,
  });

  const { playing, activeIndex, activeSegments, playSegments, stop: stopAudio } =
    useSegmentAudio();
  const mic = useMicRecorder();
  const isBusy = status === 'submitted' || status === 'streaming';

  // Log each finished assistant reply (browser console)
  useEffect(() => {
    if (isBusy) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    const text = messageText(last);
    if (!text.trim()) return;

    if (lastLoggedId.current !== last.id) {
      lastLoggedId.current = last.id;
      const segments = parseTaggedMessage(text).filter((s) => s.text.trim());
      console.log('[chat] generated content (raw):', text);
      console.log(
        '[chat] generated segments (TTS):',
        segments.map((s, i) => ({
          i,
          lang: s.lang,
          text: s.text,
          ttsText: s.ttsText,
        })),
      );
    }

    // Autoplay TTS after streaming finishes
    if (!autoplay || playing) return;
    if (lastPlayedId.current === last.id) return;
    lastPlayedId.current = last.id;
    const segments = parseTaggedMessage(text).filter((s) => s.text.trim());
    if (segments.length) void playSegments(segments);
  }, [messages, isBusy, autoplay, playing, playSegments]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || isBusy) return;
      setInput('');
      void sendMessage({ text });
    },
    [input, isBusy, sendMessage],
  );

  const resetConversation = () => {
    stopAudio();
    mic.cancel();
    lastPlayedId.current = null;
    lastLoggedId.current = null;
    setVoiceTranscript('');
    setMessages([]);
    setSessionId(newSessionId());
    setMenuOpen(false);
  };

  const playMessage = (m: UIMessage) => {
    const text = messageText(m);
    const segments = parseTaggedMessage(text).filter((s) => s.text.trim());
    if (segments.length) void playSegments(segments);
  };

  const copyMessage = async (m: UIMessage) => {
    const text = stripLanguageTags(messageText(m));
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.warn('clipboard failed');
    }
  };

  const handleMic = async () => {
    if (playing) stopAudio();
    const text = await mic.toggle();
    if (text) {
      setVoiceTranscript(text);
      void sendMessage({ text });
    }
  };

  const handleVoiceCancel = () => {
    mic.cancel();
    setVoiceTranscript('');
    stopAudio();
  };

  const orbMode: OrbMode = playing
    ? 'speaking'
    : mic.transcribing
      ? 'transcribing'
      : mic.recording
        ? 'listening'
        : isBusy
          ? 'transcribing'
          : 'idle';

  // While chat is streaming on voice screen, show last user text as transcript
  const displayTranscript =
    voiceTranscript ||
    (viewMode === 'voice' && isBusy
      ? messageText(
          [...messages].reverse().find((m) => m.role === 'user') ?? {
            id: '',
            role: 'user',
            parts: [],
          },
        )
      : '');

  return (
    <div className="app-shell flex justify-center">
      <div className="flex h-dvh w-full max-w-[430px] flex-col">
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
          <button
            type="button"
            aria-label="رجوع"
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/80"
            onClick={() =>
              viewMode === 'text' ? setViewMode('voice') : window.history.back()
            }
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="scale-x-[-1]"
            >
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="flex flex-1 items-center justify-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">شريك البرتغالي</h1>
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
                      onClick={() => {
                        setLevel(l);
                        setLevelOpen(false);
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                  className="block w-full px-4 py-3 text-start text-sm text-red-300 hover:bg-white/5"
                  onClick={resetConversation}
                >
                  محادثة جديدة
                </button>
              </div>
            )}
          </div>
        </header>

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
          />
        ) : (
          <ChatScreen
            messages={messages}
            status={status}
            error={error}
            input={input}
            setInput={setInput}
            onSubmit={handleSubmit}
            onStop={() => stop()}
            onPlayMessage={playMessage}
            onCopyMessage={copyMessage}
            onOpenVoice={() => setViewMode('voice')}
            isBusy={isBusy}
          />
        )}
      </div>
    </div>
  );
}
