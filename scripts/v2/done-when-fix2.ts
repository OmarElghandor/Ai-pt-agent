/**
 * Batch 10 Fix 2 Done-when scenarios (G1–G6).
 * Usage: DEEPINFRA_API_KEY=… npx tsx scripts/v2/done-when-fix2.ts
 */
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createLiveConvoStreamModel,
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import type { ConvoSession } from '@/lib/v2/convo/session';
import { fillNameSlot } from '@/lib/v2/convo/free';

async function collect(
  session: ConvoSession,
  store: MemoryConvoSessionStore,
  text: string,
  model: ReturnType<typeof createLiveConvoStreamModel>,
) {
  const events: ConvoTurnStreamEvent[] = [];
  const streamTexts: string[] = [];
  let visible = '';
  const out = await runFreeConvoTurn({
    session,
    learnerText: text,
    store,
    model,
    emit: (e) => {
      events.push(e);
      if (e.type === 'reaction_reset') {
        visible = e.text;
        streamTexts.push(`[reset]${e.text}`);
      } else if (e.type === 'reaction_delta') {
        visible += e.text;
        streamTexts.push(e.text);
      }
    },
  });
  return { session: out.session, events, metrics: out.metrics, visible, streamTexts };
}

function hasLabelLeak(events: ConvoTurnStreamEvent[], visible: string): boolean {
  const joined = events
    .filter((e) => e.type === 'reaction_delta')
    .map((e) => (e.type === 'reaction_delta' ? e.text : ''))
    .join('');
  const hay = `${joined}\n${visible}`;
  return /\bPT\s*:/i.test(hay) || /\bAR\s*:/i.test(hay) || /PTaro|AR:|^PT$/m.test(hay);
}

async function main() {
  const results: string[] = [];
  const store = new MemoryConvoSessionStore();

  // Deterministic G5 check (no model)
  {
    const greet = fillNameSlot(
      'Olá {name}! 😊 Sobre o que queres falar hoje?',
      'admin',
    );
    const ok = !/admin/i.test(greet) && !/\{name\}/.test(greet);
    results.push(ok ? 'G5 unit PASS' : 'G5 unit FAIL');
    console.log('greeting without admin:', greet, results.at(-1));
  }

  if (!process.env.DEEPINFRA_API_KEY) {
    console.log('SKIP live scenarios: no DEEPINFRA_API_KEY');
    const model = createStubConvoStreamModel({
      byCandidate: () =>
        [
          'PT: Que fixe!',
          'AR: رائع!',
          'FRAME: Quero falar de ___.',
          'HINT: قول الموضوع',
          'CHIPS: comida | carros | casa',
        ].join('\n'),
    });
    const started = await startFreeConvoSession({
      userId: 'dw2-stub',
      topicId: 'open',
      store,
      learnerLevel: 1,
      newId: () => 'dw2-stub-1',
      learnerName: 'Omar',
    });
    const r = await collect(
      started.session,
      store,
      'عايز اتعلم عن الاتجاهات',
      model as ReturnType<typeof createLiveConvoStreamModel>,
    );
    const lock = r.events.find((e) => e.type === 'topic_lock');
    const cta = r.events.find((e) => String(e.type).startsWith('cta'));
    console.log('stub S1 lock', lock?.type === 'topic_lock' ? lock.topic_id : null);
    results.push(
      lock?.type === 'topic_lock' &&
        lock.topic_id === 'direcoes' &&
        !cta &&
        r.session.topic_locked
        ? 'S1 stub PASS'
        : 'S1 stub FAIL',
    );

    console.log('--- summary ---');
    for (const line of results) console.log(line);
    return;
  }

  const model = createLiveConvoStreamModel();

  console.log('--- S1: عايز اتعلم عن الاتجاهات → router lock ---');
  {
    const started = await startFreeConvoSession({
      userId: 'dw2-1',
      topicId: 'open',
      store,
      learnerLevel: 1,
      newId: () => 'dw2-open-1',
      learnerName: 'Omar',
    });
    const r = await collect(
      started.session,
      store,
      'عايز اتعلم عن الاتجاهات',
      model,
    );
    const lock = r.events.find((e) => e.type === 'topic_lock');
    const cta = r.events.find((e) => String(e.type).startsWith('cta'));
    console.log('lock', lock);
    console.log('cta', cta);
    const ok =
      lock?.type === 'topic_lock' &&
      lock.topic_id === 'direcoes' &&
      !cta &&
      r.session.topic_locked;
    results.push(ok ? 'S1 PASS' : 'S1 FAIL');
    console.log(results.at(-1));
  }

  console.log('--- S3: Quero falar de comida + 4 PT turns ---');
  {
    const started = await startFreeConvoSession({
      userId: 'dw2-3',
      topicId: 'open',
      store,
      newId: () => 'dw2-open-3',
      learnerName: 'admin', // must not appear in greeting; opening already built
    });
    // Re-check opening used sanitized name at start with Omar for speech path
    const startedOk = await startFreeConvoSession({
      userId: 'dw2-3b',
      topicId: 'open',
      store,
      newId: () => 'dw2-open-3b',
      learnerName: 'Omar',
    });
    assertNoAdmin: {
      const bad = await startFreeConvoSession({
        userId: 'dw2-3c',
        topicId: 'open',
        store,
        newId: () => 'dw2-open-3c',
        learnerName: 'admin',
      });
      if (/admin/i.test(bad.opening.character.tl)) {
        results.push('S3 greeting FAIL');
        console.log(results.at(-1), bad.opening.character.tl);
      } else {
        results.push('S3 greeting PASS');
        console.log(results.at(-1), bad.opening.character.tl);
      }
    }
    void started;
    let session = startedOk.session;
    const lines = [
      'Quero falar de comida',
      'Gosto de arroz',
      'Como peixe',
      'Tu gostas de frango?',
      'Prefiro a sopa',
    ];
    let leak = false;
    let finalOk = 0;
    for (const line of lines) {
      const r = await collect(session, store, line, model);
      session = r.session;
      if (hasLabelLeak(r.events, r.visible)) leak = true;
      const bubble = r.events.find((e) => e.type === 'bubble_ar');
      const q = r.events.find((e) => e.type === 'question');
      if (
        bubble?.type === 'bubble_ar' &&
        bubble.pt &&
        q?.type === 'question' &&
        q.tl === bubble.pt
      ) {
        finalOk += 1;
      }
      console.log(
        'turn',
        line.slice(0, 28),
        'leak?',
        hasLabelLeak(r.events, r.visible),
        'final pt?',
        bubble?.type === 'bubble_ar' ? !!bubble.pt : false,
        'fallback',
        r.metrics.open_used_fallback,
      );
    }
    results.push(
      !leak && finalOk === 5 ? 'S3 stream PASS' : `S3 stream PARTIAL leak=${leak} final=${finalOk}/5`,
    );
    console.log(results.at(-1));
  }

  console.log('--- summary ---');
  for (const line of results) console.log(line);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
