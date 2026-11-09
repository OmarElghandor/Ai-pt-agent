/**
 * Hosts / origins allowed for OAuth callbacks and CSRF.
 * Keep in sync with Google OAuth redirect URIs.
 */
export const AUTH_ALLOWED_HOSTS = [
  'localhost:3000',
  '127.0.0.1:3000',
  'www.aztalkie.com',
  'aztalkie.com',
] as const;

export function authTrustedOrigins(betterAuthUrl: string): string[] {
  const origins = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://www.aztalkie.com',
    'https://aztalkie.com',
  ]);
  try {
    origins.add(new URL(betterAuthUrl).origin);
  } catch {
    // ignore invalid fallback
  }
  return [...origins];
}

export function isHttpsAuthUrl(betterAuthUrl: string): boolean {
  return betterAuthUrl.startsWith('https://');
}
