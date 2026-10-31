import { z } from 'zod';
import { callClaudeJson, zodToolSchema } from '@/lib/generation/claudeClient';
import { PageSchema, type Page } from '@/lib/v2/content/page';
import {
  collectPageItemRefs,
  hasErrors,
  validateLessonPack,
  type Issue,
} from '@/lib/v2/content/validate';
import type { Item } from '@/lib/v2/content/items';
import { formatCompactDayHeader, verifiedLemmas } from '../buildRequest';
import { splitPlainToRt } from '../coerceRt';
import { callTimingFromResult, type CallTiming } from '../cost';
import { getDayPlan } from '../plan';
import { withJsonFooter } from './jsonFooter';
import { buildCachedSystemBlocks } from './sharedPrefix';
import {
  MAX_TOKENS_PAGE,
  type OutlinePagePlan,
  type OutlineResult,
} from './types';

const PageOnlySchema = z.object({
  page: PageSchema,
});

const SUBMIT_PAGE_TOOL = {
  name: 'submit_page',
  description: 'Submit one fully written lesson page for this stage.',
  inputSchema: zodToolSchema(PageOnlySchema),
};

const COMPARE_GROUPS = ['a', 'b', 'c'] as const;

const PAGE_JSON_SKELETON = `{
  "page": {
    "id": "p1",
    "preset": "phrases",
    "mode": "guided",
    "title": [{ "text": "…", "lang": "eg" }],
    "blocks": [
      { "id": "b1", "type": "heading", "text": [{ "text": "…", "lang": "eg" }] },
      { "id": "b2", "type": "cards", "items": ["phrase.hello"] },
      {
        "id": "b3",
        "type": "compare",
        "columns": [
          {
            "head": [{ "text": "A", "lang": "eg" }],
            "group": "a",
            "entries": [{ "ref": "phrase.hello", "label": [{ "text": "Olá", "lang": "tl" }] }]
          },
          {
            "head": [{ "text": "B", "lang": "eg" }],
            "group": "b",
            "entries": [{ "ref": "phrase.thanks", "label": [{ "text": "Obrigado", "lang": "tl" }] }]
          }
        ]
      }
    ],
    "steps": [{ "target": "b1", "kind": "reveal", "tip": [{ "text": "…", "lang": "eg" }] }]
  }
}`;

/** Explore-mode controls example (use when mode is explore). tips = array of rt (each tip is a segment array). */
const EXPLORE_CONTROLS_SKELETON = `[
  { "id": "c1", "type": "reveal_axis", "target": "b2", "axis": "rows", "tips": [[{ "text": "…", "lang": "eg" }]] },
  { "id": "c2", "type": "swap", "target": "b2", "options": ["verb.ser", "verb.estar"] },
  { "id": "c3", "type": "unlock", "target": "b3" }
]`;

function formatIssues(issues: Issue[]): string {
  return issues
    .filter((i) => i.severity === 'error')
    .map((i) => `- [${i.rule}] ${i.path}: ${i.message}`)
    .join('\n');
}

function asItemId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  if (typeof o.ref === 'string') return o.ref;
  if (typeof o.id === 'string') return o.id;
  if (typeof o.item === 'string') return o.item;
  return undefined;
}

function asRt(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (
      value.length &&
      value.every(
        (s) => s && typeof s === 'object' && 'text' in s && 'lang' in s,
      )
    ) {
      return value;
    }
    const joined = value
      .map((s) =>
        typeof s === 'string'
          ? s
          : s && typeof s === 'object' && 'text' in s
            ? String((s as { text: unknown }).text)
            : '',
      )
      .join('');
    if (joined) return splitPlainToRt(joined, 'mixed');
    return value;
  }
  if (typeof value === 'string') return splitPlainToRt(value, 'mixed');
  return value;
}

function coerceEntryList(raw: unknown): { ref: string; label: unknown }[] {
  if (!Array.isArray(raw)) return [];
  const out: { ref: string; label: unknown }[] = [];
  for (const e of raw) {
    if (e && typeof e === 'object' && !Array.isArray(e)) {
      const row = e as Record<string, unknown>;
      const ref = asItemId(row.ref) ?? asItemId(row);
      if (!ref) continue;
      const label =
        row.label != null
          ? asRt(row.label)
          : [{ text: ref.split('.').pop() ?? ref, lang: 'tl' }];
      out.push({ ref, label });
      continue;
    }
    const ref = asItemId(e);
    if (ref) {
      out.push({
        ref,
        label: [{ text: ref.split('.').pop() ?? ref, lang: 'tl' }],
      });
    }
  }
  return out;
}

export function logPageSchemaFailure(
  pageId: string,
  zodError: z.ZodError,
  rawPage: unknown,
): void {
  const issues = zodError.issues.slice(0, 5).map(
    (i) => `${i.path.join('.')}: ${i.message}`,
  );
  let firstBlockKeys = '';
  if (rawPage && typeof rawPage === 'object') {
    const page = (rawPage as { page?: unknown; blocks?: unknown }).page ?? rawPage;
    const blocks =
      page && typeof page === 'object' && Array.isArray((page as { blocks?: unknown }).blocks)
        ? ((page as { blocks: unknown[] }).blocks)
        : [];
    if (blocks[0] && typeof blocks[0] === 'object') {
      firstBlockKeys = Object.keys(blocks[0] as object).join(',');
    }
  }
  console.info(
    `[v2-gen:page] schema_fail page=${pageId} issues=${JSON.stringify(issues)}${
      firstBlockKeys ? ` first_block_keys=${firstBlockKeys}` : ''
    }`,
  );
}

/** Repair common LLM shape mistakes before PageSchema. Exported for tests. */
export function normalizePageJson(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const root = data as Record<string, unknown>;
  const page = (root.page ?? root) as Record<string, unknown>;
  if (!page || typeof page !== 'object') return data;

  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  page.blocks = blocks
    .map((block, index) => {
    if (!block || typeof block !== 'object') return null;
    const b = { ...(block as Record<string, unknown>) };

    if (typeof b.id !== 'string' || !b.id.trim()) {
      b.id = `b${index + 1}`;
    }

    if (b.type === 'scene' && Array.isArray(b.hotspots)) {
      b.hotspots = b.hotspots.map((h) => {
        if (!h || typeof h !== 'object') return h;
        const hotspot = { ...(h as Record<string, unknown>) };
        const ref = asItemId(hotspot.ref) ?? asItemId(hotspot);
        if (ref) hotspot.ref = ref;
        return hotspot;
      });
    }

    if (b.type === 'timeline' && Array.isArray(b.points)) {
      b.points = b.points.map((p) => {
        if (!p || typeof p !== 'object') return p;
        const point = { ...(p as Record<string, unknown>) };
        const ref = asItemId(point.ref) ?? asItemId(point);
        if (ref) point.ref = ref;
        if (point.at != null && !['past', 'now', 'future'].includes(String(point.at))) {
          const at = String(point.at).toLowerCase();
          if (at.includes('past') || at.includes('قبل')) point.at = 'past';
          else if (at.includes('future') || at.includes('بعد')) point.at = 'future';
          else point.at = 'now';
        }
        return point;
      });
    }

    if (b.type === 'examples' && Array.isArray(b.items)) {
      b.items = b.items
        .map((it) => {
          if (Array.isArray(it)) return null;
          const ref = asItemId(it);
          return ref ? { ref } : null;
        })
        .filter(Boolean);
      if ((b.items as unknown[]).length === 0) {
        return null; // drop empty examples — never invent placeholder tips
      }
    }

    if (b.type === 'cards' && Array.isArray(b.items)) {
      b.items = b.items.map((it) => asItemId(it)).filter(Boolean);
    }

    if (b.type === 'panel' && Array.isArray(b.lines)) {
      b.lines = b.lines.map((line) => asItemId(line)).filter(Boolean);
    }

    if (b.type === 'dialogue' && Array.isArray(b.lines)) {
      b.lines = b.lines
        .map((line) => {
          if (!line || typeof line !== 'object') {
            const id = asItemId(line);
            return id
              ? { speaker: 'learner', tl: '', ar: '', ids: [id] }
              : null;
          }
          const o = line as Record<string, unknown>;
          const idsRaw = Array.isArray(o.ids) ? o.ids : [];
          const ids = idsRaw
            .map((x) => asItemId(x))
            .filter((x): x is string => Boolean(x));
          if (!ids.length) {
            const single = asItemId(o.ref ?? o.id ?? o.item);
            if (single) ids.push(single);
          }
          if (!ids.length) return null;
          return {
            speaker: String(o.speaker ?? 'learner').trim() || 'learner',
            tl: typeof o.tl === 'string' ? o.tl : '',
            ar: typeof o.ar === 'string' ? o.ar : '',
            ids,
          };
        })
        .filter(Boolean);
    }

    if (b.type === 'practice' && Array.isArray(b.questions)) {
      b.questions = b.questions.map((q) => asItemId(q)).filter(Boolean);
    }

    if (b.type === 'compare') {
      const rawCols = Array.isArray(b.columns) ? b.columns : [];
      if (rawCols.length === 0) {
        return null; // drop empty compare — never invent placeholder tips
      } else {
        b.columns = rawCols.map((col, colIndex) => {
          if (!col || typeof col !== 'object') {
            return {
              head: [{ text: String.fromCharCode(65 + colIndex), lang: 'eg' }],
              group: COMPARE_GROUPS[colIndex] ?? 'neutral',
              entries: [],
            };
          }
          const c = { ...(col as Record<string, unknown>) };
          const headSrc = c.head ?? c.title ?? c.heading ?? c.label;
          c.head = asRt(headSrc) ?? [
            { text: String.fromCharCode(65 + colIndex), lang: 'eg' },
          ];
          const entrySrc = c.entries ?? c.items ?? c.refs;
          c.entries = coerceEntryList(entrySrc);
          if (typeof c.group !== 'string' || !c.group) {
            c.group = COMPARE_GROUPS[colIndex] ?? 'neutral';
          }
          delete c.title;
          delete c.heading;
          delete c.label;
          delete c.items;
          delete c.refs;
          return c;
        });
      }
    }

    if (b.type === 'table') {
      if (!Array.isArray(b.cols) && Array.isArray(b.columns)) b.cols = b.columns;
      if (!Array.isArray(b.cols)) b.cols = [{ text: 'A', lang: 'eg' }];
      if (Array.isArray(b.rows)) {
        b.rows = b.rows.map((row) => {
          if (!row || typeof row !== 'object') {
            return { label: asRt(row) };
          }
          const r = { ...(row as Record<string, unknown>) };
          if (r.label == null && r.text != null) r.label = asRt(r.text);
          else if (r.label != null) r.label = asRt(r.label);
          else r.label = [{ text: '…', lang: 'eg' }];
          return r;
        });
      } else {
        b.rows = [];
      }
      if (!Array.isArray(b.cells)) {
        const rowCount = Array.isArray(b.rows) ? b.rows.length : 0;
        const colCount = Array.isArray(b.cols) ? b.cols.length : 1;
        b.cells = Array.from({ length: rowCount }, () =>
          Array.from({ length: colCount }, () => null),
        );
      }
    }

    if (b.type === 'heading' && b.text != null) b.text = asRt(b.text);
    if (b.type === 'tip') {
      if (b.kind === 'note' || b.kind == null || typeof b.kind !== 'string') {
        b.kind = 'culture';
      } else if (!['rule', 'culture', 'warning'].includes(String(b.kind))) {
        b.kind = 'culture';
      }
      if (b.title != null) b.title = asRt(b.title);
      if (b.body != null) b.body = asRt(b.body);
      const bodyText = Array.isArray(b.body)
        ? (b.body as { text?: string }[]).map((s) => s.text ?? '').join('').trim()
        : '';
      const GENERIC = new Set([
        'ركز على القاعدة بتاعة النهاردة',
        'شوف الجمل في الصفحة',
        'شوف النمط في الصفحة',
        'شوف الجمل في البطاقات',
      ]);
      if (!bodyText || GENERIC.has(bodyText)) return null;
    }

    if (b.type === 'formula') {
      const pattern = asItemId(b.pattern) ?? asItemId(b.ref);
      // Don't steal block.id for pattern — id was just assigned as bN
      if (pattern && !/^b\d+$/.test(pattern)) {
        b.pattern = pattern;
      } else if (typeof b.pattern === 'string' && b.pattern.length > 0) {
        // keep
      } else {
        return null; // drop broken formula — never invent placeholder tips
      }
      if (Array.isArray(b.examples)) {
        b.examples = b.examples.map((e) => asItemId(e)).filter(Boolean);
      }
    }

    if (b.type === 'vs_pairs' && Array.isArray(b.pairs)) {
      b.pairs = b.pairs.map((p) => {
        if (!p || typeof p !== 'object') return p;
        const pair = { ...(p as Record<string, unknown>) };
        const left = asItemId(pair.left);
        const right = asItemId(pair.right);
        if (left) pair.left = left;
        if (right) pair.right = right;
        return pair;
      });
    }

    return b;
  })
    .filter(Boolean);

  if (page.title != null) page.title = asRt(page.title);
  if (page.subtitle != null) page.subtitle = asRt(page.subtitle);

  if (Array.isArray(page.steps)) {
    page.steps = page.steps
      .map((step) => {
      if (!step || typeof step !== 'object') return null;
      const s = { ...(step as Record<string, unknown>) };
      if (s.tip != null) s.tip = asRt(s.tip);
      if (s.kind === 'ask') {
        if (!s.ask || typeof s.ask !== 'object') return null;
        const ask = { ...(s.ask as Record<string, unknown>) };
        if (ask.question == null && ask.question_eg != null) {
          ask.question = asRt(ask.question_eg);
        } else if (ask.question != null) {
          ask.question = asRt(ask.question);
        } else {
          return null; // incomplete ask — do not invent
        }
        if (ask.why != null) ask.why = asRt(ask.why);
        if (ask.hint != null) ask.hint = asRt(ask.hint);
        if (!Array.isArray(ask.options) || ask.options.length < 2) {
          return null; // incomplete ask — do not invent أ/ب
        }
        ask.options = ask.options.map((opt) => {
          if (!opt || typeof opt !== 'object') {
            return { label: asRt(opt), correct: false };
          }
          const o = { ...(opt as Record<string, unknown>) };
          if (o.label != null) o.label = asRt(o.label);
          else if (o.text != null) o.label = asRt(o.text);
          else return null;
          if (typeof o.correct !== 'boolean') o.correct = false;
          return o;
        });
        if (
          (ask.options as unknown[]).some((o) => o == null) ||
          (ask.options as unknown[]).length < 2
        ) {
          return null;
        }
        s.ask = ask;
      }
      return s;
    })
      .filter(Boolean);
  }

  if (Array.isArray(page.controls)) {
    const normalized: Record<string, unknown>[] = [];
    let controlIndex = 0;
    for (const raw of page.controls) {
      if (!raw || typeof raw !== 'object') continue;
      const c = { ...(raw as Record<string, unknown>) };
      const type = typeof c.type === 'string' ? c.type : '';

      if (type === 'reveal_axis') {
        if (typeof c.id !== 'string' || !c.id.trim()) {
          c.id = `c${controlIndex + 1}`;
        }
        c.axis = coerceRevealAxis(c.axis);
        c.tips = coerceControlTips(c.tips ?? c.tip);
        if (typeof c.target !== 'string' || !c.target.trim()) {
          continue;
        }
        normalized.push(c);
        controlIndex += 1;
        continue;
      }

      if (type === 'swap') {
        if (typeof c.id !== 'string' || !c.id.trim()) {
          c.id = `c${controlIndex + 1}`;
        }
        c.options = coerceSwapOptions(c);
        const hasTarget = typeof c.target === 'string' && c.target.trim().length > 0;
        if (!hasTarget) {
          // swap requires target — demote to unlock
          normalized.push({ id: c.id, type: 'unlock' });
          controlIndex += 1;
          continue;
        }
        if (!Array.isArray(c.options)) c.options = [];
        normalized.push(c);
        controlIndex += 1;
        continue;
      }

      if (type === 'unlock') {
        if (typeof c.id !== 'string' || !c.id.trim()) {
          c.id = `c${controlIndex + 1}`;
        }
        normalized.push(c);
        controlIndex += 1;
        continue;
      }

      // Unknown type — drop
    }
    page.controls = normalized;
  }

  const taught_eg =
    typeof root.taught_eg === 'string' ? root.taught_eg : undefined;
  // Always wrap as { page } even when the model put fields at the root.
  return taught_eg != null ? { page, taught_eg } : { page };
}

function coerceRevealAxis(value: unknown): 'rows' | 'cols' {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  if (s === 'rows' || s === 'row') return 'rows';
  if (s === 'cols' || s === 'col' || s === 'column' || s === 'columns') return 'cols';
  return 'rows';
}

/** tips is Rt[] — each tip is a segment array. */
function coerceControlTips(value: unknown): unknown[] {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (Array.isArray(first)) {
      return value.map((t) => {
        const rt = asRt(t);
        return Array.isArray(rt) && rt.length > 0 ? rt : [{ text: '…', lang: 'eg' }];
      });
    }
    if (first && typeof first === 'object' && 'text' in (first as object)) {
      // Flat segments mistaken for tips → wrap as one tip
      return [value];
    }
    if (typeof first === 'string') {
      return value.map((t) =>
        typeof t === 'string' && t.trim()
          ? [{ text: t, lang: 'eg' }]
          : [{ text: '…', lang: 'eg' }],
      );
    }
  }
  if (typeof value === 'string' && value.trim()) {
    return [[{ text: value, lang: 'eg' }]];
  }
  return [[{ text: '…', lang: 'eg' }]];
}

function coerceSwapOptions(c: Record<string, unknown>): string[] {
  const raw =
    c.options ?? c.choices ?? c.values ?? c.items ?? c.refs ?? undefined;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const id = asItemId(item);
    if (id) out.push(id);
  }
  return out;
}

function allowedItemIds(entry: OutlinePagePlan): Set<string> {
  return new Set([...entry.introduces, ...entry.assumes]);
}

export function validatePageAgainstOutline(
  page: Page,
  entry: OutlinePagePlan,
  items: Item[],
): Issue[] {
  const issues: Issue[] = [];
  if (page.id !== entry.page_id) {
    issues.push({
      path: 'page.id',
      rule: 'page_id_mismatch',
      message: `expected ${entry.page_id}, got ${page.id}`,
      severity: 'error',
    });
  }
  if (page.preset !== entry.preset) {
    issues.push({
      path: 'page.preset',
      rule: 'preset_mismatch',
      message: `expected ${entry.preset}, got ${page.preset}`,
      severity: 'error',
    });
  }
  if (page.mode !== entry.mode) {
    issues.push({
      path: 'page.mode',
      rule: 'mode_mismatch',
      message: `expected ${entry.mode}, got ${page.mode}`,
      severity: 'error',
    });
  }

  const isIntro =
    entry.role === 'intro' ||
    page.role === 'intro' ||
    (entry.index === 0 && entry.preset === 'story');
  const allowed = allowedItemIds(entry);
  const refs = collectPageItemRefs(page);
  // Intro story previews today's items — skip introduces∪assumes scope.
  if (!isIntro) {
    for (const ref of refs) {
      if (!allowed.has(ref)) {
        issues.push({
          path: 'page',
          rule: 'item_out_of_scope',
          message: `page uses ${ref} which is not in introduces∪assumes`,
          severity: 'error',
        });
      }
    }
  }
  for (const id of entry.introduces) {
    if (!refs.includes(id)) {
      issues.push({
        path: 'page',
        rule: 'intro_missing_on_page',
        message: `introduced item ${id} does not appear on this page`,
        severity: 'error',
      });
    }
  }

  const mini = {
    lesson: {
      id: 'tmp',
      target_lang: 'pt-PT',
      day: 1,
      kind: 'lesson' as const,
      pages: [page.id],
    },
    items,
    pages: [page],
    questions: [],
  };
  const v = validateLessonPack(mini, { mode: 'strict' });
  for (const iss of v.issues) {
    if (iss.rule === 'pages_count') continue;
    issues.push(iss);
  }

  return issues;
}

function buildPageUserPrompt(opts: {
  outline: OutlineResult;
  entry: OutlinePagePlan;
  targetLang?: string;
  errorList?: string;
}): string {
  const outlineSummary = opts.outline.pages
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(
      (p) =>
        `${p.index}. ${p.page_id} [${p.preset}/${p.mode}] "${p.title}" — ${p.purpose}\n   introduces: ${p.introduces.join(', ') || '(none)'}\n   assumes: ${p.assumes.join(', ') || '(none)'}\n   handoff: ${p.handoff}`,
    )
    .join('\n');

  const verbs = verifiedLemmas(opts.targetLang ?? 'pt-PT');
  const allowed = [...allowedItemIds(opts.entry)];

  const body = `STAGE: ONE PAGE ONLY
Write ONLY page index ${opts.entry.index} (${opts.entry.page_id}).

FULL OUTLINE (order contract — do not reorder):
${outlineSummary}

THIS PAGE PLAN ENTRY:
${JSON.stringify(opts.entry)}

Allowed item ids for this page (introduces ∪ assumes): ${allowed.join(', ') || '(none)'}
VERB_TABLE: ${verbs.join(', ')}

SKELETON (fill this shape; do not invent alternate field names):
${PAGE_JSON_SKELETON}

${
  opts.entry.mode === 'explore'
    ? `EXPLORE controls skeleton (required when mode=explore):
${EXPLORE_CONTROLS_SKELETON}
`
    : ''
}
Rules:
- page.id = ${opts.entry.page_id}, preset = ${opts.entry.preset}, mode = ${opts.entry.mode}
- Every block MUST have string id: b1, b2, b3, … (never omit id)
- compare.columns[] MUST use head (rt array), group (a|b|c), entries: [{ "ref": "item.id", "label": [{ "text": "…", "lang": "tl" }] }] — never title/items
- Use ONLY allowed item ids above (plus verb.* form ids from VERB_TABLE)
- Every introduces id MUST appear on this page
- Fill image_spec when creating a new image key; reuse EXISTING keys when possible
- guided: steps 12–20; explore: controls; static: neither
- explore controls: axis must be exactly "rows" or "cols"; reveal_axis.tips required as array of rt (e.g. [[{text,lang}]]); swap.options required string[]; control ids c1, c2, …
- panel.lines = string item ids; dialogue.lines = {speaker, ids[]} objects (code fills tl/ar)
- practice.questions = string question ids only
- cards.items = string item ids only
- Prefer cards/examples/tip/heading over complex table/scene/timeline unless preset requires them
${opts.errorList ? `\nPREVIOUS ERRORS — fix all:\n${opts.errorList}` : ''}
`;

  return withJsonFooter(body);
}

export async function runPageStage(opts: {
  outline: OutlineResult;
  entry: OutlinePagePlan;
  targetLang?: string;
  day?: number;
  /** Force first attempt to fail validation (tests). */
  forceFailOnce?: boolean;
}): Promise<{
  page: Page;
  issues: Issue[];
  timings: CallTiming[];
  model: string;
  attempts: number;
}> {
  const timings: CallTiming[] = [];
  let model = '';
  let attempts = 0;
  let lastIssues: Issue[] = [];
  let page: Page | undefined;
  const day = opts.day ?? opts.outline.lesson?.day ?? '?';

  const dayNum =
    typeof opts.day === 'number'
      ? opts.day
      : opts.outline.lesson?.day;
  const dayHeader =
    typeof dayNum === 'number'
      ? formatCompactDayHeader(getDayPlan(dayNum))
      : undefined;
  const systemBlocks = buildCachedSystemBlocks({
    items: opts.outline.items,
    dayHeader,
  });

  const tryOnce = async (errorList?: string) => {
    attempts += 1;
    const label = `page:${opts.entry.page_id}${attempts > 1 ? ':retry' : ''}`;
    const result = await callClaudeJson(
      '',
      buildPageUserPrompt({
        outline: opts.outline,
        entry: opts.entry,
        targetLang: opts.targetLang,
        errorList,
      }),
      {
        label,
        maxTokens: MAX_TOKENS_PAGE,
        systemBlocks,
        tool: SUBMIT_PAGE_TOOL,
      },
    );
    model = result.model;
    timings.push(
      callTimingFromResult({
        label,
        durationMs: result.durationMs,
        usage: result.usage,
      }),
    );

    const normalized = normalizePageJson(result.data);
    const pageObj =
      normalized && typeof normalized === 'object' && 'page' in normalized
        ? (normalized as { page: { blocks?: unknown[] } }).page
        : undefined;
    const blockTypes = Array.isArray(pageObj?.blocks)
      ? pageObj.blocks
          .map((b) =>
            b && typeof b === 'object' ? String((b as { type?: unknown }).type ?? '?') : '?',
          )
          .join(',')
      : '';
    console.info(
      `[v2-gen:page] day=${day} page=${opts.entry.page_id} attempt=${attempts} blocks=${pageObj?.blocks?.length ?? 0} types=${blockTypes || '(none)'}`,
    );

    const parsed = PageOnlySchema.safeParse(normalized);
    if (!parsed.success) {
      logPageSchemaFailure(opts.entry.page_id, parsed.error, normalized);
      lastIssues = [
        {
          path: 'page',
          rule: 'schema',
          message: parsed.error.message,
          severity: 'error',
        },
      ];
      return undefined;
    }
    return parsed.data.page;
  };

  page = await tryOnce();
  if (opts.forceFailOnce && page) {
    lastIssues = [
      {
        path: 'page',
        rule: 'forced_fail',
        message: 'forced failure for retry test',
        severity: 'error',
      },
    ];
    page = undefined;
  } else if (page) {
    lastIssues = validatePageAgainstOutline(page, opts.entry, opts.outline.items);
  }

  if ((!page || hasErrors({ issues: lastIssues })) && attempts < 2) {
    page = await tryOnce(formatIssues(lastIssues));
    if (page) {
      lastIssues = validatePageAgainstOutline(page, opts.entry, opts.outline.items);
    }
  }

  if (!page) {
    console.info(
      `[v2-gen:page] day=${day} page=${opts.entry.page_id} FAILED after ${attempts} attempt(s)`,
    );
    throw new Error(
      `Page ${opts.entry.page_id} failed: ${formatIssues(lastIssues) || 'no page'}`,
    );
  }

  console.info(
    `[v2-gen:page] day=${day} page=${opts.entry.page_id} ok attempts=${attempts} blocks=${page.blocks.length}`,
  );
  return { page, issues: lastIssues, timings, model, attempts };
}
