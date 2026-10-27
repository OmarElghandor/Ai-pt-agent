import { CORE_PROMPT } from './core';

export function buildContinuitySystemPrompt(): string {
  return `${CORE_PROMPT}

JOB: CONTINUITY
Review the assembled lesson for pedagogy continuity. Return regenerate (page indexes, at most 3) and optional notes.

REQUIRED OUTPUT: { "regenerate": number[], "notes"?: string }.

Flag a page if it repeats tips/examples almost verbatim, jumps sequence, or assumes knowledge not prepared by prior pages. Empty regenerate [] means OK.
`.trim();
}
