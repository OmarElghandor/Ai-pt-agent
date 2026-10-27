import { parseTarget } from '@/lib/v2/render/target';
import type { Block } from './blocks';
import { hasForm, loadConjugationSeed, type SeedFile } from './conjugations/resolve';
import type { LessonPack } from './lesson';
import type { Page } from './page';
import type { Rt, RtGroup } from './rt';

export type Issue = {
  path: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
};

export type ConjugationLookup = (formId: string) => boolean;

export type ValidateOptions = {
  mode?: 'normal' | 'strict';
  conjugations?: ConjugationLookup;
  seed?: SeedFile;
  /** Required core item ids (non-verb + verb stubs) that must appear in the bank. */
  coreIds?: string[];
  /**
   * Closed set for page/question refs: core ∪ recycle ∪ KNOWN.
   * When set, a non-form ref outside this set is an error even if it is in the bank.
   */
  allowedIds?: Iterable<string>;
};

/** Conjugated form id: verb.lemma:tense:person */
export function isVerbFormId(ref: string): boolean {
  return /^verb\.[^:]+:[^:]+:[^:]+$/i.test(ref);
}

/** Lemma card id: verb.falar (no colons). */
export function isVerbLemmaId(ref: string): boolean {
  return /^verb\.[a-z_]+$/i.test(ref) && !ref.includes(':');
}

export type ValidateResult = {
  issues: Issue[];
};

export function hasErrors(result: ValidateResult): boolean {
  return result.issues.some((i) => i.severity === 'error');
}

const ARABIC_RE = /[\u0600-\u06FF]/;
const LATIN_RE = /[A-Za-zÀ-ÿ]/;

function issue(
  path: string,
  rule: string,
  message: string,
  severity: 'error' | 'warning' = 'error',
): Issue {
  return { path, rule, message, severity };
}

function isRt(value: unknown): value is Rt {
  return (
    Array.isArray(value) &&
    value.every(
      (s) =>
        s &&
        typeof s === 'object' &&
        typeof (s as { text?: unknown }).text === 'string' &&
        typeof (s as { lang?: unknown }).lang === 'string',
    )
  );
}

function rejectRawMixed(path: string, value: unknown, issues: Issue[]): void {
  if (typeof value !== 'string') return;
  if (ARABIC_RE.test(value) && LATIN_RE.test(value)) {
    issues.push(
      issue(path, 'raw_mixed_string', `Mixed Arabic/Latin string must use rt: "${value.slice(0, 40)}"`),
    );
  }
}

function walkStrings(path: string, value: unknown, issues: Issue[], inRt: boolean): void {
  if (value == null) return;
  if (typeof value === 'string') {
    if (!inRt) rejectRawMixed(path, value, issues);
    return;
  }
  if (Array.isArray(value)) {
    if (isRt(value)) {
      for (let i = 0; i < value.length; i++) {
        const seg = value[i]!;
        // segments themselves are not "raw mixed" across langs
        void seg;
      }
      return;
    }
    value.forEach((v, i) => walkStrings(`${path}[${i}]`, v, issues, inRt));
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walkStrings(`${path}.${k}`, v, issues, inRt);
    }
  }
}

function formLookup(
  opts: ValidateOptions,
): ConjugationLookup {
  if (opts.conjugations) return opts.conjugations;
  const seed = opts.seed ?? loadConjugationSeed();
  return (id) => hasForm(id, seed);
}

/** Collect item/form refs from a block (exported for staged page validation). */
export function collectRefsFromBlock(block: Block, refs: string[]): void {
  switch (block.type) {
    case 'cards':
      refs.push(...block.items);
      break;
    case 'table':
      for (const row of block.cells) {
        for (const cell of row) {
          if (cell && typeof cell === 'object' && 'ref' in cell && typeof cell.ref === 'string') {
            refs.push(cell.ref);
          }
        }
      }
      break;
    case 'compare':
      for (const col of block.columns) {
        for (const e of col.entries) refs.push(e.ref);
      }
      break;
    case 'vs_pairs':
      for (const p of block.pairs) {
        refs.push(p.left, p.right);
      }
      break;
    case 'formula':
      refs.push(block.pattern);
      if (block.examples) refs.push(...block.examples);
      break;
    case 'examples':
      for (const it of block.items) refs.push(it.ref);
      break;
    case 'dialogue':
      for (const line of block.lines) {
        if (line && typeof line === 'object' && Array.isArray(line.ids)) {
          refs.push(...line.ids);
        }
      }
      break;
    case 'panel':
      refs.push(...block.lines);
      break;
    case 'scene':
      for (const h of block.hotspots) refs.push(h.ref);
      break;
    case 'timeline':
      for (const p of block.points) refs.push(p.ref);
      break;
    default:
      break;
  }
}

function resolveTarget(
  target: string,
  page: Page,
  path: string,
  issues: Issue[],
): void {
  const parsed = parseTarget(target);
  if (!parsed) {
    issues.push(issue(path, 'bad_target', `Unparseable target "${target}"`));
    return;
  }
  const block = page.blocks.find((b) => b.id === parsed.blockId);
  if (!block) {
    issues.push(
      issue(path, 'bad_target', `Target block "${parsed.blockId}" not found`),
    );
    return;
  }

  switch (parsed.kind) {
    case 'block':
      return;
    case 'col':
      if (block.type === 'compare') {
        if (parsed.index < 0 || parsed.index >= block.columns.length) {
          issues.push(issue(path, 'bad_target', `col index out of range: ${target}`));
        }
      } else if (block.type === 'table') {
        if (parsed.index < 0 || parsed.index >= block.cols.length) {
          issues.push(issue(path, 'bad_target', `col index out of range: ${target}`));
        }
      } else {
        issues.push(issue(path, 'bad_target', `col target on non-compare/table: ${target}`));
      }
      return;
    case 'row':
      if (block.type !== 'table' || parsed.index < 0 || parsed.index >= block.rows.length) {
        issues.push(issue(path, 'bad_target', `row index out of range: ${target}`));
      }
      return;
    case 'cell':
      if (
        block.type !== 'table' ||
        parsed.r < 0 ||
        parsed.r >= block.rows.length ||
        parsed.c < 0 ||
        parsed.c >= block.cols.length
      ) {
        issues.push(issue(path, 'bad_target', `cell out of range: ${target}`));
      }
      return;
    case 'entry':
      if (block.type !== 'compare') {
        issues.push(issue(path, 'bad_target', `entry target on non-compare: ${target}`));
        return;
      }
      {
        const col = block.columns[parsed.col];
        if (!col || parsed.i < 0 || parsed.i >= col.entries.length) {
          issues.push(issue(path, 'bad_target', `entry out of range: ${target}`));
        }
      }
      return;
    case 'item':
      if (block.type === 'vs_pairs') {
        if (parsed.index < 0 || parsed.index >= block.pairs.length) {
          issues.push(issue(path, 'bad_target', `item out of range: ${target}`));
        }
      } else if (block.type === 'cards') {
        if (parsed.index < 0 || parsed.index >= block.items.length) {
          issues.push(issue(path, 'bad_target', `item out of range: ${target}`));
        }
      } else if (block.type === 'examples') {
        if (parsed.index < 0 || parsed.index >= block.items.length) {
          issues.push(issue(path, 'bad_target', `item out of range: ${target}`));
        }
      } else if (block.type === 'scene') {
        if (parsed.index < 0 || parsed.index >= block.hotspots.length) {
          issues.push(issue(path, 'bad_target', `item out of range: ${target}`));
        }
      } else if (block.type === 'formula') {
        const examples = block.examples ?? [];
        if (parsed.index < 0 || parsed.index >= examples.length) {
          issues.push(
            issue(path, 'bad_target', `item out of range on formula examples: ${target}`),
          );
        }
      } else if (block.type === 'panel' || block.type === 'dialogue') {
        if (parsed.index < 0 || parsed.index >= block.lines.length) {
          issues.push(
            issue(path, 'bad_target', `item out of range on ${block.type} lines: ${target}`),
          );
        }
      } else {
        issues.push(issue(path, 'bad_target', `item target unsupported on ${block.type}`));
      }
      return;
  }
}

/** Exported for unit tests / future renderer. */
export { parseTarget, resolveTarget };

function checkBlockLimits(block: Block, path: string, issues: Issue[]): void {
  switch (block.type) {
    case 'cards':
      if (block.items.length > 20) {
        issues.push(issue(path, 'block_limit', 'cards ≤ 20 items'));
      }
      break;
    case 'table':
      if (block.cols.length > 4 || block.rows.length > 8) {
        issues.push(issue(path, 'block_limit', 'table ≤ 4 cols × 8 rows'));
      }
      for (let r = 0; r < block.cells.length; r++) {
        if (block.cells[r]!.length !== block.cols.length) {
          issues.push(
            issue(
              `${path}.cells[${r}]`,
              'table_cell_count',
              `row has ${block.cells[r]!.length} cells, expected ${block.cols.length}`,
            ),
          );
        }
      }
      if (block.cells.length !== block.rows.length) {
        issues.push(
          issue(path, 'table_cell_count', 'cells row count must match rows length'),
        );
      }
      break;
    case 'compare':
      if (block.columns.length > 3) {
        issues.push(issue(path, 'block_limit', 'compare ≤ 3 columns'));
      }
      for (const [i, col] of block.columns.entries()) {
        if (col.entries.length > 7) {
          issues.push(issue(`${path}.columns[${i}]`, 'block_limit', 'compare ≤ 7 entries/col'));
        }
      }
      {
        const expected: RtGroup[] = ['a', 'b', 'c'].slice(0, block.columns.length) as RtGroup[];
        const actual = block.columns.map((c) => c.group);
        if (actual.join(',') !== expected.join(',')) {
          issues.push(
            issue(
              path,
              'compare_groups',
              `compare groups must be ${expected.join(',')} in order, got ${actual.join(',')}`,
            ),
          );
        }
      }
      break;
    case 'vs_pairs':
      if (block.pairs.length > 5) {
        issues.push(issue(path, 'block_limit', 'vs_pairs ≤ 5'));
      }
      break;
    case 'examples':
      if (block.items.length > 4) {
        issues.push(issue(path, 'block_limit', 'examples ≤ 4'));
      }
      break;
    case 'rules_list':
      if (block.items.length > 4) {
        issues.push(issue(path, 'block_limit', 'rules_list ≤ 4'));
      }
      break;
    case 'dialogue':
      if (block.lines.length > 8) {
        issues.push(issue(path, 'block_limit', 'dialogue ≤ 8 lines'));
      }
      break;
    case 'scene':
      if (block.hotspots.length > 8) {
        issues.push(issue(path, 'block_limit', 'scene ≤ 8 hotspots'));
      }
      break;
    case 'panel':
      if (block.lines.length > 3) {
        issues.push(issue(path, 'block_limit', 'panel ≤ 3 lines'));
      }
      break;
    case 'timeline':
      if (block.points.length > 5) {
        issues.push(issue(path, 'block_limit', 'timeline ≤ 5 points'));
      }
      break;
    case 'practice':
      if (block.questions.length > 3) {
        issues.push(issue(path, 'block_limit', 'practice ≤ 3 questions'));
      }
      break;
    case 'formula':
      if ((block.examples?.length ?? 0) > 4) {
        issues.push(issue(path, 'block_limit', 'formula ≤ 4 examples'));
      }
      break;
    default:
      break;
  }
}

function checkGuidedSteps(page: Page, path: string, issues: Issue[]): void {
  const steps = page.steps ?? [];
  if (steps.length < 12 || steps.length > 20) {
    issues.push(
      issue(
        `${path}.steps`,
        'guided_step_count',
        `guided pages need 12–20 steps, got ${steps.length}`,
      ),
    );
  }
  for (let i = 0; i < Math.min(3, steps.length); i++) {
    if (steps[i]!.kind === 'ask') {
      issues.push(
        issue(
          `${path}.steps[${i}]`,
          'ask_too_early',
          'no ask allowed in the first 3 steps',
        ),
      );
    }
  }
  // every sliding window of 4 consecutive steps from index 3 onward
  for (let start = 3; start <= steps.length - 4; start++) {
    const window = steps.slice(start, start + 4);
    if (!window.some((s) => s.kind === 'ask')) {
      issues.push(
        issue(
          `${path}.steps`,
          'ask_density',
          `no ask in steps ${start + 1}–${start + 4}`,
        ),
      );
    }
  }
  // also require at least one ask somewhere after step 3 if length >= 4
  if (steps.length >= 4 && !steps.slice(3).some((s) => s.kind === 'ask')) {
    issues.push(
      issue(`${path}.steps`, 'ask_density', 'guided page needs at least one ask after step 3'),
    );
  }

  for (const [i, step] of steps.entries()) {
    resolveTarget(step.target, page, `${path}.steps[${i}].target`, issues);
    if (step.kind === 'ask') {
      if (!step.ask) {
        issues.push(issue(`${path}.steps[${i}]`, 'ask_missing', 'ask step missing ask payload'));
        continue;
      }
      const correct = step.ask.options.filter((o) => o.correct).length;
      if (correct !== 1) {
        issues.push(
          issue(
            `${path}.steps[${i}].ask`,
            'ask_correct_count',
            `ask must have exactly one correct option, got ${correct}`,
          ),
        );
      }
    }
  }
}

function checkAllowedRef(
  ref: string,
  path: string,
  itemIds: Set<string>,
  lookup: ConjugationLookup,
  allowed: Set<string> | null,
  issues: Issue[],
): void {
  if (isVerbFormId(ref)) {
    if (!lookup(ref)) {
      issues.push(issue(path, 'bad_form_id', `unknown form id ${ref}`));
    }
    return;
  }
  if (allowed && !allowed.has(ref)) {
    issues.push(
      issue(
        path,
        'ref_not_in_core_recycle_known',
        `ref ${ref} not in core ∪ recycle ∪ KNOWN`,
      ),
    );
    return;
  }
  if (!itemIds.has(ref)) {
    issues.push(issue(path, 'unknown_item_ref', `unknown item ref ${ref}`));
  }
}

export function validateLessonPack(
  pack: LessonPack,
  opts: ValidateOptions = {},
): ValidateResult {
  const mode = opts.mode ?? 'normal';
  const issues: Issue[] = [];
  const lookup = formLookup(opts);
  const allowed = opts.allowedIds
    ? new Set(
        [...opts.allowedIds].filter((id) => typeof id === 'string' && id.length),
      )
    : null;

  walkStrings('lesson', pack.lesson, issues, false);

  const itemIds = new Set<string>();
  for (const [i, item] of pack.items.entries()) {
    if (itemIds.has(item.id)) {
      issues.push(issue(`items[${i}].id`, 'duplicate_item_id', `duplicate item id ${item.id}`));
    }
    itemIds.add(item.id);
    walkStrings(`items[${i}]`, item, issues, false);
  }

  if (opts.coreIds?.length) {
    for (const id of opts.coreIds) {
      if (!itemIds.has(id)) {
        issues.push(
          issue('items', 'core_id_missing', `core id ${id} missing from draft`),
        );
      }
    }
  }

  for (const [i, item] of pack.items.entries()) {
    if (item.type !== 'pattern') continue;
    const path = `items[${i}]`;
    for (const [si, slot] of item.slots.entries()) {
      if ('fills' in slot && Array.isArray(slot.fills)) {
        for (const fid of slot.fills) {
          if (!itemIds.has(fid) && !lookup(fid)) {
            issues.push(
              issue(
                `${path}.slots[${si}].fills`,
                'unknown_item_ref',
                `pattern fill "${fid}" not in item bank`,
              ),
            );
          }
        }
      }
    }
    for (const [ei, ex] of (item.examples ?? []).entries()) {
      if (!itemIds.has(ex)) {
        issues.push(
          issue(
            `${path}.examples[${ei}]`,
            'unknown_item_ref',
            `pattern example "${ex}" not in item bank`,
          ),
        );
      }
    }
    const literals = item.slots
      .filter((s): s is { tl: string } => 'tl' in s)
      .map((s) => s.tl);
    const firstEx = item.examples?.[0];
    const exItem = firstEx
      ? pack.items.find((it) => it.id === firstEx)
      : undefined;
    const exTl =
      exItem && 'tl' in exItem && typeof exItem.tl === 'string' ? exItem.tl : '';
    if (!literals.length && !exTl) {
      issues.push(
        issue(
          path,
          'pattern_tl_missing',
          'pattern digest needs literal slot tl or a resolvable example tl',
        ),
      );
    }
  }

  const questionIds = new Set(pack.questions.map((q) => q.id));
  for (const [i, q] of pack.questions.entries()) {
    walkStrings(`questions[${i}]`, q, issues, false);
  }

  const pageCount = pack.pages.length;
  const kind = pack.lesson.kind ?? 'lesson';
  if (kind !== 'story' && kind !== 'review' && (pageCount < 4 || pageCount > 6)) {
    issues.push(
      issue(
        'pages',
        'pages_count',
        `lesson should have 4–6 pages, got ${pageCount}`,
        mode === 'strict' ? 'error' : 'warning',
      ),
    );
  }

  // lesson.pages id list matches
  for (const pid of pack.lesson.pages) {
    if (!pack.pages.some((p) => p.id === pid)) {
      issues.push(issue('lesson.pages', 'bad_ref', `lesson.pages references missing page ${pid}`));
    }
  }

  for (const [pi, page] of pack.pages.entries()) {
    const base = `pages[${pi}]`;
    if (page.blocks.length > 8) {
      issues.push(issue(`${base}.blocks`, 'block_limit', 'page ≤ 8 blocks'));
    }

    const blockIds = new Set<string>();
    for (const [bi, block] of page.blocks.entries()) {
      if (blockIds.has(block.id)) {
        issues.push(
          issue(`${base}.blocks[${bi}].id`, 'duplicate_block_id', `duplicate block ${block.id}`),
        );
      }
      blockIds.add(block.id);
      checkBlockLimits(block, `${base}.blocks[${bi}]`, issues);
      walkStrings(`${base}.blocks[${bi}]`, block, issues, false);

      const refs: string[] = [];
      collectRefsFromBlock(block, refs);
      for (const ref of refs) {
        checkAllowedRef(
          ref,
          `${base}.blocks[${bi}]`,
          itemIds,
          lookup,
          allowed,
          issues,
        );
      }

      if (block.type === 'practice') {
        for (const qid of block.questions) {
          if (!questionIds.has(qid)) {
            issues.push(
              issue(
                `${base}.blocks[${bi}].questions`,
                'bad_ref',
                `unknown question id ${qid}`,
              ),
            );
          }
        }
      }
    }

    for (const qid of page.quiz ?? []) {
      if (!questionIds.has(qid)) {
        issues.push(issue(`${base}.quiz`, 'bad_ref', `unknown question id ${qid}`));
      }
    }

    if (page.mode === 'guided') {
      if (page.controls?.length) {
        issues.push(issue(`${base}.controls`, 'mode_controls', 'guided pages must not have controls'));
      }
      checkGuidedSteps(page, base, issues);
    } else if (page.mode === 'explore') {
      if (!page.controls?.length) {
        issues.push(issue(`${base}.controls`, 'mode_controls', 'explore pages need ≥1 control'));
      }
      if (page.steps?.length) {
        issues.push(issue(`${base}.steps`, 'mode_steps', 'explore pages must not have steps'));
      }
      for (const [ci, control] of (page.controls ?? []).entries()) {
        if (control.type === 'unlock') continue;
        resolveTarget(
          control.target,
          page,
          `${base}.controls[${ci}].target`,
          issues,
        );
      }
    } else {
      // static
      if (page.steps?.length) {
        issues.push(issue(`${base}.steps`, 'mode_steps', 'static pages must not have steps'));
      }
      if (page.controls?.length) {
        issues.push(issue(`${base}.controls`, 'mode_controls', 'static pages must not have controls'));
      }
    }

    walkStrings(`${base}.title`, page.title, issues, false);
    if (page.subtitle) walkStrings(`${base}.subtitle`, page.subtitle, issues, false);
  }

  // can_do proves refs
  for (const [i, cd] of (pack.lesson.can_do ?? []).entries()) {
    for (const ref of cd.proves ?? []) {
      if (isVerbFormId(ref)) {
        if (!lookup(ref)) {
          issues.push(
            issue(`lesson.can_do[${i}]`, 'bad_form_id', `unknown form id ${ref}`),
          );
        }
      } else {
        checkAllowedRef(
          ref,
          `lesson.can_do[${i}]`,
          itemIds,
          lookup,
          allowed,
          issues,
        );
      }
    }
  }

  // question tests may include form ids
  for (const [qi, q] of pack.questions.entries()) {
    for (const ref of q.tests ?? []) {
      checkAllowedRef(
        ref,
        `questions[${qi}].tests`,
        itemIds,
        lookup,
        allowed,
        issues,
      );
    }
    const audioRef = (q as { prompt?: { audio_ref?: string } }).prompt
      ?.audio_ref;
    if (audioRef) {
      checkAllowedRef(
        audioRef,
        `questions[${qi}].prompt.audio_ref`,
        itemIds,
        lookup,
        allowed,
        issues,
      );
    }
  }

  checkIntroductionOrder(pack, issues);

  // Panel lines that are sentence items need speaker; dialogue lines carry speaker.
  for (const [pi, page] of pack.pages.entries()) {
    for (const [bi, block] of page.blocks.entries()) {
      if (block.type === 'panel') {
        for (const [li, lineId] of block.lines.entries()) {
          const item = pack.items.find((it) => it.id === lineId);
          if (item?.type === 'sentence' && !item.speaker) {
            issues.push(
              issue(
                `pages[${pi}].blocks[${bi}].lines[${li}]`,
                'sentence_speaker_required',
                `sentence ${lineId} used in panel needs speaker`,
              ),
            );
          }
        }
      }
      if (block.type === 'dialogue') {
        for (const [li, line] of block.lines.entries()) {
          if (!line.speaker?.trim()) {
            issues.push(
              issue(
                `pages[${pi}].blocks[${bi}].lines[${li}].speaker`,
                'dialogue_speaker_required',
                'dialogue line needs speaker',
              ),
            );
          }
          if (!line.ids?.length) {
            issues.push(
              issue(
                `pages[${pi}].blocks[${bi}].lines[${li}].ids`,
                'dialogue_ids_required',
                'dialogue line needs ids[]',
              ),
            );
          }
        }
      }
    }
  }

  return { issues };
}

/**
 * Continuity contract: a page must not reference an item before the page that
 * introduces it; every item with introduced_on_page N must appear on page N;
 * questions may only test items introduced up to their page_index.
 */
export function checkIntroductionOrder(pack: LessonPack, issues: Issue[]): void {
  const introById = new Map<string, number>();
  for (const item of pack.items) {
    if (typeof item.introduced_on_page === 'number') {
      introById.set(item.id, item.introduced_on_page);
    }
  }
  if (introById.size === 0) return;

  const pageIndexById = new Map<string, number>();
  for (const [pi, page] of pack.pages.entries()) {
    pageIndexById.set(page.id, pi);
  }

  for (const [pi, page] of pack.pages.entries()) {
    const refs: string[] = [];
    for (const block of page.blocks) {
      collectRefsFromBlock(block, refs);
    }
    const seenOnPage = new Set(refs.filter((r) => !isVerbFormId(r)));

    for (const ref of seenOnPage) {
      const intro = introById.get(ref);
      if (intro != null && pi < intro) {
        issues.push(
          issue(
            `pages[${pi}]`,
            'item_before_intro',
            `page references ${ref} before it is introduced on page ${intro}`,
          ),
        );
      }
    }

    for (const [itemId, introPage] of introById) {
      if (introPage !== pi) continue;
      if (!seenOnPage.has(itemId)) {
        issues.push(
          issue(
            `pages[${pi}]`,
            'intro_missing_on_page',
            `item ${itemId} is introduced_on_page ${pi} but does not appear on that page`,
          ),
        );
      }
    }
  }

  for (const [qi, q] of pack.questions.entries()) {
    const pageIndex = q.page_index;
    if (typeof pageIndex !== 'number') continue;
    for (const ref of q.tests ?? []) {
      if (isVerbFormId(ref)) continue;
      const intro = introById.get(ref);
      if (intro != null && intro > pageIndex) {
        issues.push(
          issue(
            `questions[${qi}].tests`,
            'question_before_intro',
            `question on page ${pageIndex} tests ${ref} introduced on page ${intro}`,
          ),
        );
      }
    }
  }
}

/** Collect non-form item refs used on a single page (includes verb lemma cards). */
export function collectPageItemRefs(page: Page): string[] {
  const refs: string[] = [];
  for (const block of page.blocks) {
    collectRefsFromBlock(block, refs);
  }
  return [...new Set(refs.filter((r) => !isVerbFormId(r)))];
}
