import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearProblemsCache,
  loadProblemsFile,
  validateProblemsFile,
} from '../lib/v2/progress/problems';
import { ProblemsFileSchema } from '../lib/v2/progress/problems/schema';

describe('P5 · problems list validator', () => {
  it('loads and validates the content file', () => {
    clearProblemsCache();
    const file = loadProblemsFile('pt-PT');
    assert.equal(file.target_lang, 'pt-PT');
    const parsed = ProblemsFileSchema.parse(file);
    const issues = validateProblemsFile(parsed);
    assert.deepEqual(issues, []);
  });

  it('rejects duplicate ids and unknown patterns', () => {
    const issues = validateProblemsFile(
      {
        version: 1,
        target_lang: 'pt-PT',
        problems: [
          {
            id: 'grammar.ser_estar',
            top: 'grammar',
            title_tl: 'ser/estar',
            title_ar: 'س',
            explain_eg: 'ش',
            taught_on: { days: [19] },
            patterns: ['pattern.does_not_exist_xyz'],
            available_from: 19,
          },
          {
            id: 'grammar.ser_estar',
            top: 'grammar',
            title_tl: 'x',
            title_ar: 'y',
            explain_eg: 'z',
            taught_on: { days: [19] },
            patterns: [],
            available_from: 19,
          },
        ],
      },
      {
        knownPatternIds: new Set(['pattern.chamo_me']),
        knownDays: new Set([19, 22]),
      },
    );
    assert.ok(issues.some((i) => i.message.includes('duplicate')));
    assert.ok(issues.some((i) => i.message.includes('unknown pattern')));
  });

  it('accepts a well-formed problem linked to a real pattern', () => {
    const issues = validateProblemsFile(
      {
        version: 1,
        target_lang: 'pt-PT',
        problems: [
          {
            id: 'grammar.article_gender',
            top: 'grammar',
            title_tl: 'o/a',
            title_ar: 'الـ',
            explain_eg: 'الجنس',
            taught_on: { days: [3] },
            patterns: ['pattern.article_gender'],
            available_from: 3,
          },
        ],
      },
      {
        knownPatternIds: new Set(['pattern.article_gender']),
        knownDays: new Set([3]),
      },
    );
    assert.deepEqual(issues, []);
  });
});
