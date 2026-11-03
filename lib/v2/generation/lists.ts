/** Fixed lists appended to the Claude system prompt. */

import { charactersPromptBlock } from '@/lib/v2/characters/registry';

/** Recurring cast — sourced from content/v2/characters.json. */
export const CHARACTERS = charactersPromptBlock();

export const ICONS = `
home, work, cafe, food, cart, map, train, bus, phone, heart, smile, sad, tired, clock, money, card, bag, water, bread, milk, cheese, apple, fish, chicken, rice, sugar, meat, coffee, tea, doctor, pharmacy, family, clothes, color, star, check, help, speak, listen, book, sun, moon, rain, bed, door, key, lock, person, group, question, warning, tip, sound, slow, replay
`.trim();

export const FUNCTION_WORDS = `
a, o, as, os, um, uma, uns, umas, de, do, da, dos, das, em, no, na, nos, nas, a (to), ao, à, aos, às, por, para, com, sem, e, ou, mas, que, se, não, sim, eu, tu, ele, ela, você, nós, eles, elas, me, te, se, nos, o senhor, a senhora, isto, isso, aquele, aquela, este, esta, esse, essa, muito, mais, menos, também, já, ainda, agora, hoje, amanhã, ontem, aqui, ali, onde, quando, como, porquê, porque, por favor, obrigado, obrigada
`.trim();

export const PRONUNCIATION_TABLE = `
say is code-filled using this mapping (پ ڤ چ غ are REQUIRED letters, never errors):
g → ج (Egyptian jim; hard g is ج, not غ)
j / g before e|i → چ
s/ch (sh sound) → ش
r at word start / rr → غ
v → ڤ · p → پ
lh → لي · nh → ني
nasal vowels (ão, ãe, õe, im, om, um) → light ن
final e often dropped · final o → و
`.trim();
