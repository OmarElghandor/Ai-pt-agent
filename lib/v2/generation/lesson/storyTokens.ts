import { normToken } from './functionWords';

export { normToken };

/** Split TL into raw tokens (punctuation stripped). */
export function tokenizeRaw(tl: string): string[] {
  return tl
    .replace(/[…]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[,.;:!?«»"']+|[,.;:!?«»"']+$/g, ''))
    .filter(Boolean);
}

export function tokenizeTl(tl: string): string[] {
  return tokenizeRaw(tl);
}
