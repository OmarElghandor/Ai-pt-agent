import Link from 'next/link';
import { buildPathPayload, type PathDayRow } from '@/lib/v2/path';

export default async function PathPage() {
  const { days } = await buildPathPayload();

  const unlocked = days.filter((d) => d.status !== 'locked');
  const lockedCount = days.length - unlocked.length;

  return (
    <main className="flex flex-1 flex-col gap-4">
      <header>
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-primary">
          المسار
        </h1>
        <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          {unlocked.length
            ? `${unlocked.length} يوم جاهز`
            : 'مفيش دروس في قاعدة البيانات لسه'}
        </p>
      </header>

      {!unlocked.length ? (
        <p className="rounded-v2-card bg-v2-card px-4 py-6 font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted shadow-[var(--shadow-v2-soft)]">
          الأيام بتفتح لما يبقى في درس محفوظ في قاعدة البيانات (مسودة أو منشور).
        </p>
      ) : null}

      <ol className="space-y-2">
        {days.map((row) => (
          <PathRow key={row.day} row={row} />
        ))}
      </ol>

      {lockedCount > 0 ? (
        <p className="pb-4 text-center font-[family-name:var(--font-v2-ui)] text-xs text-v2-ink-muted">
          {lockedCount} يوم مقفول
        </p>
      ) : null}
    </main>
  );
}

function PathRow({ row }: { row: PathDayRow }) {
  const locked = row.status === 'locked' || !row.href;
  const body = (
    <span className="flex items-center gap-3">
      <span
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-v2-ui)] text-sm',
          locked
            ? 'bg-v2-rule text-v2-ink-muted'
            : row.status === 'published'
              ? 'bg-v2-primary text-white'
              : 'bg-v2-action text-white',
        ].join(' ')}
      >
        {row.day}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className="truncate font-[family-name:var(--font-v2-target)] text-base text-v2-primary"
            dir="ltr"
          >
            {row.title_tl}
          </span>
          {row.is_story ? (
            <span className="shrink-0 rounded-full bg-v2-note px-2 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px]">
              قصة
            </span>
          ) : null}
          {row.status === 'draft' || row.status === 'reviewed' ? (
            <span className="shrink-0 font-[family-name:var(--font-v2-ui)] text-[10px] text-v2-ink-muted">
              {row.status}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
          {row.situation_eg}
        </span>
        {row.situation_tl ? (
          <span
            className="mt-0.5 block truncate font-[family-name:var(--font-v2-target)] text-xs italic text-v2-ink-muted"
            dir="ltr"
          >
            {row.situation_tl}
          </span>
        ) : null}
      </span>
    </span>
  );

  const className = [
    'block rounded-v2-card border px-3 py-3',
    locked
      ? 'border-v2-rule bg-v2-card opacity-55'
      : 'border-v2-line bg-v2-card shadow-[var(--shadow-v2-soft)]',
  ].join(' ');

  if (locked || !row.href) {
    return (
      <li>
        <div className={className} aria-disabled="true">
          {body}
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link href={row.href} className={className}>
        {body}
      </Link>
    </li>
  );
}
