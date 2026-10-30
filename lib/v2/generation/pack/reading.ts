import type { Item } from '@/lib/v2/content/items';
import type {
  ListeningOption,
  ReadingArtifact,
} from '@/lib/v2/content/pack';

export const ARTIFACT_KIND_AR: Record<ReadingArtifact['kind'], string> = {
  receipt: 'فاتورة',
  sign: 'يافطة',
  label: 'ملصق',
  menu: 'منيو',
};

export type ReadingQuestionKind = 'first' | 'last' | 'missing';

function tlOf(item: Item): string {
  if ('tl' in item && typeof item.tl === 'string') return item.tl.trim();
  return '';
}

function artifactTls(artifact: ReadingArtifact): Set<string> {
  return new Set(artifact.lines.map((l) => l.tl.trim()).filter(Boolean));
}

function shuffleById<T extends { id: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Code-built reading closed options.
 * - first/last: correct = target artifact line TL; distractors NOT on artifact.
 * - missing: correct = bank TL not on artifact; distractors = artifact lines.
 */
export function buildReadingQuestion(opts: {
  kind: ReadingQuestionKind;
  artifact: ReadingArtifact;
  bank: Item[];
  optionCount?: number;
}): {
  question_eg: string;
  options: ListeningOption[];
} | null {
  const { kind, artifact, bank } = opts;
  const count = opts.optionCount ?? 3;
  const lines = artifact.lines.filter((l) => l.tl.trim());
  if (lines.length < 1) return null;

  const onArtifact = artifactTls(artifact);
  const kindAr = ARTIFACT_KIND_AR[artifact.kind];

  if (kind === 'first' || kind === 'last') {
    const target = kind === 'first' ? lines[0]! : lines[lines.length - 1]!;
    const correctLabel = target.tl.trim();
    const distractors = bank
      .map((i) => tlOf(i))
      .filter((tl) => tl && tl !== correctLabel && !onArtifact.has(tl));
    const unique = [...new Set(distractors)];
    const options: ListeningOption[] = [
      {
        id: 'opt.correct',
        label: correctLabel,
        lang: 'tl',
        correct: true,
      },
    ];
    for (let i = 0; i < unique.length && options.length < count; i++) {
      options.push({
        id: `opt.d.${i}`,
        label: unique[i]!,
        lang: 'tl',
        correct: false,
      });
    }
    if (options.length < 2) return null;
    const which = kind === 'first' ? 'أول' : 'آخر';
    return {
      question_eg: `إيه ${which} حاجة في ال${kindAr}؟`,
      options: shuffleById(options),
    };
  }

  // missing
  const offArtifact = bank
    .map((i) => ({ id: i.id, tl: tlOf(i) }))
    .filter((x) => x.tl && !onArtifact.has(x.tl));
  const correct = offArtifact[0];
  if (!correct) return null;
  const options: ListeningOption[] = [
    {
      id: 'opt.correct',
      label: correct.tl,
      lang: 'tl',
      correct: true,
    },
  ];
  for (let i = 0; i < lines.length && options.length < count; i++) {
    const tl = lines[i]!.tl.trim();
    if (!tl || tl === correct.tl) continue;
    options.push({
      id: `opt.line.${i}`,
      label: tl,
      lang: 'tl',
      correct: false,
    });
  }
  if (options.length < 2) return null;
  return {
    question_eg: `إيه اللي مش في ال${kindAr}؟`,
    options: shuffleById(options),
  };
}

/** True when every incorrect option label is absent from the artifact (first/last). */
export function distractorsAbsentFromArtifact(
  artifact: ReadingArtifact,
  options: ListeningOption[],
): boolean {
  const onArtifact = artifactTls(artifact);
  for (const o of options) {
    if (o.correct) continue;
    if (onArtifact.has(o.label.trim())) return false;
  }
  return true;
}
