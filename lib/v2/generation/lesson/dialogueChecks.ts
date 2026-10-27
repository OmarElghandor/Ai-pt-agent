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
      const speaker = (line.speaker ?? '').trim().toLowerCase();
      if (speaker !== 'learner') return line;

      const heardIds = (line.ids ?? []).filter((id) => {
        const it = bankById.get(id);
        return it?.type === 'phrase' && (it as { role?: string }).role === 'heard';
      });
      if (!heardIds.length) return line;

      // Prefer reply to previous non-learner heard line
      let heardForReply: string | null = null;
      for (let j = li - 1; j >= 0; j--) {
        const prev = block.lines[j]!;
        if ((prev.speaker ?? '').trim().toLowerCase() === 'learner') continue;
        for (const id of prev.ids ?? []) {
          const it = bankById.get(id);
          if (it?.type === 'phrase' && (it as { role?: string }).role === 'heard') {
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
        return line;
      }
      fixes.push(
        `blocks[${bi}].lines[${li}]: replaced heard with reply ${replyId}`,
      );
      const hydrated = hydrateDialogueLine([replyId], bank);
      return {
        ...line,
        ids: [replyId],
        tl: hydrated.tl,
        ar: hydrated.ar,
      };
    });
    return { ...block, lines };
  });

  return {
    page: hydrateDialogueBlocks({ ...page, blocks }, bank),
    fixes,
  };
}
