import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTopicsList,
  loadTopicsFile,
  parseTopicsFile,
  topicStatus,
  statusGlyph,
  talkHrefForTopic,
  topicReviewSuggestionEg,
} from '@/lib/v2/convo/topics';
import { createItemState, type ItemState } from '@/lib/v2/progress';

const DAY33_ITEMS = [
  'word.station',
  'word.street',
  'word.pharmacy',
  'word.left',
  'word.right',
  'phrase.where_is_station',
  'phrase.is_it_near',
  'phrase.its_far',
  'pattern.onde_fica',
];

function solidState(itemId: string, now: Date): ItemState {
  const s = createItemState({
    user_id: 'u1',
    item_id: itemId,
    introducedDay: 33,
  });
  s.levels.said = 1;
  s.levels.understood = 1;
  s.levels.heard = 1;
  // Not due: future dueAt
  s.card.dueAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  s.card.interval = 7;
  return s;
}

function dueState(itemId: string, now: Date): ItemState {
  const s = solidState(itemId, now);
  s.card.dueAt = new Date(now.getTime() - 60_000).toISOString();
  return s;
}

describe('v2 convo topics · content file', () => {
  it('loads and parses topics.pt-PT.json with day-33 directions', () => {
    const file = loadTopicsFile();
    assert.equal(file.target_lang, 'pt-PT');
    const directions = file.themes.find((t) => t.id === 'directions');
    assert.ok(directions);
    const topic = directions!.topics.find((t) => t.id === 'directions.day-33');
    assert.ok(topic);
    assert.equal(topic!.pack_id, 'pt-PT.day-33');
    assert.equal(topic!.day, 33);
    assert.deepEqual(topic!.item_ids, DAY33_ITEMS);

    const day34 = directions!.topics.find((t) => t.id === 'directions.day-34');
    assert.ok(day34);
    assert.equal(day34!.pack_id, 'pt-PT.day-34');
    assert.equal(day34!.day, 34);
  });

  it('rejects a bad topics file', () => {
    assert.throws(() => parseTopicsFile({ themes: [] }));
  });
});

describe('v2 convo topics · status', () => {
  const now = new Date('2026-11-04T12:00:00.000Z');

  it('returns not_tried when no states', () => {
    assert.equal(
      topicStatus(DAY33_ITEMS, new Map(), new Set(), now),
      'not_tried',
    );
    assert.equal(statusGlyph('not_tried'), '⚪');
  });

  it('returns needs_review when any item is due', () => {
    const map = new Map<string, ItemState>();
    for (const id of DAY33_ITEMS) map.set(id, solidState(id, now));
    map.set('word.left', dueState('word.left', now));
    assert.equal(topicStatus(DAY33_ITEMS, map, new Set(), now), 'needs_review');
    assert.equal(statusGlyph('needs_review'), '🟡');
  });

  it('returns needs_review when any item is weak', () => {
    const map = new Map<string, ItemState>();
    for (const id of DAY33_ITEMS) map.set(id, solidState(id, now));
    assert.equal(
      topicStatus(DAY33_ITEMS, map, new Set(['word.station']), now),
      'needs_review',
    );
  });

  it('returns solid when tried, not due, not weak', () => {
    const map = new Map<string, ItemState>();
    for (const id of DAY33_ITEMS) map.set(id, solidState(id, now));
    assert.equal(topicStatus(DAY33_ITEMS, map, new Set(), now), 'solid');
    assert.equal(statusGlyph('solid'), '🟢');
  });
});

describe('v2 convo topics · list for a test user', () => {
  const now = new Date('2026-11-04T12:00:00.000Z');
  const file = loadTopicsFile();

  it('unlocks every catalog topic; pack_available still reflects ready packs', () => {
    const listing = buildTopicsList({
      file,
      currentDay: 1,
      statesById: new Map(),
      weakIds: new Set(),
      now,
      packAvailable: (id) => id === 'pt-PT.day-33',
    });

    const d33 = listing.themes
      .flatMap((t) => t.topics)
      .find((t) => t.id === 'directions.day-33');
    assert.ok(d33);
    assert.equal(d33!.unlocked, true);
    assert.equal(d33!.pack_available, true);
    assert.equal(d33!.status, 'not_tried');
    assert.equal(d33!.status_glyph, '⚪');

    const cafe = listing.themes
      .flatMap((t) => t.topics)
      .find((t) => t.id === 'cafe.day-3');
    assert.ok(cafe);
    assert.equal(cafe!.unlocked, true);
    assert.equal(cafe!.pack_available, false);
  });

  it('returns needs_review statuses and a 🟡 suggestion for a test user', () => {
    const map = new Map<string, ItemState>();
    for (const id of DAY33_ITEMS) map.set(id, solidState(id, now));
    map.set('word.right', dueState('word.right', now));

    const listing = buildTopicsList({
      file,
      currentDay: 40,
      statesById: map,
      weakIds: new Set(),
      now,
      packAvailable: (id) => id === 'pt-PT.day-33',
    });

    const d33 = listing.themes
      .flatMap((t) => t.topics)
      .find((t) => t.id === 'directions.day-33');
    assert.equal(d33!.status, 'needs_review');
    assert.equal(d33!.status_glyph, '🟡');
    assert.ok(listing.suggestion);
    assert.equal(listing.suggestion!.id, 'directions.day-33');
    assert.equal(listing.suggestion!.pack_id, 'pt-PT.day-33');
  });

  it('returns solid with no suggestion when progress is healthy', () => {
    const map = new Map<string, ItemState>();
    for (const id of DAY33_ITEMS) map.set(id, solidState(id, now));

    const listing = buildTopicsList({
      file,
      currentDay: 40,
      statesById: map,
      weakIds: new Set(),
      now,
      packAvailable: (id) => id === 'pt-PT.day-33',
    });

    const d33 = listing.themes
      .flatMap((t) => t.topics)
      .find((t) => t.id === 'directions.day-33');
    assert.equal(d33!.status, 'solid');
    assert.equal(listing.suggestion, null);
  });

  it('builds home suggestion copy and talk href', () => {
    assert.equal(
      topicReviewSuggestionEg({
        title_ar: 'الاتجاهات',
        character_name: 'Inês',
      }),
      'الاتجاهات محتاجة مراجعة، تتكلم مع Inês؟',
    );
    assert.equal(talkHrefForTopic({ pack_id: 'pt-PT.day-33' }), '/talk/pt-PT.day-33');
  });
});
