import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Db, Document } from 'mongodb';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  clearCustomDeckCreators,
  deleteV2UserData,
} from '../lib/v2/auth/deleteAccount';
import { USER_KEYED_V2_COLLECTIONS } from '../lib/v2/auth/userKeyedCollections';
import type { Item } from '../lib/v2/content/items';
import {
  customItemId,
  findOfficialItemId,
  normaliseLemma,
  resolveOrCreateCustomItem,
} from '../lib/v2/decks';
import type { CustomItemFields } from '../lib/v2/decks/types';

describe('C1 · custom item keys', () => {
  it('normalises lemma: lowercase, strip article, keep accents', () => {
    assert.equal(normaliseLemma('A chuva'), 'chuva');
    assert.equal(normaliseLemma('o frigorífico'), 'frigorífico');
    assert.equal(normaliseLemma('  Os sapatos '), 'sapatos');
    assert.equal(customItemId('pt-PT', 'a chuva', 'noun'), 'ugc.pt-PT.chuva.noun');
  });
});

describe('C1 · official lookup and shared pool', () => {
  it('resolves a lesson word to the official item id', () => {
    const known = new Map<string, Item>([
      [
        'weather.rain',
        {
          type: 'word',
          id: 'weather.rain',
          tl: 'a chuva',
          ar: 'المطر',
          gender: 'f',
        } as Item,
      ],
    ]);
    assert.equal(findOfficialItemId(known, 'A chuva', 'noun'), 'weather.rain');
    assert.equal(findOfficialItemId(known, 'chuva', 'noun'), 'weather.rain');
  });

  it('same word from two decks resolves to one custom item', async () => {
    const store = new Map<string, CustomItemFields>();
    const known = new Map<string, Item>();
    const base = {
      target_lang: 'pt-PT',
      tl: 'o frigorífico',
      pos: 'noun' as const,
      gender: 'm' as const,
      ar: 'الثلاجة',
      example_tl: 'O frigorífico está cheio.',
      example_ar: 'الثلاجة ممتلئة.',
      say: 'و فريغوريفيكو',
      known,
      memoryStore: store,
    };
    const a = await resolveOrCreateCustomItem({ ...base, deck_id: 'deck-a' });
    const b = await resolveOrCreateCustomItem({ ...base, deck_id: 'deck-b' });
    assert.equal(a.item_id, b.item_id);
    assert.equal(a.source, 'custom');
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(store.size, 1);
    const doc = store.get(a.item_id)!;
    assert.deepEqual(doc.deck_ids.sort(), ['deck-a', 'deck-b']);
  });

  it('prefers official id over creating a custom item', async () => {
    const store = new Map<string, CustomItemFields>();
    const known = new Map<string, Item>([
      [
        'food.cheese',
        {
          type: 'word',
          id: 'food.cheese',
          tl: 'o queijo',
          ar: 'الجبن',
          gender: 'm',
        } as Item,
      ],
    ]);
    const r = await resolveOrCreateCustomItem({
      target_lang: 'pt-PT',
      tl: 'o queijo',
      pos: 'noun',
      gender: 'm',
      ar: 'الجبن',
      example_tl: 'O queijo é bom.',
      example_ar: 'الجبن جيد.',
      say: 'و كيجو',
      known,
      memoryStore: store,
    });
    assert.equal(r.item_id, 'food.cheese');
    assert.equal(r.source, 'official');
    assert.equal(store.size, 0);
  });
});

describe('C1 · A5 deletion clears creator, keeps public deck', () => {
  it('lists v2_user_decks and v2_deck_reports as user-keyed', () => {
    assert.ok(USER_KEYED_V2_COLLECTIONS.includes('v2_user_decks'));
    assert.ok(USER_KEYED_V2_COLLECTIONS.includes('v2_deck_reports'));
    assert.ok(
      !USER_KEYED_V2_COLLECTIONS.includes(
        'v2_custom_decks' as (typeof USER_KEYED_V2_COLLECTIONS)[number],
      ),
    );
  });

  it('declares custom-deck collections in models.ts', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'lib/v2/mongo/models.ts'),
      'utf8',
    );
    for (const name of [
      'v2_custom_items',
      'v2_custom_decks',
      'v2_user_decks',
      'v2_deck_reports',
      'v2_custom_deck_jobs',
      'v2_official_decks',
    ]) {
      assert.match(src, new RegExp(`collection:\\s*'${name}'`));
    }
  });

  it('clears created_by and leaves the deck document', async () => {
    const decks: Document[] = [
      {
        _id: 'deck1',
        title_tl: 'Tempo',
        created_by: 'user-omar',
        visibility: 'public',
      },
      {
        _id: 'deck2',
        title_tl: 'Other',
        created_by: 'user-other',
        visibility: 'public',
      },
    ];
    const userDecks: Document[] = [
      { user_id: 'user-omar', deck_id: 'deck1' },
    ];
    const reports: Document[] = [
      { user_id: 'user-omar', deck_id: 'deck1', reason: 'wrong_word' },
    ];

    const db = {
      collection(name: string) {
        if (name === 'v2_custom_decks') {
          return {
            async updateMany(
              filter: Document,
              update: { $set?: Document },
            ) {
              let modified = 0;
              for (const d of decks) {
                if (d.created_by === filter.created_by) {
                  Object.assign(d, update.$set ?? {});
                  modified += 1;
                }
              }
              return { modifiedCount: modified };
            },
            async find() {
              return {
                async toArray() {
                  return decks;
                },
              };
            },
          };
        }
        if (name === 'v2_user_decks') {
          return {
            async deleteMany(filter: Document) {
              const before = userDecks.length;
              for (let i = userDecks.length - 1; i >= 0; i--) {
                if (userDecks[i]!.user_id === filter.user_id) {
                  userDecks.splice(i, 1);
                }
              }
              return { deletedCount: before - userDecks.length };
            },
          };
        }
        if (name === 'v2_deck_reports') {
          return {
            async deleteMany(filter: Document) {
              const before = reports.length;
              for (let i = reports.length - 1; i >= 0; i--) {
                if (reports[i]!.user_id === filter.user_id) {
                  reports.splice(i, 1);
                }
              }
              return { deletedCount: before - reports.length };
            },
          };
        }
        return {
          async deleteMany() {
            return { deletedCount: 0 };
          },
        };
      },
    } as unknown as Db;

    const cleared = await clearCustomDeckCreators(db, 'user-omar');
    assert.equal(cleared, 1);
    assert.equal(decks[0]!.created_by, null);
    assert.equal(decks.length, 2);
    assert.equal(decks[1]!.created_by, 'user-other');

    // Simulate keyed deletes the same way deleteV2UserData does.
    await db.collection('v2_user_decks').deleteMany({ user_id: 'user-omar' });
    await db.collection('v2_deck_reports').deleteMany({ user_id: 'user-omar' });
    assert.equal(userDecks.length, 0);
    assert.equal(reports.length, 0);
    assert.equal(decks[0]!.visibility, 'public');
  });

  it('deleteAccount source wires clearCustomDeckCreators', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'lib/v2/auth/deleteAccount.ts'),
      'utf8',
    );
    assert.match(src, /clearCustomDeckCreators/);
    assert.match(src, /created_by:\s*null/);
    void deleteV2UserData;
  });
});
