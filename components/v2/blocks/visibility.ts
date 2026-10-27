import type { PartVisibility } from '@/lib/v2/render/guided';

/** Headers never dim. Only the active row gets the pale-yellow fill. */
export function partClass(state: PartVisibility, header = false): string {
  if (header) {
    return state === 'active' ? 'ring-2 ring-inset ring-v2-highlight-border' : '';
  }
  if (state === 'active') {
    return 'border-2 border-v2-highlight-border bg-v2-highlight-fill opacity-100';
  }
  if (state === 'dim') return 'pointer-events-none opacity-20';
  return '';
}
