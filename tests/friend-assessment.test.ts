import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dropJunkCoach, parseFriendOutput, parseOpenVerdict } from '../lib/friendParse';
import {
  buildLessonReactionInstruction,
  notesForReaction,
} from '../lib/friendPrompt';
import { emptyProgress, type LessonReactionContext } from '../lib/progressTypes';
import { lessonById } from '../lib/lessons/catalogue';
import { applyLearnerTurn, ASSESSMENT_COOLDOWN_MS, chipsFor, commitOpenVerdict } from '../lib/turn';
import type { Progress } from '../lib/progressTypes';

describe('friend output parse', () => {
  it('parses correction then chat blocks', () => {
    const raw = `<correction><ar>قصدك</ar><arz>قَصْدَك</arz> <pt>fui</pt>
<pt>Ontem fui ao café.</pt></correction>
<chat><pt>Onde foste?</pt><ar>رحت فين؟</ar><arz>رُحْت فِين؟</arz></chat>`;
    const messages = parseFriendOutput(raw);
    assert.equal(messages[0].type, 'correction');
    assert.equal(messages[1].type, 'chat');
    assert.ok(messages[1].translation?.length);
    assert.ok(messages[1].segments.every((s) => s.lang === 'pt'));
  });

  it('drops a coach line that glues or doubles the learner’s words', () => {
    const glued = parseFriendOutput('<coach><pt>Muitomuto</pt></coach>');
    const doubled = parseFriendOutput('<coach><pt>SimSim</pt></coach>');
    const clean = parseFriendOutput('<coach><ar>قول</ar><pt>Muito prazer</pt></coach>');
    assert.equal(dropJunkCoach(glued, 'muto prazer').length, 0);
    assert.equal(dropJunkCoach(doubled, 'sim Sou de Lisboa').length, 0);
    assert.equal(dropJunkCoach(clean, 'muto prazer').length, 1);
  });
});

describe('open verdict parse', () => {
  it('reads the hidden verdict line and body', () => {
    const raw = `VERDICT: correct — has past form
<chat><pt>Boa!</pt><ar>حلو!</ar><arz>حِلْو!</arz></chat>`;
    const parsed = parseOpenVerdict(raw);
    assert.equal(parsed.verdict, 'correct');
    assert.ok(parsed.rawLine?.includes('VERDICT'));
    assert.ok(parsed.body.includes('<chat>'));
  });

  it('returns null verdict when the line is missing', () => {
    const parsed = parseOpenVerdict(`<chat><pt>Boa!</pt></chat>`);
    assert.equal(parsed.verdict, null);
  });
});

function acceptAnswer(progress: Progress, userText: string, verdict: 'correct' | 'wrong' = 'correct') {
  const turn = applyLearnerTurn({ progress, userText });
  if (turn.modelContext?.reaction?.source === 'code') {
    const follow = turn.modelContext.reaction.nextPrompts ?? [];
    return { turn, follow, progress: turn.progress };
  }
  const pack = lessonById('test-greetings');
  assert.ok(pack);
  const follow = commitOpenVerdict(turn.progress, pack, turn.log.itemId ?? '', verdict);
  return { turn, follow, progress: turn.progress };
}

describe('assessment', () => {
  it('offers assessment only after cooldown and lets the model grade', () => {
    let progress = emptyProgress();
    progress = applyLearnerTurn({
      progress,
      userText: '',
      action: { type: 'start-practice', lessonId: 'test-greetings' },
    }).progress;
    for (const answer of ['Olá!', 'Chamo-me Omar.', 'Tudo bem?']) {
      const step = acceptAnswer(progress, answer);
      assert.equal(step.turn.streamKind, 'lesson-reaction');
      const expectedSource = answer.startsWith('Chamo-me') ? 'you' : 'code';
      assert.equal(step.turn.modelContext?.reaction?.source, expectedSource);
      progress = step.progress;
    }
    assert.equal(progress.practice?.phase, 'friend-bridge');
    // Exhaust friend-bridge turns to mark practisedAt
    for (let i = 0; i < 5; i++) {
      progress = applyLearnerTurn({ progress, userText: 'Oi' }).progress;
    }
    assert.ok(progress.lessons['test-greetings']?.practisedAt);

    progress.lessons['test-greetings'].practisedAt = Date.now();
    assert.ok(!chipsFor(progress).some((c) => c.id.startsWith('assess-')));

    progress.lessons['test-greetings'].practisedAt = Date.now() - ASSESSMENT_COOLDOWN_MS - 1000;
    assert.ok(chipsFor(progress).some((c) => c.action.type === 'start-assessment'));

    const start = applyLearnerTurn({
      progress,
      userText: '',
      action: { type: 'start-assessment', lessonId: 'test-greetings' },
    });
    assert.equal(start.progress.mode, 'assessment');
    progress = start.progress;

    let step = acceptAnswer(progress, 'Olá!');
    assert.equal(step.turn.log.gradingSource, 'model');
    assert.equal(step.turn.modelContext?.reaction?.source, 'you');
    assert.equal(step.turn.streamKind, 'lesson-reaction');
    progress = step.progress;

    step = acceptAnswer(progress, 'nope', 'wrong');
    assert.equal(step.turn.streamKind, 'lesson-reaction');
    assert.equal(step.turn.modelContext?.reaction?.attempt, 1);
    assert.ok(step.turn.modelContext?.reaction?.nudgeNote);
    progress = step.progress;
    step = acceptAnswer(progress, 'nope', 'wrong');
    assert.equal(step.progress.assessment?.taskOutcomes['a2'], 'fail');
    progress = step.progress;

    step = acceptAnswer(progress, 'Tudo bem?');
    assert.equal(step.progress.mode, 'friend');
    assert.equal(step.turn.streamKind, 'lesson-reaction');
    assert.ok(step.follow.some((message) => message.type === 'results'));
    assert.equal(step.progress.lessons['test-greetings']?.assessmentByTarget?.['تحية'], 'pass');
    assert.equal(
      step.progress.lessons['test-greetings']?.assessmentByTarget?.['تقديم النفس'],
      'fail',
    );
  });
});

describe('praise and help parse', () => {
  it('parses praise and help blocks', () => {
    const praise = parseFriendOutput(
      `<praise><pt>Boa escolha!</pt><ar>اختيار حلو!</ar></praise>`,
    );
    assert.equal(praise[0].type, 'praise');
    assert.ok(praise[0].translation?.length);

    const help = parseFriendOutput(
      `<help><ar>بنقول</ar><arz>بِنْقول</arz><pt>fui</pt></help><chat><pt>Tenta tu?</pt><ar>جرّب؟</ar></chat>`,
    );
    assert.equal(help[0].type, 'help');
    assert.equal(help[1].type, 'chat');
  });
});

describe('Prompt 4 reaction context', () => {
  const base = (over: Partial<LessonReactionContext>): LessonReactionContext => ({
    mode: 'practice',
    verdict: 'correct',
    source: 'code',
    attempt: 1,
    currentPromptPlain: 'Como dizes adeus?',
    accepted: 'Adeus! | Até logo! | Tchau!',
    hintNote: 'فكر في تحية الصباح',
    whyNote: 'في الصبح بنقول Bom dia',
    mistakeNote: 'قربت من Adeus',
    recentPraise: [],
    ...over,
  });

  it('keeps CURRENT_PROMPT and never embeds next-item Portuguese text', () => {
    const instruction = buildLessonReactionInstruction({
      level: 'A0',
      userText: 'Adeus',
      reaction: base({
        verdict: 'correct',
        nextPrompt: {
          id: 'next',
          role: 'assistant',
          type: 'task',
          at: Date.now(),
          segments: [{ lang: 'pt', text: 'Bom dia!' }],
          prompt: { shape: 'question', pt: 'Como saudas o teu vizinho de manhã?', arHidden: '' },
        },
      }),
    });
    assert.match(instruction, /CURRENT_PROMPT: Como dizes adeus\?/);
    assert.match(instruction, /HAS_NEXT_PROMPT: yes/);
    assert.doesNotMatch(instruction, /NEXT_PROMPT \(context/);
    assert.doesNotMatch(instruction, /Como saudas o teu vizinho de manhã/);
    assert.doesNotMatch(instruction, /Bom dia!/);
  });

  it('omits why_note on correct; attempt-1 wrong includes accepted to repeat', () => {
    assert.equal(notesForReaction(base({ verdict: 'correct' })), '(none)');

    const wrong1 = notesForReaction(base({ verdict: 'wrong', attempt: 1 }));
    assert.match(wrong1, /hint_note/);
    assert.match(wrong1, /accepted:/);
    assert.doesNotMatch(wrong1, /why_note/);

    const wrong2 = notesForReaction(base({ verdict: 'wrong', attempt: 2 }));
    assert.match(wrong2, /why_note/);
    assert.match(wrong2, /accepted:/);

    const instruction = buildLessonReactionInstruction({
      level: 'A0',
      userText: 'xyz',
      reaction: base({ verdict: 'wrong', attempt: 1, source: 'code' }),
    });
    assert.match(instruction, /show the target phrase/);
    assert.match(instruction, /جرّب تاني/);
    assert.doesNotMatch(instruction, /Never give the answer/);
  });

  it('near_miss only exposes mistake_note', () => {
    const notes = notesForReaction(base({ verdict: 'near_miss' }));
    assert.match(notes, /mistake_note/);
    assert.doesNotMatch(notes, /why_note/);
    assert.doesNotMatch(notes, /hint_note/);
  });
});

