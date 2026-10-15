import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  classifyScript,
  gradeFilledPersonalSlot,
  gradeKnownAnswer,
  isStuckMessage,
  normalizeAnswer,
  normalizeWithoutAccents,
  passesCodeGuard,
} from '../lib/grade';
import { validateLessonPack } from '../lib/lessons';
import { emptyProgress, type Progress } from '../lib/progressTypes';
import { presentBeat, presentBeatHead, presentBeatTail } from '../lib/messages';
import { learnerView } from '../lib/learnerView';
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
import type { LearnerFile, PracticeFocus } from '../lib/progressTypes';
import type { StoryBeat } from '../lib/lessons/types';

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), 'content/lessons/test-greetings.json'), 'utf8'),
);
const pack = validateLessonPack(fixture);
assert.equal(pack.ok, true, pack.ok ? '' : JSON.stringify(pack));
const lesson = pack.ok ? pack.pack : null;
assert.ok(lesson);

function dismissSceneWords(progress: Progress): Progress {
  if (!progress.practice?.sceneWordGate) return progress;
  return applyLearnerTurn({
    progress,
    userText: '',
    action: { type: 'dismiss-scene-word-card' },
  }).progress;
}

function startLesson(): Progress {
  const started = applyLearnerTurn({
    progress: emptyProgress(),
    userText: '',
    action: { type: 'start-practice', lessonId: 'test-greetings' },
  }).progress;
  return dismissSceneWords(started);
}

/**
 * Known beats (including filled personal slots) are graded in code.
 * First known miss returns streamKind none with a pack note.
 * Open / unmatched personal-slot beats still need a model verdict via commitOpenVerdict.
 * After advancing into a new scene with words, dismiss the card so follow-up
 * assertions see tip+character (gate-specific tests call applyLearnerTurn directly).
 */
function judged(
  progress: Progress,
  userText: string,
  verdict: 'correct' | 'near-miss' | 'wrong' = 'correct',
) {
  const turn = applyLearnerTurn({ progress, userText });
  let nextProgress = turn.progress;
  let follow: typeof turn.messages = [];
  if (turn.streamKind === 'none' && turn.log.gradingSource === 'code') {
    // Attempt-2 wrong advances in the same turn; next story lines are in messages.
    follow = turn.messages.filter(
      (m) => m.type === 'character' || m.type === 'narration' || m.type === 'results',
    );
  } else if (turn.modelContext?.reaction?.source === 'code') {
    follow = [...(turn.modelContext.reaction.nextPrompts ?? [])];
  } else {
    const id = turn.log.itemId ?? '';
    follow = commitOpenVerdict(turn.progress, lesson!, id, verdict);
  }
  if (nextProgress.practice?.sceneWordGate) {
    const dismissed = applyLearnerTurn({
      progress: nextProgress,
      userText: '',
      action: { type: 'dismiss-scene-word-card' },
    });
    nextProgress = dismissed.progress;
    follow = [
      ...follow.filter((m) => m.type !== 'character' && m.type !== 'coach'),
      ...dismissed.messages,
    ];
  }
  return { turn, follow, progress: nextProgress };
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
    assert.equal(classifyScript('???'), 'empty');
  });

  it('detects stuck messages before grading', () => {
    assert.equal(isStuckMessage('???'), true);
    assert.equal(isStuckMessage('؟؟؟'), true);
    assert.equal(isStuckMessage('مش فاهم'), true);
    assert.equal(isStuckMessage('مفهمتش'), true);
    assert.equal(isStuckMessage('يعني إيه'), true);
    assert.equal(isStuckMessage('Olá'), false);
    assert.equal(isStuckMessage('ليه queria'), false);
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
    const oneLetter = gradeKnownAnswer('Bon dia', accepted);
    assert.equal(oneLetter.verdict, 'near-miss');
    if (oneLetter.verdict === 'near-miss') {
      assert.equal(oneLetter.reason, 'spelling');
      assert.equal(oneLetter.correctedWord, 'Bom');
    }
    const egpico = gradeKnownAnswer('Sou egpico', ['Sou egípcio']);
    assert.equal(egpico.verdict, 'near-miss');
    if (egpico.verdict === 'near-miss') {
      assert.equal(egpico.reason, 'spelling');
      assert.equal(egpico.correctedWord, 'egípcio');
    }
    // Adjacent letter swap counts as one edit.
    const swapped = gradeKnownAnswer('abdce', ['abcde']);
    assert.equal(swapped.verdict, 'near-miss');
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
    // Anticipated match wins over accent-only against an accepted form.
    const shadowed = gradeKnownAnswer('Oi', ['Ói'], [
      {
        answer: 'Oi',
        verdict: 'wrong',
        feedback: [{ lang: 'ar', text: 'غلط', pronunciation: 'غَلَط' }],
      },
    ]);
    assert.equal(shadowed.verdict, 'anticipated-wrong');
  });
});

describe('story lesson turns', () => {
  it('starts with intro + narration and gates before the first beat', () => {
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
    const sceneWords = result.messages.find((m) => m.type === 'scene-words');
    assert.ok(sceneWords?.sceneWordCard?.words?.length);
    assert.equal(sceneWords?.sceneWordCard?.sceneId, 's1');
    assert.equal(result.messages.some((m) => m.type === 'character'), false);
    assert.equal(result.messages.some((m) => m.type === 'coach'), false);
    assert.equal(result.progress.practice?.sceneWordGate?.sceneId, 's1');
    assert.deepEqual(
      result.progress.practice?.sceneWordCardsSeen ?? [],
      [],
    );
  });

  it('dismisses the scene word card and then shows tip + character', () => {
    const gated = applyLearnerTurn({
      progress: emptyProgress(),
      userText: '',
      action: { type: 'start-practice', lessonId: 'test-greetings' },
    });
    const dismissed = applyLearnerTurn({
      progress: gated.progress,
      userText: '',
      action: { type: 'dismiss-scene-word-card' },
    });
    assert.equal(dismissed.progress.practice?.sceneWordGate, null);
    assert.deepEqual(dismissed.progress.practice?.sceneWordCardsSeen, ['s1']);
    assert.ok(dismissed.messages.some((m) => m.type === 'coach'));
    const line = dismissed.messages.find((m) => m.type === 'character');
    assert.equal(line?.speaker, 'Rita');
    assert.equal(line?.playablePt, 'Olá!');
    assert.equal(dismissed.messages.some((m) => m.type === 'narration'), false);
  });

  it('blocks grading while the scene word gate is open', () => {
    const gated = applyLearnerTurn({
      progress: emptyProgress(),
      userText: '',
      action: { type: 'start-practice', lessonId: 'test-greetings' },
    }).progress;
    const turn = applyLearnerTurn({ progress: gated, userText: 'Olá!' });
    assert.equal(turn.log.verdict, 'awaiting-scene-words');
    assert.equal(turn.log.gradingSource, 'none');
    assert.equal(turn.progress.practice?.beatIndex, 0);
    assert.equal(turn.progress.practice?.itemOutcomes.b01, undefined);
  });

  it('grades a known answer in code and advances when correct', () => {
    const progress = startLesson();
    const step = judged(progress, 'Olá!');
    assert.equal(step.turn.streamKind, 'lesson-reaction');
    assert.equal(step.turn.log.gradingSource, 'code');
    assert.equal(step.turn.modelContext?.reaction?.source, 'code');
    assert.equal(step.turn.modelContext?.reaction?.currentPromptPlain, 'Olá!');
    assert.equal(step.progress.practice?.beatIndex, 1);
    assert.equal(step.progress.practice?.itemOutcomes.b01, 'correct');
    assert.ok(step.turn.messages.some((m) => m.type === 'praise'));
    assert.ok(step.progress.lastPraiseIndex >= 0);
    // Advance hits s2 word gate; judged dismisses so follow includes the character line.
    assert.equal(
      step.follow.some((m) => m.type === 'character' && m.playablePt === 'Como te chamas?'),
      true,
    );
  });

  it('near-miss advances with بنكتبها and no praise', () => {
    const progress = startLesson();
    // First beat accepted is Olá — use accent near-miss against it.
    const step = judged(progress, 'Ola');
    assert.equal(step.turn.log.verdict, 'near-miss');
    assert.equal(step.turn.streamKind, 'lesson-reaction');
    assert.equal(step.progress.practice?.itemOutcomes.b01, 'near-miss');
    assert.equal(step.progress.practice?.beatIndex, 1);
    assert.equal(step.turn.messages.some((m) => m.type === 'praise'), false);
    const coach = step.turn.messages.find((m) => m.type === 'coach');
    assert.ok(coach);
    const coachText = coach.segments.map((s) => s.text).join(' ');
    assert.match(coachText, /بنكتبها/);
    assert.equal(coachText.includes('جرّب تاني'), false);
    assert.ok(step.follow.some((m) => m.type === 'character'));
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
    assert.match(coachText, /تحية قصيرة/);
    assert.equal(coachText.includes('الإجابة مش صح'), false);
    assert.equal(first.turn.messages.some((m) => m.type === 'character'), false);
    assert.equal(first.turn.messages.some((m) => m.type === 'praise'), false);

    const second = judged(first.progress, 'Bom e dia', 'wrong');
    assert.equal(second.progress.practice?.itemOutcomes.b01, 'learned-with-help');
    assert.equal(second.progress.practice?.beatIndex, 1);
    const why = second.turn.messages.find((m) => m.type === 'coach');
    assert.ok(why);
    assert.match(why.segments.map((s) => s.text).join(' '), /Olá/);
    assert.ok(second.follow.some((m) => m.type === 'character' && m.playablePt === 'Como te chamas?'));
  });

  it('falls back to coach_tip when hint_note is missing on open wrongs', () => {
    const openBeat = {
      id: 'b-open',
      sceneId: 's1',
      speaker: 'Rita',
      line: { pt: 'Olá!', ar: 'أهلاً!', arz: 'أَهْلاً!' },
      altLine: { pt: 'Olá!', ar: 'أهلاً!', arz: 'أَهْلاً!' },
      difficulty: 'open',
      kind: 'open',
      reactionCue: 'glad',
      hintNote: undefined,
      whyNote: 'عشان التحية بنقول Olá (أهلاً). قولها كده.',
      coachTip: { ar: 'لما حد يسلّم، بنقول Olá (أهلاً). يلا جرّب', arz: 'لَمّا حَد يِسَلِّم، بِنْقول Olá.' },
      successCriterion: 'He greets her',
      codeGuard: { requiredWords: ['olá'] },
      wordBank: [{ pt: 'olá', meaning: 'أهلاً' }],
      frame: 'Olá …',
    } as StoryBeat;
    const miniPack = { ...lesson!, beats: [openBeat, ...lesson!.beats.slice(1)] };
    const progress = emptyProgress();
    progress.mode = 'practice';
    progress.practice = {
      lessonId: miniPack.id,
      phase: 'story',
      beatIndex: 0,
      attemptsOnCurrent: 0,
      stuckCountOnCurrent: 0,
      useAltLine: false,
      coachTipShown: false,
      itemOutcomes: {},
      friendBridgeTurnsLeft: FRIEND_BRIDGE_TURNS,
    };
    const first = commitOpenVerdict(progress, miniPack, 'b-open', 'wrong');
    assert.equal(progress.practice?.attemptsOnCurrent, 1);
    const tipCoach = first.find((m) => m.type === 'coach');
    assert.ok(tipCoach);
    const tipText = tipCoach.segments.map((s) => s.text).join(' ');
    assert.match(tipText, /بنقول Olá/);
    assert.match(tipText, /جرّب تاني/);
    assert.equal(tipText.includes('الإجابة مش صح'), false);

    const withHint = {
      ...openBeat,
      hintNote: 'مصري بالبرتغالي egípcio. جرّب تاني.',
    } as StoryBeat;
    const pack2 = { ...miniPack, beats: [withHint, ...lesson!.beats.slice(1)] };
    progress.practice = { ...progress.practice!, attemptsOnCurrent: 0, beatIndex: 0 };
    const hinted = commitOpenVerdict(progress, pack2, 'b-open', 'wrong');
    assert.match(
      hinted.find((m) => m.type === 'coach')!.segments.map((s) => s.text).join(' '),
      /egípcio/,
    );
    const second = commitOpenVerdict(progress, pack2, 'b-open', 'wrong');
    assert.equal(progress.practice?.itemOutcomes['b-open'], 'learned-with-help');
    const why = second.find((m) => m.type === 'coach');
    assert.ok(why);
    assert.match(why.segments.map((s) => s.text).join(' '), /قولها كده|Olá/);
  });

  it('emits praise for model-graded practice passes only', () => {
    assert.equal(
      shouldEmitPracticePraise({ mode: 'practice', source: 'you' }, 'correct'),
      true,
    );
    assert.equal(
      shouldEmitPracticePraise({ mode: 'practice', source: 'you' }, 'near-miss'),
      false,
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

  it('matches a personal slot in code; R2 only when the matcher fails', () => {
    assert.equal(gradeFilledPersonalSlot('chamo-me omar', ['Chamo-me [NAME].'])?.verdict, 'correct');
    let progress = startLesson();
    progress = judged(progress, 'Olá!').progress;

    const filled = applyLearnerTurn({ progress, userText: 'Chamo-me Omar' });
    assert.equal(filled.log.gradingSource, 'code');
    assert.equal(filled.modelContext?.reaction?.source, 'code');
    assert.equal(filled.modelContext?.reaction?.reactionKind, 'r1');
    assert.match(filled.modelContext?.reaction?.slotNote ?? '', /Omar/);
    assert.equal(filled.progress.practice?.beatIndex, 2);
    assert.ok((filled.modelContext?.reaction?.nextPrompts ?? []).some((m) => m.playablePt === 'Tudo bem?'));

    // Brazilian Me chamo [NAME] → anticipated pack note in code (no R2).
    const brazilian = applyLearnerTurn({ progress, userText: 'Me chamo Omar' });
    assert.equal(brazilian.log.gradingSource, 'code');
    assert.equal(brazilian.streamKind, 'none');
    assert.equal(brazilian.log.verdict, 'anticipated-wrong');
    const brCoach = brazilian.messages.find((m) => m.type === 'coach');
    assert.ok(brCoach);
    assert.match(brCoach.segments.map((s) => s.text).join(' '), /برازيلي/);
    assert.equal(brazilian.messages.some((m) => m.type === 'praise'), false);

    const missed = applyLearnerTurn({ progress, userText: 'trabalho' });
    assert.equal(missed.modelContext?.reaction?.source, 'you');
    assert.equal(missed.modelContext?.reaction?.reactionKind, 'r2');
    assert.equal(missed.modelContext?.reaction?.slotPattern, 'Chamo-me [NAME].');
    const instruction = buildLessonReactionInstruction({
      level: 'A0',
      userText: 'trabalho',
      reaction: missed.modelContext!.reaction!,
    });
    assert.match(instruction, /VERDICT: correct/);
    assert.match(instruction, /Chamo-me \[NAME\]/);
    assert.match(instruction, /<character/);
    assert.doesNotMatch(instruction, /LESSON_TARGET|SITUATION:/);

    const open = buildLessonReactionInstruction({
      level: 'A0',
      userText: 'Sim, está bom',
      reaction: {
        mode: 'practice',
        verdict: 'wrong',
        source: 'you',
        attempt: 1,
        reactionKind: 'r2',
        currentPromptPlain: 'Está bom o café?',
        beatLine: 'Está bom o café?',
        criterion: 'uses está bom',
        guard: 'bom',
        recentPraise: [],
      },
    });
    assert.match(open, /Learner: "Sim, está bom"/);
    assert.match(open, /A correct answer must: uses está bom/);
    assert.match(open, /It must contain: bom/);
    assert.match(open, /VERDICT: correct/);
    assert.doesNotMatch(open, /LESSON_TARGET|SITUATION:/);

    const coded = buildLessonReactionInstruction({
      level: 'A0',
      userText: 'Olá',
      reaction: {
        mode: 'practice',
        verdict: 'correct',
        source: 'code',
        attempt: 1,
        reactionKind: 'r1',
        currentPromptPlain: 'Olá!',
        beatLine: 'Olá!',
        characterName: 'Rita',
        characterRole: 'جارة',
        nextLine: 'Como te chamas?',
        nextSpeaker: 'Rita',
        recentPraise: [],
      },
    });
    assert.match(coded, /You are Rita/);
    assert.match(coded, /<character name="Rita">/);
    assert.match(coded, /Rita will say: "Como te chamas\?"/);
    assert.match(coded, /Never say your own name \(Rita\)/);
    assert.doesNotMatch(coded, /LESSON_TARGET|SITUATION:/);
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
      assert.equal(step.turn.log.gradingSource, 'code');
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
      stuckCountOnCurrent: 0,
      friendBridgeTurnsLeft: 0,
      useAltLine: false,
      coachTipShown: false,
      itemOutcomes: {},
    };

    const asked: string[] = [];
    for (let i = 0; i < beats.length; i++) {
      let focus = progress.practice as PracticeFocus;
      if (focus.sceneWordGate) {
        progress = dismissSceneWords(progress);
        focus = progress.practice as PracticeFocus;
      }
      assert.equal(focus.phase, 'story');
      const beat = beats[focus.beatIndex];
      asked.push(beat.id);
      const messages: { type: string; segments: { text: string }[] }[] = [];
      advancePracticeAfterOutcome(progress, six, focus, beat.id, 'correct', messages as never);
      if (i < beats.length - 1) {
        assert.equal(progress.practice?.phase, 'story');
        if (progress.practice?.sceneWordGate) {
          assert.equal(messages.some((m) => m.type === 'character'), false);
          progress = dismissSceneWords(progress);
          // dismiss emits tip+character; advance already recorded outcome.
        } else {
          assert.ok(messages.some((m) => m.type === 'character'));
        }
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

  it('shows guided tip before the character line; supported tip after', () => {
    const gated = applyLearnerTurn({
      progress: emptyProgress(),
      userText: '',
      action: { type: 'start-practice', lessonId: 'test-greetings' },
    });
    const started = applyLearnerTurn({
      progress: gated.progress,
      userText: '',
      action: { type: 'dismiss-scene-word-card' },
    });
    assert.ok(started.messages.some((m) => m.type === 'coach'));
    assert.equal(started.progress.practice?.coachTipShown, true);
    const guided = presentBeat(lesson!, 0);
    const guidedTypes = guided.map((m) => m.type);
    const coachIdx = guidedTypes.indexOf('coach');
    const charIdx = guidedTypes.indexOf('character');
    assert.ok(coachIdx >= 0 && charIdx >= 0 && coachIdx < charIdx);

    // Advance without auto-dismiss so we can assert the s2 gate.
    const afterFirst = applyLearnerTurn({ progress: started.progress, userText: 'Olá!' });
    assert.equal(afterFirst.progress.practice?.beatIndex, 1);
    assert.equal(afterFirst.progress.practice?.sceneWordGate?.sceneId, 's2');
    const gatedFollow = afterFirst.modelContext?.reaction?.nextPrompts ?? [];
    assert.equal(gatedFollow.some((m) => m.type === 'character'), false);
    const afterS2 = applyLearnerTurn({
      progress: afterFirst.progress,
      userText: '',
      action: { type: 'dismiss-scene-word-card' },
    });
    assert.ok(afterS2.messages.some((m) => m.type === 'coach'));
    assert.equal(afterS2.progress.practice?.coachTipShown, true);
    assert.deepEqual(afterS2.progress.practice?.sceneWordCardsSeen, ['s1', 's2']);

    const supported = presentBeat(lesson!, 1);
    const supportedTypes = supported.map((m) => m.type);
    assert.ok(supportedTypes.indexOf('character') < supportedTypes.indexOf('coach'));
    assert.match(
      supported.find((m) => m.type === 'coach')!.segments.map((s) => s.text).join(' '),
      /Chamo-me/,
    );
  });

  it('shows s02 word card then none on s03; learnerView exposes reopen chip', () => {
    let progress = startLesson();
    // Advance into s2 without auto-dismiss.
    progress = applyLearnerTurn({ progress, userText: 'Olá!' }).progress;
    assert.equal(progress.practice?.sceneWordGate?.sceneId, 's2');

    const file: LearnerFile = {
      id: 't',
      level: 'A0',
      progress,
      visible: [],
      archive: [],
      createdAt: 0,
      updatedAt: 0,
    };
    const gatedView = learnerView(file);
    assert.equal(gatedView.sceneWordCard?.mode, 'blocking');
    assert.equal(gatedView.sceneWordCard?.sceneId, 's2');
    assert.equal(gatedView.showSceneWordChip, false);
    assert.ok(gatedView.sceneWordWarmPt.includes('Olá'));

    progress = dismissSceneWords(progress);
    assert.equal(progress.practice?.sceneWordGate, null);
    const reviewView = learnerView({ ...file, progress });
    assert.equal(reviewView.sceneWordCard?.mode, 'review');
    assert.equal(reviewView.showSceneWordChip, true);

    progress = judged(progress, 'Chamo-me Omar').progress;
    // s3 has no words → direct beat, no gate, no chip.
    assert.equal(progress.practice?.sceneWordGate, null);
    assert.equal(progress.practice?.beatIndex, 2);
    const s3View = learnerView({ ...file, progress });
    assert.equal(s3View.sceneWordCard, null);
    assert.equal(s3View.showSceneWordChip, false);
  });

  it('pause/resume preserves gate before dismiss and seen cards after', () => {
    const gated = applyLearnerTurn({
      progress: emptyProgress(),
      userText: '',
      action: { type: 'start-practice', lessonId: 'test-greetings' },
    }).progress;
    assert.ok(gated.practice?.sceneWordGate);

    const pausedMid = applyLearnerTurn({
      progress: gated,
      userText: '',
      action: { type: 'end-practice' },
    });
    const resumeMid = applyLearnerTurn({
      progress: pausedMid.progress,
      userText: '',
      action: { type: 'resume-practice' },
    });
    assert.equal(resumeMid.progress.practice?.sceneWordGate?.sceneId, 's1');
    assert.ok(resumeMid.messages.some((m) => m.type === 'narration'));
    assert.ok(resumeMid.messages.some((m) => m.type === 'scene-words'));
    assert.equal(resumeMid.messages.some((m) => m.type === 'character'), false);

    let progress = dismissSceneWords(resumeMid.progress);
    assert.deepEqual(progress.practice?.sceneWordCardsSeen, ['s1']);
    const pausedAfter = applyLearnerTurn({
      progress,
      userText: '',
      action: { type: 'end-practice' },
    });
    const resumeAfter = applyLearnerTurn({
      progress: pausedAfter.progress,
      userText: '',
      action: { type: 'resume-practice' },
    });
    assert.equal(resumeAfter.progress.practice?.sceneWordGate, null);
    assert.deepEqual(resumeAfter.progress.practice?.sceneWordCardsSeen, ['s1']);
    assert.ok(resumeAfter.messages.some((m) => m.type === 'character'));
  });

  it('presentBeatHead/Tail split narration from tip+line', () => {
    const head = presentBeatHead(lesson!, 0);
    const tail = presentBeatTail(lesson!, 0);
    assert.ok(head.every((m) => m.type === 'narration' || m.type === 'intro'));
    assert.equal(head.some((m) => m.type === 'character'), false);
    assert.ok(tail.some((m) => m.type === 'character'));
    assert.ok(tail.some((m) => m.type === 'coach'));
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
      stuckCountOnCurrent: 0,
      friendBridgeTurnsLeft: 0,
      useAltLine: false,
      coachTipShown: false,
      itemOutcomes: {},
      sceneWordGate: null,
      sceneWordCardsSeen: ['s1'],
    };
    const stuck = unresolvedPracticePrompt(progress, base);
    assert.equal(stuck?.playablePt, base.beats[0].line.pt);
    advancePracticeAfterOutcome(progress, base, progress.practice, base.beats[0].id, 'correct', []);
    // s2 needs a word card — unresolved prompt is withheld while gated.
    assert.equal(progress.practice?.sceneWordGate?.sceneId, 's2');
    assert.equal(unresolvedPracticePrompt(progress, base), undefined);
    progress = dismissSceneWords(progress);
    const next = unresolvedPracticePrompt(progress, base);
    assert.equal(next?.playablePt, base.beats[1].line.pt);
  });

  it('stuck ??? shows line_explain + hint card and does not count as a wrong attempt', () => {
    const progress = startLesson();
    const turn = applyLearnerTurn({ progress, userText: '???' });
    assert.equal(turn.streamKind, 'none');
    assert.equal(turn.log.verdict, 'stuck-1');
    assert.equal(turn.progress.practice?.attemptsOnCurrent, 0);
    assert.equal(turn.progress.practice?.stuckCountOnCurrent, 1);
    assert.equal(turn.progress.practice?.beatIndex, 0);
    assert.ok(turn.messages.some((m) => m.coachKind === 'explain'));
    const card = turn.messages.find((m) => m.hintCard);
    assert.ok(card?.hintCard?.words?.length);
    assert.ok(card?.hintCard?.frame);
  });

  it('stuck ladder is independent of wrong attempts and advances on the third stuck', () => {
    let progress = startLesson();
    progress = applyLearnerTurn({ progress, userText: 'wrong answer xyz' }).progress;
    assert.equal(progress.practice?.attemptsOnCurrent, 1);
    assert.equal(progress.practice?.stuckCountOnCurrent ?? 0, 0);

    progress = applyLearnerTurn({ progress, userText: 'مش فاهم' }).progress;
    assert.equal(progress.practice?.stuckCountOnCurrent, 1);
    assert.equal(progress.practice?.attemptsOnCurrent, 1);

    progress = applyLearnerTurn({ progress, userText: '???' }).progress;
    assert.equal(progress.practice?.stuckCountOnCurrent, 2);
    assert.equal(progress.practice?.beatIndex, 0);

    const third = applyLearnerTurn({ progress, userText: 'يعني إيه' });
    assert.equal(third.log.verdict, 'stuck-3');
    assert.equal(third.progress.practice?.itemOutcomes.b01, 'learned-with-help');
    assert.ok((third.progress.practice?.beatIndex ?? 0) >= 1);
    assert.equal(third.progress.practice?.stuckCountOnCurrent, 0);
  });

  it('show-grammar-card and Arabic tool-why show the card without calling the model', () => {
    const progress = startLesson();
    const chip = applyLearnerTurn({
      progress,
      userText: '',
      action: { type: 'show-grammar-card' },
    });
    assert.equal(chip.streamKind, 'none');
    assert.equal(chip.log.verdict, 'grammar-card');
    assert.ok(chip.messages.some((m) => m.type === 'explanation'));
    assert.ok(chip.messages.some((m) => m.segments.some((s) => s.text.includes('يلا نستخدمها'))));
    assert.ok(chip.messages.some((m) => m.type === 'character'));
    assert.equal(chip.progress.practice?.beatIndex, 0);

    const why = applyLearnerTurn({
      progress: chip.progress,
      userText: 'ليه بنقول Olá مش Oi؟',
    });
    assert.equal(why.streamKind, 'none');
    assert.equal(why.log.verdict, 'grammar-card');
    assert.ok(why.messages.some((m) => m.type === 'explanation'));
  });

  it('unrelated Arabic still goes to R3', () => {
    const progress = startLesson();
    const turn = applyLearnerTurn({ progress, userText: 'الجو عامل إيه النهارده؟' });
    assert.equal(turn.streamKind, 'lesson-reaction');
    assert.equal(turn.modelContext?.reaction?.reactionKind, 'r3');
  });
});
