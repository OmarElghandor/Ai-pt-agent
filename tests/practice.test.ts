import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  classifyScript,
  gradeFilledPersonalSlot,
  gradeKnownAnswer,
  normalizeAnswer,
  normalizeWithoutAccents,
  passesCodeGuard,
} from '../lib/grade';
import { validateLessonPack } from '../lib/lessons';
import { emptyProgress, type Progress } from '../lib/progressTypes';
import { presentBeat } from '../lib/messages';
import {
  advancePracticeAfterOutcome,
  applyLearnerTurn,
  chipsFor,
  commitOpenVerdict,
  FRIEND_BRIDGE_TURNS,
  shouldEmitPracticePraise,
  takePracticePraise,
  unresolvedPracticePrompt,
} from '../lib/turn';
import { buildLessonReactionInstruction } from '../lib/friendPrompt';
import type { PracticeFocus } from '../lib/progressTypes';
import type { StoryBeat } from '../lib/lessons/types';

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), 'content/lessons/test-greetings.json'), 'utf8'),
);
const pack = validateLessonPack(fixture);
assert.equal(pack.ok, true, pack.ok ? '' : JSON.stringify(pack));
const lesson = pack.ok ? pack.pack : null;
assert.ok(lesson);

function startLesson(): Progress {
  return applyLearnerTurn({
    progress: emptyProgress(),
    userText: '',
    action: { type: 'start-practice', lessonId: 'test-greetings' },
  }).progress;
}

/**
 * Known beats are graded in code (advance/retry already applied).
 * First known miss returns streamKind none with a template coach.
 * Open / personal-slot beats still need a model verdict via commitOpenVerdict.
 */
function judged(
  progress: Progress,
  userText: string,
  verdict: 'correct' | 'near-miss' | 'wrong' = 'correct',
) {
  const turn = applyLearnerTurn({ progress, userText });
  if (turn.streamKind === 'none' && turn.log.gradingSource === 'code') {
    return { turn, follow: [] as typeof turn.messages, progress: turn.progress };
  }
  if (turn.modelContext?.reaction?.source === 'code') {
    const follow = turn.modelContext.reaction.nextPrompts ?? [];
    return { turn, follow, progress: turn.progress };
  }
  const id = turn.log.itemId ?? '';
  const follow = commitOpenVerdict(turn.progress, lesson!, id, verdict);
  return { turn, follow, progress: turn.progress };
}

describe('grading', () => {
  it('normalizes case, punctuation and spacing', () => {
    assert.equal(normalizeAnswer('  Olá!! '), 'olá');
  });

  it('detects accent-only near misses', () => {
    assert.equal(normalizeWithoutAccents('Olá'), normalizeWithoutAccents('Ola'));
  });

  it('classifies script', () => {
    assert.equal(classifyScript('Olá'), 'latin');
    assert.equal(classifyScript('إزاي'), 'arabic-only');
    assert.equal(classifyScript(''), 'empty');
  });

  it('applies code guards', () => {
    assert.equal(passesCodeGuard('Eu fui ontem', { requiredWords: ['fui'] }), true);
    assert.equal(passesCodeGuard('Eu vou', { requiredWords: ['fui'] }), false);
    assert.equal(passesCodeGuard('falámos', { requiredEndings: ['mos'] }), true);
  });

  it('grades known answers in code', () => {
    const accepted = ['Bom dia', 'Bom dia!'];
    assert.equal(gradeKnownAnswer('Bom dia!', accepted).verdict, 'correct');
    assert.equal(gradeKnownAnswer('bom dia', accepted).verdict, 'correct');
    const accent = gradeKnownAnswer('Bom día', accepted);
    assert.equal(accent.verdict, 'near-miss');
    if (accent.verdict === 'near-miss') assert.equal(accent.reason, 'accent');
    assert.equal(gradeKnownAnswer('Bom e dia', accepted).verdict, 'wrong');
    const anticipated = gradeKnownAnswer('Oi', accepted, [
      {
        answer: 'Oi',
        verdict: 'near_miss',
        feedback: [{ lang: 'ar', text: 'دي برازيلية.', pronunciation: 'دي بَرازِيلِيّة.' }],
      },
    ]);
    assert.equal(anticipated.verdict, 'anticipated-wrong');
    if (anticipated.verdict === 'anticipated-wrong') {
      assert.equal(anticipated.authoredVerdict, 'near_miss');
    }
  });
});

describe('story lesson turns', () => {
  it('starts with the intro and the first character line', () => {
    const result = applyLearnerTurn({
      progress: emptyProgress(),
      userText: '',
      action: { type: 'start-practice', lessonId: 'test-greetings' },
    });
    assert.equal(result.streamKind, 'none');
    assert.equal(result.progress.mode, 'practice');
    assert.equal(result.progress.practice?.phase, 'story');
    assert.equal(result.progress.practice?.beatIndex, 0);
    assert.ok(result.messages.some((m) => m.type === 'intro'));
    assert.ok(result.messages.some((m) => m.type === 'narration'));
    const line = result.messages.find((m) => m.type === 'character');
    assert.equal(line?.speaker, 'Rita');
    assert.equal(line?.playablePt, 'Olá!');
    assert.ok(result.messages.some((m) => m.type === 'coach'));
  });

  it('grades a known answer in code and advances when correct', () => {
    const progress = startLesson();
    const turn = applyLearnerTurn({ progress, userText: 'Olá!' });
    assert.equal(turn.streamKind, 'lesson-reaction');
    assert.equal(turn.log.gradingSource, 'code');
    assert.equal(turn.modelContext?.reaction?.source, 'code');
    assert.equal(turn.modelContext?.reaction?.currentPromptPlain, 'Olá!');
    assert.equal(turn.progress.practice?.beatIndex, 1);
    assert.equal(turn.progress.practice?.itemOutcomes.b01, 'correct');
    assert.ok(turn.messages.some((m) => m.type === 'praise'));
    assert.ok(turn.progress.lastPraiseIndex >= 0);
    const follow = turn.modelContext?.reaction?.nextPrompts ?? [];
    assert.equal(follow.some((m) => m.type === 'character' && m.playablePt === 'Como te chamas?'), true);
  });

  it('stays on the beat after the first known miss and moves on after the second', () => {
    const progress = startLesson();
    const first = judged(progress, 'Bom e dia', 'wrong');
    assert.equal(first.turn.streamKind, 'none');
    assert.equal(first.turn.log.gradingSource, 'code');
    assert.equal(first.turn.log.finishReason, 'deterministic');
    assert.equal(first.turn.log.verdict, 'wrong');
    assert.equal(first.progress.practice?.beatIndex, 0);
    assert.equal(first.progress.practice?.attemptsOnCurrent, 1);
    assert.equal(first.progress.practice?.useAltLine, true);
    assert.equal(first.follow.length, 0);
    const coach = first.turn.messages.find((m) => m.type === 'coach');
    assert.ok(coach);
    const coachText = coach.segments.map((s) => s.text).join(' ');
    assert.match(coachText, /Olá/);
    assert.match(coachText, /جرّب تاني/);
    assert.match(coachText, /مش صح|خلّينا نعيد/);
    assert.equal(first.turn.messages.some((m) => m.type === 'character'), false);
    assert.equal(first.turn.messages.some((m) => m.type === 'praise'), false);

    const second = judged(first.progress, 'Bom e dia', 'wrong');
    assert.equal(second.progress.practice?.itemOutcomes.b01, 'learned-with-help');
    assert.equal(second.progress.practice?.beatIndex, 1);
    assert.ok(second.follow.some((m) => m.type === 'character' && m.playablePt === 'Como te chamas?'));
  });

  it('emits praise for model-graded practice passes only', () => {
    assert.equal(
      shouldEmitPracticePraise({ mode: 'practice', source: 'you' }, 'correct'),
      true,
    );
    assert.equal(
      shouldEmitPracticePraise({ mode: 'practice', source: 'you' }, 'near-miss'),
      true,
    );
    assert.equal(
      shouldEmitPracticePraise({ mode: 'practice', source: 'code' }, 'correct'),
      false,
    );
    assert.equal(
      shouldEmitPracticePraise({ mode: 'practice', source: 'you' }, 'wrong'),
      false,
    );
    assert.equal(
      shouldEmitPracticePraise({ mode: 'assessment', source: 'you' }, 'correct'),
      false,
    );

    const progress = emptyProgress();
    const praise = takePracticePraise(progress);
    assert.equal(praise.type, 'praise');
    assert.ok(progress.lastPraiseIndex >= 0);
    assert.ok((progress.recentPraise?.length ?? 0) > 0);
  });

  it('asks the model to judge a personal slot against the pattern', () => {
    assert.equal(gradeFilledPersonalSlot('chamo-me omar', ['Chamo-me [NAME].'])?.verdict, 'correct');
    let progress = startLesson();
    progress = judged(progress, 'Olá!').progress;

    const filled = applyLearnerTurn({ progress, userText: 'Chamo-me Omar' });
    assert.equal(filled.log.gradingSource, 'model');
    assert.equal(
      shouldEmitPracticePraise(filled.modelContext!.reaction!, 'correct'),
      true,
    );
    assert.equal(filled.modelContext?.reaction?.source, 'you');
    assert.equal(filled.modelContext?.reaction?.slotPattern, 'Chamo-me [NAME].');
    assert.equal(filled.progress.practice?.beatIndex, 1);
    const advanced = commitOpenVerdict(filled.progress, lesson!, filled.log.itemId ?? '', 'correct');
    assert.ok(advanced.some((m) => m.playablePt === 'Tudo bem?'));
    assert.equal(filled.progress.practice?.beatIndex, 2);

    const missed = applyLearnerTurn({ progress, userText: 'trabalho' });
    assert.equal(missed.modelContext?.reaction?.source, 'you');
    assert.equal(missed.modelContext?.reaction?.slotPattern, 'Chamo-me [NAME].');
    const instruction = buildLessonReactionInstruction({
      level: 'A0',
      userText: 'trabalho',
      reaction: missed.modelContext!.reaction!,
    });
    assert.match(instruction, /Pattern: Chamo-me \[NAME\]/);
    assert.match(instruction, /No brackets, no extra words/);
    assert.match(instruction, /Target: Chamo-me \[NAME\]/);
    assert.doesNotMatch(instruction, /<character/);
    assert.doesNotMatch(instruction, /Muito prazer/);

    const open = buildLessonReactionInstruction({
      level: 'A0',
      userText: 'Sim, está bom',
      reaction: {
        mode: 'practice',
        verdict: 'wrong',
        source: 'you',
        attempt: 1,
        currentPromptPlain: 'Está bom o café?',
        accepted: 'Está bom',
        coachTip: 'قول Está bom',
        wordBank: 'bom (كويس) | café (قهوة)',
        recentPraise: [],
      },
    });
    assert.match(open, /Previous line: Está bom o café\?/);
    assert.match(open, /Learner: Sim, está bom/);
    assert.match(open, /Target: Está bom/);
    assert.match(open, /Coach tip: قول Está bom/);
    assert.match(open, /Word bank: bom \(كويس\)/);
    assert.match(open, /missing accent/);
    assert.match(open, /one line only: VERDICT: correct/);
    assert.match(open, /"muto" for "Muito"/);
    assert.match(open, /<coach><ar><\/ar><arz><\/arz><pt><\/pt><\/coach>/);
    assert.doesNotMatch(open, /Muito prazer/);
    assert.doesNotMatch(open, /<character/);
    assert.doesNotMatch(open, /OUTPUT FORMAT/);

    const coded = buildLessonReactionInstruction({
      level: 'A0',
      userText: 'Olá',
      reaction: {
        mode: 'practice',
        verdict: 'correct',
        source: 'code',
        attempt: 1,
        currentPromptPlain: 'Olá!',
        recentPraise: [],
      },
    });
    assert.match(coded, /OUTPUT FORMAT/);
    assert.match(coded, /<character/);
  });

  it('pauses and resumes on the current beat', () => {
    let progress = startLesson();
    progress = judged(progress, 'Olá!').progress;

    const paused = applyLearnerTurn({
      progress,
      userText: '',
      action: { type: 'end-practice' },
    });
    assert.equal(paused.progress.mode, 'friend');
    assert.ok(paused.progress.lessons['test-greetings']?.paused);

    const resumed = applyLearnerTurn({
      progress: paused.progress,
      userText: '',
      action: { type: 'resume-practice' },
    });
    assert.equal(resumed.progress.mode, 'practice');
    assert.equal(resumed.progress.practice?.phase, 'story');
    assert.equal(resumed.progress.practice?.beatIndex, 1);
    assert.ok(resumed.messages.some((m) => m.type === 'character'));
  });

  it('reaches the friend bridge after the last beat, with the closing hook queued', () => {
    let progress = startLesson();

    for (const answer of ['Olá!', 'Chamo-me Omar', 'Tudo bem?']) {
      const step = judged(progress, answer);
      const expectedSource = answer === 'Chamo-me Omar' ? 'model' : 'code';
      assert.equal(step.turn.log.gradingSource, expectedSource);
      progress = step.progress;
      if (progress.practice?.phase === 'friend-bridge') {
        assert.ok(step.follow.some((m) => m.playablePt === 'E tu, de onde és?'));
      }
    }

    assert.equal(progress.mode, 'friend');
    assert.equal(progress.practice?.phase, 'friend-bridge');
    assert.equal(progress.practice?.friendBridgeTurnsLeft, FRIEND_BRIDGE_TURNS);
  });

  it('asks every beat and completes only after all outcomes', () => {
    const base = lesson!;
    const beats: StoryBeat[] = [
      ...base.beats,
      ...[1, 2, 3].map((n) => ({ ...base.beats[2], id: `extra-${n}` })),
    ];
    const six = { ...base, beats };
    let progress = emptyProgress();
    progress.mode = 'practice';
    progress.practice = {
      lessonId: six.id,
      phase: 'story',
      beatIndex: 0,
      attemptsOnCurrent: 0,
      friendBridgeTurnsLeft: 0,
      useAltLine: false,
      coachTipShown: false,
      itemOutcomes: {},
    };

    const asked: string[] = [];
    for (let i = 0; i < beats.length; i++) {
      const focus = progress.practice as PracticeFocus;
      assert.equal(focus.phase, 'story');
      const beat = beats[focus.beatIndex];
      asked.push(beat.id);
      const messages: { type: string; segments: { text: string }[] }[] = [];
      advancePracticeAfterOutcome(progress, six, focus, beat.id, 'correct', messages as never);
      if (i < beats.length - 1) {
        assert.equal(progress.practice?.phase, 'story');
        assert.ok(messages.some((m) => m.type === 'character'));
        assert.equal(messages.some((m) => m.type === 'results'), false);
      } else {
        assert.equal(progress.practice?.phase, 'friend-bridge');
        const done = messages.find((m) => m.type === 'results');
        assert.ok(done);
        assert.match(done.segments.map((s) => s.text).join(' '), /خلصت 6 من 6/);
      }
    }
    assert.deepEqual(asked, beats.map((beat) => beat.id));
  });

  it('shows a coach pre-hint with guided and supported beats before the answer', () => {
    const started = applyLearnerTurn({
      progress: emptyProgress(),
      userText: '',
      action: { type: 'start-practice', lessonId: 'test-greetings' },
    });
    assert.ok(started.messages.some((m) => m.type === 'coach'));
    assert.equal(started.progress.practice?.coachTipShown, true);
    assert.equal(
      chipsFor(started.progress).some((c) => c.action.type === 'show-coach-tip'),
      false,
    );

    const afterFirst = judged(started.progress, 'Olá!');
    assert.equal(afterFirst.progress.practice?.beatIndex, 1);
    assert.ok(afterFirst.follow.some((m) => m.type === 'coach'));
    assert.equal(afterFirst.progress.practice?.coachTipShown, true);
    assert.equal(
      chipsFor(afterFirst.progress).some((c) => c.action.type === 'show-coach-tip'),
      false,
    );

    const supported = presentBeat(lesson!, 1);
    assert.ok(supported.some((m) => m.type === 'character' && m.playablePt === 'Como te chamas?'));
    assert.ok(supported.some((m) => m.type === 'coach'));
    assert.match(
      supported.find((m) => m.type === 'coach')!.segments.map((s) => s.text).join(' '),
      /Chamo-me/,
    );
  });

  it('still shows the current beat if open grading never returns', () => {
    const base = lesson!;
    let progress = emptyProgress();
    progress.mode = 'practice';
    progress.practice = {
      lessonId: base.id,
      phase: 'story',
      beatIndex: 0,
      attemptsOnCurrent: 0,
      friendBridgeTurnsLeft: 0,
      useAltLine: false,
      coachTipShown: false,
      itemOutcomes: {},
    };
    const stuck = unresolvedPracticePrompt(progress, base);
    assert.equal(stuck?.playablePt, base.beats[0].line.pt);
    advancePracticeAfterOutcome(progress, base, progress.practice, base.beats[0].id, 'correct', []);
    const next = unresolvedPracticePrompt(progress, base);
    assert.equal(next?.playablePt, base.beats[1].line.pt);
  });
});
