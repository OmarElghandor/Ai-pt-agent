import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSceneCatalog,
  clearSceneLoadCache,
  loadSceneIndex,
  nextSceneIdOnPath,
  nextUnfinishedSceneIdOnPath,
} from '@/lib/v2/convo/scenes';
import {
  MemoryConvoSessionStore,
  createFreeConvoSessionDoc,
  freePackId,
} from '@/lib/v2/convo/session';
import { freeTopicById } from '@/lib/v2/convo/topics';

describe('scenes S3 · catalog + path progress (café-only path)', () => {
  it('builds catalog with next = café when unfinished', () => {
    clearSceneLoadCache();
    const catalog = buildSceneCatalog({ finishedIds: [] });
    assert.equal(catalog.path.length, 1);
    assert.equal(catalog.next?.id, 'cena-cafe');
    assert.equal(catalog.past.length, 0);
    assert.equal(catalog.path_finished, false);
  });

  it('path_finished when café is done', () => {
    clearSceneLoadCache();
    const index = loadSceneIndex();
    const catalog = buildSceneCatalog({
      finishedIds: index.path.map((p) => p.id),
    });
    assert.equal(catalog.next, null);
    assert.equal(catalog.path_finished, true);
  });

  it('nextUnfinishedSceneIdOnPath with one scene', () => {
    clearSceneLoadCache();
    assert.equal(nextSceneIdOnPath('cena-cafe'), null);
    assert.equal(nextUnfinishedSceneIdOnPath('cena-cafe', ['cena-cafe']), null);
  });

  it('memory store tracks finished and active scene sessions', async () => {
    clearSceneLoadCache();
    const store = new MemoryConvoSessionStore();
    const topic = freeTopicById('cena-cafe');
    assert.ok(topic);
    const open = createFreeConvoSessionDoc({
      id: 's-open',
      userId: 'u1',
      topic: topic!,
      learnerLevel: 9,
    });
    await store.create(open);

    const finished = await store.listFinishedSceneIds!('u1');
    const active = await store.listActiveScenesByTopic!('u1');
    assert.deepEqual(finished, []);
    assert.equal(active['cena-cafe']?.id, 's-open');
    assert.equal(freePackId('cena-cafe'), 'free.cena-cafe');

    const catalog = buildSceneCatalog({
      finishedIds: finished,
      activeByScene: active,
    });
    assert.equal(catalog.next?.id, 'cena-cafe');
    assert.equal(catalog.next?.resume, false);
    assert.equal(catalog.next?.active_session_id, null);
  });
});
