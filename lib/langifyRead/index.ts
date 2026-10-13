/**
 * Sole adapter that knows Langify's schema.
 * READ ONLY — never insert/update/delete Langify collections.
 */
import mongoose from 'mongoose';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { getCurrentUserId } from '@/lib/auth/currentUser';
import { LangifyUserProgressModel, type LangifyUserProgressDoc } from './models';
import type { KnownProgress } from './types';

export type { KnownProgress } from './types';

function normalizeWord(w: string): string {
  return String(w || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, '')
    .trim();
}

function flattenConnectedWords(
  raw: string[] | Record<string, string[]> | undefined,
): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  return Object.values(raw).flat().map(String);
}

export function toKnownProgress(doc: LangifyUserProgressDoc | null | undefined): KnownProgress {
  if (!doc) {
    return { cells: [], words: [], finishedMissions: [] };
  }

  const finished = (doc.finished_lessons ?? []) as Array<{
    mission_id?: string;
    lesson_id?: string;
    connected_words?: string[] | Record<string, string[]>;
  }>;

  return {
    cells: (doc.grammar_cells ?? []).map((c) => ({
      cellId: String(c.cell_id ?? ''),
      verb: c.verb ?? '',
      tense: c.tense ?? '',
      person: c.person ?? '',
      form: c.form ?? '',
      status: c.status ?? 'introduced',
    })),
    words: (doc.introduced_words ?? [])
      .map((w) => w.word)
      .filter((w): w is string => Boolean(w)),
    finishedMissions: finished.map((f) => ({
      missionId: String(f.mission_id || f.lesson_id || ''),
      connectedWords: flattenConnectedWords(f.connected_words),
    })),
  };
}

/** Load KNOWN for a Langify user. Never writes. */
export async function loadKnownForUser(userId: string): Promise<KnownProgress | null> {
  if (!mongoConfigured() || !userId) return null;
  await connectMongo();
  const doc = await LangifyUserProgressModel()
    .findOne({ userId: new mongoose.Types.ObjectId(userId) })
    .lean<LangifyUserProgressDoc>();
  return toKnownProgress(doc);
}

/** Resolve session → Langify user id, then load KNOWN. */
export async function loadKnownForSession(sessionHint: string): Promise<KnownProgress | null> {
  const userId = getCurrentUserId(sessionHint);
  if (!userId) return null;
  return loadKnownForUser(userId);
}

/** @deprecated alias — prefer loadKnownForSession */
export async function loadUserProgress(learnerId: string): Promise<KnownProgress | null> {
  return loadKnownForSession(learnerId);
}

export function requirementsMet(
  requirements: { cells: string[]; words: string[] },
  known: KnownProgress | null,
): { ok: boolean; missingCells: string[]; missingWords: string[] } {
  const reqCells = requirements.cells ?? [];
  const reqWords = requirements.words ?? [];
  if (reqCells.length === 0 && reqWords.length === 0) {
    return { ok: true, missingCells: [], missingWords: [] };
  }
  if (!known) {
    return { ok: false, missingCells: reqCells, missingWords: reqWords };
  }
  const cells = new Set(known.cells.map((c) => c.cellId));
  const words = new Set(known.words.map(normalizeWord));
  const missingCells = reqCells.filter((id) => !cells.has(id));
  const missingWords = reqWords.filter((w) => !words.has(normalizeWord(w)));
  return {
    ok: missingCells.length === 0 && missingWords.length === 0,
    missingCells,
    missingWords,
  };
}

export function formatKnownForPrompt(known: KnownProgress | null): string {
  if (!known) return 'None loaded.';
  const cellLines = known.cells
    .slice(0, 40)
    .map((c) => `${c.cellId}${c.form ? ` (${c.form})` : ''}`);
  const wordLines = known.words.slice(0, 80);
  return [
    `Cells (${known.cells.length}): ${cellLines.join(', ') || '—'}`,
    `Words (${known.words.length}): ${wordLines.join(', ') || '—'}`,
  ].join('\n');
}
