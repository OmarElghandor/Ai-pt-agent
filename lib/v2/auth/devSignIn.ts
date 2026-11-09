/**
 * Dev sign-in is only available outside production.
 * Production builds must never expose this route.
 */
export function isDevSignInEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV !== 'production';
}
