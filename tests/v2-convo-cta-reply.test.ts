import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyCtaReply,
  normalizeCtaReply,
} from '@/lib/v2/convo/free/ctaReply';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import { createStubConvoCoachCaller } from '@/lib/v2/convo/sideChannel';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';

describe('v2 free · G4 CTA yes/no', () => {
  it('normalizes and matches whole-message yes/no only', () => {
    assert.equal(normalizeCtaReply('  نعم! 🎉 '), 'نعم');
    assert.equal(classifyCtaReply('نعم'), 'yes');
    assert.equal(classifyCtaReply('أيوه'), 'yes');
    assert.equal(classifyCtaReply('Sim!'), 'yes');
    assert.equal(classifyCtaReply('لأ'), 'no');
    assert.equal(classifyCtaReply('não'), 'no');
    assert.equal(classifyCtaReply('نعم عايز أتعلم'), null);
    assert.equal(classifyCtaReply('قول نعم'), null);
    assert.equal(classifyCtaReply('ok go'), null);
  });

  it('«نعم» with pending CTA navigates and clears', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'cta-yes',
      topicId: 'comida',
      store,
      newId: () => 'cta-yes-1',
    });
    const model = createStubConvoStreamModel({ byCandidate: () => 'Ok!' });
    const suggestEvents: ConvoTurnStreamEvent[] = [];
    const afterSuggest = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'عايز أتعلم الاتجاهات',
      store,
      model,
      emit: (e) => suggestEvents.push(e),
    });
    assert.ok(afterSuggest.session.pending_cta?.href);
    const href = afterSuggest.session.pending_cta!.href;

    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: afterSuggest.session,
      learnerText: 'نعم',
      store,
      model,
      emit: (e) => events.push(e),
    });
    assert.equal(out.session.pending_cta, null);
    assert.ok(
      events.some((e) => e.type === 'cta_navigate' && e.href === href),
    );
    assert.equal(out.session.learner_lines.length, 0);
    assert.equal(out.session.last_exchanges.length, 0);
  });

  it('dismiss_cta clears without a transcript line', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'cta-dis',
      topicId: 'comida',
      store,
      newId: () => 'cta-dis-1',
    });
    const model = createStubConvoStreamModel({ byCandidate: () => 'Ok!' });
    const afterSuggest = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'عايز أتعلم الاتجاهات',
      store,
      model,
      emit: () => {},
    });
    assert.ok(afterSuggest.session.pending_cta);

    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: afterSuggest.session,
      learnerText: '',
      store,
      model,
      emit: (e) => events.push(e),
      dismissCta: true,
    });
    assert.equal(out.session.pending_cta, null);
    assert.ok(events.some((e) => e.type === 'cta_dismissed'));
    assert.equal(out.session.learner_lines.length, 0);
    assert.equal(out.session.last_exchanges.length, 0);
  });

  it('«نعم» with no CTA goes to Arabic side channel', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'cta-side',
      topicId: 'comida',
      store,
      newId: () => 'cta-side-1',
    });
    const model = createStubConvoStreamModel({ byCandidate: () => 'Ok!' });
    const coach = createStubConvoCoachCaller({
      eg: 'حلو — بالبرتغالي: «Sim».',
    });
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'نعم',
      store,
      model,
      emit: (e) => events.push(e),
      coachCaller: coach,
    });
    assert.equal(out.session.pending_cta, null);
    assert.ok(!events.some((e) => e.type === 'cta_navigate'));
    assert.ok(events.some((e) => e.type === 'coach'));
    assert.equal(coach.calls, 1);
  });

  it('"Sim" after a later turn does not navigate', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'cta-ttl',
      topicId: 'comida',
      store,
      newId: () => 'cta-ttl-1',
    });
    const model = createStubConvoStreamModel({
      byCandidate: () => 'Que bom!',
    });
    const afterSuggest = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'عايز أتعلم الاتجاهات',
      store,
      model,
      emit: () => {},
    });
    assert.ok(afterSuggest.session.pending_cta);

    // Other message consumes TTL
    const mid = await runFreeConvoTurn({
      session: afterSuggest.session,
      learnerText: 'Gosto de arroz',
      store,
      model,
      emit: () => {},
    });
    assert.equal(mid.session.pending_cta, null);

    const events: ConvoTurnStreamEvent[] = [];
    const late = await runFreeConvoTurn({
      session: mid.session,
      learnerText: 'Sim',
      store,
      model,
      emit: (e) => events.push(e),
    });
    assert.ok(!events.some((e) => e.type === 'cta_navigate'));
    assert.equal(late.session.pending_cta, null);
  });
});
