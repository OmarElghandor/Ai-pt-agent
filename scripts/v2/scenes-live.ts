/**
 * Live (not CI) scene scripts on Qwen — batch-rp-3 (2026-11-20).
 *
 * Prints every turn as:
 *   YOU / CHAR / QWEN (raw JSON) / FIX
 *
 * Usage:
 *   npx tsx scripts/v2/scenes-live.ts
 *   npx tsx scripts/v2/scenes-live.ts g1
 *   npx tsx scripts/v2/scenes-live.ts extras
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(name: string) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2]!;
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]!]) process.env[m[1]!] = v;
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

type LiveScript = {
  id: string;
  topicId: string;
  lines: readonly string[];
  /** Seed turns before the scripted lines (to reach a goal). */
  setup?: readonly string[];
};

/** G1 golden path (2026-11-20). */
const G1_LINES = [
  'Bom dia',
  'quero um galão',
  'grande',
  'quente',
  'sem açúcar',
  'um pastel de nata',
  'e uma agua',
  'fresca',
  'Comer para aqui.',
  'é tudo, a conta?',
  'Cartão',
  'Nao obrigado',
  'até amanhã!',
] as const;

/** batch-rp-4 live checks (real Qwen, not CI). */
const RP4_RESTAURANTE = [
  'mesa pra dois',
  'agua',
  'nao como porco',
  'frango',
  'a sopa tem porco?',
  'ازاي اقول الحساب؟',
  'sim muito bom',
  'a conta',
  'cartao',
  'obrigado',
] as const;

const RP4_FARMACIA = [
  'tenho tose',
  'desde onten',
  'nao',
  'nao tenho alergia',
  'quantas vez por dia?',
  'cartão',
  'obrigado',
] as const;

const RP4_TELEFONE = [
  'ola tiago e o omar',
  'tudo bem e tu',
  'vamos o cinema?',
  'hoje',
  'sim amanha',
  'as nove',
  'na porta',
  'xau',
] as const;

const SCRIPTS: Record<string, LiveScript> = {
  g1: {
    id: 'g1',
    topicId: 'cena-cafe',
    lines: G1_LINES,
  },
  cafe: {
    id: 'cafe',
    topicId: 'cena-cafe',
    lines: G1_LINES,
  },
  restaurante: {
    id: 'restaurante',
    topicId: 'cena-restaurante',
    lines: RP4_RESTAURANTE,
  },
  farmacia: {
    id: 'farmacia',
    topicId: 'cena-farmacia',
    lines: RP4_FARMACIA,
  },
  telefone: {
    id: 'telefone',
    topicId: 'cena-telefone',
    lines: RP4_TELEFONE,
  },
  extras: {
    id: 'extras',
    topicId: 'cena-cafe',
    // Reach contexts for the four extra messages from the spec.
    setup: [
      'Bom dia',
      'quero um galão',
      'grande',
      'quente',
      'sem açúcar',
    ],
    lines: [
      // at order_food
      'Sim qureia um pastel de nata',
      // continue to sugar-ish / already past sugar — re-seed a sugar turn via unclear path is hard;
      // play si acucar while still early: after drink path reset via water skip is messy.
      // Spec: «si acucar» → «com açúcar»; run after returning to sugar-adjacent by jumping:
    ],
  },
};

async function playLines(opts: {
  scriptId: string;
  topicId: string;
  lines: readonly string[];
  label?: string;
}) {
  const {
    MemoryConvoSessionStore,
    startFreeConvoSession,
  } = await import('../../lib/v2/convo/session');
  const {
    createLiveConvoStreamModel,
    runFreeConvoTurn,
  } = await import('../../lib/v2/convo/turn');
  type ConvoTurnStreamEvent =
    import('../../lib/v2/convo/turn').ConvoTurnStreamEvent;

  console.log(
    `\n======== ${opts.label ?? opts.scriptId} (${opts.topicId}) ========`,
  );
  const store = new MemoryConvoSessionStore();
  const started = await startFreeConvoSession({
    userId: `live-${opts.scriptId}`,
    topicId: opts.topicId,
    store,
    learnerName: null,
    learnerLevel: 9,
    newId: () => `live-${opts.scriptId}-sess`,
  });
  let session = started.session;
  console.log(`CHAR: ${started.opening.character.tl}`);
  if (started.opening.character.ar) {
    console.log(`AR:   ${started.opening.character.ar}`);
  }
  const model = createLiveConvoStreamModel({ sceneMode: true });

  for (const line of opts.lines) {
    const events: ConvoTurnStreamEvent[] = [];
    let rawQwen: unknown = undefined;
    const out = await runFreeConvoTurn({
      session,
      learnerText: line,
      store,
      model,
      emit: (e) => events.push(e),
      onSceneQwen: (raw) => {
        rawQwen = raw;
      },
    });
    session = out.session;

    const chars = events.filter(
      (e): e is Extract<ConvoTurnStreamEvent, { type: 'bubble_ar' }> =>
        e.type === 'bubble_ar',
    );
    const fixes = events.filter(
      (e): e is Extract<ConvoTurnStreamEvent, { type: 'correction' }> =>
        e.type === 'correction',
    );
    const coaches = events.filter(
      (e) => e.type === 'coach' && e.id !== 'scene_done',
    );

    console.log(`YOU:  ${line}`);
    for (const c of chars) {
      console.log(`CHAR: ${c.pt}`);
      if (c.coach_eg) console.log(`COACH:${c.coach_eg}`);
    }
    if (!chars.length) console.log('CHAR: (none)');
    console.log(`QWEN: ${JSON.stringify(rawQwen ?? null)}`);
    for (const f of fixes) {
      console.log(
        `FIX:  ${f.corrected_tl}${f.note_eg ? ` · ${f.note_eg}` : ''}`,
      );
    }
    if (!fixes.length) console.log('FIX:  (none)');
    for (const c of coaches) {
      if (c.type === 'coach') {
        console.log(
          `HELP: ${c.eg}${c.suggest?.length ? ` [${c.suggest.join(' | ')}]` : ''}`,
        );
      }
    }
    console.log('---');
    if (session.status === 'done') {
      const done = events.find(
        (e) => e.type === 'coach' && e.id === 'scene_done',
      );
      if (done && done.type === 'coach' && done.end_tips_eg?.length) {
        console.log(`TIPS: ${done.end_tips_eg.join(' · ')}`);
      }
      console.log('(scene finished)');
      break;
    }
  }
  return session;
}

async function playExtras() {
  const {
    MemoryConvoSessionStore,
    startFreeConvoSession,
  } = await import('../../lib/v2/convo/session');
  const {
    createLiveConvoStreamModel,
    runFreeConvoTurn,
  } = await import('../../lib/v2/convo/turn');
  type ConvoTurnStreamEvent =
    import('../../lib/v2/convo/turn').ConvoTurnStreamEvent;

  const model = createLiveConvoStreamModel({ sceneMode: true });

  async function turnAt(
    label: string,
    setup: string[],
    line: string,
  ) {
    console.log(`\n======== extra · ${label} ========`);
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: `live-extra-${label}`,
      topicId: 'cena-cafe',
      store,
      learnerName: null,
      learnerLevel: 9,
      newId: () => `live-extra-${label}-sess`,
    });
    let session = started.session;
    for (const s of setup) {
      const out = await runFreeConvoTurn({
        session,
        learnerText: s,
        store,
        model,
        emit: () => {},
      });
      session = out.session;
    }
    console.log(`goal: ${session.current_goal}`);
    const events: ConvoTurnStreamEvent[] = [];
    let rawQwen: unknown = undefined;
    const out = await runFreeConvoTurn({
      session,
      learnerText: line,
      store,
      model,
      emit: (e) => events.push(e),
      onSceneQwen: (raw) => {
        rawQwen = raw;
      },
    });
    session = out.session;
    const chars = events.filter((e) => e.type === 'bubble_ar');
    const fixes = events.filter((e) => e.type === 'correction');
    console.log(`YOU:  ${line}`);
    for (const c of chars) {
      if (c.type === 'bubble_ar') console.log(`CHAR: ${c.pt}`);
    }
    if (!chars.length) console.log('CHAR: (none)');
    console.log(`QWEN: ${JSON.stringify(rawQwen ?? null)}`);
    for (const f of fixes) {
      if (f.type === 'correction') {
        console.log(
          `FIX:  ${f.corrected_tl}${f.note_eg ? ` · ${f.note_eg}` : ''}`,
        );
      }
    }
    if (!fixes.length) console.log('FIX:  (none)');
    console.log(`goal→ ${session.current_goal}`);
  }

  // «Sim qureia um pastel de nata» at order_food
  await turnAt(
    'Sim qureia um pastel de nata',
    ['quero um galão', 'grande', 'quente', 'sem açúcar'],
    'Sim qureia um pastel de nata',
  );
  // «si acucar» at sugar
  await turnAt(
    'si acucar',
    ['quero um galão', 'grande', 'quente'],
    'si acucar',
  );
  // «e todo» at ask_price
  await turnAt(
    'e todo @ ask_price',
    [
      'quero um galão',
      'grande',
      'quente',
      'sem açúcar',
      'um pastel de nata',
      'e uma agua',
      'fresca',
      'Comer para aqui.',
    ],
    'e todo',
  );
  // «con carto» at pay
  await turnAt(
    'con carto @ pay',
    [
      'quero um galão',
      'grande',
      'quente',
      'sem açúcar',
      'um pastel de nata',
      'e uma agua',
      'fresca',
      'Comer para aqui.',
      'é tudo, a conta?',
    ],
    'con carto',
  );
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const ids = args.length ? args : ['restaurante', 'farmacia', 'telefone'];

  for (const id of ids) {
    if (id === 'extras') {
      await playExtras();
      continue;
    }
    const script =
      SCRIPTS[id] ??
      (id === 'cafe-off' || id === 'cafe-jump' || id === 'cafe-typos'
        ? SCRIPTS.g1
        : undefined);
    if (!script) {
      console.error(
        `Unknown script: ${id}. Use: g1 | cafe | restaurante | farmacia | telefone | extras`,
      );
      process.exitCode = 1;
      continue;
    }
    await playLines({
      scriptId: script.id,
      topicId: script.topicId,
      lines: script.lines,
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
