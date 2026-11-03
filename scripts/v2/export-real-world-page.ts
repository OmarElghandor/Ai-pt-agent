/**
 * Export Day N real_world page JSON + stitch-style screenshot HTML.
 * Usage: npx tsx scripts/v2/export-real-world-page.ts <day>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(name: string) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

function toArabicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]!);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainRt(
  segs: Array<{ text?: string }> | undefined,
): string {
  if (!Array.isArray(segs)) return '';
  return segs.map((s) => s.text ?? '').join('');
}

async function main() {
  const day = Number(process.argv[2] ?? '3');
  const { getLatestLesson } = await import(
    '@/lib/v2/generation/lesson/save'
  );
  const lesson = await getLatestLesson(day);
  if (!lesson?.data) {
    console.error(`No lesson for day ${day}`);
    process.exit(1);
  }
  const data = lesson.data as {
    pages?: Array<Record<string, unknown>>;
    items?: Array<Record<string, unknown>>;
    lesson?: { situation?: { tl?: string; eg?: string } };
  };
  const page = (data.pages ?? []).find((p) => p.preset === 'real_world');
  if (!page) {
    console.error('No real_world page on lesson');
    console.error(
      'presets:',
      (data.pages ?? []).map((p) => p.preset).join(', '),
    );
    process.exit(1);
  }
  const rw = page.real_world as
    | {
        phrase_ids?: string[];
        categories?: Array<{ id: string; label_eg: string }>;
      }
    | undefined;
  const bank = new Map(
    (data.items ?? []).map((i) => [String(i.id), i]),
  );
  const phrases = (rw?.phrase_ids ?? [])
    .map((id, i) => {
      const item = bank.get(id);
      if (!item) return null;
      return {
        index: i + 1,
        id,
        tl: String(item.tl ?? ''),
        tl_f: item.tl_f ? String(item.tl_f) : undefined,
        ar: String(item.ar ?? ''),
        say: String(item.say ?? ''),
        eg_note: String(item.context_eg ?? ''),
        tag: String(item.tag ?? ''),
        category: String(item.category ?? 'other'),
      };
    })
    .filter(Boolean) as Array<{
    index: number;
    id: string;
    tl: string;
    tl_f?: string;
    ar: string;
    say: string;
    eg_note: string;
    tag: string;
    category: string;
  }>;

  const tipBlock = (page.blocks as Array<Record<string, unknown>> | undefined)?.find(
    (b) => b.type === 'tip',
  );
  const out = {
    day,
    version: lesson.version,
    status: lesson.status,
    page,
    phrases,
    tip: tipBlock
      ? {
          title: plainRt(tipBlock.title as Array<{ text?: string }>),
          body: plainRt(tipBlock.body as Array<{ text?: string }>),
          title_rt: tipBlock.title,
          body_rt: tipBlock.body,
        }
      : null,
  };

  mkdirSync('tmp', { recursive: true });
  const jsonPath = `tmp/day${String(day).padStart(2, '0')}-real-world.page.json`;
  writeFileSync(jsonPath, JSON.stringify(out, null, 2) + '\n');

  const situation =
    data.lesson?.situation ??
    ({
      tl: 'No café',
      eg: 'في الكافيه',
    } as { tl?: string; eg?: string });
  const pill =
    String(page.pill ?? '') ||
    `${(situation.tl ?? '').toUpperCase()} · ${situation.eg ?? ''}`;
  const title = plainRt(page.title as Array<{ text?: string }>) || 'بيقولوها كده';
  const subtitle =
    plainRt(page.subtitle as Array<{ text?: string }>) ||
    situation.eg ||
    '';
  const cats = rw?.categories ?? [];
  const tipTitle = out.tip?.title ?? 'نصيحة';
  const tipBodyHtml = Array.isArray(tipBlock?.body)
    ? (tipBlock!.body as Array<{ text?: string; lang?: string; bold?: boolean }>)
        .map((s) => {
          const t = esc(s.text ?? '');
          if (s.lang === 'tl') {
            return `<strong dir="ltr" class="text-primary">${t}</strong>`;
          }
          return t;
        })
        .join('')
    : esc(out.tip?.body ?? '');

  const cardsHtml = phrases
    .map((p) => {
      return `<div class="phrase-card bg-white rounded-xl p-4 shadow-sm" data-cat="${esc(p.category)}">
  <div class="flex items-start justify-between gap-2 mb-2">
    <div class="flex items-center gap-1.5">
      <span class="w-6 h-6 rounded-full bg-surface-container text-primary flex items-center justify-center text-[10px] font-semibold">${toArabicDigits(p.index)}</span>
      ${p.tag ? `<span class="px-2 py-0.5 rounded-full bg-surface-container text-primary text-[10px]">${esc(p.tag)}</span>` : ''}
    </div>
    <button type="button" class="w-9 h-9 rounded-full bg-surface-container-low text-primary flex items-center justify-center" aria-label="استمع">🔊</button>
  </div>
  <div dir="ltr" class="text-left mb-1">
    <p class="font-serif text-lg font-semibold text-primary">${esc(p.tl)}</p>
    ${p.say ? `<p class="text-xs text-muted mt-0.5 font-arabic">${esc(p.say)}</p>` : ''}
  </div>
  <div class="meaning-box">
    <p class="text-sm font-medium font-arabic">${esc(p.ar)}</p>
    ${p.eg_note ? `<p class="text-xs text-muted mt-0.5 font-arabic">${esc(p.eg_note)}</p>` : ''}
  </div>
  <div class="mt-3"><button type="button" class="rounded-full border border-secondary/40 px-3 py-1 text-xs font-semibold text-secondary font-arabic">+ للكروت</button></div>
</div>`;
    })
    .join('\n');

  const chipsHtml =
    cats.length >= 2
      ? `<div class="flex gap-1.5 overflow-x-auto pb-2">
  <button type="button" class="shrink-0 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs">الكل (${toArabicDigits(phrases.length)})</button>
  ${cats
    .map((c) => {
      const n = phrases.filter((p) => p.category === c.id).length;
      return `<button type="button" class="shrink-0 px-3 py-1.5 rounded-full bg-surface-container text-xs font-arabic">${esc(c.label_eg)} (${toArabicDigits(n)})</button>`;
    })
    .join('\n  ')}
</div>`
      : '';

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>بيقولوها كده · Day ${day}</title>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:wght@600;700&family=Noto+Sans+Arabic:wght@400;500;600&display=swap" rel="stylesheet"/>
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        background: '#fff8f2',
        primary: '#003c41',
        'on-primary': '#ffffff',
        secondary: '#a9361d',
        muted: '#8C8C86',
        'surface-container': '#f8ecdb',
        'surface-container-low': '#fef2e1',
        'tertiary-fixed': '#fee263',
        'on-surface': '#201b11',
      },
      fontFamily: {
        serif: ['Newsreader', 'serif'],
        arabic: ['Noto Sans Arabic', 'sans-serif'],
      },
    },
  },
};
</script>
<style>
  body { font-family: 'Noto Sans Arabic', sans-serif; }
  .font-serif { font-family: Newsreader, serif; }
  .font-arabic { font-family: 'Noto Sans Arabic', sans-serif; }
</style>
</head>
<body class="bg-background text-on-surface min-h-screen">
<main class="mx-auto max-w-[390px] px-4 pb-24 pt-4 flex flex-col gap-3">
  <header class="flex items-center gap-2 mb-1">
    <span class="text-primary font-semibold font-arabic">بيقولوها كده</span>
  </header>
  <section class="rounded-xl bg-surface-container p-4 shadow-sm">
    <span class="inline-block px-2.5 py-0.5 rounded-full bg-primary text-on-primary text-[10px] mb-2 tracking-wide">${esc(pill)}</span>
    <h1 class="text-xl font-bold text-primary font-arabic leading-tight">${esc(title)}</h1>
    ${subtitle ? `<p class="mt-1 text-xs text-muted font-arabic">${esc(subtitle)}</p>` : ''}
  </section>
  <div class="flex items-center justify-between gap-2">
    <span class="text-[10px] text-muted font-arabic">${toArabicDigits(phrases.length)} عبارات</span>
    <button type="button" class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container text-xs font-arabic">غطّي المعنى</button>
  </div>
  ${chipsHtml}
  <div class="flex flex-col gap-2">
${cardsHtml}
  </div>
  <aside class="rounded-xl border border-amber-200 bg-tertiary-fixed/40 p-4">
    <p class="font-semibold text-sm font-arabic mb-1">${esc(tipTitle)}</p>
    <p class="text-sm font-arabic leading-6">${tipBodyHtml}</p>
  </aside>
  <button type="button" class="mt-2 w-full rounded-full bg-secondary text-white py-3 font-semibold font-arabic">التالي</button>
</main>
</body>
</html>
`;

  const htmlPath =
    'design/stitch-html/17-real-world-phrases.day03.screenshot.code.html';
  mkdirSync('design/stitch-html', { recursive: true });
  writeFileSync(htmlPath, html);
  console.log(JSON.stringify({ jsonPath, htmlPath, phraseCount: phrases.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
