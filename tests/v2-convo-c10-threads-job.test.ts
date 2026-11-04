import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUTHORED_THREAD_TOPIC_IDS } from '@/lib/v2/generation/convo/runTopicThreads';
import { TopicThreadsToolSchema } from '@/lib/v2/generation/convo/threadsSchema';
import { validateThreadTopicFile } from '@/lib/v2/convo/topics';
import { loadThreadTopic } from '@/lib/v2/convo/topics';

describe('v2 free chat · C10 thread generation job', () => {
  it('protects the 12 authored topic ids', () => {
    assert.equal(AUTHORED_THREAD_TOPIC_IDS.size, 12);
    assert.ok(AUTHORED_THREAD_TOPIC_IDS.has('casa'));
  });

  it('tool schema accepts an authored file shape', () => {
    const doc = loadThreadTopic('casa');
    const parsed = TopicThreadsToolSchema.safeParse(doc);
    assert.equal(parsed.success, true);
    const validated = validateThreadTopicFile(doc, { addressIsTu: true });
    assert.equal(validated.ok, true);
  });
});
