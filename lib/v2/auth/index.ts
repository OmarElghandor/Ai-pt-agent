import { betterAuth } from 'better-auth';
import { mongodbAdapter } from '@better-auth/mongo-adapter';
import { nextCookies } from 'better-auth/next-js';
import { MongoClient } from 'mongodb';
import { assertAuthEnv, isAdminEmail } from './env';
import { tryLinkLangifyUser } from './link';
import {
  AUTH_ALLOWED_HOSTS,
  authTrustedOrigins,
  isHttpsAuthUrl,
} from './origins';

const SIXTY_DAYS = 60 * 60 * 24 * 60;
const ONE_DAY = 60 * 60 * 24;

const globalForAuth = globalThis as typeof globalThis & {
  __v2BetterAuth?: ReturnType<typeof createAuth>;
  __v2AuthMongoClient?: MongoClient;
};

function createAuth() {
  const env = assertAuthEnv();
  const https = isHttpsAuthUrl(env.betterAuthUrl);

  let client = globalForAuth.__v2AuthMongoClient;
  if (!client) {
    client = new MongoClient(env.mongodbUri, {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
    });
    globalForAuth.__v2AuthMongoClient = client;
  }
  const db = client.db();

  return betterAuth({
    appName: 'Langify',
    /**
     * Resolve baseURL from the incoming request host (must be in allowedHosts)
     * so OAuth redirect_uri and cookies match the browser origin. Fallback is
     * BETTER_AUTH_URL for non-request contexts.
     */
    baseURL: {
      allowedHosts: [...AUTH_ALLOWED_HOSTS],
      fallback: env.betterAuthUrl,
      protocol: https ? 'https' : 'http',
    },
    secret: env.betterAuthSecret,
    trustedOrigins: authTrustedOrigins(env.betterAuthUrl),
    database: mongodbAdapter(db, {
      client,
      transaction: true,
    }),
    socialProviders: {
      google: {
        clientId: env.googleClientId,
        clientSecret: env.googleClientSecret,
        scopes: ['openid', 'email', 'profile'],
      },
    },
    user: {
      modelName: 'v2_users',
      fields: {
        emailVerified: 'email_verified',
        image: 'picture',
      },
      additionalFields: {
        role: {
          type: ['learner', 'admin'],
          required: false,
          defaultValue: 'learner',
          input: false,
        },
        gender: {
          type: 'string',
          required: false,
          input: true,
        },
        onboarded_at: {
          type: 'date',
          required: false,
          input: false,
        },
        langify_user_id: {
          type: 'string',
          required: false,
          input: false,
        },
      },
    },
    session: {
      modelName: 'v2_auth_sessions',
      expiresIn: SIXTY_DAYS,
      updateAge: ONE_DAY,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    account: {
      modelName: 'v2_auth_accounts',
      // Keep DB + state cookie (default for Mongo). Do not skip the state check.
    },
    verification: {
      modelName: 'v2_auth_verifications',
    },
    advanced: {
      // Secure cookies only on https base URL — never tie to NODE_ENV alone
      // (next start on http://localhost would otherwise set Secure cookies the
      // browser refuses to store → state_mismatch on callback).
      useSecureCookies: https,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        // Do not set `secure` here; createCookieGetter derives it from useSecureCookies.
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const role = isAdminEmail(user.email) ? 'admin' : 'learner';
            return { data: { ...user, role } };
          },
          after: async (user) => {
            await tryLinkLangifyUser({
              userId: user.id,
              email: user.email,
              emailVerified: Boolean(user.emailVerified),
              existingLangifyId:
                (user as { langify_user_id?: string | null }).langify_user_id ??
                null,
            });
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            await syncRoleOnSignIn(session.userId);
            await retryLangifyLinkOnSignIn(session.userId);
          },
        },
      },
    },
    // Must be last so Set-Cookie from the handler is forwarded through next/headers.
    plugins: [nextCookies()],
  });
}

async function syncRoleOnSignIn(userId: string): Promise<void> {
  try {
    const client = globalForAuth.__v2AuthMongoClient;
    if (!client) return;
    const { findV2UserDoc, updateV2UserDoc } = await import('./v2UserDoc');
    const db = client.db();
    const doc = await findV2UserDoc(db, userId);
    if (!doc?.email) return;
    const role = isAdminEmail(String(doc.email)) ? 'admin' : 'learner';
    if (doc.role !== role) {
      await updateV2UserDoc(db, userId, { role });
    }
  } catch (err) {
    console.error('[v2/auth] syncRoleOnSignIn failed', err);
  }
}

async function retryLangifyLinkOnSignIn(userId: string): Promise<void> {
  try {
    const client = globalForAuth.__v2AuthMongoClient;
    if (!client) return;
    const { findV2UserDoc } = await import('./v2UserDoc');
    const db = client.db();
    const doc = await findV2UserDoc(db, userId);
    if (!doc) return;
    await tryLinkLangifyUser({
      userId,
      email: String(doc.email ?? ''),
      emailVerified: Boolean(doc.email_verified ?? doc.emailVerified),
      existingLangifyId: doc.langify_user_id ? String(doc.langify_user_id) : null,
    });
  } catch (err) {
    console.error('[v2/auth] retryLangifyLinkOnSignIn failed', err);
  }
}

/**
 * Better Auth instance. Eager so `toNextJsHandler` sees a real `.handler`.
 * Recreate on every module evaluation so HMR / env edits pick up new config
 * (a sticky global with stale cookie/baseURL settings caused state_mismatch).
 */
export const auth: ReturnType<typeof createAuth> = (() => {
  globalForAuth.__v2BetterAuth = createAuth();
  return globalForAuth.__v2BetterAuth;
})();

export type { V2User, V2UserGender, V2UserRole } from './types';
