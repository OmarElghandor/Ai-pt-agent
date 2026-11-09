import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ThreadTopicFile } from '@/lib/v2/convo/topics';

/**
 * Persist a generated thread topic next to the authored banks.
 * Does not overwrite if the caller already refused authored ids.
 */
export function saveThreadTopicFile(
  doc: ThreadTopicFile,
  opts?: { baseDir?: string },
): string {
  const baseDir =
    opts?.baseDir ??
    path.join(process.cwd(), 'content/v2/convo/threads');
  const filePath = path.join(
    baseDir,
    `${doc.target_lang}.${doc.topic.id}.json`,
  );
  writeFileSync(filePath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  return filePath;
}
