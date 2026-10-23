import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dropJunkCoach,
  filterReactionMessages,
  parseFriendOutput,
  parseOpenVerdict,
} from '../lib/friendParse';
import {
  buildLessonReactionInstruction,
  buildR1CharacterReaction,
  buildR2Judge,
  buildR3CoachArabic,
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

function dismissSceneWords(progress: Progress): Progress {
  if (!progress.practice?.sceneWordGate) return progress;
  return applyLearnerTurn({
    progress,
    userText: '',
    action: { type: 'dismiss-scene-word-card' },
  }).progress;
}

function acceptAnswer(progress: Progress, userText: string, verdict: 'correct' | 'wrong' = 'correct') {
  let ready = dismissSceneWords(progress);
  const turn = applyLearnerTurn({ progress: ready, userText });
  let nextProgress = turn.progress;
  let follow: typeof turn.messages = [];
  if (turn.streamKind === 'none' && turn.log.gradingSource === 'code') {
    // Authored reply / final-task known answers already advanced.
    follow = turn.messages;
  } else if (turn.modelContext?.reaction?.source === 'code') {
    follow = [...(turn.modelContext.reaction.nextPrompts ?? [])];
  } else {
    const pack = lessonById('test-greetings');
    assert.ok(pack);
    follow = commitOpenVerdict(turn.progress, pack, turn.log.itemId ?? '', verdict);
  }
  if (nextProgress.practice?.sceneWordGate) {
    nextProgress = dismissSceneWords(nextProgress);
  }
  return { turn, follow, progress: nextProgress };
}

describe('assessment', () => {
  it('offers assessment only after cooldown and lets the model grade', () => {
    let progress = emptyProgress();
    progress = applyLearnerTurn({
      progress,
      userText: '',
      action: { type: 'start-practice', lessonId: 'test-greetings' },
    }).progress;
    progress = dismissSceneWords(progress);
    for (const answer of ['Olá!', 'Chamo-me Omar.', 'Tudo bem?']) {
      const step = acceptAnswer(progress, answer);
      assert.equal(step.turn.streamKind, 'lesson-reaction');
      assert.equal(step.turn.modelContext?.reaction?.source, 'code');
      assert.equal(step.turn.modelContext?.reaction?.reactionKind, 'r1');
      progress = step.progress;
    }
    // v5: immediate final tasks before the friend bridge (practice check only).
    assert.equal(progress.practice?.phase, 'final-task');
    for (const answer of ['Olá!', 'Chamo-me Omar.', 'Tudo bem?']) {
      const step = acceptAnswer(progress, answer);
      progress = step.progress;
    }
    assert.equal(progress.practice?.phase, 'friend-bridge');
    // Exhaust friend-bridge turns to mark practisedAt
    for (let i = 0; i < 5; i++) {
      progress = applyLearnerTurn({ progress, userText: 'Oi' }).progress;
    }
    assert.ok(progress.lessons['test-greetings']?.practisedAt);
    // Formal assessment results are NOT written by the practice final-task phase.
    assert.equal(progress.lessons['test-greetings']?.assessmentByTarget, undefined);

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

describe('Prompt 4 reaction builders', () => {
  const base = (over: Partial<LessonReactionContext>): LessonReactionContext => ({
    mode: 'practice',
    verdict: 'correct',
    source: 'code',
    attempt: 1,
    reactionKind: 'r1',
    currentPromptPlain: 'Como dizes adeus?',
    beatLine: 'Como dizes adeus?',
    characterName: 'Rita',
    characterRole: 'جارة',
    reactionCue: 'glad; says goodbye warmly',
    recentPraise: [],
    ...over,
  });

  it('R1 leads into the next story line and omits LESSON_TARGET / SITUATION', () => {
    const instruction = buildR1CharacterReaction({
      userText: 'Adeus',
      reaction: base({
        nextLine: 'Bom dia!',
        nextSpeaker: 'Rita',
        nextPrompt: {
          id: 'next',
          role: 'assistant',
          type: 'task',
          at: Date.now(),
          segments: [{ lang: 'pt', text: 'Bom dia!' }],
        },
      }),
    });
    assert.match(instruction, /You just said: "Como dizes adeus\?"/);
    assert.match(instruction, /Rita will say: "Bom dia!"/);
    assert.match(instruction, /Never say your own name/);
    assert.match(instruction, /Do not repeat or echo his sentence/);
    assert.doesNotMatch(instruction, /Egípcio! Que bom/);
    assert.doesNotMatch(instruction, /LESSON_TARGET|SITUATION:/);
  });

  it('R1 uses answerForReaction instead of the raw slip', () => {
    const instruction = buildR1CharacterReaction({
      userText: 'queria um pacote de o chá',
      reaction: base({
        answerForReaction: 'Queria um pacote de chá',
      }),
    });
    assert.match(instruction, /answered: "Queria um pacote de chá"/);
    assert.doesNotMatch(instruction, /de o chá/);
  });

  it('parses fix tags as coach bubbles with Arabic', () => {
    const messages = parseFriendOutput(
      '<fix><pt>Muito prazer</pt><ar>قربت، بس بنكتبها Muito</ar></fix>',
      { strict: true },
    );
    assert.equal(messages[0].type, 'coach');
    assert.equal(messages[0].label, 'قربت');
    assert.ok(messages[0].segments.some((s) => s.lang === 'ar'));
  });

  it('R2 judges open answers; assessment omits character react part', () => {
    const practice = buildR2Judge({
      userText: 'Adeus',
      reaction: base({
        reactionKind: 'r2',
        source: 'you',
        criterion: 'uses a farewell',
        guard: 'adeus',
      }),
    });
    assert.match(practice, /VERDICT: correct/);
    assert.match(practice, /<character/);
    assert.match(practice, /<fix>/);

    const assessment = buildR2Judge({
      userText: 'Adeus',
      reaction: base({
        mode: 'assessment',
        reactionKind: 'r2',
        source: 'you',
        criterion: 'uses a farewell',
        guard: 'adeus',
      }),
    });
    assert.match(assessment, /VERDICT: correct/);
    assert.doesNotMatch(assessment, /<character/);
  });

  it('R3 answers Arabic side remarks as WHY/HOW/OTHER coach', () => {
    const instruction = buildR3CoachArabic({
      userText: 'إزاي أقول؟',
      reaction: base({
        mode: 'side',
        reactionKind: 'r3',
        frame: 'Adeus …',
        grammarPoint: 'farewells with Adeus',
      }),
    });
    assert.match(instruction, /<coach>/);
    assert.match(instruction, /WHY:/);
    assert.match(instruction, /HOW:/);
    assert.match(instruction, /OTHER:/);
    assert.match(instruction, /This lesson's tool: farewells with Adeus/);
    assert.match(instruction, /<example>/);
    assert.doesNotMatch(instruction, /NEXT_LINE|LESSON_TARGET/);
  });

  it('parses R3 coach plus playable example', () => {
    const raw = `<coach><ar>عشان نقول وداعاً بنقول Adeus.</ar><arz>عَشان نِقول وَداعاً بِنْقول Adeus.</arz></coach>
<example><pt>Adeus!</pt><ar>مع السلامة!</ar></example>`;
    const messages = parseFriendOutput(raw, { strict: true });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'coach');
    assert.equal(messages[0].examples?.[0]?.pt, 'Adeus!');
    const filtered = filterReactionMessages(messages, base({ mode: 'side', reactionKind: 'r3' }), raw);
    assert.ok(filtered);
    assert.equal(filtered![0].examples?.[0]?.pt, 'Adeus!');
  });

  it('drops untagged practice reactions and never falls back to plain text', () => {
    assert.equal(parseFriendOutput('Just say Bom dia', { strict: true }).length, 0);
    const bad = filterReactionMessages(
      parseFriendOutput('<character name="Rita"><pt>How are you?</pt><ar>إزاي؟</ar></character>', {
        strict: true,
      }),
      base({ reactionKind: 'r1' }),
      '<character name="Rita"><pt>How are you?</pt><ar>إزاي؟</ar></character>',
    );
    assert.equal(bad, null);
  });

  it('drops a character reaction that contains the speaker’s own name', () => {
    const raw =
      '<character name="Rita"><pt>Bom dia, Rita!</pt><ar>صباح الخير يا ريتا!</ar></character>';
    const dropped = filterReactionMessages(
      parseFriendOutput(raw, { strict: true }),
      base({ reactionKind: 'r1', characterName: 'Rita' }),
      raw,
    );
    assert.equal(dropped, null);

    const okRaw =
      '<character name="Rita"><pt>Bom dia!</pt><ar>صباح الخير!</ar></character>';
    const kept = filterReactionMessages(
      parseFriendOutput(okRaw, { strict: true }),
      base({
        reactionKind: 'r1',
        characterName: 'Rita',
        words: 'Bom dia · Adeus',
      }),
      okRaw,
    );
    assert.ok(kept);
    assert.equal(kept!.length, 1);
  });

  it('drops an R1 that echoes more than half of his answer', () => {
    const raw =
      '<character name="Marta"><pt>Um café, perfeito!</pt><ar>قهوة، تمام!</ar></character>';
    const dropped = filterReactionMessages(
      parseFriendOutput(raw, { strict: true }),
      base({
        reactionKind: 'r1',
        characterName: 'Marta',
        beatLine: 'Um café ou um chá?',
        currentPromptPlain: 'Um café ou um chá?',
        nextLine: 'É para aqui ou para levar?',
        words: 'café · chá · perfeito · claro',
        answerForReaction: 'Um café',
      }),
      raw,
      'Um café',
    );
    assert.equal(dropped, null);
  });

  it('keeps a short R1 that reacts without echoing his sentence', () => {
    const raw =
      '<character name="Marta"><pt>Claro.</pt><ar>تمام.</ar></character>';
    const kept = filterReactionMessages(
      parseFriendOutput(raw, { strict: true }),
      base({
        reactionKind: 'r1',
        characterName: 'Marta',
        beatLine: 'Um café ou um chá?',
        currentPromptPlain: 'Um café ou um chá?',
        nextLine: 'É para aqui ou para levar?',
        words: 'café · chá · claro',
        answerForReaction: 'Um café',
      }),
      raw,
      'Um café',
    );
    assert.ok(kept);
    assert.equal(kept!.length, 1);
    assert.equal(kept![0].type, 'character');
  });

  it('drops an R1 that leaks a word from another lesson', () => {
    const raw =
      '<character name="Marta"><pt>Egípcio, que bom.</pt><ar>مصري، حلو.</ar></character>';
    const dropped = filterReactionMessages(
      parseFriendOutput(raw, { strict: true }),
      base({
        reactionKind: 'r1',
        characterName: 'Marta',
        beatLine: 'Quanto custa?',
        currentPromptPlain: 'Quanto custa?',
        words: 'caro · barato · euros',
        answerForReaction: 'É caro',
      }),
      raw,
      'É caro',
    );
    assert.equal(dropped, null);
  });

  it('drops an R1 that steals the next story line’s wording', () => {
    const raw =
      '<character name="Marta"><pt>Para aqui ou para levar.</pt><ar>هنا ولا تيك أواي.</ar></character>';
    const dropped = filterReactionMessages(
      parseFriendOutput(raw, { strict: true }),
      base({
        reactionKind: 'r1',
        characterName: 'Marta',
        beatLine: 'Um café ou um chá?',
        nextLine: 'É para aqui ou para levar?',
      }),
      raw,
    );
    assert.equal(dropped, null);
  });
});

