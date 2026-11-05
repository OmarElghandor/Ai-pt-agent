/**
 * Batch 10 Fix 1 Done-when scenarios against the live model.
 * Usage: set -a && source .env.local && set +a && npx tsx scripts/v2/done-when-fix1.ts
 */
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createLiveConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import { createLiveConvoCoachCaller } from '@/lib/v2/convo/sideChannel';
import type { ConvoSession } from '@/lib/v2/convo/session';

async function collect(
  session: ConvoSession,
  store: MemoryConvoSessionStore,
  text: string,
  model: ReturnType<typeof createLiveConvoStreamModel>,
  coach?: ReturnType<typeof createLiveConvoCoachCaller>,
) {
  const events: ConvoTurnStreamEvent[] = [];
  const out = await runFreeConvoTurn({
    session,
    learnerText: text,
    store,
    model,
    emit: (e) => events.push(e),
    ...(coach ? { coachCaller: coach } : {}),
  });
  return { session: out.session, events, metrics: out.metrics };
}

async function main() {
  if (!process.env.DEEPINFRA_API_KEY) {
    console.log('SKIP real-model: no DEEPINFRA_API_KEY');
    return;
  }

  const store = new MemoryConvoSessionStore();
  const model = createLiveConvoStreamModel();
  const coach = createLiveConvoCoachCaller(8_000);
  const results: string[] = [];

  console.log('--- S1: عايز اعلم عن الاتجاهات ---');
  {
    const started = await startFreeConvoSession({
      userId: 'done-when-1',
      topicId: 'open',
      store,
      newId: () => 'dw-open-1',
      learnerName: 'Omar',
    });
    const r = await collect(
      started.session,
      store,
      'عايز اعلم عن الاتجاهات',
      model,
    );
    const cta = r.events.find((e) => e.type === 'cta');
    console.log('cta', cta);
    const ok = cta?.type === 'cta' && cta.label_eg === 'يلا نتعلّم';
    results.push(ok ? 'S1 PASS' : 'S1 FAIL');
    console.log(results.at(-1));
  }

  console.log('--- S2: ازاي أقول مع رز؟ ---');
  {
    const started = await startFreeConvoSession({
      userId: 'done-when-2',
      topicId: 'open',
      store,
      newId: () => 'dw-open-2',
      learnerName: 'Omar',
    });
    const r = await collect(
      started.session,
      store,
      'ازاي أقول مع رز؟',
      model,
      coach,
    );
    const note = r.events.find((e) => e.type === 'coach');
    const eg = note?.type === 'coach' ? note.eg : '';
    console.log('coach eg', eg);
    const ok = /com arroz/i.test(eg);
    results.push(ok ? 'S2 PASS' : 'S2 FAIL');
    console.log(results.at(-1));
  }

  console.log('--- S3: 5 PT car turns ---');
  {
    const started = await startFreeConvoSession({
      userId: 'done-when-3',
      topicId: 'open',
      store,
      newId: () => 'dw-open-3',
      learnerName: 'Omar',
    });
    let session = started.session;
    const lines = [
      'Quero falar de carros',
      'Gosto de carros rápidos',
      'Tenho um carro pequeno',
      'Tu tens carro?',
      'Prefiro a cidade',
    ];
    let sayOk = 0;
    let qOk = 0;
    for (const line of lines) {
      const r = await collect(session, store, line, model);
      session = r.session;
      const q = r.events.find((e) => e.type === 'question');
      if (q?.type === 'question' && q.say) sayOk += 1;
      if (q?.type === 'question' && /\?/.test(q.tl)) qOk += 1;
      console.log(
        'turn',
        line.slice(0, 24),
        'say?',
        !!(q?.type === 'question' && q.say),
        'fallback',
        r.metrics.open_used_fallback,
        'rate',
        `${r.metrics.open_fallbacks}/${r.metrics.open_turns}`,
      );
    }
    console.log(
      'S3 say',
      `${sayOk}/5`,
      'questions',
      `${qOk}/5`,
      `${session.open_fallbacks}/${session.open_turns}`,
    );
    results.push(sayOk === 5 && qOk === 5 ? 'S3 PASS' : 'S3 PARTIAL');
    console.log(results.at(-1));
  }

  console.log('--- S4: casa off-topic football ---');
  {
    const started = await startFreeConvoSession({
      userId: 'done-when-4',
      topicId: 'casa',
      store,
      newId: () => 'dw-casa-1',
      learnerName: 'Omar',
    });
    let r = await collect(started.session, store, '', model);
    let session = r.session;
    r = await collect(session, store, 'Moro em Amadora', model);
    session = r.session;
    r = await collect(
      session,
      store,
      'I like football did you watch Benfica',
      model,
    );
    session = r.session;
    const mas = r.events.some(
      (e) => e.type === 'reaction_delta' && /Mas diz-me/i.test(e.text),
    );
    const coachMas = r.events.some(
      (e) => e.type === 'coach' && /Mas diz-me/i.test(e.eg),
    );
    console.log(
      'topic',
      session.topic_id,
      'Mas diz-me?',
      mas || coachMas,
    );
    const ok = session.topic_id === 'casa' && !mas && !coachMas;
    results.push(ok ? 'S4 PASS' : 'S4 FAIL');
    console.log(results.at(-1));
  }

  console.log('--- summary ---');
  for (const line of results) console.log(line);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
