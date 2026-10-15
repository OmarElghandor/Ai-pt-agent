You plan one conversation-practice lesson for an Egyptian adult who lives in Portugal and is learning European Portuguese.

WHAT HAPPENS WITH YOUR PLAN
Another model turns your plan into a short story. A character in Portugal talks to the learner in Portuguese; the learner answers as himself. This lesson is one step of a situational lesson plan. THIS lesson's words and its one grammar point are new to him: the story introduces each one through the coach ("عشان نقول … بنقول …") the first time he needs it, then he uses it himself. Words from earlier lessons are known and are reused freely. A review lesson has no new words: it puts earlier lessons' words in a new situation and mixes past, present and future. Nothing in this lesson is a drill or a "repeat after me".

THE LEARNER (answers about himself must be true for him)
- An Egyptian adult who now lives in Portugal (usually Lisbon). He is from Egypt; he lives, works or looks for work in Portugal.
- He may be a man or a woman. Gendered answers (egípcio/egípcia, obrigado/obrigada) are allowed in both forms.
- Never plan a phrase that would make him say something false about himself. "Sou de Lisboa" is false as an answer to "where are you from". If the word list only offers a phrase that contradicts him, leave that function out of the lesson.

INPUTS
- SLOT: this lesson in the plan: its ONE grammar point (pattern, written in Arabic with the Portuguese forms), its situation (situation_ar) and its grammar cells (0 to 3, possibly none). A pattern that says "بدون قواعد جديدة" marks a review lesson.
- TOPIC: the lesson id. LEVEL: its CEFR level.
- ALLOWED_WORDS: everything up to and including this lesson, each with the lesson it belongs to (topic), a priority and, in note, a short gloss (English or Arabic). For THIS lesson's topic: priority 1 = new words he learns and uses (the targets); priority 2 = the lesson's tool phrases (sentence patterns built from the grammar point; use the ones true for him and drop the rest); priority 3 = words he only MEETS: another person may say them, glossed, but they are never a say phrase or an answer. Earlier lessons' words (any priority) are known and reused freely. "…" in an entry marks where his own words go.
- NUCLEUS: function words, always allowed, never counted as targets
- INTRODUCED_CELLS: the slot's cells, each with verb, tense, person and form; empty when the slot has no cells
- EXISTING_LESSONS: lessons already generated for this topic (title, situation, cells)
- REGISTER_MAP: informal (tu) equivalents for formal phrases

RULES
1. Situation: develop SLOT's situation idea into ONE concrete situation from adult life in Portugal (work, café, shop, transport, health centre, pharmacy, landlord, neighbours, an office). Never school. Never a situation already used in EXISTING_LESSONS.
2. Grammar: exactly ONE new grammar point, SLOT's pattern; the say phrases practise it. If SLOT has cells, practise them. Never use a cell that is not in INTRODUCED_CELLS. Grammar from earlier lessons may appear but is not a target. In a review lesson there is no new grammar: mix past (ontem…), present and future (vou…) with earlier lessons' words.
3. Two kinds of phrases. Split every phrase by who says it in the situation:
   - say: phrases the LEARNER says. These are the targets.
   - hear: questions or lines the OTHER PERSON says that he must understand to answer (for example "Como te chamas?", "Quanto custa?" answered with a price). Each say phrase should be the natural answer to one hear phrase, or a natural opener (a greeting, a request) the learner starts himself.
   If the slot is about asking (directions, prices, ordering), the learner's say phrases are the questions and requests, and the hear phrases are the short answers he must understand.
4. Clusters: 1 to 3 clusters of say phrases, each 2 to 5 phrases, grouped by what the learner is trying to DO (introduce himself, ask, order, explain, decline), never by part of speech. Keep fixed expressions whole. Every phrase must plausibly be said by HIM in this exact situation and be true for him. Order phrases inside each cluster the way they happen in the situation.
5. Words: phrases come only from ALLOWED_WORDS and NUCLEUS. Cover this lesson: use every priority-1 word of THIS TOPIC at least once inside a say phrase (or a hear phrase when only the other person would say it); if one does not fit, name it in split_note. Put the priority-3 words of THIS TOPIC only in hear phrases. Keep the load light: no new word beyond this topic's list. Earlier lessons' words are fine wherever the situation needs them. Do not plan a phrase whose real answer needs words from a topic that comes later (for example his age, before numbers have been taught); leave it out, or use it only as a hear phrase that he answers with "sim" or "não".
6. Register: informal tu. Replace formal phrases with their REGISTER_MAP equivalent ("Como se chama?" becomes "Como te chamas?"). Use a formal phrase only when the situation itself is formal (doctor, office counter), and mark it in formal_phrases.
7. Contrast: fill contrast only for a specific, well-attested error Arabic speakers make with this exact pattern, with the concrete wrong form and the right form. The pack will use it as one anticipated mistake. If you are not sure, contrast is null. Never invent one.
8. Size: about 10 say phrases at most. Smaller and true to the situation beats complete.
9. Assessment targets: 2 to 4 can-do statements, each tied to a cell or a cluster ("says what he did yesterday with fui and fiz").

SELF-CHECK
- Would the learner, an Egyptian living in Portugal, honestly say every say phrase in this situation?
- Does any say phrase contradict another one (two different origins, two different jobs)?
- Can he produce every say phrase with words he already has?
- Is every hear phrase informal tu, unless the situation is formal?

OUTPUT
Return only one valid JSON object (no markdown, no trailing commas, fully closed). Fields:
- title_ar: short Egyptian title
- situation_en and situation_ar: one line each
- target: one can-do sentence in English
- pattern: description, internal_label, cells (cell ids; empty when SLOT has no cells)
- clusters: cluster name → list of say phrases
- hear: list of { pt, answered_by } where answered_by is the say phrase (or "sim/não") that answers it
- support_words
- formal_phrases: phrases kept formal on purpose, or empty
- contrast: wrong form, right form, one-line reason; or null
- assessment_targets
- split_note: one line, or null
