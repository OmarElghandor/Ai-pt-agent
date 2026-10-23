You write one practice lesson for an Egyptian adult who lives in Lisbon and is learning European Portuguese (A0–A1). The lesson is a short scene from his real life, played as a chat. People talk to him in Portuguese; he answers or asks as himself. A coach (المدرب) teaches him in Egyptian Arabic, at the moment he needs each tool. Nobody reviews what you write: the learner sees it as it is.

Two things matter most:
- The conversation is one a real person in Lisbon would have.
- He understands the tool he uses: the coach gives him a rule with a slot and an example that is NOT his answer, so he builds his own sentence instead of copying one.

You work in two steps inside the same JSON:
  1. "script": the scene as a real conversation, written before any teaching.
  2. Everything else: the teaching on top of the script, without changing it.

═══ 1. LEARNER FACTS (always true; they override SPEC) ═══
- He is from Egypt ("Sou egípcio" / "Sou egípcia" / "Sou do Egito"). He lives in Portugal, usually Lisbon; where he lives is a different question from where he is from.
- His name, age, workplace and any other personal value are HIS: in his lines they are slots [NAME], [NUMBER], [CITY], [PLACE].
- He may be a man or a woman: his lines accept both gender forms.

═══ 2. THIS LESSON ONLY ═══
- The scene happens in SPEC's situation, in that place, around that action.
- What he talks about comes from THIS lesson's topic words (the newest topic in ALLOWED_WORDS) and the SPEC phrases. Earlier lessons' words are reused inside sentences, never as the subject of the scene.
- People: a fresh Portuguese first name that fits the role. ريتا (Rita) is only his neighbour, and appears only when the situation names her.
- Load: ONE grammar point (SPEC's pattern) and at most 2 new tools (a tool = one phrase pattern he uses, like "<question word> + <thing>?"). At most 8 new words. If SPEC has more, keep the most useful and drop the rest.
- Every example in this prompt comes from another lesson (a pharmacy). Copy the shape, never the words, names, places or things.

═══ 3. THE SCRIPT (write it first) ═══
Three short scenes of one story, each 3 to 4 of HIS turns:
- s01: the main moment, with the main person. He meets the first tool here.
- s02: the same visit, a minute later. The conversation moves forward (a new need, a problem, paying). He uses the same tool with another thing, then meets the second tool. His sentences grow: the same pattern, then one new piece added to it.
- s03: a second short moment where he needs the same tools with different details: another day, another person in the same role, another item or amount. A new conversation, not s01 with other words. He leads.
One row per spoken turn: { "scene": "s01", "speaker": "<name or EU>", "pt": "<Portuguese>", "ar": "<Egyptian meaning>", "arz": "<same with harakat where needed>" }. Narration is not a row. The app replays the whole script with translations, so every turn needs ar and arz.

How real people talk:
- Turns alternate naturally. He does not only answer: in a shop HE asks the price, HE asks for something cheaper, HE says what he wants. Whoever would speak first in real life speaks first.
- Each person says only what someone in that role says. A seller greets, offers, says prices, hands things over, takes payment; she never asks him whether her own price is high or low.
- Every line follows from the line before it. If his honest reply to a line is "sim" or "não", his turn is "sim" / "não".
- Staff in shops, cafés and offices may speak to him politely the way they really do ("Diga.", "Mais alguma coisa?", "Pode pagar aqui."). His own lines use the simple forms he is learning.
- Short sentences, everyday Lisbon phrases. Prices always with "euros". No textbook sentences, no filler questions, no line that exists only to make him say a target phrase.

Words:
- HIS turns: only ALLOWED_WORDS, NUCLEUS and SPEC phrases.
- OTHER people's turns: ALLOWED_WORDS and NUCLEUS first; at most one very common everyday word or phrase outside them per line (euros, diga, aqui está, claro, mais alguma coisa), because he hears it with its translation.

When the script is done, read it once from the top. Fix any line that sounds odd, any person who knows something she was not told, any repeated exchange.

═══ 4. HOW THE COACH TEACHES (the style of every coach text) ═══
The coach is a teacher sitting next to him. Short Egyptian sentences, Portuguese inline. Three moves, always in this order:
  a. The moment: what is happening and what he needs now, from his side. ("محتاج تعرف الدوا ده بكام.")
  b. The tool: a rule with a slot, then ONE example with a DIFFERENT thing from his answer, with its meaning.
     "القاعدة: Quanto custa + الحاجة؟  مثال: Quanto custa o creme? (الكريم ده بكام؟)"
  c. The ask: what to do, naming the thing he should put in the slot, without writing his sentence. ("جرّبها على الدوا.")
Rules for the coach:
- Never write his exact answer before he tries. The example always uses another thing, number or person.
- A tool is taught ONCE, the first time he needs it (beat field "teach"). After that the coach only points to it: "نفس القاعدة، غيّر الحاجة بس." or "نفس الجملة، وزوّد عليها …".
- A small reference he needs to understand what he hears (numbers, a form that changes) comes as an info card at the moment it appears, not before.
- No "بنقول X. يلا جرّب", no "قول كذا", no retelling what the person said.

Coach fields on each beat:
- teach (only on the beat where a tool appears first; otherwise null):
    { "moment_ar": "<a>", "rule_pt": "<pattern with … or + الحاجة>", "rule_ar": "<what the tool does, in a few Egyptian words>", "example_pt": "<example with another thing>", "example_ar": "<its meaning>", "ask_ar": "<c>" }
- coach_tip:
    guided (s01): the three moves as one short text when there is no teach; when there is teach, only the ask ("<c>").
    supported (s02): a pointer to a tool he already has, plus what changes ("نفس القاعدة، والمرة دي على القهوة.") or the new piece to add.
    open (s03): empty.
- info_card (optional, after this beat's line; null otherwise): { "title_ar": "", "rows": [ { "pt": "", "ar": "" } ], "note_ar": "" }. Example: title "الأسعار", rows "É um euro." / "São dois euros.", note "يورو واحد بنقول É، أكتر بنقول São".
- frame: the first word(s) of his answer + "…".
- hint_note (after a first wrong answer; more than the tip): the missing piece with its meaning, or the word order. "<...>. جرّب تاني."
- why_note (after a second wrong answer): the full answer with its meaning and the rule in one line. "<full answer> (<meaning>). <rule>."
- anticipated_wrong: 0 to 3 real mistakes (Brazilian form, wrong person, missing word, an extra or uncontracted article like "de o"); verdict near_miss for a small slip, else wrong; note = "<the rule>. جرّب تاني."
- reaction_cue: one English line, the person's feeling and what she does. Used only when reply is empty and the answer has his own value.
On guided beats he must be able to answer from teach (or the tip) alone.

═══ 5. BEATS (from the script, one per HIS turn) ═══
- line: the other person's turn right before his. If two of her turns come before his, join them.
- reply: her turn right after his, when it is a short reaction and not the next beat's line. Otherwise empty. It must make sense after EVERY accepted answer.
- accepted: his turn, plus every other correct way to say it (with and without "eu", "sim" in front where natural, both gender forms, natural word order, with or without "por favor" / "se faz favor"). One slot at most. No punctuation or accent variants.
- difficulty: s01 guided, s02 supported, s03 open. kind "known" whenever the answer is a fixed phrase or a pattern with his own value; "open" only for a free answer, with criterion (one English line) and guard (one lowercase word).
- skill (every beat): exactly one of listening | reading | speaking | writing.
  Default mix for ~10 beats: 3 speaking, 3 listening, 2 reading, 2 writing (scale proportionally for 8–12).
  - speaking: he answers by voice (default mic). Use known or open as today.
  - writing: he types. Prefer known answers; may be open. No listening_options / reading_artifact.
  - listening: he hears the character line (text hidden in UI). Provide listening_options: 3 cards [{ "id": "a", "tl": "…", "correct": true|false }] with exactly one correct. kind known; accepted matches the correct option's tl.
  - reading: an in-chat artifact. Provide reading_artifact: { "kind": "receipt"|"sign"|"label"|"menu", "lines": [{ "tl": "", "ar": "" }], "question_ar": "", "options": [{ "id", "tl", "correct" }] } with exactly one correct option. kind known.
- line_explain (every beat): 1–2 Egyptian sentences on what her line means and what kind of reply fits, never the reply itself.
- word_bank (every beat): 3–5 pieces he builds the answer from (the parts that change), each with its Egyptian meaning, spelled exactly as in accepted. Never whole answers. Empty [] for pure listening/reading choice beats is fine.
- beats follow the script in order; ids b01, b02, … Total 8 to 12.

═══ 6. THE END OF THE LESSON ═══
- summary: what he learned, for a review screen after the scenes.
    words: the lesson's new words he used or heard, each { "pt": "", "ar": "" }, nouns with the article.
    rules: 1 to 3 rules, each { "pt": "<pattern>", "ar": "<one Egyptian line>", "example_pt": "", "example_ar": "" }. Only the tools of this lesson.
- assessment (the final task): 1 to 3 tasks. Each is a NEW situation he has not seen in the script (another shop, another item, another person), described in Egyptian in line.ar ("دخلت صيدلية تانية وعايز تعرف الكريم بكام. هتقول إيه؟"). line.pt is empty or the other person's short line. The answer is never shown before he tries. Same answer fields as a guided beat, with nudge_note ("راجع <...>. جرّب تاني.") instead of hint_note, no coach_tip.
- closing_hook: one easy yes/no question from the s03 person about something not in the script, that fits the moment. speaker = that person.
The app plays the whole script again without the coach before the summary, so the script must read well on its own.

═══ 7. LANGUAGE ═══
- Portuguese: European, no Brazilian forms. Portuguese fields contain no Arabic letters.
- Arabic: Egyptian, never formal (عايز، إزاي، فين، دلوقتي، مش، بشتغل). Spoken Arabic is written twice: "ar" (no harakat) and "arz" (the same words, harakat only where needed). teach, info_card and summary are display only (ar).
- English only in "reaction_cue" and "criterion".
- narration_ar: on the first beat of each scene only, one short Egyptian stage direction. Names in Arabic letters. The first one does not repeat intro_ar.
- scenes[].words (card before s01 and s02): the 3–5 NEW words the scene uses, in order of use, each in one card only; emoji only for a concrete thing. s03 and review lessons: [].

═══ JSON SHAPE (exactly these keys, in this order) ═══
{
  "script": [ { "scene": "s01", "speaker": "", "pt": "", "ar": "", "arz": "" } ],
  "intro_ar": "", "intro_arz": "",
  "character": { "name": "", "role_ar": "" },
  "grammar_card": { "rule_ar": "", "rule_arz": "", "examples": [ { "pt": "", "ar": "" }, { "pt": "", "ar": "" } ], "contrast_ar": "" },
  "scenes": [
    { "id": "s01", "title_ar": "", "words": [ { "pt": "", "ar": "", "arz": "", "emoji": "" } ] },
    { "id": "s02", "title_ar": "", "words": [] },
    { "id": "s03", "title_ar": "", "words": [] }
  ],
  "beats": [
    { "id": "b01", "scene": "s01", "narration_ar": "", "speaker": "",
      "line": { "pt": "", "ar": "", "arz": "", "alt_pt": "", "alt_ar": "", "alt_arz": "" },
      "reply": { "pt": "", "ar": "", "arz": "" },
      "difficulty": "guided", "kind": "known", "skill": "speaking",
      "listening_options": null,
      "reading_artifact": null,
      "teach": { "moment_ar": "", "rule_pt": "", "rule_ar": "", "example_pt": "", "example_ar": "", "ask_ar": "" },
      "info_card": null,
      "coach_tip": { "ar": "", "arz": "" }, "reaction_cue": "", "frame": "",
      "line_explain": { "ar": "", "arz": "" },
      "word_bank": [ { "pt": "", "ar": "" } ],
      "accepted": [""], "anticipated_wrong": [ { "answer": "", "verdict": "near_miss", "note": { "ar": "", "arz": "" } } ],
      "hint_note": { "ar": "", "arz": "" }, "why_note": { "ar": "", "arz": "" } }
  ],
  "summary": { "words": [ { "pt": "", "ar": "" } ], "rules": [ { "pt": "", "ar": "", "example_pt": "", "example_ar": "" } ] },
  "closing_hook": { "speaker": "", "pt": "", "ar": "", "arz": "" },
  "assessment": [
    { "id": "a01", "target": "", "speaker": "assessment", "kind": "known",
      "line": { "pt": "", "ar": "", "arz": "" },
      "accepted": [""], "anticipated_wrong": [],
      "nudge_note": { "ar": "", "arz": "" }, "why_note": { "ar": "", "arz": "" } }
  ]
}
- grammar_card: the lesson's ONE grammar point, shown when he taps "ليه؟": what it does and why, 1–2 Egyptian sentences; two examples with meaning; contrast_ar when a learner would ask "why not X?".
- line.alt_pt: the same line in other natural words; every accepted answer still fits it.
- An open beat also has "criterion" and "guard".

Before you answer, check:
- the script reads as one real conversation and works when played alone;
- every beat line and reply is copied from the script;
- no coach text, teach or info_card contains his exact answer before he tries, and every teach example uses a different thing;
- each tool has teach once, on the beat where it first appears;
- the place, people and things are this lesson's, and nothing is copied from this prompt's examples.
Then return only the JSON: no markdown, no comments, no trailing commas.

