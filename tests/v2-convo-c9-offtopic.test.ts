import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isLearnerQuestionToCharacter,
  isOffTopic,
  isShortOnTopicAnswer,
} from '@/lib/v2/convo/free';
import { freeTopicById, loadThreadTopic } from '@/lib/v2/convo/topics';

describe('v2 free chat · C9 off-topic + learner questions', () => {
  const casa = freeTopicById('casa')!;
  const doc = loadThreadTopic('casa');
  const extras = [
    ...doc.threads[0]!.ask.frame.chips,
    doc.threads[0]!.ask.tl,
    doc.threads[0]!.share.tl,
  ];

  it('Sim, grande, Moro em Amadora are on topic', () => {
    assert.equal(isShortOnTopicAnswer('Sim'), true);
    assert.equal(isOffTopic('Sim', casa, extras), false);
    assert.equal(isOffTopic('grande', casa, extras), false);
    assert.equal(isOffTopic('Moro em Amadora', casa, extras), false);
  });

  it('English football rant is off-topic', () => {
    assert.equal(
      isOffTopic('I like football did you watch Benfica', casa, extras),
      true,
    );
  });

  it('E tu, moras onde? is a question to the character', () => {
    assert.equal(isLearnerQuestionToCharacter('E tu, moras onde?'), true);
    assert.equal(isLearnerQuestionToCharacter('E tu? Tens animais?'), true);
    assert.equal(isLearnerQuestionToCharacter('Moro em Amadora.'), false);
  });
});
