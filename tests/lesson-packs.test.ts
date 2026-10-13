import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  formatValidationIssues,
  loadLessonPacks,
  validateLessonPack,
} from '../lib/lessons';

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), 'content/lessons/test-greetings.json'), 'utf8'),
);

describe('lesson pack validator', () => {
  it('accepts the test-only three-beat pack', () => {
    const result = validateLessonPack(fixture);
    assert.equal(result.ok, true, result.ok ? '' : formatValidationIssues(result.issues));
    if (result.ok) {
      assert.equal(result.pack.testOnly, true);
      assert.equal(result.pack.beats.length, 3);
    }
  });

  it('rejects a missing required field with the exact path', () => {
    const bad = structuredClone(fixture);
    delete bad.titleAr;
    const result = validateLessonPack(bad);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.path === 'titleAr'));
    }
  });

  it('rejects known beats without accepted answers', () => {
    const bad = structuredClone(fixture);
    bad.beats[0].acceptedAnswers = [];
    const result = validateLessonPack(bad);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.issues.some((i) => i.path === 'beats[0].acceptedAnswers'),
        formatValidationIssues(result.issues),
      );
    }
  });

  it('rejects Portuguese fields that contain Arabic letters', () => {
    const bad = structuredClone(fixture);
    bad.beats[0].acceptedAnswers = ['Olá أهلا'];
    const result = validateLessonPack(bad);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.issues.some((i) => i.path.startsWith('beats[0].acceptedAnswers')),
      );
    }
  });

  it('rejects Arabic fields with unmarked Latin letters', () => {
    const bad = structuredClone(fixture);
    bad.beats[0].coachTip.ar = 'قول Olá';
    const result = validateLessonPack(bad);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.path === 'beats[0].coachTip.ar'));
    }
  });

  it('allows marked Portuguese inside Arabic fields', () => {
    const ok = structuredClone(fixture);
    ok.beats[0].coachTip.ar = 'قول [Olá] دلوقتي';
    ok.beats[0].coachTip.arz = 'قُول [Olá] دِلْوَقْتي';
    const result = validateLessonPack(ok);
    assert.equal(result.ok, true, result.ok ? '' : formatValidationIssues(result.issues));
  });

  it('rejects Brazilian blacklist words', () => {
    const bad = structuredClone(fixture);
    bad.beats[0].acceptedAnswers = ['O ônibus'];
    const result = validateLessonPack(bad);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.message.includes('ônibus')));
    }
  });

  it('rejects -ando forms', () => {
    const bad = structuredClone(fixture);
    bad.beats[0].acceptedAnswers = ['Estou falando'];
    const result = validateLessonPack(bad);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.message.includes('-ando')));
    }
  });

  it('rejects live packs outside 8–14 beats', () => {
    const bad = structuredClone(fixture);
    bad.testOnly = false;
    const result = validateLessonPack(bad);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.path === 'beats'));
    }
  });

  it('requires beats on the pack', () => {
    const bad = structuredClone(fixture);
    delete bad.beats;
    const result = validateLessonPack(bad);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.path === 'beats'));
    }
  });

  it('requires a coach tip on a guided beat', () => {
    const bad = structuredClone(fixture);
    delete bad.beats[0].coachTip;
    const result = validateLessonPack(bad);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.path === 'beats[0].coachTip'));
    }
  });

  it('rejects difficulty out of order', () => {
    const bad = structuredClone(fixture);
    bad.beats[2].difficulty = 'guided';
    const result = validateLessonPack(bad);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.path === 'beats[2].difficulty' && i.message.includes('order')));
    }
  });

  it('rejects a slot shown in the character line', () => {
    const bad = structuredClone(fixture);
    bad.beats[1].line.pt = 'Chamo-me [NAME]';
    const result = validateLessonPack(bad);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.path.startsWith('beats[1].line')));
    }
  });

  it('rejects assessment task count outside 3–6', () => {
    const bad = structuredClone(fixture);
    bad.assessmentTasks = bad.assessmentTasks.slice(0, 2);
    const result = validateLessonPack(bad);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.path === 'assessmentTasks'));
    }
  });
});

describe('lesson pack loader / catalogue', () => {
  it('loads the repo test pack and excludes it from live', () => {
    const report = loadLessonPacks();
    assert.equal(report.rejected.length, 0, JSON.stringify(report.rejected, null, 2));
    assert.ok(report.testOnly.some((p) => p.id === 'test-greetings'));
    assert.ok(!report.live.some((p) => p.id === 'test-greetings'));
  });

  it('rejects invalid files and keeps them out of the catalogues', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lessons-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'bad.json'),
      JSON.stringify({ id: 'bad', titleAr: 'سيء' }),
    );
    writeFileSync(
      path.join(dir, 'test-greetings.json'),
      readFileSync(path.join(process.cwd(), 'content/lessons/test-greetings.json')),
    );
    const report = loadLessonPacks(dir);
    assert.ok(report.rejected.some((r) => r.file === 'bad.json'));
    assert.ok(report.testOnly.some((p) => p.id === 'test-greetings'));
    assert.equal(report.live.length, 0);
  });
});
