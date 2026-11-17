/**
 * Live (not CI) cena-cafe script on current default model + Haiku.
 * Usage: npx tsx scripts/v2/scenes-live-cafe.ts
 */
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '../../lib/v2/convo/session';
import {
  createLiveConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '../../lib/v2/convo/turn';
import { parseConvoModelSpec } from '../../lib/model';
import type { FreeTextCorrection } from '../../lib/v2/grader';

const SCRIPT = [
  'quero um cafe',
  'Um pastel de nata, por favor.',
  'Para aqui',
  'Quanto é?',
  'Con cartão',
  'Nao perciso',
  'Obrigado!',
] as const;

const stubGrader = async (): Promise<FreeTextCorrection> => ({
  has_error: false,
  severity: 'none',
  corrected_tl: '',
  changes: [],
  main_error: null,
  note_eg: '',
  ar: '',
});

async function play(label: string, modelOverride: string | null) {
  const spec = parseConvoModelSpec(modelOverride);
  console.log(`\n======== ${label} (${spec.label} / ${spec.modelId}) ========`);
  const store = new MemoryConvoSessionStore();
  const started = await startFreeConvoSession({
    userId: `live-${label}`,
    topicId: 'cena-cafe',
    store,
    learnerName: null,
    learnerLevel: 9,
    newId: () => `live-${label}-sess`,
  });
  console.log(`CHAR: ${started.opening.character.tl}`);
  let session = started.session;
  const model = createLiveConvoStreamModel({ modelOverride });

  for (const line of SCRIPT) {
    console.log(`YOU:  ${line}`);
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session,
      learnerText: line,
      store,
      model,
      emit: (e) => events.push(e),
      freeTextGrader: stubGrader,
      learnerGender: 'm',
    });
    session = out.session;
    for (const e of events) {
      if (e.type === 'bubble_ar') {
        console.log(`CHAR: ${e.pt}`);
        if (e.coach_eg) console.log(`CUE:  ${e.coach_eg}`);
      } else if (e.type === 'correction') {
        console.log(`FIX:  ${e.corrected_tl}`);
      } else if (e.type === 'coach' && e.id === 'scene_done') {
        console.log(`END:  ${e.eg}`);
      }
    }
    console.log(
      `      goal=${session.current_goal ?? '—'} status=${session.status}`,
    );
    if (session.status === 'done') break;
  }
}

async function main() {
  await play('current', null);
  await play('haiku', 'haiku');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
