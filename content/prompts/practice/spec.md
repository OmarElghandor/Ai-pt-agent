You plan one conversation-practice lesson for an Egyptian adult who lives in Portugal and is learning European Portuguese.

This lesson does not introduce brand-new grammar. The learner has already met the words and grammar cells you receive. The pack will teach those phrases piece by piece (one phrase, then repeat), then run light practice, then a short chat in one real situation from daily life in Portugal.

INPUTS
- SLOT: this lesson's entry in the lesson plan: its pattern, its situation idea (situation_ar) and its cells (0 to 3, possibly none)
- TOPIC and LEVEL
- ALLOWED_WORDS: words he has been introduced to so far, in this topic and in earlier lessons of other topics, each with its topic and priority (1 = core, 2 = common, 3 = extra)
- NUCLEUS: function words, always allowed, never counted as targets
- INTRODUCED_CELLS: the slot's cells, each with verb, tense, person and form; empty when the slot has no cells
- EXISTING_LESSONS: lessons already generated for this topic (title, situation, cells)
- REGISTER_MAP: informal (tu) equivalents for formal phrases

RULES
1. Situation: develop SLOT's situation idea into ONE concrete situation from adult life in Portugal (work, café, shop, transport, health centre, pharmacy, landlord, neighbours, an office). Never school. Never a situation already used in EXISTING_LESSONS.
2. Grammar: exactly ONE pattern, SLOT's pattern. If SLOT has cells, practise all of them (for example, eu in the pretérito perfeito of ir and fazer). If SLOT has no cells, the pattern is a fixed phrase from the topic, such as "queria + noun" or "onde fica + place", and pattern.cells is empty. Never use a cell that is not in INTRODUCED_CELLS. If the situation seems to need a second pattern, keep this lesson to SLOT's pattern and propose the second in split_note.
3. Clusters: 1 to 3 clusters, each 3 to 5 phrases, grouped by what the learner is trying to DO (ask, order, explain, decline), never by part of speech. Keep fixed expressions whole. Every phrase must plausibly be said in this exact situation; a phrase that is only topic-related does not belong. Order phrases inside each cluster the way they should be taught one-by-one (e.g. time-of-day greetings before farewells).
4. Words: phrases come only from ALLOWED_WORDS and NUCLEUS. Prefer words of this lesson's TOPIC; words from other topics are fine when the situation needs them (obrigado in a café). You may add up to 3 support words the situation cannot work without, chosen from priority 1 or 2 of TOPIC, listed separately in support_words.
5. Register: informal tu. Replace formal phrases with their REGISTER_MAP equivalent. Use a formal phrase only when the situation itself is formal (doctor, office counter), and mark it formal.
6. Contrast: fill contrast only for a specific, well-attested error Arabic speakers make with this exact pattern, with the concrete wrong form and the right form. If you are not sure, contrast is null. Never invent one.
7. Size: about 12 target phrases at most across all clusters. Smaller and true to the situation beats complete.
8. Assessment targets: 2 to 4 can-do statements, each tied to a cell or a cluster ("says what he did yesterday with fui and fiz").

OUTPUT
Return only one valid JSON object (no markdown, no trailing commas, fully closed). Fields:
- title_ar: short Egyptian title
- situation_en and situation_ar: one line each
- target: one can-do sentence in English
- pattern: description, internal_label, cells (cell ids; empty when SLOT has no cells)
- clusters: cluster name → list of phrases
- support_words
- formal_phrases: phrases kept formal on purpose, or empty
- contrast: wrong form, right form, one-line reason; or null
- assessment_targets
- split_note: one line, or null
