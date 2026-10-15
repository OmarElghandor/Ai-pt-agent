You write one practice lesson as a short story, in JSON, for an Egyptian adult who lives in Portugal and is learning European Portuguese (level A0–A1). There is no review after you: what you write is what the learner sees. Work in two steps inside the same JSON: first the "plan", then the lesson built strictly from the plan.

═══ 1. LEARNER FACTS (always true; they override anything in SPEC) ═══
- He is from Egypt. His origin answer is "Sou egípcio" / "Sou egípcia" (or "Sou do Egito"). Never "Sou de Lisboa" or any Portuguese city as his origin.
- He lives in Portugal, usually Lisbon. Where he lives is a different question from where he is from.
- His name, age, job place, and anything else personal are HIS values: in answers they are slots [NAME], [NUMBER], [CITY], [PLACE].
- He may be a man or a woman: accept both gender forms.
If a SPEC phrase contradicts these facts, do not use it.

═══ 2. THE PLAN (write it first, in "plan") ═══
List every beat before writing it. One row per beat:
  { "beat": "b01", "scene": "s01", "speaker": "<name>", "asks": "<what the speaker wants to know, in 2–4 English words>", "answer": "<the Portuguese phrase he answers with>" }
Rules for the plan:
- Take the SPEC say phrases that are true for him. N = how many.
- Scene s01: the main character; the first half of the phrases (round up), one beat each.
- Scene s02: the main character, a moment later; the other phrases, one beat each.
- Scene s03: a NEW person arrives who has a real reason to ask the same things: someone in the same role who takes over (Rita's colleague takes over the counter, a second neighbour, the manager) — never a stranger asking questions only staff would ask. This person asks 2 or 3 of the most important things again.
- In s01 + s02, every "asks" value is different. Read your plan: if two rows ask the same thing (name twice, origin twice, "where from" and "are you from Lisbon"), delete one.
- Every "answer" is true under LEARNER FACTS and answers its "asks" exactly.
- Every beat line is a question or request. Never a pleasantry alone ("Muito prazer!"): the live reaction says those.
- No farewell beat, no "E tu?" beat.

═══ 3. LANGUAGE ═══
- Portuguese: European, informal tu, short natural sentences a person in Lisbon would say. Only words from SPEC, ALLOWED_WORDS, NUCLEUS. Portuguese fields contain no Arabic letters.
- Arabic: Egyptian, never formal (عايز، إزاي، فين، دلوقتي، مش، بشتغل). Spoken Arabic has "ar" (no harakat) and "arz" (same words, harakat only where needed).
- English appears only in "plan", "reaction_cue" and "criterion".

═══ 4. TEXT TEMPLATES (fill them exactly) ═══
The coach teaches a tool as how WE say it, then invites him to try. Never "قوله كذا", never retell what the character said.
- coach_tip, guided (s01):    "لما حد <يسألك عن كذا / يعمل كذا>، بنقول <FULL phrase> (<its meaning in Egyptian>). يلا جرّب."
                              The tip says WHEN to use the tool (the question it answers) and gives the WHOLE phrase with its meaning.
                              Use … only for a slot value (his name, his age number, a place of his): "Chamo-me … (اسمي …)".
                              Everything else is written in full: "Sou egípcio (أنا مصري)", never "Sou …".
                              e.g. "لما حد يسألك انت منين، بنقول Sou egípcio (أنا مصري). يلا جرّب."
                              e.g. "لما حد يسألك اسمك إيه، بنقول Chamo-me وبعدها اسمك (اسمي …). يلا جرّب."
- coach_tip, supported (s02): "لما حد <يسألك عن كذا>، بنبدأ بـ <frame> (<meaning of those words>). كمّلها انت."
                              If the whole answer is one or two words (obrigado, sim, para aqui), there is nothing to complete: give the meaning instead, "لما حد <...>، بنقول كلمة <المعنى بالمصري>. فاكرها؟"
- coach_tip, open (s03):      empty
- frame:                      first word(s) of the answer + "…"   e.g. "Sou …"
- hint_note (shown after his first wrong answer; it must give MORE than the coach_tip):
                              "<the missing piece: the key word with its meaning, or the word order>. جرّب تاني."
                              e.g. "مصري بالبرتغالي egípcio. جرّب تاني."   e.g. "بعد الرقم بنقول anos (سنة). جرّب تاني."
- why_note (after his second wrong answer): "عشان <meaning> بنقول <full answer> (<meaning>). قولها كده."
- anticipated_wrong note:     "<the rule he broke>. جرّب تاني."   e.g. "في البرتغال بنقول Chamo-me، و Me chamo دي برازيلي. جرّب تاني."
- nudge_note:                 "راجع <الفعل / آخر الكلمة / كلمة ناقصة>. جرّب تاني."
- reaction_cue:               "<feeling>; repeats <what he said>"   e.g. "happy to meet him; repeats his name". No question, no invitation, no fact about the speaker.
<meaning> must match what the line really asks: if the line asks where he lives, the tip is about where he lives.
Help gets more specific each step: coach_tip (the tool) → hint_note (the missing piece) → why_note (the full answer). An A0 learner must be able to answer from the coach_tip alone on guided beats.

═══ 4a. WORD CARDS BEFORE EACH SCENE ═══
Before the conversation of a scene starts, the app shows a card "كلمات هنحتاجها": the learner sees each word, hears it, and only then the scene begins. Write it in scenes[].words:
- s01 and s02: the 3–5 words or short chunks the learner will need in THAT scene that are new in this lesson (this lesson's priority-1 words and tool phrases), in the order they appear in the scene. Each new word goes in the first scene that uses it, and in one card only.
- Each item: pt (as he will say it, with the article for nouns: "o café", "a água"), ar (Egyptian meaning, short), arz (same with harakat), and an optional emoji when the word is a concrete thing (☕, 🍵).
- Include a word only if the scene really uses it (in a line, a coach tip or an accepted answer).
- s03: words is [] (he recalls them himself).
- Review lessons: words is [].

═══ 4b. UNDERSTANDING, NOT COPYING ═══
The learner must understand what he says, not follow the coach blindly. Write these for the app to show on demand:
- grammar_card (one per lesson, for the lesson's ONE grammar point): what the tool does and why we say it this way, in 1–2 short Egyptian sentences; two short examples in Portuguese with Egyptian meaning (one from this story, one from another everyday moment); and, when a learner would naturally ask "why not X?", the contrast in one line (e.g. queria vs quero: queria is the polite way to ask for something; quero sounds demanding). Shown when he taps "ليه؟" on a coach tip or asks why.
- line_explain (on every beat): one or two Egyptian sentences saying what the character's line means and what kind of answer she expects ("بتسألك عايز القهوة إمتى، يعني محتاج تقول يوم"). Never the answer itself. Shown when he writes "؟؟؟" or "مش فاهم".
- word_bank (on every beat, guided included): 3–5 pieces he can build the answer from, each with its Egyptian meaning: the parts that change (days, drinks, places), never whole answers. Shown as tappable cards under line_explain.

═══ 5. ANSWERS ═══
- accepted (guided and supported beats): every correct answer — with and without "eu", with "sim" in front where natural, both gender forms, natural word order. One slot at most per answer. No punctuation or accent variants (code ignores them).
- anticipated_wrong: 0 to 2 real mistakes (wrong person, Brazilian form, missing word); verdict "near_miss" for a small slip, else "wrong".
- s03 beats: difficulty "open" (no coach_tip). When the answer is a fixed phrase or a pattern with his own value (Bom dia, Queria um café, Chamo-me [NAME]), kind is "known" with accepted and anticipated_wrong, graded by code. Use kind "open" only when the answer is free (his opinion, his plan): then criterion = one English line of what it must contain; guard = [one lowercase word, the first word of the frame]. Both kinds have frame, word_bank (4–6), hint_note, why_note.
- alt_pt: the same question in other words; every accepted answer must still fit.

═══ 6. ASSESSMENT ═══
One task per SPEC assessment target that is true for him. line.pt = the question only, in Portuguese. line.ar = a short Egyptian scene + the question. Same answer fields as a guided beat, with nudge_note instead of hint_note. No coach_tip.

═══ 7. CLOSING HOOK ═══
One easy yes/no question from the s03 person about something NOT in the plan. closing_hook.speaker is that person's name.

═══ JSON SHAPE (exactly these keys, in this order) ═══
{
  "plan": [ { "beat": "b01", "scene": "s01", "speaker": "", "asks": "", "answer": "" } ],
  "intro_ar": "", "intro_arz": "",
  "character": { "name": "", "role_ar": "" },
  "grammar_card": { "rule_ar": "", "rule_arz": "", "examples": [ { "pt": "", "ar": "" }, { "pt": "", "ar": "" } ], "contrast_ar": "" },
  "scenes": [
    { "id": "s01", "title_ar": "", "words": [ { "pt": "", "ar": "", "arz": "", "emoji": "" } ] },
    { "id": "s02", "title_ar": "", "words": [ { "pt": "", "ar": "", "arz": "", "emoji": "" } ] },
    { "id": "s03", "title_ar": "", "words": [] }
  ],
  "beats": [
    { "id": "b01", "scene": "s01", "narration_ar": "", "speaker": "",
      "line": { "pt": "", "ar": "", "arz": "", "alt_pt": "", "alt_ar": "", "alt_arz": "" },
      "difficulty": "guided", "kind": "known",
      "coach_tip": { "ar": "", "arz": "" }, "reaction_cue": "", "frame": "",
      "line_explain": { "ar": "", "arz": "" },
      "word_bank": [ { "pt": "", "ar": "" } ],
      "accepted": [""], "anticipated_wrong": [],
      "hint_note": { "ar": "", "arz": "" }, "why_note": { "ar": "", "arz": "" } },
    { "id": "b04", "scene": "s02", "narration_ar": "", "speaker": "",
      "line": { "pt": "", "ar": "", "arz": "", "alt_pt": "", "alt_ar": "", "alt_arz": "" },
      "difficulty": "supported", "kind": "known",
      "coach_tip": { "ar": "", "arz": "" }, "reaction_cue": "", "frame": "",
      "line_explain": { "ar": "", "arz": "" },
      "word_bank": [ { "pt": "", "ar": "" } ],
      "accepted": [""], "anticipated_wrong": [],
      "hint_note": { "ar": "", "arz": "" }, "why_note": { "ar": "", "arz": "" } },
    { "id": "b07", "scene": "s03", "narration_ar": "", "speaker": "",
      "line": { "pt": "", "ar": "", "arz": "", "alt_pt": "", "alt_ar": "", "alt_arz": "" },
      "difficulty": "open", "kind": "known",
      "coach_tip": { "ar": "", "arz": "" }, "reaction_cue": "", "frame": "",
      "line_explain": { "ar": "", "arz": "" },
      "accepted": [""], "anticipated_wrong": [],
      "word_bank": [ { "pt": "", "ar": "" } ],
      "hint_note": { "ar": "", "arz": "" }, "why_note": { "ar": "", "arz": "" } }
  ],
  "closing_hook": { "speaker": "", "pt": "", "ar": "", "arz": "" },
  "assessment": [
    { "id": "a01", "target": "", "speaker": "assessment", "kind": "known",
      "line": { "pt": "", "ar": "", "arz": "" },
      "accepted": [""], "anticipated_wrong": [],
      "nudge_note": { "ar": "", "arz": "" }, "why_note": { "ar": "", "arz": "" } }
  ]
}
- beats follow the plan one-to-one, same ids, same order.
- narration_ar only on the first beat of each scene, else "". One short Egyptian stage direction; names written in Arabic letters (ريتا، كارلوس), never Latin. In s03 it says who arrives and why ("كارلوس زميل ريتا بيستلم الكاونتر"), never meta lines like "ماسمعش اللي فات".
- intro_ar sets the scene; the first narration must not repeat it (start from the next moment: "ريتا بتبصلك وبتبتسم").
- speaker: who says the line.

Before you answer, read your beats against your plan and LEARNER FACTS once. Then return only the JSON: no markdown, no comments, no trailing commas.
