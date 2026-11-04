# Batch 8 · Fix 1 · Free chat does not follow the plan

Observed on /talk/free/home (2026-11-04), compared with 09 §5 and §9.

## What is wrong (from a real run)

1. **The character does not react to what the learner said.** Learner: "Nao meu casa é pocenuo". Reply: "A tua casa tem janela? Vives com vizinho?". The streamed `reaction_delta` text is just the angle question, with no reaction before it. The input tokens were 236 (111 cached). The plan's six parts come to about 800 tokens, so most of the prompt is missing: the character rules, the scene, the last 3 exchanges, or the learner's answer.
2. **The same angle repeats.** `home.a01` was asked 3 turns in a row, so the angle pointer never moves.
3. **Duplicated question.** The model writes the question as its "reaction", and code then appends the same angle question. That is the Module A behaviour (always append, strip questions from the reaction) applied to free chat.
4. **Two questions in one bubble** ("A tua casa tem janela? Vives com vizinho?"). The angle bank allowed angles that hold two questions.
5. **Dead-end yes/no questions.** "A sua casa é grande?" and "Tem janela?" get "Sim" and nothing else, so the conversation can't grow.
6. **Mixed address.** The resume template says "A sua casa", the model says "A tua casa", and another angle says "Mora num prédio alto?". The character must use one form throughout.
7. **Mistakes are ignored.** "meu casa", "pocenuo" and "Nao" get no natural recast.
8. **Topic label leaks:** the header shows "home" and the opener says "Vamos falar de Casa?" with a capital C. The topic id is being used as display text.
9. **Opening shows two questions back to back** ("Olá! Vamos falar de Casa?" then "Mora num prédio alto?").

## Fixes

**F1 · Restore the six-part prompt (09 §5.1).** Log the full prompt of one free-chat turn in dev and check each part is present, in order:
- the character rules (with the rules in F5 and F6);
- the scene: topic in pt-PT and the character;
- the event line;
- the current angle and the next angle;
- the last 3 exchanges;
- the learner's message.

The target is about 700–900 input tokens with the static part cached. Add a test that fails if any of the six parts is empty.

**F2 · Module C output contract (09 §5.3), not Module A.** In free chat:
- the model writes the whole reply: a reaction to the learner (one short sentence) followed by exactly **one** question or invitation;
- the model does not output a candidate-id tag;
- code does **not** append the angle question when the reply already ends with a question;
- code appends the angle question only when the reply has no question at the end;
- never send a separate question bubble that duplicates the reply's question;
- post-check: more than one question in the reply → keep the reaction and the last question only.

**F3 · Angle pointer.**
- An angle is closed when the learner gives any Portuguese answer (not Arabic, not empty), or after 2 turns on it, whichever comes first.
- Then code moves to the next angle.
- Never reuse an angle used in the last 5 turns.
- After the last angle, bridge to a related topic (09 §9).
- Store the pointer in the session so resume continues from it.

**F4 · Angle bank rules (regenerate the banks).** Each angle is **one** question. At most 1 in 3 angles may be yes/no. The others are:
- either/or with known words ("A tua casa é grande ou pequena?");
- simple open questions ("Como é a tua casa?", "Quantos quartos tem?").

Each angle also lists 2–4 known words that answer it. Code checks these rules when the bank is generated and drops failing angles.

**F5 · Recast rule (static, in the cached character rules).** "If the learner's Portuguese has mistakes, start your reply by saying back what they meant, correctly and naturally, without pointing out the mistake."
- Example: "Ah, a tua casa é pequena!"
- One recast only, then the question.
- This is a fixed rule, so it adds no per-turn tokens.

**F6 · One address form per character.**
- Add `address: tu | voce_formal` to each character in characters.json; Inês and Nour use tu, Graça uses formal.
- Write the form into the character rules.
- Write the resume and opening templates and the angle bank in that form (tu: "a tua casa", "Moras…").
- Add a post-check: in a tu character's reply, "a sua", "o seu" or a 3rd-person verb addressed to the learner triggers the one allowed regeneration with that exact reason.

**F7 · Display names.**
- Free topics have `title_tl` (a casa), `title_ar` (البيت) and an id (home).
- The header shows title_tl with title_ar under it, never the id.
- Templates use title_tl in lowercase inside sentences: "Vamos falar da casa?"

**F8 · Opening: one bubble, one question.** "Olá! Vamos falar da casa? Como é a tua casa?" as a single bubble, using angle 1. Don't send a separate opener question and angle question.

## Done when

Play 10 turns on /talk/free/home with these answers:

1. "Nao meu casa é pocenuo"
2. "Sim"
3. "grande"
4. one Arabic message
5. "I like football"
6. to 10. any answers

Then:
- every reply reacts to the answer before its question;
- the first reply recasts "a minha casa é pequena";
- no angle repeats;
- every bubble has exactly one question;
- the reply never uses "sua" or "Mora";
- the header shows "a casa / البيت";
- the dev panel shows input tokens in the 700–900 range, flat across the 10 turns.
