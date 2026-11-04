import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CoachBank, CoachBankLine } from './types';

const DEFAULT_PATH = path.join(
  process.cwd(),
  'content/v2/convo/coach-bank.eg.json',
);

let cached: CoachBank | null = null;

function isLine(v: unknown): v is CoachBankLine {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.eg === 'string';
}

export function parseCoachBank(raw: unknown): CoachBank {
  if (!raw || typeof raw !== 'object') {
    throw new Error('coach bank: expected object');
  }
  const bank: CoachBank = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      throw new Error(`coach bank: "${key}" must be an array`);
    }
    const lines: CoachBankLine[] = [];
    for (const row of value) {
      if (!isLine(row)) {
        throw new Error(`coach bank: bad line under "${key}"`);
      }
      lines.push({ id: row.id, eg: row.eg });
    }
    bank[key] = lines;
  }
  return bank;
}

export function loadCoachBank(filePath: string = DEFAULT_PATH): CoachBank {
  if (cached && filePath === DEFAULT_PATH) return cached;
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  const bank = parseCoachBank(raw);
  if (filePath === DEFAULT_PATH) cached = bank;
  return bank;
}

/** Test helper: clear the module cache. */
export function clearCoachBankCache(): void {
  cached = null;
}
