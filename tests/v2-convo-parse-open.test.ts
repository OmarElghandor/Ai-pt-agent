import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isYesNoQuestion,
  parseOpenConvoTurn,
  splitOpenMarkers,
} from '@/lib/v2/convo/output/parseOpen';
import { pickOpenFallback } from '@/lib/v2/convo/free/openFallback';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
} from '@/lib/v2/convo/turn';

const GOOD = `PT: Que fixe! E o teu carro é novo ou usado?
AR: رائع! هل سيارتك جديدة أم مستعملة؟
FRAME: O meu carro é ___.
HINT: قول عربيتك جديدة ولا مستعملة
CHIPS: novo | usado | Não tenho carro`;

describe('v2 open mode · parser (Batch 10 D5)', () => {
  it('parses a markers-split stream', () => {
    const fields = splitOpenMarkers(GOOD);
    assert.equal(fields.PT?.startsWith('Que fixe'), true);
    assert.ok(fields.AR);
    assert.ok(fields.FRAME?.includes('___'));
    assert.ok(fields.HINT);
    assert.ok(fields.CHIPS?.includes('|'));
  });

  it('accepts a valid open turn', () => {
    const parsed = parseOpenConvoTurn(GOOD);
    assert.equal(parsed.decision, 'ok');
    assert.equal(parsed.chips.length, 3);
  });

  it('flags missing FRAME', () => {
    const text = `PT: Conta-me mais sobre isso?
AR: احكِ لي المزيد؟
HINT: كمّل
CHIPS: a | b`;
    const parsed = parseOpenConvoTurn(text);
    assert.equal(parsed.decision, 'regenerate');
    assert.ok(parsed.issues.includes('missing_frame'));
  });

  it('flags a yes/no question', () => {
    assert.equal(isYesNoQuestion('Gostas de carros?'), true);
    assert.equal(isYesNoQuestion('Gostas de carros ou motas?'), false);
    const parsed = parseOpenConvoTurn(`PT: Gostas de carros?
AR: هل تحب السيارات؟
FRAME: Gosto de ___.
HINT: قول
CHIPS: sim | não`);
    assert.ok(parsed.issues.includes('yes_no'));
  });

  it('flags two questions', () => {
    const parsed = parseOpenConvoTurn(`PT: Que fixe! Onde? Quando?
AR: رائع! أين؟ متى؟
FRAME: Foi em ___.
HINT: قول
CHIPS: a | b`);
    assert.ok(parsed.issues.includes('question_count'));
  });

  it('fallback bank has 10 questions with frames', () => {
    const q = pickOpenFallback(0);
    assert.ok(q.tl);
    assert.ok(q.ar);
    assert.ok(q.frame.tl.includes('___') || q.frame.chips.length >= 2);
    assert.equal(pickOpenFallback(9).id, 'fb10');
  });

  it('open turn uses fallback when model fails twice', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'open-1',
      topicId: 'open',
      store,
      newId: () => 'open-sess-1',
      learnerName: 'Omar',
    });
    assert.deepEqual(started.session.free_step, { kind: 'open' });
    const model = createStubConvoStreamModel({
      byCandidate: () => 'Gostas de carros?\nAR: ؟',
    });
    const events: Array<{ type: string }> = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'Quero falar de carros',
      store,
      model,
      emit: (e) => events.push(e),
    });
    assert.equal(out.session.topic_id, 'open');
    assert.deepEqual(out.session.free_step, { kind: 'open' });
    const frame = events.find((e) => e.type === 'free_frame');
    assert.ok(frame);
    assert.ok(out.session.pending_frame);
    assert.equal(
      out.session.pending_frame!.tl,
      (frame as { tl: string }).tl,
    );
    assert.deepEqual(
      out.session.pending_frame!.chips,
      (frame as { chips: string[] }).chips,
    );
    const q = events.find((e) => e.type === 'question');
    assert.ok(q && 'tl' in q);
    assert.match(String((q as { tl: string }).tl), /\?/);
  });

  it('open start seeds pending_frame with fixed opening chips (E3/E5)', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'open-frame',
      topicId: 'open',
      store,
      newId: () => 'open-frame-1',
    });
    assert.ok(started.session.pending_frame);
    assert.equal(started.session.pending_frame!.tl, 'Quero falar de ___.');
    assert.equal(started.session.pending_frame!.eg, 'قول عايز تتكلم عن إيه');
    assert.deepEqual(started.session.pending_frame!.chips, [
      'Sobre o meu dia',
      'Futebol',
      'Comida',
      'O trabalho',
    ]);
  });

  it('open suggested_words are not catalog title chips (E4)', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'open-words',
      topicId: 'open',
      store,
      newId: () => 'open-words-1',
      suggestedWords: ['à direita', 'a esquina'],
    });
    assert.deepEqual(started.session.suggested_words, [
      'à direita',
      'a esquina',
    ]);
    assert.ok(
      !started.session.suggested_words.some((w) =>
        /^Sobre\s/i.test(w),
      ),
    );
    assert.ok(started.session.pending_frame?.chips.length);
  });
});
