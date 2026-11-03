import {
  getLatestLessonPack,
  getPublishedLesson,
  type PublishedLesson,
} from '@/lib/v2/content/getPublishedLesson';
import type { StoryDoc } from '@/lib/v2/content/story';
import {
  getLatestStoryByDay,
  getPublishedStory,
  getStoryById,
} from '@/lib/v2/generation/lesson/storySave';

/**
 * Admin / image pipeline: prefer the newest lesson+story (any status) so
 * denormalize writes onto the same version the board shows.
 */
export async function loadLessonAndStoryForImages(day: number): Promise<{
  lesson: PublishedLesson | null;
  story: StoryDoc | null;
}> {
  const lesson =
    (await getLatestLessonPack(day)) || (await getPublishedLesson(day));
  const targetLang = lesson?.target_lang ?? 'pt-PT';
  const story =
    (await getLatestStoryByDay({ day, targetLang })) ||
    (await getPublishedStory({ day, targetLang })) ||
    (await getStoryById(
      `${targetLang}.day-${String(day).padStart(2, '0')}`,
    ));
  return { lesson, story };
}
