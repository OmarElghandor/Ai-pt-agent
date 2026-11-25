'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Tab = 'situations' | 'official' | 'custom';

type SituationDeck = {
  day: number;
  id: string;
  title_tl: string;
  title_ar: string;
  situation_eg: string;
  card_count: number;
  imageable_count: number;
  missing_images: number;
  images_status: string;
  source: 'published' | 'bank' | 'lesson' | 'none';
  lesson_status: string | null;
  bank_status: string | null;
};

type OfficialDeck = {
  id: string;
  title_tl: string;
  title_ar: string;
  status: string;
  word_count: number;
  source_deck: string | null;
  missing_images: number;
  images_status: string;
};

type CustomDeck = {
  id: string;
  title_tl: string;
  title_ar: string;
  visibility: string;
  status: string;
  report_count: number;
  added_count: number;
  images_status?: string;
  word_count: number;
};

function tabFromParam(v: string | null): Tab {
  if (v === 'custom') return 'custom';
  if (v === 'official') return 'official';
  return 'situations';
}

/** Lesson image pipeline needs a lesson pack (draft OK). */
function canGenerateSituationImages(d: SituationDeck): boolean {
  return Boolean(d.lesson_status) && d.missing_images > 0;
}

function situationImagesDisabledReason(d: SituationDeck): string {
  if (!d.lesson_status) return 'no lesson — generate/open lesson first';
  if (d.missing_images === 0) return 'no missing images';
  return '';
}

function lessonStatusLabel(status: string | null): string {
  if (!status) return '—';
  return status;
}

function AdminFlashcardsInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => tabFromParam(searchParams.get('tab')));
  const [situations, setSituations] = useState<SituationDeck[]>([]);
  const [official, setOfficial] = useState<OfficialDeck[]>([]);
  const [custom, setCustom] = useState<CustomDeck[]>([]);
  const [filter, setFilter] = useState('all');
  const [cost, setCost] = useState<{ jobs: number; quota_jobs: number } | null>(
    null,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyDeckId, setBusyDeckId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setTab(tabFromParam(searchParams.get('tab')));
  }, [searchParams]);

  const loadSituations = useCallback(async () => {
    const res = await fetch('/api/v2/admin/situation-decks');
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const json = (await res.json()) as { decks: SituationDeck[] };
    setSituations(json.decks);
    setError(null);
  }, []);

  const loadOfficial = useCallback(async () => {
    const res = await fetch('/api/v2/admin/official-decks');
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const json = (await res.json()) as { decks: OfficialDeck[] };
    setOfficial(json.decks);
    setError(null);
  }, []);

  const loadCustom = useCallback(async () => {
    const res = await fetch(
      `/api/v2/admin/custom-decks?filter=${encodeURIComponent(filter)}`,
    );
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const json = (await res.json()) as {
      decks: CustomDeck[];
      cost: { jobs: number; quota_jobs: number };
    };
    setCustom(json.decks);
    setCost(json.cost);
    setError(null);
  }, [filter]);

  useEffect(() => {
    if (tab === 'situations') void loadSituations();
    else if (tab === 'official') void loadOfficial();
    else void loadCustom();
  }, [tab, loadSituations, loadOfficial, loadCustom]);

  useEffect(() => {
    setSelected(new Set());
    setMessage(null);
  }, [tab, filter]);

  const allIds = useMemo(() => {
    if (tab === 'situations') return situations.map((d) => String(d.day));
    if (tab === 'official') return official.map((d) => d.id);
    return custom.map((d) => d.id);
  }, [tab, situations, official, custom]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (prev.size === allIds.length) return new Set();
      return new Set(allIds);
    });
  }

  async function patchCustom(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/v2/admin/custom-decks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await loadCustom();
  }

  async function generateSituationDeck(day: number) {
    const row = situations.find((d) => d.day === day);
    const hasCards =
      (row?.card_count ?? 0) > 0 || row?.bank_status === 'ready';
    if (hasCards) {
      const ok = window.confirm(
        `Day ${day}: regenerate and overwrite the existing deck?`,
      );
      if (!ok) return;
    }

    setBusyDeckId(`deck:${day}`);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/v2/admin/situation-decks/${day}/generate`,
        { method: 'POST' },
      );
      const json = (await res.json()) as {
        status?: string;
        source?: string;
        item_count?: number;
        message_eg?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(json.message_eg ?? json.error ?? (await res.text()));
        return;
      }
      if (json.status === 'generating') {
        setMessage(`Day ${day}: بنجهّز الكروت…`);
      } else {
        setMessage(
          `Day ${day}: ${json.item_count ?? 0} cards (${json.source ?? json.status})`,
        );
      }
      await loadSituations();
    } finally {
      setBusyDeckId(null);
    }
  }

  async function bulkSituationDecks() {
    const days = [...selected].map(Number).filter((n) => Number.isInteger(n));
    if (!days.length) return;
    const targets = situations.filter((d) => days.includes(d.day));
    if (!targets.length) return;

    const withExisting = targets.filter(
      (d) => d.card_count > 0 || d.bank_status === 'ready',
    ).length;
    const ok = window.confirm(
      withExisting > 0
        ? `Regenerate decks for ${targets.length} day(s)?\nWill overwrite ${withExisting} existing.`
        : `Generate decks for ${targets.length} day(s)?`,
    );
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      let ready = 0;
      let failed = 0;
      for (const row of targets) {
        const res = await fetch(
          `/api/v2/admin/situation-decks/${row.day}/generate`,
          { method: 'POST' },
        );
        const json = (await res.json()) as {
          status?: string;
          message_eg?: string;
        };
        if (!res.ok || json.status === 'failed') {
          failed += 1;
          setError(
            json.message_eg ??
              `Day ${row.day} generate failed (${res.status})`,
          );
          break;
        }
        if (json.status === 'ready') ready += 1;
      }
      setMessage(
        `Regenerate decks: ready ${ready}${failed ? ` · failed ${failed}` : ''} · tried ${targets.length}`,
      );
      await loadSituations();
    } finally {
      setBusy(false);
    }
  }

  async function generateSituationImages(day: number) {
    setBusyDeckId(String(day));
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/v2/admin/images/generate-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day }),
      });
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        missing?: number;
        jobIds?: string[];
        estimate_usd?: number;
      };
      if (!res.ok) {
        setError(json.error ?? (await res.text()));
        return;
      }
      setMessage(
        json.message ??
          `Day ${day}: missing ${json.missing ?? 0} · jobs ${json.jobIds?.length ?? 0}`,
      );
      await loadSituations();
    } finally {
      setBusyDeckId(null);
    }
  }

  async function bulkSituationImages() {
    const days = [...selected].map(Number).filter((n) => Number.isInteger(n));
    if (!days.length) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const withMissing = situations.filter(
        (d) => days.includes(d.day) && canGenerateSituationImages(d),
      );
      if (!withMissing.length) {
        setMessage(
          'المحددين مفيش عندهم صور ناقصة أو مفيش درس (لازم lesson)',
        );
        return;
      }
      const totalMissing = withMissing.reduce((s, d) => s + d.missing_images, 0);
      const ok = window.confirm(
        `ولّد الصور الناقصة للمواقف؟\nناقص ${totalMissing} · ${withMissing.length} يوم`,
      );
      if (!ok) return;

      let enqueued = 0;
      for (const row of withMissing) {
        const res = await fetch('/api/v2/admin/images/generate-missing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day: row.day }),
        });
        if (!res.ok) {
          setError(await res.text());
          break;
        }
        const json = (await res.json()) as { jobIds?: string[] };
        enqueued += json.jobIds?.length ?? 0;
      }
      setMessage(`اتعمل enqueue لـ ${enqueued} صورة عبر ${withMissing.length} يوم`);
      await loadSituations();
    } finally {
      setBusy(false);
    }
  }

  async function bulkImages(confirmOverCap = false) {
    if (tab === 'situations') {
      await bulkSituationImages();
      return;
    }
    const deck_ids = [...selected];
    if (!deck_ids.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const previewQs = new URLSearchParams({ kind: tab });
      for (const id of deck_ids) previewQs.append('deck_id', id);
      const previewRes = await fetch(
        `/api/v2/admin/flashcards/images/bulk?${previewQs}`,
      );
      if (!previewRes.ok) {
        setError(await previewRes.text());
        return;
      }
      const preview = (await previewRes.json()) as {
        missing_count: number;
        estimate_usd: number;
      };
      const ok = window.confirm(
        `ولّد الصور للمحددين؟\nناقص ${preview.missing_count} · تقدير ~$${preview.estimate_usd.toFixed(2)}\n(${deck_ids.length} مجموعة)`,
      );
      if (!ok) return;

      const res = await fetch('/api/v2/admin/flashcards/images/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: tab,
          deck_ids,
          confirm_over_cap: confirmOverCap,
        }),
      });
      if (res.status === 409) {
        const again = window.confirm('هنتجاوز الحد اليومي للصور. تأكيد؟');
        if (again) {
          setBusy(false);
          await bulkImages(true);
          return;
        }
        return;
      }
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const json = (await res.json()) as {
        totals: { enqueued: number; reused: number; missing_before: number };
      };
      setMessage(
        `اتعمل enqueue: ${json.totals.enqueued} · reused ${json.totals.reused} · كان ناقص ${json.totals.missing_before}`,
      );
      if (tab === 'official') await loadOfficial();
      else await loadCustom();
    } finally {
      setBusy(false);
    }
  }

  async function generateDeckImages(
    deckId: string,
    kind: 'official' | 'custom',
    confirmOverCap = false,
  ) {
    setBusyDeckId(deckId);
    setMessage(null);
    setError(null);
    try {
      if (kind === 'custom') {
        const previewRes = await fetch(
          `/api/v2/admin/custom-decks/${encodeURIComponent(deckId)}/images`,
        );
        if (!previewRes.ok) {
          setError(await previewRes.text());
          return;
        }
        const preview = (await previewRes.json()) as {
          missing_count: number;
          estimate_usd: number;
        };
        if (preview.missing_count === 0) {
          setMessage('مفيش صور ناقصة في المجموعة دي');
          return;
        }
        const ok = window.confirm(
          `ولّد الصور الناقصة؟\nناقص ${preview.missing_count} · تقدير ~$${preview.estimate_usd.toFixed(2)}`,
        );
        if (!ok) return;

        const res = await fetch(
          `/api/v2/admin/custom-decks/${encodeURIComponent(deckId)}/images`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm_over_cap: confirmOverCap }),
          },
        );
        if (res.status === 409) {
          const again = window.confirm('هنتجاوز الحد اليومي للصور. تأكيد؟');
          if (again) {
            setBusyDeckId(null);
            await generateDeckImages(deckId, kind, true);
            return;
          }
          return;
        }
        if (!res.ok) {
          setError(await res.text());
          return;
        }
        const json = (await res.json()) as {
          enqueued?: number;
          reused?: number;
        };
        setMessage(
          `مجموعة ${deckId}: enqueue ${json.enqueued ?? 0} · reused ${json.reused ?? 0}`,
        );
        await loadCustom();
        return;
      }

      const previewQs = new URLSearchParams({
        kind: 'official',
        deck_id: deckId,
      });
      const previewRes = await fetch(
        `/api/v2/admin/flashcards/images/bulk?${previewQs}`,
      );
      if (!previewRes.ok) {
        setError(await previewRes.text());
        return;
      }
      const preview = (await previewRes.json()) as {
        missing_count: number;
        estimate_usd: number;
      };
      if (preview.missing_count === 0) {
        setMessage('مفيش صور ناقصة في المجموعة دي');
        return;
      }
      const ok = window.confirm(
        `ولّد الصور الناقصة؟\nناقص ${preview.missing_count} · تقدير ~$${preview.estimate_usd.toFixed(2)}`,
      );
      if (!ok) return;

      const res = await fetch(
        `/api/v2/admin/official-decks/${encodeURIComponent(deckId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'images' }),
        },
      );
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const json = (await res.json()) as {
        enqueued?: number;
        reused?: number;
      };
      setMessage(
        `مجموعة رسمية: enqueue ${json.enqueued ?? 0} · reused ${json.reused ?? 0}`,
      );
      await loadOfficial();
    } finally {
      setBusyDeckId(null);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState({}, '', url.toString());
  }

  const anyBusy = busy || busyDeckId != null;

  const selectedCanGenerateImages =
    tab === 'situations' &&
    situations.some(
      (d) => selected.has(String(d.day)) && canGenerateSituationImages(d),
    );

  return (
    <main className="flex flex-1 flex-col gap-5 pb-12" dir="ltr">
      <header className="space-y-1">
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-ink">
          Flashcards
        </h1>
        <p className="text-sm text-v2-ink-muted">
          Situation decks (curriculum) · official themes · learner custom decks
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'situations' as const, label: 'Situations (المواقف)' },
            { id: 'official' as const, label: 'Official (مواضيع)' },
            { id: 'custom' as const, label: 'Custom (من المتعلمين)' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTab(t.id)}
            className={[
              'rounded-v2-chip px-3 py-1.5 text-sm',
              tab === t.id
                ? 'bg-v2-action text-white'
                : 'bg-v2-card text-v2-ink-muted',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'custom' && cost ? (
        <p className="text-sm text-v2-ink-muted">
          Today: {cost.quota_jobs} quota generations · {cost.jobs} jobs total
        </p>
      ) : null}

      {tab === 'custom' ? (
        <div className="flex flex-wrap gap-2">
          {['all', 'reported', 'not_promoted', 'popular'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={[
                'rounded-v2-chip px-3 py-1 text-xs',
                filter === f
                  ? 'bg-v2-ink text-white'
                  : 'border border-v2-rule bg-v2-card text-v2-ink-muted',
              ].join(' ')}
            >
              {f}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {tab === 'situations' ? (
          <button
            type="button"
            disabled={anyBusy || selected.size === 0}
            onClick={() => void bulkSituationDecks()}
            className="rounded-v2-chip bg-v2-action px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Regenerate decks ({selected.size})
          </button>
        ) : null}
        <button
          type="button"
          disabled={
            anyBusy ||
            selected.size === 0 ||
            (tab === 'situations' && !selectedCanGenerateImages)
          }
          title={
            tab === 'situations' && selected.size > 0 && !selectedCanGenerateImages
              ? 'Selected days have no missing images or no lesson'
              : undefined
          }
          onClick={() => void bulkImages()}
          className={[
            'rounded-v2-chip px-4 py-2 text-sm disabled:opacity-50',
            tab === 'situations' && selectedCanGenerateImages
              ? 'bg-v2-action text-white'
              : 'border border-v2-rule bg-v2-card',
          ].join(' ')}
        >
          ولّد الصور للمحددين ({selected.size})
        </button>
        {message ? (
          <span className="text-sm text-v2-ink-muted">{message}</span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-v2-row border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-v2-row border border-v2-rule bg-v2-card">
        {tab === 'situations' ? (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-v2-rule text-left text-v2-ink-muted">
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allIds.length > 0 && selected.size === allIds.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2">day</th>
                <th className="px-3 py-2">title</th>
                <th className="px-3 py-2">lesson</th>
                <th className="px-3 py-2">source</th>
                <th className="px-3 py-2 text-right">cards</th>
                <th className="px-3 py-2">images</th>
                <th className="px-3 py-2 text-right">missing</th>
                <th className="px-3 py-2">actions</th>
              </tr>
            </thead>
            <tbody>
              {situations.map((d) => {
                const imagesOk = canGenerateSituationImages(d);
                const imagesWhy = situationImagesDisabledReason(d);
                return (
                <tr key={d.day} className="border-t border-v2-rule/60">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(String(d.day))}
                      onChange={() => toggle(String(d.day))}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{d.day}</td>
                  <td className="px-3 py-2">
                    <div>{d.title_ar}</div>
                    <div className="text-xs text-v2-ink-muted">{d.title_tl}</div>
                    {d.situation_eg ? (
                      <div className="mt-0.5 text-xs text-v2-ink-muted">
                        {d.situation_eg}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={[
                        'rounded-v2-chip px-2 py-0.5 text-xs',
                        d.lesson_status === 'published'
                          ? 'bg-emerald-100 text-emerald-900'
                          : d.lesson_status === 'reviewed'
                            ? 'bg-sky-100 text-sky-900'
                            : d.lesson_status
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-v2-card text-v2-ink-muted border border-v2-rule',
                      ].join(' ')}
                    >
                      {lessonStatusLabel(d.lesson_status)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div>{d.source}</div>
                    {d.bank_status ? (
                      <div className="text-xs text-v2-ink-muted">
                        bank {d.bank_status}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">{d.card_count}</td>
                  <td className="px-3 py-2">{d.images_status}</td>
                  <td className="px-3 py-2 text-right">{d.missing_images}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={anyBusy}
                        onClick={() => void generateSituationDeck(d.day)}
                        className="rounded-v2-chip border border-v2-rule bg-v2-paper px-2 py-1 text-xs disabled:opacity-40"
                      >
                        {busyDeckId === `deck:${d.day}`
                          ? '…'
                          : d.card_count > 0 || d.bank_status === 'ready'
                            ? 'Regenerate deck'
                            : 'Generate deck'}
                      </button>
                      <button
                        type="button"
                        disabled={anyBusy || !imagesOk}
                        title={imagesOk ? undefined : imagesWhy}
                        onClick={() => void generateSituationImages(d.day)}
                        className={[
                          'rounded-v2-chip px-2 py-1 text-xs disabled:opacity-40',
                          imagesOk
                            ? 'bg-v2-action text-white'
                            : 'border border-v2-rule bg-v2-paper text-v2-ink-muted',
                        ].join(' ')}
                      >
                        {busyDeckId === String(d.day) ? '…' : 'ولّد الصور'}
                      </button>
                      <Link
                        href={`/v2-admin/lessons/${d.day}`}
                        className="text-xs underline"
                      >
                        open
                      </Link>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        ) : tab === 'official' ? (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-v2-rule text-left text-v2-ink-muted">
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allIds.length > 0 && selected.size === allIds.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2">title</th>
                <th className="px-3 py-2">status</th>
                <th className="px-3 py-2 text-right">words</th>
                <th className="px-3 py-2">images</th>
                <th className="px-3 py-2 text-right">missing</th>
                <th className="px-3 py-2">actions</th>
              </tr>
            </thead>
            <tbody>
              {official.map((d) => (
                <tr key={d.id} className="border-t border-v2-rule/60">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggle(d.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div>{d.title_ar}</div>
                    <div className="text-xs text-v2-ink-muted">{d.title_tl}</div>
                  </td>
                  <td className="px-3 py-2">{d.status}</td>
                  <td className="px-3 py-2 text-right">{d.word_count}</td>
                  <td className="px-3 py-2">{d.images_status}</td>
                  <td className="px-3 py-2 text-right">{d.missing_images}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={anyBusy || d.missing_images === 0}
                        onClick={() => void generateDeckImages(d.id, 'official')}
                        className="text-xs text-v2-action underline disabled:opacity-40"
                      >
                        {busyDeckId === d.id ? '…' : 'ولّد الصور'}
                      </button>
                      {d.source_deck ? (
                        <Link
                          href={`/v2-admin/custom-decks/${d.source_deck}/promote`}
                          className="text-xs underline"
                        >
                          edit / promote
                        </Link>
                      ) : d.status === 'draft' ? (
                        <span className="text-xs text-v2-ink-muted">draft</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-v2-rule text-left text-v2-ink-muted">
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allIds.length > 0 && selected.size === allIds.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2">title</th>
                <th className="px-3 py-2">vis</th>
                <th className="px-3 py-2">status</th>
                <th className="px-3 py-2 text-right">added</th>
                <th className="px-3 py-2 text-right">reports</th>
                <th className="px-3 py-2">images</th>
                <th className="px-3 py-2 text-right">words</th>
                <th className="px-3 py-2">actions</th>
              </tr>
            </thead>
            <tbody>
              {custom.map((d) => (
                <tr key={d.id} className="border-t border-v2-rule/60">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggle(d.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div>{d.title_ar}</div>
                    <div className="text-xs text-v2-ink-muted">{d.title_tl}</div>
                  </td>
                  <td className="px-3 py-2">{d.visibility}</td>
                  <td className="px-3 py-2">{d.status}</td>
                  <td className="px-3 py-2 text-right">{d.added_count}</td>
                  <td className="px-3 py-2 text-right">{d.report_count}</td>
                  <td className="px-3 py-2">{d.images_status ?? 'none'}</td>
                  <td className="px-3 py-2 text-right">{d.word_count}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={anyBusy || d.images_status === 'ready'}
                        onClick={() => void generateDeckImages(d.id, 'custom')}
                        className="text-xs text-v2-action underline disabled:opacity-40"
                      >
                        {busyDeckId === d.id ? '…' : 'ولّد الصور'}
                      </button>
                      <button
                        type="button"
                        disabled={anyBusy}
                        onClick={() =>
                          void patchCustom(d.id, {
                            action: 'visibility',
                            visibility:
                              d.visibility === 'hidden' ? 'public' : 'hidden',
                          })
                        }
                        className="text-xs underline disabled:opacity-40"
                      >
                        {d.visibility === 'hidden' ? 'unhide' : 'hide'}
                      </button>
                      <button
                        type="button"
                        disabled={anyBusy}
                        onClick={() => {
                          if (!window.confirm(`Delete «${d.title_ar}»?`)) return;
                          void patchCustom(d.id, { action: 'delete' });
                        }}
                        className="text-xs text-amber-800 underline disabled:opacity-40"
                      >
                        delete
                      </button>
                      {d.status === 'custom' ? (
                        <Link
                          href={`/v2-admin/custom-decks/${d.id}/promote`}
                          className="text-xs underline"
                        >
                          promote
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

export default function AdminFlashcardsPage() {
  return (
    <Suspense
      fallback={
        <main className="py-6 text-sm text-v2-ink-muted">Loading…</main>
      }
    >
      <AdminFlashcardsInner />
    </Suspense>
  );
}
