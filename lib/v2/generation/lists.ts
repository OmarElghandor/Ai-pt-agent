/** Fixed lists appended to the Claude system prompt. */

export const CHARACTERS = `
yassin — Egyptian learner, late 20s, olive-green jacket, white t-shirt, dark jeans, white sneakers, brown backpack
ines — Portuguese colleague/friend, late 20s, mustard cardigan, navy-and-white striped top, dark grey trousers
rita — supermarket cashier, about 45, short dark bob, reading glasses on a cord, navy polo uniform
manuel — café owner, about 60, short grey hair, grey moustache, white shirt, dark brown apron
sofia — pharmacist, about 35, black hair in a low bun, white coat over light blue blouse
carlos — landlord, about 50, stocky, salt-and-pepper hair, beige sweater, dark trousers
`.trim();

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
