#!/usr/bin/env npx tsx
/**
 * Warm TTS cache for every authored Portuguese / Arabic segment in lesson packs.
 * Failures are logged but do not abort — audio will fall back to live TTS.
 */
import { warmAuthoredSegments } from '../lib/lessons/warmAudio';
import { allValidLessons, assertValidLessonCatalogue } from '../lib/lessons';
import type { AuthoredSegment } from '../lib/lessons';

function collectSegments(): AuthoredSegment[] {
  assertValidLessonCatalogue();
  const out: AuthoredSegment[] = [];
  for (const pack of allValidLessons()) {
    out.push({ lang: 'ar', text: pack.introAr, pronunciation: pack.introArz });
    for (const beat of pack.beats) {
      out.push({ lang: 'pt', text: beat.line.pt });
      out.push({ lang: 'pt', text: beat.altLine.pt });
      if (beat.line.ar) {
        out.push({ lang: 'ar', text: beat.line.ar, pronunciation: beat.line.arz || beat.line.ar });
      }
      if (beat.coachTip) {
        out.push({ lang: 'ar', text: beat.coachTip.ar, pronunciation: beat.coachTip.arz });
      }
      if (beat.kind === 'known') {
        for (const wrong of beat.anticipatedWrong) out.push(...wrong.feedback);
      }
    }
    out.push({ lang: 'pt', text: pack.closingHook.pt });
    for (const scene of pack.scenes) {
      for (const word of scene.words ?? []) {
        const pt = word.pt.trim();
        if (pt) out.push({ lang: 'pt', text: pt });
      }
    }
    for (const task of pack.assessmentTasks) {
      out.push({ lang: 'pt', text: task.line.pt });
      if (task.line.ar) {
        out.push({ lang: 'ar', text: task.line.ar, pronunciation: task.line.arz || task.line.ar });
      }
      out.push(...task.passSummary, ...task.reviewSummary);
      if (task.kind === 'known') {
        for (const wrong of task.anticipatedWrong) out.push(...wrong.feedback);
      }
    }
  }
  return out;
}

async function main() {
  const segments = collectSegments();
  console.log(`Warming audio for ${segments.length} authored segments…`);
  const result = await warmAuthoredSegments(segments);
  console.log(`Done · cached ${result.cached} · skipped ${result.skipped} · failed ${result.failed}`);
  if (result.failed > 0) process.exitCode = 1;
}

void main();
