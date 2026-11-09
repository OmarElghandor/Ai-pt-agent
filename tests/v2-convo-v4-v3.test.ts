import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isGreetingOrSmallTalk,
  routeTopic,
  stubRouterClassifier,
} from '@/lib/v2/convo/router';

describe('conversations v4 · V3 router', () => {
  it('«Ola bom dia» at level 1 → greeting, no topic lock', async () => {
    assert.equal(isGreetingOrSmallTalk('Ola bom dia'), true);
    const d = await routeTopic({ message: 'Ola bom dia', level: 1 });
    assert.equal(d.kind, 'greeting');
    if (d.kind === 'greeting') assert.equal(d.reask, true);
  });

  it('«quero falar de futebol» at level 1 → teaching-mode lock (not refusal)', async () => {
    const d = await routeTopic({
      message: 'quero falar de futebol',
      level: 1,
    });
    assert.equal(d.kind, 'lock');
    if (d.kind === 'lock') {
      assert.equal(d.teaching_mode, true);
      assert.ok(d.topic_id === 'futebol' || d.is_new);
    }
  });

  it('low-confidence stub → chips only', async () => {
    const d = await routeTopic({
      message: 'talvez o tempo',
      level: 20,
      classify: stubRouterClassifier({
        topic_id: 'casa',
        confidence: 0.4,
      }),
    });
    assert.equal(d.kind, 'chips');
    if (d.kind === 'chips') {
      assert.equal(d.reason, 'low_confidence');
      assert.equal(d.confidence, 0.4);
    }
  });

  it('«عايز أتكلم عن الشغل» at level 20 → trabalho', async () => {
    const d = await routeTopic({
      message: 'عايز أتكلم عن الشغل',
      level: 20,
    });
    assert.equal(d.kind, 'lock');
    if (d.kind === 'lock') {
      assert.equal(d.topic_id, 'trabalho');
      assert.equal(d.teaching_mode, false);
    }
  });

  it('above-level explicit directions → teaching lock', async () => {
    const d = await routeTopic({
      message: 'عايز أتعلم الاتجاهات',
      level: 1,
    });
    assert.equal(d.kind, 'lock');
    if (d.kind === 'lock') {
      assert.equal(d.topic_id, 'direcoes');
      assert.equal(d.teaching_mode, true);
    }
  });
});
