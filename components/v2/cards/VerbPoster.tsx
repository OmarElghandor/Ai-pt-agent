import { AudioButton } from '@/components/v2/AudioButton';
import { Icon } from '@/components/v2/Icon';
import type { CardFacePayload } from '@/lib/v2/decks';
import type { VerbClass } from '@/lib/v2/content/conjugations/regular';

const ENDING: Record<VerbClass, string> = {
  ar: 'text-v2-verb-ar-text',
  er: 'text-v2-verb-er',
  ir: 'text-v2-verb-ir-text',
};

type Row = NonNullable<CardFacePayload['conjugation']>[number];

export function VerbPoster({
  lemma,
  verbClass,
  rows,
}: {
  lemma: string;
  verbClass?: VerbClass | 'irregular';
  rows: Row[];
}) {
  const cls = verbClass === 'ar' || verbClass === 'er' || verbClass === 'ir'
    ? verbClass
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p
          dir="ltr"
          className="font-[family-name:var(--font-v2-target)] text-sm font-semibold uppercase tracking-wide text-v2-ink-muted"
        >
          {lemma}
        </p>
        <span className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
          المضارع
        </span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.person}
            className="flex items-center justify-between gap-2 rounded-v2-row bg-v2-paper-deep/60 px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <AudioButton text={row.tl} size="chip" label={`نطق ${row.tl}`} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2" dir="ltr">
                  {row.irregular ? (
                    <span className="inline-flex items-center gap-0.5 font-[family-name:var(--font-v2-target)] text-base font-semibold text-v2-verb-irregular">
                      {row.tl}
                      <Icon name="bolt" size={20} className="text-v2-verb-irregular" />
                    </span>
                  ) : (
                    <span
                      dir="ltr"
                      className="font-[family-name:var(--font-v2-target)] text-base font-semibold text-v2-primary"
                    >
                      {row.stem ? (
                        <>
                          <span className="text-v2-ink-muted">{row.stem}</span>
                          <span className={cls ? ENDING[cls] : ''}>{row.ending}</span>
                        </>
                      ) : (
                        row.tl
                      )}
                    </span>
                  )}
                  <span className="font-[family-name:var(--font-v2-target)] text-xs text-v2-ink-muted">
                    {row.label_tl}
                  </span>
                </div>
                {!row.irregular ? (
                  <span className="font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-ink-muted">
                    عادي
                  </span>
                ) : null}
              </div>
            </div>
            <span className="shrink-0 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
              {row.label_ar}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
