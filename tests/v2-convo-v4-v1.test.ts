import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  sessionHasGoals,
  sessionInOpenMode,
  startResponseIsOpenMode,
} from '@/lib/v2/convo/turn/freeMode';
import { freeTalkTopicHeaderLine } from '@/lib/v2/convo/ui/topicHeader';
import { OPEN_TOPIC_ID } from '@/lib/v2/convo/topics/openTopic';

describe('conversations v4 · V1 goal path', () => {
  it('session with goals never takes open-mode path (topic=open)', () => {
    const session = {
      goals: [{ id: 'g1', status: 'open' as const }],
      free_step: { kind: 'open' as const },
    };
    assert.equal(sessionHasGoals(session), true);
    assert.equal(
      sessionInOpenMode(session, { id: OPEN_TOPIC_ID }),
      false,
    );
    assert.equal(
      startResponseIsOpenMode({
        hasGoals: true,
        topicId: OPEN_TOPIC_ID,
        isLessonDay: false,
        freeStepKind: 'open',
      }),
      false,
    );
  });

  it('session without goals on open topic is open mode', () => {
    const session = {
      goals: [] as Array<{ id: string; status: 'open' }>,
      free_step: { kind: 'open' as const },
    };
    assert.equal(sessionHasGoals(session), false);
    assert.equal(
      sessionInOpenMode(session, { id: OPEN_TOPIC_ID }),
      true,
    );
  });
});

describe('conversations v4 · V1 topic header', () => {
  it('shows locked topic title, never أي حاجة once a topic is set', () => {
    const line = freeTalkTopicHeaderLine({
      openMode: false,
      topicId: OPEN_TOPIC_ID,
      titleTl: 'Apresentações',
      titleAr: 'التعارف',
    });
    assert.match(line, /Apresentações/);
    assert.doesNotMatch(line, /أي حاجة/);
    assert.doesNotMatch(line, /Qualquer coisa/);
  });

  it('shows أي حاجة only while still open with no locked title', () => {
    assert.equal(
      freeTalkTopicHeaderLine({
        openMode: true,
        topicId: OPEN_TOPIC_ID,
        titleTl: 'Qualquer coisa',
        titleAr: 'أي حاجة',
      }),
      'أي حاجة',
    );
  });

  it('prefers locked title even if openMode was left true', () => {
    const line = freeTalkTopicHeaderLine({
      openMode: true,
      topicId: OPEN_TOPIC_ID,
      titleTl: 'A casa',
      titleAr: 'البيت',
    });
    assert.equal(line, 'A casa · البيت');
  });
});
