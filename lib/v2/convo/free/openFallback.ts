import { readFileSync } from 'node:fs';
import path from 'node:path';

export type OpenFallbackFrame = {
  tl: string;
  eg: string;
  chips: string[];
};

export type OpenFallbackQuestion = {
  id: string;
  tl: string;
  ar: string;
  frame: OpenFallbackFrame;
};

type OpenFallbackFile = {
  target_lang: string;
  version: number;
  questions: OpenFallbackQuestion[];
};

let cached: OpenFallbackFile | null = null;

export function loadOpenFallback(
  targetLang: string = 'pt-PT',
): OpenFallbackFile {
  if (cached && cached.target_lang === targetLang) return cached;
  const filePath = path.join(
    process.cwd(),
    'content/v2/convo',
    `open-fallback.${targetLang}.json`,
  );
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as OpenFallbackFile;
  if (!Array.isArray(raw.questions) || raw.questions.length < 1) {
    throw new Error('open-fallback: need at least one question');
  }
  cached = raw;
  return raw;
}

/** Pick a fallback question (rotates by index). */
export function pickOpenFallback(index = 0): OpenFallbackQuestion {
  const file = loadOpenFallback();
  const i = ((index % file.questions.length) + file.questions.length) %
    file.questions.length;
  return file.questions[i]!;
}

export function clearOpenFallbackCache(): void {
  cached = null;
}
