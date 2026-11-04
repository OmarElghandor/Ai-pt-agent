import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  freeTopicById,
  listThreadTopicIdsFromFiles,
  loadFreeTopicsFile,
  loadPersonasFile,
  loadThreadTopic,
  personaById,
  requireThreadTopic,
  validatePersonasFile,
  validateThreadTopicFile,
} from '@/lib/v2/convo/topics';

const EXPECTED_TOPIC_IDS = [
  'amanha',
  'bairro',
  'casa',
  'comida',
  'compras',
  'egito',
  'familia',
  'fim_de_semana',
  'ginasio',
  'ontem',
  'trabalho',
  'transportes',
];

describe('v2 free topics · Batch 9 C1 threads', () => {
  it('loads exactly 12 free topics from thread files', () => {
    const file = loadFreeTopicsFile();
    assert.equal(file.target_lang, 'pt-PT');
    assert.equal(file.topics.length, 12);
    assert.deepEqual(file.topics.map((t) => t.id).sort(), EXPECTED_TOPIC_IDS);
    for (const t of file.topics) {
      assert.ok(t.word_set.length >= 5, `${t.id} needs a word_set`);
      assert.ok(t.character_id, `${t.id} needs character_id`);
      assert.ok(t.title_ar, `${t.id} needs title_ar`);
      assert.ok(t.title_in_sentence_tl, `${t.id} needs title_in_sentence_tl`);
      assert.ok(t.intro_eg, `${t.id} needs intro_eg`);
      assert.ok(t.related_topic_ids.length >= 1, `${t.id} needs related`);
    }
    assert.equal(freeTopicById('casa')?.character_id, 'ines');
    assert.equal(freeTopicById('ontem')?.character_id, 'nour');
  });

  it('all 12 thread files pass validation', () => {
    const fromFiles = listThreadTopicIdsFromFiles();
    assert.deepEqual(fromFiles, EXPECTED_TOPIC_IDS);
    for (const id of fromFiles) {
      const doc = requireThreadTopic(id);
      assert.equal(doc.topic.id, id);
      assert.equal(doc.threads.length, 5);
      const persona = personaById(doc.topic.character_id);
      assert.ok(persona, `persona ${doc.topic.character_id}`);
      assert.equal(persona!.address, 'tu');
    }
  });

  it('loads personas (ines, tiago, nour)', () => {
    const file = loadPersonasFile();
    assert.equal(file.target_lang, 'pt-PT');
    assert.ok(file.personas.ines);
    assert.ok(file.personas.tiago);
    assert.ok(file.personas.nour);
    const bad = validatePersonasFile({ target_lang: 'pt-PT', personas: {} });
    assert.equal(bad.ok, false);
  });

  it('rejects an ask with two question marks', () => {
    const good = loadThreadTopic('casa');
    const bad = structuredClone(good);
    bad.threads[0]!.ask.tl = 'E tu, onde moras? Em Lisboa?';
    const r = validateThreadTopicFile(bad, { addressIsTu: true });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.rule === 'question_mark'));
  });

  it('rejects a share that contains a question mark', () => {
    const good = loadThreadTopic('casa');
    const bad = structuredClone(good);
    bad.threads[0]!.share.tl = 'Eu moro em Alfama?';
    const r = validateThreadTopicFile(bad, { addressIsTu: true });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.rule === 'question_mark'));
  });

  it('rejects formal você / Mora opener for tu characters', () => {
    const good = loadThreadTopic('casa');
    const bad = structuredClone(good);
    bad.threads[0]!.ask.tl = 'Mora em Lisboa?';
    const r = validateThreadTopicFile(bad, { addressIsTu: true });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.rule === 'formal' || i.rule === 'tu'));
  });

  it('rejects a frame with fewer than 2 chips', () => {
    const good = loadThreadTopic('casa');
    const bad = structuredClone(good);
    bad.threads[0]!.ask.frame.chips = ['Moro em Lisboa.'];
    const r = validateThreadTopicFile(bad, { addressIsTu: true });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.rule === 'chips' || i.rule === 'shape'));
  });
});
