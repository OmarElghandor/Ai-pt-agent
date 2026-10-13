#!/usr/bin/env npx tsx
/**
 * Story-lesson transcript: intro → beats → friend-bridge.
 * Known beats grade in code and queue the next line on the reaction.
 */
import { emptyProgress } from '../lib/progressTypes';
import { applyLearnerTurn } from '../lib/turn';
import { typedToPlain } from '../lib/messages';

function show(label: string, result: ReturnType<typeof applyLearnerTurn>) {
  console.log(`\n=== ${label} ===`);
  console.log(
    `stream=${result.streamKind} · ${[
      `source=${result.log.gradingSource}`,
      `verdict=${result.log.verdict}`,
      `matched=${result.log.matchedAnswer}`,
      `phase=${result.progress.practice?.phase ?? '-'}`,
      `beat=${result.progress.practice?.beatIndex ?? '-'}`,
    ].join(' · ')}`,
  );
  if (result.learnerVerdict) console.log(`learnerVerdict=${result.learnerVerdict}`);
  for (const m of result.messages) {
    console.log(`  [${m.type}] ${typedToPlain(m).slice(0, 140)}`);
  }
  for (const m of result.modelContext?.reaction?.nextPrompts ?? []) {
    console.log(`  next [${m.type}] ${typedToPlain(m).slice(0, 140)}`);
  }
}

let progress = emptyProgress();
let r = applyLearnerTurn({
  progress,
  userText: '',
  action: { type: 'start-practice', lessonId: 'test-greetings' },
});
show('start', r);
progress = r.progress;

r = applyLearnerTurn({ progress, userText: 'xyz' });
show('first miss stays and re-asks', r);
progress = r.progress;

r = applyLearnerTurn({ progress, userText: 'Olá!' });
show('second try advances', r);
progress = r.progress;

r = applyLearnerTurn({ progress, userText: 'Chamo-me Omar' });
show('name slot', r);
progress = r.progress;

r = applyLearnerTurn({ progress, userText: 'Tudo bem?' });
show('last beat → hook', r);
console.log('phase', r.progress.practice?.phase);
