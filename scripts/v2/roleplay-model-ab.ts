/**
 * Live eval (not CI): play scripted learner turns for rp.cafe, rp.restaurante,
 * and rp.direcoes against Qwen and Haiku; print transcripts side by side.
 *
 * Usage: npx tsx scripts/v2/roleplay-model-ab.ts
 * Requires live V2_CONVO_MODEL credentials (DeepInfra / Anthropic).
 */
import { createLiveRoleplayActor } from '../../lib/v2/roleplay/actor';
import {
  clearRoleplayLoadCache,
  loadRoleplaySituation,
  runRoleplayTurn,
  startRoleplayScene,
  createRoleplaySessionState,
} from '../../lib/v2/roleplay';
import { playableSteps } from '../../lib/v2/roleplay/playable';

type Script = { id: string; turns: string[] };

const SCRIPTS: Script[] = [
  {
    id: 'rp.cafe',
    turns: [
      'Bom dia! Queria um galão, por favor.',
      'Um pastel de nata, por favor.',
      'Para levar.',
      'Quanto é?',
      'Aceita cartão?',
      'Não, obrigado.',
      'Obrigado! Até amanhã!',
    ],
  },
  {
    id: 'rp.restaurante',
    turns: [
      'Uma mesa para dois, por favor.',
      'Não como carne de porco.',
      'O frango.',
      'Isto tem porco?',
      'Uma água, por favor.',
      'Sim, muito bom!',
      'A conta, por favor.',
      'Aceita cartão?',
      'Obrigado! Boa tarde!',
    ],
  },
  {
    id: 'rp.direcoes',
    turns: [
      'Desculpe, sabe onde fica o metro?',
      'Pode repetir?',
      'Em frente e depois à esquerda?',
      'É longe?',
      'Ao lado do banco. Obrigado!',
      'Muito obrigado! Bom dia!',
    ],
  },
];

const MODELS = ['qwen', 'haiku'] as const;

async function playScript(
  script: Script,
  model: string,
): Promise<Array<{ learner: string; character: string; step: string | null }>> {
  const situation = loadRoleplaySituation(script.id);
  const playable = playableSteps(situation, {});
  let state = createRoleplaySessionState({
    id: `ab-${script.id}-${model}`,
    user_id: 'ab',
    situation_id: script.id,
    first_step_id: playable[0]!.id,
  });
  const started = startRoleplayScene({ situation, state });
  state = started.state;
  const actor = createLiveRoleplayActor({ modelOverride: model });
  const rows: Array<{ learner: string; character: string; step: string | null }> =
    [];

  const open = started.events.find((e) => e.type === 'character');
  if (open && open.type === 'character') {
    rows.push({
      learner: '(start)',
      character: open.tl,
      step: open.step_id ?? null,
    });
  }

  for (const text of script.turns) {
    const r = await runRoleplayTurn(
      { situation, state, learnerText: text },
      { actor },
    );
    state = r.state;
    const char = [...r.events].reverse().find((e) => e.type === 'character');
    rows.push({
      learner: text,
      character:
        char && char.type === 'character' ? char.tl : '(no character bubble)',
      step: state.current_step_id,
    });
    if (state.status === 'done') break;
  }
  return rows;
}

function pad(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t.padEnd(n);
  return `${t.slice(0, n - 1)}…`;
}

async function main() {
  clearRoleplayLoadCache();
  console.log('Role-play live A/B — Qwen vs Haiku\n');

  for (const script of SCRIPTS) {
    console.log(`\n======== ${script.id} ========`);
    const [qwen, haiku] = await Promise.all([
      playScript(script, MODELS[0]),
      playScript(script, MODELS[1]),
    ]);
    const n = Math.max(qwen.length, haiku.length);
    console.log(
      `${pad('learner', 36)} | ${pad('qwen', 42)} | ${pad('haiku', 42)}`,
    );
    console.log('-'.repeat(126));
    for (let i = 0; i < n; i++) {
      const q = qwen[i];
      const h = haiku[i];
      const learner = q?.learner ?? h?.learner ?? '';
      console.log(
        `${pad(learner, 36)} | ${pad(q?.character ?? '', 42)} | ${pad(h?.character ?? '', 42)}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
