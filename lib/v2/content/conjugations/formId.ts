import type { Person, Tense } from '../items';

const FORM_ID_RE = /^verb\.([a-zçãõáéíóúâêô]+):([a-z]+):([a-z]+)$/i;

/** `verb.<lemma>:<tense>:<person>`. No filesystem access — safe in the client bundle. */
export function parseFormId(
  id: string,
): { lemma: string; tense: Tense; person: Person } | null {
  const m = FORM_ID_RE.exec(id);
  if (!m) return null;
  return {
    lemma: m[1]!,
    tense: m[2] as Tense,
    person: m[3] as Person,
  };
}
