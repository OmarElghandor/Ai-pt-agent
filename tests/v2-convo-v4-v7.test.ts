import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseConvoModelSpec } from '@/lib/model';

describe('conversations v4 · V7 convo model', () => {
  it('parses qwen / haiku / prefixed specs', () => {
    assert.equal(parseConvoModelSpec('qwen').label, 'qwen');
    assert.equal(parseConvoModelSpec('haiku').provider, 'anthropic');
    assert.equal(
      parseConvoModelSpec('anthropic:claude-haiku-5-5').modelId,
      'claude-haiku-5-5',
    );
    assert.equal(
      parseConvoModelSpec('deepinfra:Qwen/Qwen3.5-35B-A3B').provider,
      'deepinfra',
    );
  });
});
