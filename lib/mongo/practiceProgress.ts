import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { getCurrentUserId } from '@/lib/auth/currentUser';
import { PracticeProgressModel } from './models';

const ASSESSMENT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type PracticeLessonProgressRow = {
  lessonKey: string;
  version: number;
  startedAt: number | null;
  finishedAt: number | null;
  assessmentDueAt: number | null;
};

export async function loadPracticeProgress(sessionHint: string): Promise<{
  lessons: PracticeLessonProgressRow[];
} | null> {
  const userId = getCurrentUserId(sessionHint);
  if (!mongoConfigured() || !userId) return null;
  await connectMongo();
  const doc = await PracticeProgressModel().findOne({ userId }).lean();
  if (!doc) return { lessons: [] };
  return {
    lessons: (doc.lessons ?? []).map((p) => ({
      lessonKey: p.lesson_key,
      version: p.version ?? 1,
      startedAt: p.started_at ? new Date(p.started_at).getTime() : null,
      finishedAt: p.finished_at ? new Date(p.finished_at).getTime() : null,
      assessmentDueAt: p.assessment_due_at
        ? new Date(p.assessment_due_at).getTime()
        : null,
    })),
  };
}

export async function markLessonPracticed(
  sessionHint: string,
  lessonKey: string,
  version = 1,
): Promise<void> {
  const userId = getCurrentUserId(sessionHint);
  if (!mongoConfigured() || !userId) return;
  await connectMongo();
  const finishedAt = new Date();
  const assessmentDueAt = new Date(finishedAt.getTime() + ASSESSMENT_COOLDOWN_MS);

  const existing = await PracticeProgressModel().findOne({ userId });
  if (!existing) {
    await PracticeProgressModel().create({
      userId,
      cells: [],
      lessons: [
        {
          lesson_key: lessonKey,
          version,
          started_at: finishedAt,
          finished_at: finishedAt,
          assessment_due_at: assessmentDueAt,
          helped_items: [],
        },
      ],
    });
    return;
  }

  const rows = existing.lessons ?? [];
  const idx = rows.findIndex((r) => r.lesson_key === lessonKey);
  if (idx >= 0) {
    rows[idx].finished_at = finishedAt;
    rows[idx].assessment_due_at = assessmentDueAt;
    rows[idx].version = version;
    if (!rows[idx].started_at) rows[idx].started_at = finishedAt;
  } else {
    rows.push({
      lesson_key: lessonKey,
      version,
      started_at: finishedAt,
      finished_at: finishedAt,
      assessment_due_at: assessmentDueAt,
      helped_items: [],
      assessment_result: null,
    });
  }
  existing.lessons = rows;
  await existing.save();
}

export async function markCellsPracticed(
  sessionHint: string,
  cellIds: string[],
): Promise<void> {
  const userId = getCurrentUserId(sessionHint);
  if (!mongoConfigured() || !userId || cellIds.length === 0) return;
  await connectMongo();
  const now = new Date();
  let doc = await PracticeProgressModel().findOne({ userId });
  if (!doc) {
    doc = await PracticeProgressModel().create({
      userId,
      cells: cellIds.map((id) => ({
        cell_id: id,
        practised_at: now,
        assessed_at: null,
      })),
      lessons: [],
    });
    return;
  }
  const cells = doc.cells ?? [];
  for (const id of cellIds) {
    const row = cells.find((c) => c.cell_id === id);
    if (row) row.practised_at = now;
    else cells.push({ cell_id: id, practised_at: now, assessed_at: null });
  }
  doc.cells = cells;
  await doc.save();
}

export async function markCellsAssessed(
  sessionHint: string,
  cellIds: string[],
): Promise<void> {
  const userId = getCurrentUserId(sessionHint);
  if (!mongoConfigured() || !userId || cellIds.length === 0) return;
  await connectMongo();
  const now = new Date();
  let doc = await PracticeProgressModel().findOne({ userId });
  if (!doc) {
    await PracticeProgressModel().create({
      userId,
      cells: cellIds.map((id) => ({
        cell_id: id,
        practised_at: null,
        assessed_at: now,
      })),
      lessons: [],
    });
    return;
  }
  const cells = doc.cells ?? [];
  for (const id of cellIds) {
    const row = cells.find((c) => c.cell_id === id);
    if (row) row.assessed_at = now;
    else cells.push({ cell_id: id, practised_at: null, assessed_at: now });
  }
  doc.cells = cells;
  await doc.save();
}
