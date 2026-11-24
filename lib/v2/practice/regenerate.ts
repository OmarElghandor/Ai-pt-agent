/**
 * Who may rebuild today's review (testing tool): admins always, anyone
 * when not running in production. Shared by the route and the page.
 */
export function canRegenerateReview(
  role: string | null | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return role === 'admin' || nodeEnv !== 'production';
}
