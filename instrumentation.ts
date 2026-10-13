/**
 * Next.js instrumentation — validates lesson packs once when the server starts.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;
  const { assertValidLessonCatalogue } = await import('./lib/lessons');
  assertValidLessonCatalogue();
}
