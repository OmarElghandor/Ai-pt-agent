import type { LessonPack } from './lesson';
import { loadConjugationSeed, resolveForm, type ResolvedForm } from './conjugations/resolve';

const FORM_REF = /verb\.[a-zçãõáéíóúâêô]+:[a-z]+:[a-z]+/gi;

/** Deep-walk pack JSON and replace form-id string fields named `ref` / list entries with resolved objects. */
export function resolvePackForms(pack: LessonPack): unknown {
  const seed = loadConjugationSeed();
  return walk(pack, seed);
}

function walk(value: unknown, seed: ReturnType<typeof loadConjugationSeed>): unknown {
  if (typeof value === 'string') {
    if (/^verb\./.test(value)) {
      const form = resolveForm(value, seed);
      if (form) return { id: value, ...form };
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, seed));
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.ref === 'string' && obj.ref.startsWith('verb.')) {
      const form = resolveForm(obj.ref, seed);
      if (form) {
        const resolved: ResolvedForm & { id: string } = { id: obj.ref, ...form };
        return { ...obj, form: resolved };
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = walk(v, seed);
    }
    return out;
  }
  return value;
}

export function collectFormIds(pack: LessonPack): string[] {
  const text = JSON.stringify(pack);
  const found = text.match(FORM_REF) ?? [];
  return [...new Set(found)];
}
