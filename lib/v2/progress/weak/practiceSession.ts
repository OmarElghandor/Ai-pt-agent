import type { Question } from '@/lib/v2/content/lesson';
import { getProblem } from '@/lib/v2/progress/problems';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';

/**
 * Build 6–8 questions testing a problem's patterns from day banks (code only).
 */
export async function buildProblemPracticeQuestions(opts: {
  problemId: string;
  currentDay: number;
  targetLang?: string;
  size?: number;
}): Promise<Question[]> {
  const size = opts.size ?? 7;
  const problem = getProblem(opts.problemId, opts.targetLang ?? 'pt-PT');
  if (!problem) return [];
  const patternSet = new Set(problem.patterns);
  const out: Question[] = [];

  for (let day = 1; day <= opts.currentDay && out.length < size; day++) {
    const published = await getPublishedLesson(day);
    const questions = published?.pack.questions ?? [];
    for (const q of questions) {
      if (out.length >= size) break;
      const tests = Array.isArray(q.tests) ? q.tests.map(String) : [];
      const hitsPattern = tests.some((t) => patternSet.has(t));
      const type = String(q.type ?? '');
      const grammarType =
        type === 'fill_blank_choice' || type === 'build_sentence';
      if (hitsPattern || (grammarType && hitsPattern)) {
        out.push(q as Question);
      }
    }
  }
  return out.slice(0, size);
}
