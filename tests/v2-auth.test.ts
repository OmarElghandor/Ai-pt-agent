import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ObjectId, type Db, type Document } from 'mongodb';
import { parseAdminEmails, isAdminEmail } from '../lib/v2/auth/env';
import { isDevSignInEnabled } from '../lib/v2/auth/devSignIn';
import { tryLinkLangifyUser } from '../lib/v2/auth/link';
import {
  authTrustedOrigins,
  isHttpsAuthUrl,
} from '../lib/v2/auth/origins';
import {
  USER_KEYED_V2_COLLECTIONS,
  USER_ID_FIELD,
} from '../lib/v2/auth/userKeyedCollections';
import {
  findV2UserDoc,
  updateV2UserDoc,
  userIdFilter,
} from '../lib/v2/auth/v2UserDoc';
import { pickBankOpeningLines } from '../lib/v2/convo/session/freeInit';
import type { ConvoGoalBank } from '../lib/v2/convo/goals/types';

/** Minimal in-memory Db stub for v2_users findOne/updateOne. */
function mockUsersDb(docs: Document[]): Db {
  function matches(filter: Document, doc: Document): boolean {
    if (filter.$or) {
      return (filter.$or as Document[]).some((part) => matches(part, doc));
    }
    if (filter.$and) {
      return (filter.$and as Document[]).every((part) => matches(part, doc));
    }
    for (const [key, value] of Object.entries(filter)) {
      const actual = doc[key];
      if (value instanceof ObjectId) {
        if (!(actual instanceof ObjectId) || !actual.equals(value)) return false;
      } else if (actual !== value) {
        return false;
      }
    }
    return true;
  }

  return {
    collection() {
      return {
        async findOne(filter: Document) {
          return docs.find((d) => matches(filter, d)) ?? null;
        },
        async updateOne(filter: Document, update: { $set?: Document }) {
          const idx = docs.findIndex((d) => matches(filter, d));
          if (idx < 0) return { matchedCount: 0, modifiedCount: 0 };
          Object.assign(docs[idx]!, update.$set ?? {});
          return { matchedCount: 1, modifiedCount: 1 };
        },
      };
    },
  } as unknown as Db;
}

describe('v2 auth origins', () => {
  it('trustedOrigins include localhost and production', () => {
    const origins = authTrustedOrigins('http://localhost:3000');
    assert.ok(origins.includes('http://localhost:3000'));
    assert.ok(origins.includes('https://www.aztalkie.com'));
  });

  it('https detection follows BETTER_AUTH_URL not NODE_ENV', () => {
    assert.equal(isHttpsAuthUrl('http://localhost:3000'), false);
    assert.equal(isHttpsAuthUrl('https://www.aztalkie.com'), true);
  });
});

describe('v2 auth env helpers', () => {
  it('parses ADMIN_EMAILS', () => {
    assert.deepEqual(parseAdminEmails('a@x.com, B@Y.com'), [
      'a@x.com',
      'b@y.com',
    ]);
  });

  it('isAdminEmail is case-insensitive against env', () => {
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = 'Admin@Example.com';
    assert.equal(isAdminEmail('admin@example.com'), true);
    assert.equal(isAdminEmail('other@example.com'), false);
    process.env.ADMIN_EMAILS = prev;
  });
});

describe('v2 auth link rules', () => {
  it('skips unverified email', async () => {
    const result = await tryLinkLangifyUser({
      userId: 'u1',
      email: 'a@b.com',
      emailVerified: false,
      existingLangifyId: null,
    });
    assert.equal(result.linked, false);
    assert.equal(result.skippedReason, 'email_unverified');
  });

  it('skips when already linked', async () => {
    const result = await tryLinkLangifyUser({
      userId: 'u1',
      email: 'a@b.com',
      emailVerified: true,
      existingLangifyId: 'langify1',
    });
    assert.equal(result.linked, false);
    assert.equal(result.skippedReason, 'already_linked');
  });
});

describe('dev sign-in production guard', () => {
  it('is disabled in production', () => {
    assert.equal(isDevSignInEnabled({ NODE_ENV: 'production' }), false);
  });

  it('is enabled outside production', () => {
    assert.equal(isDevSignInEnabled({ NODE_ENV: 'development' }), true);
    assert.equal(isDevSignInEnabled({ NODE_ENV: 'test' }), true);
  });

  it('fails if the production build could register the route while enabled', () => {
    // Route module always exists; the runtime guard must refuse production.
    assert.equal(
      isDevSignInEnabled({ NODE_ENV: 'production' }),
      false,
      'dev sign-in must not be reachable with production settings',
    );
  });
});

describe('user-keyed collection registry', () => {
  it('lists the known learner collections', () => {
    assert.ok(USER_KEYED_V2_COLLECTIONS.includes('v2_item_state'));
    assert.ok(USER_KEYED_V2_COLLECTIONS.includes('v2_convo_sessions'));
    assert.equal(USER_ID_FIELD, 'user_id');
  });

  it('fails when a new mongoose user_id model is missing from the list', () => {
    const modelsPath = path.join(process.cwd(), 'lib/v2/mongo/models.ts');
    const src = readFileSync(modelsPath, 'utf8');
    const collectionMatches = [
      ...src.matchAll(/collection:\s*'([^']+)'/g),
    ].map((m) => m[1]);
    const userIdModels = collectionMatches.filter((name) => {
      // Heuristic: collections that appear near user_id in the same file block.
      return src.includes(`collection: '${name}'`) && src.includes('user_id');
    });
    // Stronger check: every v2_ collection whose schema mentions user_id
    const blocks = src.split(/mongoose\.model|Schema\(/);
    const keyed = new Set<string>();
    for (const block of blocks) {
      if (!block.includes('user_id')) continue;
      const m = block.match(/collection:\s*'([^']+)'/);
      if (m) keyed.add(m[1]);
    }
    for (const name of keyed) {
      if (name.startsWith('v2_auth') || name === 'v2_users') continue;
      assert.ok(
        (USER_KEYED_V2_COLLECTIONS as readonly string[]).includes(name),
        `Add ${name} to USER_KEYED_V2_COLLECTIONS (account deletion / migration)`,
      );
    }
    void userIdModels;
  });
});

describe('gender feeds tl_f', () => {
  it('pickBankOpeningLines uses tl_f for female learners', () => {
    const bank = {
      opening: {
        tl: 'Obrigado',
        tl_f: 'Obrigada',
        ar: 'شكرا',
        ar_f: 'شكرا ف',
      },
    } as ConvoGoalBank;
    assert.equal(pickBankOpeningLines(bank, 'm')?.tl, 'Obrigado');
    assert.equal(pickBankOpeningLines(bank, 'f')?.tl, 'Obrigada');
  });
});

describe('v2 user doc id|_id filter', () => {
  it('userIdFilter matches Google-style ObjectId _id', () => {
    const id = new ObjectId().toHexString();
    const filter = userIdFilter(id);
    assert.ok(filter.$or);
    const branches = filter.$or as Document[];
    assert.ok(branches.some((b) => b.id === id));
    assert.ok(
      branches.some(
        (b) => b._id instanceof ObjectId && b._id.toHexString() === id,
      ),
    );
  });

  it('userIdFilter still includes string id for dev users', () => {
    const id = 'dev_abc123';
    const filter = userIdFilter(id);
    const branches = filter.$or as Document[];
    assert.ok(branches.some((b) => b.id === id));
    assert.ok(branches.some((b) => b._id === id));
  });

  it('find + update work for ObjectId _id docs (Google users)', async () => {
    const oid = new ObjectId();
    const docs: Document[] = [
      {
        _id: oid,
        name: 'Omar',
        email: 'omar@example.com',
        gender: null,
        onboarded_at: null,
      },
    ];
    const db = mockUsersDb(docs);
    const found = await findV2UserDoc(db, oid.toHexString());
    assert.ok(found);
    assert.equal(found.name, 'Omar');

    const write = await updateV2UserDoc(db, oid.toHexString(), {
      gender: 'm',
      onboarded_at: new Date('2026-11-09'),
    });
    assert.equal(write.matchedCount, 1);
    assert.equal(docs[0]!.gender, 'm');
    assert.ok(docs[0]!.onboarded_at);
  });

  it('find + update work for string id docs (dev-signin)', async () => {
    const id = 'dev_ci_user';
    const docs: Document[] = [
      {
        id,
        name: 'CI',
        email: 'ci@langify.local',
        gender: null,
        onboarded_at: null,
      },
    ];
    const db = mockUsersDb(docs);
    const found = await findV2UserDoc(db, id);
    assert.ok(found);
    assert.equal(found.name, 'CI');

    const write = await updateV2UserDoc(db, id, { gender: 'f' });
    assert.equal(write.matchedCount, 1);
    assert.equal(docs[0]!.gender, 'f');
  });

  it('update returns matchedCount 0 when user is missing', async () => {
    const db = mockUsersDb([]);
    const write = await updateV2UserDoc(db, new ObjectId().toHexString(), {
      onboarded_at: new Date(),
    });
    assert.equal(write.matchedCount, 0);
  });
});

describe('api/v2 never reads user id from the request', () => {
  it('grep: no userId from body/query/headers in app/api/v2', () => {
    const root = path.join(process.cwd(), 'app/api/v2');
    const offenders: string[] = [];

    function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!name.endsWith('.ts')) continue;
        const src = readFileSync(full, 'utf8');
        const patterns = [
          /body\??\.(userId|user_id)\b/,
          /searchParams\.get\(['"]user(Id|_id)['"]\)/,
          /headers\.get\(['"]x-user/,
          /req\.headers\.get\(['"]x-user/,
        ];
        for (const re of patterns) {
          if (re.test(src)) offenders.push(`${full} ~ ${re}`);
        }
      }
    }
    walk(root);
    assert.deepEqual(offenders, []);
  });
});
