import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  advanceAfterAnswer,
  currentNextLine,
  isNegativeAnswer,
  openingNextLine,
} from '@/lib/v2/convo/free';
import {
  freeTopicById,
  loadThreadTopic,
} from '@/lib/v2/convo/topics';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
} from '@/lib/v2/convo/turn';

describe('v2 free chat · C2 nextLine machine', () => {
  it('isNegativeAnswer detects nao / nunca / ainda nao', () => {
    assert.equal(isNegativeAnswer('Não.'), true);
    assert.equal(isNegativeAnswer('nunca fui'), true);
    assert.equal(isNegativeAnswer('ainda não'), true);
    assert.equal(isNegativeAnswer('Sim, gosto.'), false);
  });

  it('opening is thread 0 share + ask', () => {
    const doc = loadThreadTopic('casa');
    const line = openingNextLine(doc);
    assert.equal(line.line_id, 'casa.t1.ask');
    assert.match(line.bubble_tl, /Alfama/);
    assert.match(line.bubble_tl, /\?/);
    assert.ok(line.share_tl);
  });

  it('scripted answers walk asks then follow-ups then open on same topic', () => {
    const doc = loadThreadTopic('casa');
    const topic = freeTopicById('casa')!;
    let thread_index = 0;
    let step:
      | { kind: 'ask' }
      | { kind: 'follow_up'; n: number }
      | { kind: 'open' } = { kind: 'ask' };
    let threads_done: string[] = [];
    const lineIds: string[] = [];
    let enteredOpen = false;

    // Each of 5 threads: ask + follow-up → 10 answers land in open mode.
    for (let i = 0; i < 10; i++) {
      const cur = currentNextLine(doc, thread_index, step, topic);
      lineIds.push(cur.line_id);
      const advanced = advanceAfterAnswer({
        doc,
        topic,
        thread_index,
        step,
        threads_done,
        learnerText: 'É longe.',
      });
      thread_index = advanced.thread_index;
      step = advanced.step;
      threads_done = advanced.threads_done;
      assert.equal(advanced.switch_topic_id, undefined);
      if (advanced.entered_open) enteredOpen = true;
    }

    assert.ok(lineIds.includes('casa.t1.ask'));
    assert.ok(lineIds.includes('casa.t1.fu0'));
    assert.ok(lineIds.includes('casa.t2.ask'));
    assert.ok(lineIds.includes('casa.t5.ask'));
    assert.equal(step.kind, 'open');
    assert.equal(enteredOpen, true);
    assert.equal(currentNextLine(doc, thread_index, step, topic).line_id, 'casa.open');
  });

  it('negative answer skips skip_if_negative follow-up', () => {
    const doc = loadThreadTopic('familia');
    const topic = freeTopicById('familia')!;
    // familia.t1 follow-up has skip_if_negative
    const afterAsk = advanceAfterAnswer({
      doc,
      topic,
      thread_index: 0,
      step: { kind: 'ask' },
      threads_done: [],
      learnerText: 'Não.',
    });
    // Should skip fu0 if skip_if_negative, go to t2 ask
    const fu0 = doc.threads[0]!.follow_ups[0]!;
    assert.equal(fu0.skip_if_negative, true);
    assert.equal(afterAsk.next.line_id, 'familia.t2.ask');
    assert.equal(afterAsk.thread_index, 1);
    assert.deepEqual(afterAsk.step, { kind: 'ask' });
  });

  it('legacy bridge step enters open on the same topic', () => {
    const doc = loadThreadTopic('casa');
    const topic = freeTopicById('casa')!;
    const advanced = advanceAfterAnswer({
      doc,
      topic,
      thread_index: 4,
      step: { kind: 'bridge', relatedIndex: 0 },
      threads_done: doc.threads.map((t) => t.id),
      learnerText: 'Sim!',
    });
    assert.equal(advanced.switch_topic_id, undefined);
    assert.deepEqual(advanced.step, { kind: 'open' });
    assert.equal(advanced.entered_open, true);
    assert.equal(advanced.next.line_id, 'casa.open');
  });

  it('runFreeTurn advances thread cursor across answers', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'nl-u',
      topicId: 'casa',
      store,
      newId: () => 'nl-sess',
    });
    let session = started.session;
    assert.equal(session.pending_question?.id, 'casa.t1.ask');
    const model = createStubConvoStreamModel({
      byCandidate: () => 'Que fixe!',
    });

    {
      const out = await runFreeConvoTurn({
        session,
        learnerText: 'Moro em Amadora.',
        store,
        model,
        emit: () => {},
      });
      session = out.session;
      assert.equal(session.pending_question?.id, 'casa.t1.fu0');
      assert.deepEqual(session.free_step, { kind: 'follow_up', n: 0 });
    }

    {
      const out = await runFreeConvoTurn({
        session,
        learnerText: 'É longe.',
        store,
        model,
        emit: () => {},
      });
      session = out.session;
      assert.equal(session.pending_question?.id, 'casa.t2.ask');
      assert.equal(session.thread_index, 1);
    }
  });
});
