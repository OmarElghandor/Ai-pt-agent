import type { ReviewSession } from './types';
import fixtureJson from '@/content/v2/fixtures/review-all-types.json';

export function loadReviewFixtureAllTypes(
  learnerName?: string,
): ReviewSession {
  const base = fixtureJson as ReviewSession;
  return {
    ...base,
    learner_name: learnerName ?? base.learner_name ?? 'عمر',
  };
}