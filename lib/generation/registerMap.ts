export const REGISTER_MAP: Record<string, string> = {
  'e você?': 'e tu?',
  'como se chama?': 'como te chamas?',
  'como se chama': 'como te chamas',
  'como está?': 'como estás?',
  'como está': 'como estás',
  'o senhor': 'tu',
  'a senhora': 'tu',
  você: 'tu',
  'o que você': 'o que tu',
  'de onde é?': 'de onde és?',
  'quantos anos tem?': 'quantos anos tens?',
};

export function applyRegisterMap(phrase: string): string {
  if (!phrase || typeof phrase !== 'string') return phrase;
  const key = phrase.trim().toLowerCase();
  return REGISTER_MAP[key] ?? phrase;
}
