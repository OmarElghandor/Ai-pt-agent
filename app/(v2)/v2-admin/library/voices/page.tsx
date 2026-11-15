'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Voice = {
  key: string;
  who?: string;
  gender?: string;
  kind: string;
  elevenlabs_voice_id?: string;
  stability?: unknown;
  similarity?: unknown;
  style?: unknown;
  approved: boolean;
};

type Settings = {
  model?: unknown;
  output_format?: unknown;
  monthly_char_limit?: unknown;
  speed_by_level?: Record<string, unknown>;
  check_script_text?: string;
};

export default function LibraryVoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/v2/admin/library/voices/manage');
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const json = (await res.json()) as { voices: Voice[]; settings: Settings | null };
    setVoices(json.voices);
    setSettings(json.settings ?? {});
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch('/api/v2/admin/library/voices/manage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(await res.text());
      return null;
    }
    setMessage('اتحفظ');
    await load();
    return res.json();
  }

  return (
    <main
      dir="rtl"
      className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 font-[family-name:var(--font-v2-arabic)]"
    >
      <p className="text-sm text-v2-ink-muted">
        <Link href="/v2-admin/library" className="underline">
          المكتبة
        </Link>
        {' · الأصوات'}
      </p>
      <h1 className="text-2xl text-v2-ink">أصوات المكتبة</h1>
      {error ? (
        <p className="rounded-v2-row border border-v2-attention bg-v2-attention/15 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-v2-primary">{message}</p>
      ) : null}

      <section className="space-y-2 rounded-v2-card border border-v2-line bg-v2-card p-4">
        <h2 className="font-medium">إعدادات عامة</h2>
        <label className="block text-sm">
          نص اختبار pt-PT (بيكتبه Omar)
          <textarea
            rows={3}
            dir="ltr"
            className="mt-1 w-full rounded border border-v2-line px-2 py-1 text-start"
            value={settings.check_script_text ?? ''}
            onChange={(e) =>
              setSettings((s) => ({ ...s, check_script_text: e.target.value }))
            }
          />
        </label>
        <label className="block text-sm">
          الموديل
          <input
            dir="ltr"
            className="mt-1 w-full rounded border border-v2-line px-2 py-1"
            value={String(settings.model ?? '')}
            onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          الحد الشهري (حروف)
          <input
            dir="ltr"
            className="mt-1 w-full rounded border border-v2-line px-2 py-1"
            value={String(settings.monthly_char_limit ?? '')}
            onChange={(e) =>
              setSettings((s) => ({ ...s, monthly_char_limit: e.target.value }))
            }
          />
        </label>
        <button
          type="button"
          className="rounded-v2-chip bg-v2-action px-3 py-1 text-white"
          onClick={() =>
            void patch({
              action: 'settings',
              patch: {
                check_script_text: settings.check_script_text,
                model: settings.model,
                monthly_char_limit: settings.monthly_char_limit,
                output_format: settings.output_format,
                speed_by_level: settings.speed_by_level,
              },
            })
          }
        >
          احفظ الإعدادات
        </button>
      </section>

      <div className="space-y-3">
        {voices.map((v) => (
          <div
            key={v.key}
            className="rounded-v2-card border border-v2-line bg-v2-card p-3 space-y-2"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <strong dir="ltr">{v.key}</strong>
              <span>{v.who}</span>
              <span>{v.gender}</span>
              <span>{v.kind}</span>
              <span>{v.approved ? 'معتمد' : 'مش معتمد'}</span>
            </div>
            <input
              dir="ltr"
              className={`w-full rounded border px-2 py-1 text-sm ${
                String(v.elevenlabs_voice_id ?? '').includes('<<')
                  ? 'border-v2-attention'
                  : 'border-v2-line'
              }`}
              value={v.elevenlabs_voice_id ?? ''}
              onChange={(e) =>
                setVoices((list) =>
                  list.map((x) =>
                    x.key === v.key
                      ? { ...x, elevenlabs_voice_id: e.target.value }
                      : x,
                  ),
                )
              }
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-v2-chip border border-v2-line px-2 py-1 text-xs"
                onClick={() =>
                  void patch({
                    action: 'voice',
                    key: v.key,
                    patch: {
                      elevenlabs_voice_id: v.elevenlabs_voice_id,
                      stability: v.stability,
                      similarity: v.similarity,
                      style: v.style,
                    },
                  })
                }
              >
                احفظ
              </button>
              <button
                type="button"
                className="rounded-v2-chip border border-v2-line px-2 py-1 text-xs"
                onClick={() =>
                  void patch({ action: 'test', key: v.key }).then((r) => {
                    if (r && (r as { url?: string }).url) {
                      const audio = new Audio((r as { url: string }).url);
                      void audio.play().catch(() => undefined);
                    }
                  })
                }
              >
                اختبار الصوت
              </button>
              <button
                type="button"
                className="rounded-v2-chip bg-v2-action px-2 py-1 text-xs text-white"
                onClick={() => void patch({ action: 'approve', key: v.key })}
              >
                اعتمد
              </button>
              <button
                type="button"
                className="rounded-v2-chip border border-v2-line px-2 py-1 text-xs"
                onClick={() => void patch({ action: 'reject', key: v.key })}
              >
                ارفض
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
