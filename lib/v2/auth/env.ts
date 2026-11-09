/** Server-only auth env. Never import from client components. */

const REQUIRED = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'ADMIN_EMAILS',
] as const;

export type AuthEnv = {
  googleClientId: string;
  googleClientSecret: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  adminEmails: string[];
  mongodbUri: string;
};

function read(name: string): string {
  return (process.env[name] ?? '').trim();
}

/** Parse comma-separated ADMIN_EMAILS into lowercased emails. */
export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = parseAdminEmails(process.env.ADMIN_EMAILS);
  return list.includes(email.trim().toLowerCase());
}

/**
 * Read and validate auth env. Throws a clear Error if any required var is missing.
 * Call once when creating the Better Auth instance.
 */
export function assertAuthEnv(): AuthEnv {
  const missing: string[] = REQUIRED.filter((name) => !read(name));
  const mongodbUri = read('MONGODB_URI').replace(/^['"]|['"]$/g, '');
  if (!mongodbUri) missing.push('MONGODB_URI');

  if (missing.length > 0) {
    throw new Error(
      `Auth env missing: ${missing.join(', ')}. Set them in .env (see docs/langify-v2/10-auth.md).`,
    );
  }

  return {
    googleClientId: read('GOOGLE_CLIENT_ID'),
    googleClientSecret: read('GOOGLE_CLIENT_SECRET'),
    betterAuthSecret: read('BETTER_AUTH_SECRET'),
    betterAuthUrl: read('BETTER_AUTH_URL').replace(/\/$/, ''),
    adminEmails: parseAdminEmails(process.env.ADMIN_EMAILS),
    mongodbUri,
  };
}
