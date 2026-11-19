/**
 * Live (not CI) scene scripts on Qwen — batch-rp-3.
 *
 * Prints every turn as:
 *   YOU / CHAR / FIX / HINT
 *
 * Usage:
 *   npx tsx scripts/v2/scenes-live.ts
 *   npx tsx scripts/v2/scenes-live.ts g1
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
};

const SCRIPTS: Record<string, LiveScript> = {
  g1: {
    id: 'g1',
    topicId: 'cena-cafe',
    lines: [
      'Bom dia',
      'quero um cafe',
      'um pastel de nata',
      'Comer para aqui.',
      'sem açúcar',
      'sim, moro aqui perto',
      'sou do Egito',
      'a tudo, e quenta?',
      'Cartão',
      'Nao obrigado',
      'até amanhã!',
    ],
  },
  cafe: {
    id: 'cafe',
    topicId: 'cena-cafe',
    lines: [
      'Bom dia',
      'quero um cafe',
      'um pastel de nata',
      'Comer para aqui.',
      'sem açúcar',
      'sim, moro aqui perto',
      'sou do Egito',
      'a tudo, e quenta?',
      'Cartão',
      'Nao obrigado',
      'até amanhã!',
    ],
  },
};

async function main() {
  const {
    MemoryConvoSessionStore,
    startFreeConvoSession,
  } = await import('../../lib/v2/convo/session');
  const {
    createLiveConvoStreamModel,
    runFreeConvoTurn,
  } = await import('../../lib/v2/convo/turn');
  type ConvoTurnStreamEvent = import('../../lib/v2/convo/turn').ConvoTurnStreamEvent;

  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const ids = args.length ? args : ['g1'];

  for (const id of ids) {
    const script =
      SCRIPTS[id] ??
      (id === 'cafe-off' || id === 'cafe-jump' || id === 'cafe-typos'
        ? SCRIPTS.g1
        : undefined);
    if (!script) {
      console.error(`Unknown script: ${id}. Use: g1 | cafe`);
      process.exitCode = 1;
      continue;
    }

    console.log(`\n======== ${script.id} (${script.topicId}) ========`);
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: `live-${script.id}`,
      topicId: script.topicId,
      store,
      learnerName: null,
      learnerLevel: 9,
      newId: () => `live-${script.id}-sess`,
    });
    let session = started.session;
    console.log(`CHAR: ${started.opening.character.tl}`);
    if (started.opening.character.ar) {
      console.log(`AR:   ${started.opening.character.ar}`);
    }
    const model = createLiveConvoStreamModel({ sceneMode: true });

    for (const line of script.lines) {
      const events: ConvoTurnStreamEvent[] = [];
      const out = await runFreeConvoTurn({
        session,
        learnerText: line,
        store,
        model,
        emit: (e) => events.push(e),
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
      const hints = events
        .filter((e) => e.type === 'coach' && e.moment === 'help')
        .map((e) => (e.type === 'coach' ? e.eg : ''));

      console.log(`YOU: ${line}`);
      for (const c of chars) {
        console.log(`CHAR: ${c.pt}`);
        if (c.ar) console.log(`AR:   ${c.ar}`);
      }
      if (!chars.length) console.log('CHAR: (none)');
      for (const f of fixes) {
        console.log(
          `FIX:  ${f.corrected_tl}${f.note_eg ? ` · ${f.note_eg}` : ''}`,
        );
      }
      if (!fixes.length) console.log('FIX:  (none)');
      if (hints.length) console.log(`HINT: ${hints.join(' | ')}`);
      // batch-rp-3 Change 2026-11-19: spotlight these corrections in the live log
      if (
        /quero um cafe|par aqui|e cont|Nao obrigado|sem açúcar|sim, moro aqui perto/i.test(
          line,
        )
      ) {
        console.log(
          `QWEN: ${JSON.stringify(
            fixes.map((f) => ({
              corrected: f.corrected_tl,
              note_eg: f.note_eg,
            })),
          )}`,
        );
      }
      console.log('---');
      if (session.status === 'done') {
        console.log('(scene finished)');
        break;
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
