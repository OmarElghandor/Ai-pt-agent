'use client';

import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';
import { TaggedBubble } from '@/components/TaggedBubble';

function messageText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

type Props = {
  messages: UIMessage[];
  status: string;
  error?: Error | undefined;
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onStop: () => void;
  onPlayMessage: (m: UIMessage) => void;
  onCopyMessage: (m: UIMessage) => void;
  onOpenVoice: () => void;
  isBusy: boolean;
};

export function ChatScreen({
  messages,
  status,
  error,
  input,
  setInput,
  onSubmit,
  onStop,
  onPlayMessage,
  onCopyMessage,
  onOpenVoice,
  isBusy,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !isBusy && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full avatar-gradient text-2xl">
              🇵🇹
            </div>
            <p className="text-lg font-medium">أهلاً! جاهز نتكلم؟</p>
            <p className="text-sm text-muted">
              اكتب بأي موضوع — بالبرتغالي أو بالمصري. أنا هتابعك.
            </p>
          </div>
        )}

        <ul className="flex flex-col gap-5">
          {messages.map((m) => {
            const text = messageText(m);
            if (m.role === 'user') {
              return (
                <li key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-[24px] rounded-ee-md bg-bubble-user px-4 py-3 text-bubble-user-fg shadow-sm">
                    <p
                      dir="auto"
                      className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap"
                    >
                      {text}
                    </p>
                  </div>
                </li>
              );
            }

            return (
              <li key={m.id} className="flex flex-col gap-2">
                <div className="flex items-end gap-2.5">
                  <div
                    className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full avatar-gradient text-xs font-bold text-[#04100e]"
                    aria-hidden
                  >
                    PT
                  </div>
                  <div className="max-w-[85%] rounded-[24px] rounded-es-md border border-border bg-bubble-assistant px-4 py-3 text-white/95">
                    <TaggedBubble raw={text} />
                  </div>
                </div>
                {status !== 'streaming' && (
                  <div className="flex items-center gap-2 ps-11">
                    <button
                      type="button"
                      onClick={() => onPlayMessage(m)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted hover:text-white"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      تشغيل
                    </button>
                    <button
                      type="button"
                      onClick={() => void onCopyMessage(m)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted hover:text-white"
                    >
                      نسخ
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {isBusy && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="mt-5 flex items-end gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full avatar-gradient text-xs font-bold text-[#04100e]">
              PT
            </div>
            <div className="rounded-[24px] border border-border bg-bubble-assistant px-4 py-3 text-sm text-muted">
              بيكتب…
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 text-center text-sm text-red-300">
            حصل خطأ: {error.message}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={onSubmit}
        className="safe-bottom flex items-center gap-2.5 px-4 pb-5 pt-2"
      >
        <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-surface/90 px-4 py-2.5 backdrop-blur">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اكتب رسالة..."
            dir="auto"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-muted"
            disabled={isBusy && status === 'submitted'}
          />
          <button
            type="button"
            aria-label="وضع الصوت"
            onClick={onOpenVoice}
            className="text-muted hover:text-accent-mint"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"
                strokeLinecap="round"
              />
              <path
                d="M3 17c2-4 4-4 6 0s4 4 6 0 4-4 6 0"
                strokeLinecap="round"
                opacity="0.5"
              />
            </svg>
          </button>
        </div>

        {isBusy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="إيقاف"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            aria-label="إرسال"
            disabled={!input.trim()}
            className="accent-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[#04100e] shadow-lg shadow-teal-900/40 disabled:opacity-40"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="scale-x-[-1] translate-x-px"
            >
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        )}
      </form>
    </>
  );
}
