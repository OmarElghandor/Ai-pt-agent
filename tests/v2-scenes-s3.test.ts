import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSceneCatalog,
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

describe('scenes S3 · catalog + path progress', () => {
  it('builds catalog with next = first unfinished', () => {
    const catalog = buildSceneCatalog({
      finishedIds: ['cena-cafe', 'cena-mercado'],
    });
    assert.equal(catalog.path.length, 15);
    assert.equal(catalog.next?.id, 'cena-supermercado');
    assert.equal(catalog.past.length, 2);
    assert.equal(catalog.path_finished, false);
    assert.ok(catalog.path[0]!.place_eg.length > 0);
  });

  it('prefers an active resume over the first unfinished', () => {
    const catalog = buildSceneCatalog({
      finishedIds: ['cena-cafe'],
      activeByScene: { 'cena-farmacia': { id: 'sess-1' } },
    });
    assert.equal(catalog.next?.id, 'cena-farmacia');
    assert.equal(catalog.next?.resume, true);
  });

  it('path_finished when every scene is done', () => {
    const index = loadSceneIndex();
    const catalog = buildSceneCatalog({
      finishedIds: index.path.map((p) => p.id),
    });
    assert.equal(catalog.next, null);
    assert.equal(catalog.path_finished, true);
  });

  it('nextUnfinishedSceneIdOnPath skips finished', () => {
    assert.equal(nextSceneIdOnPath('cena-cafe'), 'cena-mercado');
    assert.equal(
      nextUnfinishedSceneIdOnPath('cena-cafe', [
        'cena-cafe',
        'cena-mercado',
      ]),
      'cena-supermercado',
    );
  });

  it('memory store tracks finished and active scene sessions', async () => {
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

    const doneTopic = freeTopicById('cena-mercado');
    assert.ok(doneTopic);
    const done = createFreeConvoSessionDoc({
      id: 's-done',
      userId: 'u1',
      topic: doneTopic!,
      learnerLevel: 9,
    });
    done.status = 'done';
    done.phase = 'closing';
    await store.create(done);

    const finished = await store.listFinishedSceneIds!('u1');
    const active = await store.listActiveScenesByTopic!('u1');
    assert.deepEqual(finished, ['cena-mercado']);
    assert.equal(active['cena-cafe']?.id, 's-open');
    assert.equal(freePackId('cena-cafe'), 'free.cena-cafe');

    const catalog = buildSceneCatalog({
      finishedIds: finished,
      activeByScene: active,
    });
    assert.equal(catalog.next?.id, 'cena-cafe');
    assert.equal(catalog.next?.resume, true);
  });
});
