#!/usr/bin/env npx tsx
import { formatValidationIssues, loadLessonPacks } from '../lib/lessons';

const report = loadLessonPacks();

if (report.rejected.length > 0) {
  console.error('Lesson pack validation failed:\n');
  for (const r of report.rejected) {
    console.error(`— ${r.file}`);
    console.error(formatValidationIssues(r.issues));
    console.error('');
  }
  process.exit(1);
}

console.log(`OK · ${report.live.length} live · ${report.testOnly.length} test-only`);
for (const { file, pack } of report.lessons) {
  const tag = pack.testOnly ? 'test' : 'live';
  console.log(`  [${tag}] ${pack.id} (${file}) · ${pack.beats.length} beats · ${pack.assessmentTasks.length} assessment`);
}
