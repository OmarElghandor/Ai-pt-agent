import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
import type { CriticIssue } from './jobs/runCritic';
import { pickReplyId } from './heardReplies';
import { wordCount } from './prompts/core';
import { CHARACTERS, FUNCTION_WORDS } from '../lists';

const CAST_IDS = new Set(
  CHARACTERS.split('\n')
    .map((line) => line.split('—')[0]?.trim().toLowerCase())
    .filter(Boolean) as string[],
);

function functionWordSet(): Set<string> {
  return new Set(
    FUNCTION_WORDS.split(',')
      .map((w) => w.replace(/\s*\(.*\)\s*/g, '').trim().toLowerCase())
      .filter(Boolean),
  );
}

function tokenizeTl(tl: string): string[] {
  return tl
    .replace(/[…]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[,.;:!?«»"']+|[,.;:!?«»"']+$/g, ''))
    .filter(Boolean);
}

function itemTlTokens(item: Item): string[] {
  if (!('tl' in item) || typeof item.tl !== 'string') return [];
  return tokenizeTl(item.tl);
}

export function allowedDialogueSpeakers(chatCharacter?: string): Set<string> {
  const allowed = new Set<string>(['learner', ...CAST_IDS]);
  if (chatCharacter) allowed.add(chatCharacter.toLowerCase());
  return allowed;
}

/** Join item tl/ar for a dialogue line from ids. */
export function hydrateDialogueLine(
  ids: string[],
  bank: Item[],
): { tl: string; ar: string } {
  const partsTl: string[] = [];
  const partsAr: string[] = [];
  for (const id of ids) {
    const item = bank.find((i) => i.id === id);
    if (!item) continue;
    if ('tl' in item && typeof item.tl === 'string' && item.tl) {
      partsTl.push(item.tl);
    }
    if ('ar' in item && typeof item.ar === 'string' && item.ar) {
      partsAr.push(item.ar);
    }
  }
  return {
    tl: partsTl.join(' ').replace(/\s+([,.!?…])/g, '$1').trim(),
    ar: partsAr.join(' ').trim(),
  };
}

export function hydrateDialogueBlocks(page: Page, bank: Item[]): Page {
  return {
    ...page,
    blocks: page.blocks.map((block) => {
      if (block.type !== 'dialogue') return block;
      return {
        ...block,
        lines: block.lines.map((line) => {
          const hydrated = hydrateDialogueLine(line.ids, bank);
          return {
            ...line,
            tl: hydrated.tl || line.tl,
            ar: hydrated.ar || line.ar,
          };
        }),
      };
    }),
  };
}

/**
 * Code dialogue checks → high severity (feeds critic one-shot page rerun).
 */
export function checkDialoguePage(opts: {
  page: Page;
  items: Item[];
  recycleIds?: string[];
  maxWords: number;
  day: number;
  chatCharacter?: string;
}): CriticIssue[] {
  const issues: CriticIssue[] = [];
  const speakers = allowedDialogueSpeakers(opts.chatCharacter);
  const fn = functionWordSet();
  const bankById = new Map(opts.items.map((i) => [i.id, i]));
  const allowedIds = new Set([
    ...opts.items.map((i) => i.id),
    ...(opts.recycleIds ?? []),
  ]);

  const allowedTokens = new Set<string>();
  for (const item of opts.items) {
    for (const t of itemTlTokens(item)) allowedTokens.add(t.toLowerCase());
  }
  for (const w of fn) allowedTokens.add(w);

  // Bold tl in step tips must appear on the target line or in the bank.
  // Segments marked wrong:true are intentional counterexamples — skip them.
  for (const [si, step] of (opts.page.steps ?? []).entries()) {
    if (step.kind !== 'reveal' || !Array.isArray(step.tip)) continue;
    const boldTl = step.tip
      .filter(
        (seg) =>
          seg &&
          typeof seg === 'object' &&
          (seg as { lang?: string }).lang === 'tl' &&
          (seg as { bold?: boolean }).bold &&
          !(seg as { wrong?: boolean }).wrong &&
          typeof (seg as { text?: string }).text === 'string',
      )
      .map((seg) => String((seg as { text: string }).text).trim())
      .filter(Boolean);
    if (!boldTl.length) continue;
    const target = step.target;
    let targetLineTl = '';
    const m = target.match(/^b(\d+)(?:\/item:(\d+))?$/);
    if (m) {
      const bi = Number(m[1]) - 1;
      const block = opts.page.blocks[bi];
      if (block?.type === 'dialogue' && m[2] != null) {
        const line = block.lines[Number(m[2])];
        targetLineTl = (line?.tl || hydrateDialogueLine(line?.ids ?? [], opts.items).tl).toLowerCase();
      }
    }
    const bankTls = new Set(
      opts.items
        .filter((i) => 'tl' in i && typeof i.tl === 'string')
        .map((i) => String((i as { tl: string }).tl).toLowerCase()),
    );
    for (const tl of boldTl) {
      const lower = tl.toLowerCase();
      if (
        !targetLineTl.includes(lower) &&
        ![...bankTls].some((b) => b.includes(lower) || lower.includes(b))
      ) {
        issues.push({
          severity: 'high',
          path: `steps[${si}].tip`,
          message: `bold tl "${tl}" not in target line or item bank`,
        });
      }
    }
  }

  for (const [bi, block] of opts.page.blocks.entries()) {
    if (block.type !== 'dialogue') continue;
    for (const [li, line] of block.lines.entries()) {
      const path = `blocks[${bi}].lines[${li}]`;
      const speaker = (line.speaker ?? '').trim().toLowerCase();
      if (!speakers.has(speaker)) {
        issues.push({
          severity: 'high',
          path: `${path}.speaker`,
          message: `unknown speaker "${line.speaker}" (need cast + learner)`,
        });
      }

      if (speaker === 'learner') {
        for (const id of line.ids ?? []) {
          const item = bankById.get(id);
          if (
            item?.type === 'phrase' &&
            (item as { role?: string }).role === 'heard'
          ) {
            issues.push({
              severity: 'high',
              path: `${path}.ids`,
              message: `heard phrase ${id} must not appear on a learner line`,
            });
          }
        }
      }

      // Bare single noun: line must be a phrase/verb/sentence, not only one word item.
      const lineIds = line.ids ?? [];
      if (lineIds.length === 1) {
        const only = bankById.get(lineIds[0]!);
        if (only?.type === 'word') {
          issues.push({
            severity: 'high',
            path: `${path}.ids`,
            message: `bare noun line ${lineIds[0]} — need a phrase id or verb/sentence`,
          });
        }
      }

      // After a heard phrase with replies_to, the next learner line must include that reply.
      if (speaker === 'learner' && li > 0) {
        const prev = block.lines[li - 1]!;
        if ((prev.speaker ?? '').trim().toLowerCase() !== 'learner') {
          for (const hid of prev.ids ?? []) {
            const heard = bankById.get(hid);
            if (
              heard?.type === 'phrase' &&
              (heard as { role?: string }).role === 'heard' &&
              (heard as { replies_to?: string }).replies_to
            ) {
              const replyId = (heard as { replies_to: string }).replies_to;
              if (!(line.ids ?? []).includes(replyId)) {
                issues.push({
                  severity: 'high',
                  path: `${path}.ids`,
                  message: `learner line must include replies_to ${replyId} for heard ${hid}`,
                });
              }
            }
          }
        }
      }

      for (const id of line.ids ?? []) {
        if (!allowedIds.has(id) && !bankById.has(id)) {
          issues.push({
            severity: 'high',
            path: `${path}.ids`,
            message: `dialogue id ${id} not in items/recycle`,
          });
        }
      }

      const tl = line.tl || hydrateDialogueLine(line.ids ?? [], opts.items).tl;
      const wc = wordCount(tl);
      if (wc > opts.maxWords) {
        issues.push({
          severity: 'high',
          path: `${path}.tl`,
          message: `dialogue line has ${wc} words > max_words ${opts.maxWords}`,
        });
      }

      // If every id resolves in the bank, surface text is owned by those items —
      // skip per-token membership (avoids false positives on clitics / cloze heads).
      const allIdsKnown = (line.ids ?? []).every((id) => bankById.has(id));
      if (!allIdsKnown) {
        for (const tok of tokenizeTl(tl)) {
          const lower = tok.toLowerCase();
          if (/^\d+([.,]\d+)?$/.test(tok)) {
            if (opts.day < 4) {
              issues.push({
                severity: 'high',
                path: `${path}.tl`,
                message: `number token "${tok}" not allowed before day 4`,
              });
            }
            continue;
          }
          if (!allowedTokens.has(lower) && !fn.has(lower)) {
            const covered = [...allowedTokens].some(
              (a) => a.includes(lower) || lower.includes(a),
            );
            if (!covered) {
              issues.push({
                severity: 'high',
                path: `${path}.tl`,
                message: `token "${tok}" not in items ∪ recycle ∪ function words`,
              });
            }
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Deterministic fix after critic regen: replace learner lines that cite heard
 * phrases with a said reply for the previous heard line.
 */
export function fixDialoguePage(
  page: Page,
  bank: Item[],
): { page: Page; fixes: string[] } {
  const fixes: string[] = [];
  const bankById = new Map(bank.map((i) => [i.id, i]));

  const blocks = page.blocks.map((block, bi) => {
    if (block.type !== 'dialogue') return block;
    const lines = block.lines.map((line, li) => {
      let next = line;
      const speaker = (line.speaker ?? '').trim().toLowerCase();

      // Ensure replies_to after heard
      if (speaker === 'learner' && li > 0) {
        const prev = block.lines[li - 1]!;
        if ((prev.speaker ?? '').trim().toLowerCase() !== 'learner') {
          for (const hid of prev.ids ?? []) {
            const heard = bankById.get(hid);
            const replyId =
              heard?.type === 'phrase' &&
              (heard as { role?: string }).role === 'heard'
                ? (heard as { replies_to?: string }).replies_to ??
                  pickReplyId(hid, bank)
                : null;
            if (replyId && !(next.ids ?? []).includes(replyId)) {
              const hydrated = hydrateDialogueLine([replyId], bank);
              fixes.push(
                `blocks[${bi}].lines[${li}]: inserted replies_to ${replyId}`,
              );
              next = {
                ...next,
                ids: [replyId],
                tl: hydrated.tl,
                ar: hydrated.ar,
              };
            }
          }
        }
      }

      if (speaker !== 'learner') return next;

      const heardIds = (next.ids ?? []).filter((id) => {
        const it = bankById.get(id);
        return it?.type === 'phrase' && (it as { role?: string }).role === 'heard';
      });
      if (heardIds.length) {
        let heardForReply: string | null = null;
        for (let j = li - 1; j >= 0; j--) {
          const prev = block.lines[j]!;
          if ((prev.speaker ?? '').trim().toLowerCase() === 'learner') continue;
          for (const id of prev.ids ?? []) {
            const it = bankById.get(id);
            if (
              it?.type === 'phrase' &&
              (it as { role?: string }).role === 'heard'
            ) {
              heardForReply = id;
              break;
            }
          }
          if (heardForReply) break;
        }
        heardForReply = heardForReply ?? heardIds[0]!;
        const replyId = pickReplyId(heardForReply, bank);
        if (!replyId) {
          fixes.push(
            `blocks[${bi}].lines[${li}]: no said reply for ${heardForReply}`,
          );
          return next;
        }
        fixes.push(
          `blocks[${bi}].lines[${li}]: replaced heard with reply ${replyId}`,
        );
        const hydrated = hydrateDialogueLine([replyId], bank);
        next = {
          ...next,
          ids: [replyId],
          tl: hydrated.tl,
          ar: hydrated.ar,
        };
      }

      // Bare noun → try replies_to from previous heard, else drop to nearest said phrase
      if ((next.ids ?? []).length === 1) {
        const only = bankById.get(next.ids![0]!);
        if (only?.type === 'word') {
          let replyId: string | null = null;
          for (let j = li - 1; j >= 0; j--) {
            const prev = block.lines[j]!;
            if ((prev.speaker ?? '').trim().toLowerCase() === 'learner') continue;
            for (const id of prev.ids ?? []) {
              replyId = pickReplyId(id, bank);
              if (replyId) break;
            }
            if (replyId) break;
          }
          if (!replyId) {
            const said = bank.find(
              (i) =>
                i.type === 'phrase' &&
                (i as { role?: string }).role !== 'heard' &&
                !(i as { derived?: boolean }).derived,
            );
            replyId = said?.id ?? null;
          }
          if (replyId) {
            const hydrated = hydrateDialogueLine([replyId], bank);
            fixes.push(
              `blocks[${bi}].lines[${li}]: replaced bare noun with ${replyId}`,
            );
            next = {
              ...next,
              ids: [replyId],
              tl: hydrated.tl,
              ar: hydrated.ar,
            };
          }
        }
      }

      return next;
    });
    return { ...block, lines };
  });

  return {
    page: hydrateDialogueBlocks({ ...page, blocks }, bank),
    fixes,
  };
}
