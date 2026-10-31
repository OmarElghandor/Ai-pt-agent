import {
  listLatestLessonSummaries,
  listPublishedLessonSummaries,
} from '@/lib/v2/content/getPublishedLesson';
import { loadPlan } from '@/lib/v2/generation/lesson/plan';

export type PathDayStatus = 'published' | 'draft' | 'reviewed' | 'locked';

export type PathDayRow = {
  day: number;
  week: number;
  title_tl: string;
  title_ar: string;
  situation_eg: string;
  situation_tl?: string;
  is_story: boolean;
  status: PathDayStatus;
  version?: number;
  href: string | null;
};

export type PathPayload = {
  days: PathDayRow[];
  target_lang: string;
  dev: boolean;
};

/**
 * Merge curriculum plan with Mongo lesson status for the path home list.
 * Any day with a lesson document unlocks (published preferred; else latest draft/reviewed).
 */
export async function buildPathPayload(opts?: {
  targetLang?: string;
  dev?: boolean;
}): Promise<PathPayload> {
  const target_lang = opts?.targetLang ?? 'pt-PT';
  const dev = Boolean(opts?.dev);
  const plan = loadPlan();

  const [published, latest] = await Promise.all([
    listPublishedLessonSummaries(target_lang),
    listLatestLessonSummaries(target_lang),
  ]);
  const publishedByDay = new Map(published.map((s) => [s.day, s]));
  const latestByDay = new Map(latest.map((s) => [s.day, s]));

  const days: PathDayRow[] = plan.days.map((d) => {
    const pub = publishedByDay.get(d.day);
    const row = pub ?? latestByDay.get(d.day);
    const situation_tl =
      row?.situation?.tl ?? d.generation?.situation_tl;

    if (row) {
      const status: PathDayStatus =
        row.status === 'published'
          ? 'published'
          : row.status === 'reviewed'
            ? 'reviewed'
            : 'draft';
      return {
        day: d.day,
        week: d.week,
        title_tl: d.title_tl,
        title_ar: d.title_ar,
        situation_eg: row.situation?.eg ?? d.situation_eg,
        situation_tl,
        is_story: d.is_story,
        status,
        version: row.version,
        href: `/day/${d.day}`,
      };
    }

    return {
      day: d.day,
      week: d.week,
      title_tl: d.title_tl,
      title_ar: d.title_ar,
      situation_eg: d.situation_eg,
      situation_tl: d.generation?.situation_tl,
      is_story: d.is_story,
      status: 'locked',
      href: null,
    };
  });

  return { days, target_lang, dev };
}
