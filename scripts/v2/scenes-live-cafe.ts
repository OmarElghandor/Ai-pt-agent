/**
 * Live (not CI) cena-cafe script on current default model + Haiku.
 * Prints per-turn v2_scene_turn guard logs under each reply.
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

type SceneLog = {
  tag: string;
  model_called?: boolean;
  raw?: string[];
  guard?: string;
  final_pt?: string;
  current_goal?: string | null;
};

function installSceneLogCapture(): {
  logs: SceneLog[];
  restore: () => void;
} {
  const logs: SceneLog[] = [];
  const orig = console.info.bind(console);
  console.info = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.includes('"tag":"v2_scene_turn"')) {
      try {
        logs.push(JSON.parse(first) as SceneLog);
      } catch {
        /* ignore */
      }
    }
    // Suppress noisy cost lines in the transcript; keep scene logs for print.
    if (typeof first === 'string' && first.includes('"tag":"v2_convo_turn_cost"')) {
      return;
    }
    orig(...args);
  };
  return {
    logs,
    restore: () => {
      console.info = orig;
    },
  };
}

function printLog(log: SceneLog | undefined) {
  if (!log) {
    console.log('LOG:  (missing v2_scene_turn)');
    return;
  }
  console.log(
    `LOG:  model_called=${log.model_called} guard=${log.guard} current_goal=${log.current_goal ?? '—'}`,
  );
  for (const [i, raw] of (log.raw ?? []).entries()) {
    const oneLine = raw.replace(/\s+/g, ' ').trim().slice(0, 220);
    console.log(`RAW${i + 1}: ${oneLine}`);
  }
}

async function play(label: string, modelOverride: string | null) {
  const spec = parseConvoModelSpec(modelOverride);
  console.log(`\n======== ${label} (${spec.label} / ${spec.modelId}) ========`);
  const capture = installSceneLogCapture();
  try {
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
    console.log(`CAST: ${started.session.character_id}`);
    let session = started.session;
    const model = createLiveConvoStreamModel({ modelOverride });

    for (const line of SCRIPT) {
      console.log(`YOU:  ${line}`);
      const before = capture.logs.length;
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
      const turnLogs = capture.logs.slice(before);
      printLog(turnLogs.at(-1));
      console.log(
        `      goal=${session.current_goal ?? '—'} status=${session.status}`,
      );
      if (session.status === 'done') break;
    }
  } finally {
    capture.restore();
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
