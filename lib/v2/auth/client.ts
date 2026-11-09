'use client';

import { createAuthClient } from 'better-auth/react';

/**
 * Relative `/api/auth` base so the client always talks to the same origin the
 * page was loaded from (avoids localhost vs 127.0.0.1 / port drift that breaks
 * the OAuth state cookie).
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
});

export const { signIn, signOut, useSession } = authClient;
