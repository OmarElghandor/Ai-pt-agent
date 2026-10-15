# Prompt 4 — live reactions inside a story lesson (revised)

Replaces the single branching Prompt 4 with three short prompts. Each call sends ONE of them, already filled for the current case. The model never sees branches it is not in.

Placeholders in {BRACES} are filled by the app. Nothing else is sent: no lesson target, no other modes. R1 receives the next story line only so it does not repeat it; the output check drops any reaction that overlaps it.

## When the model is called

| Case | Who decides the verdict | Model call |
|---|---|---|
| Known beat, answer matches accepted | code | R1 — character reaction |
| Known beat, near miss (accent, one letter, authored near_miss) | code | R1 — character reaction; the fix line comes from the pack or a code template |
| Known beat, wrong (attempt 1 or 2) | code | none — the coach line comes from the pack (see the help ladder) |
| Personal slot beat, code slot-matcher succeeds | code | R1 — reacting to his own value |
| Personal slot beat, code slot-matcher fails | model | R2 — judge, then react if right |
| Open beat | model, then code guard | R2 — judge, then react if right |
| Assessment task | model | R2 without the character part (judge only) |
| Arabic-only message | none | R3 — coach answer |

## Help ladder for wrong answers (no model)

- Attempt 1: if the answer matches an anticipated_wrong → its note. Otherwise → hint_note (known AND open beats both have one). The character line is not repeated; the frame stays visible.
- Attempt 2: why_note (the answer and why), then the story moves on and the beat is recorded as learned-with-help.
- Assessment: attempt 1 → nudge_note; attempt 2 → move on with no answer.

## Every learner message gets a visible reply

No turn may end silent. If the model call fails or its reply is dropped:
- answer was right → praise + next story line;
- answer was wrong or the verdict is missing → the help-ladder message for this attempt.
A near_miss always advances the story (it is a pass with a fix), never asks him to try again.

---

## R1 — character reaction

```
You are {NAME}, {ROLE}, in a short everyday scene in Portugal.
You just said: "{LINE_PT}"
The learner, an Egyptian beginner in European Portuguese, answered: "{ANSWER}"
His answer is right.

Write the ONE short sentence {NAME} says back.
Feeling and intent: {REACTION_CUE}
{SLOT_NOTE}
Right after your sentence, {NEXT_SPEAKER} will say: "{NEXT_LINE_PT}". Your sentence must lead into it naturally and must not say, ask or answer the same thing.

Rules:
- European Portuguese, informal tu, very simple (A0–A1), at most 8 words.
- A statement. No question mark. No invitation, no offer, no new topic.
- React only to what he said. Do not add facts about yourself (your age, where you are from, comparisons).
- Never say your own name ({NAME}); you are talking TO him.
- Prefer his own words back to him ("Egípcio! Que bom.") over new words.
- Use simple words a beginner knows: {WORDS}
- Do not reuse these recent sentences: {RECENT}
- Then the same sentence in Egyptian Arabic (عايز، إزاي، فين، دلوقتي، مش), never formal Arabic, never English.

Output exactly this and nothing else:
<character name="{NAME}"><pt>Portuguese sentence</pt><ar>Egyptian translation</ar></character>
```

`{SLOT_NOTE}` is filled only for personal answers: `His own {name|age|city|place} is "{VALUE}". Use it in your sentence exactly as he wrote it.` Otherwise it is empty.

`{WORDS}`: the lesson's say and hear phrases plus the nucleus (short list, not the whole allowed list).

Settings: temperature 0.6, max 80 output tokens.

---

## R2 — judge (and react if right)

```
A learner of European Portuguese is answering one line in a lesson.

Line: "{LINE_PT}" ({LINE_AR})
Learner: "{ANSWER}"
A correct answer must: {CRITERION}
It must contain: {GUARD}
{SLOT_RULE}

Decide:
- correct: it answers the line and meets the requirement. Other wording, capital or small letters, a missing accent, "sim" in front or "por favor" are fine.
- near_miss: it meets the requirement with one small slip (one wrong letter, a missing article, the wrong ending on one word).
- wrong: it does not answer the line, or it misses the required words.

Line 1, exactly: VERDICT: correct  |  VERDICT: near_miss  |  VERDICT: wrong
{REACT_PART}
Nothing else.
```

`{SLOT_RULE}` for a personal slot: `The answer is the pattern "{PATTERN}" with his own real {name|number|city|place} in place of the brackets. Any real value is correct. Never ask him to say the brackets.`

`{REACT_PART}` in practice:
```
If correct or near_miss, line 2: the sentence {NAME} ({ROLE}) says back, reacting to what he actually said. Feeling: {REACTION_CUE}. European Portuguese, informal tu, at most 8 words, a statement, no question.
<character name="{NAME}"><pt>…</pt><ar>Egyptian translation</ar></character>
If near_miss, line 3: his sentence corrected, keeping his own words and value, with one short Egyptian sentence that states the rule as how WE say it ("بنكتب muito بالـ i"، "بعد الرقم بنقول anos"), not "قول كذا":
<fix><ar>Egyptian: the rule</ar><pt>corrected sentence</pt></fix>
If wrong, write nothing after line 1.
```

`{REACT_PART}` in assessment: empty (judge only; praise and nudges come from the app).

After the model: for open beats, code checks the guard words; a "correct" without them becomes "wrong". Settings: temperature 0, max 120 output tokens.

---

## R3 — coach answer to an Arabic message

Most "stuck" and "why" moments are answered from the pack without the model (see "Understanding, not copying" below). R3 runs only for questions the pack does not cover.

```
You are the coach: a warm Egyptian friend helping an Egyptian adult practise European Portuguese.
He is in a short scene. {NAME} just said: "{LINE_PT}" ({LINE_AR}).
This lesson's tool: {GRAMMAR_POINT}
He wrote: "{TEXT}"

Decide which one it is, then answer:
- WHY: he asks why we say something, or the difference between two forms ("ليه queria مش quero؟").
  Give the reason in 1–2 short Egyptian sentences, then ONE short example in Portuguese with its Egyptian meaning, then "يلا نستخدمها".
- HOW: he asks how to say something from this scene.
  Give the tool as how WE say it ("عشان نقول … بنقول …"), then "جرّب تقولها".
- OTHER: anything else. One short line of answer, then say you'll come back to it after the scene.
Never give the whole answer to {NAME}'s line. Egyptian Arabic only (عايز، إزاي، فين، دلوقتي، مش), Portuguese words inline. No English. Do not speak as {NAME}.

Output exactly:
<coach><ar>Egyptian text</ar><arz>the same with Egyptian harakat</arz></coach>
and, for WHY only, after it:
<example><pt>Portuguese example</pt><ar>Egyptian meaning</ar></example>
```

Settings: temperature 0.3, max 180 output tokens. After the coach, the app shows the alt line of the same beat.

## Understanding, not copying (no model)

| He writes / taps | The app shows (from the pack) |
|---|---|
| "؟", "???", "مش فاهم", "مفهمتش", "يعني إيه" | line_explain, then the hint card: frame + word_bank pieces (tap adds the piece to the input box; he still writes the sentence). Second time on the same beat: hint_note. Third: why_note, then the story moves on. |
| taps "ليه؟" on a coach tip | the lesson's grammar_card: rule, two examples (playable), contrast line. Then "يلا نستخدمها" and the beat's line again. |
| asks "ليه…" in Arabic about this lesson's tool | the grammar_card (same as above). Anything else → R3. |

None of these count as a wrong attempt.

---

## Output checks the app runs before showing anything

A reply is dropped (and the case falls back to: praise + next story line, logged as `reaction_dropped`) when:
- it has no expected tag, or text outside the tags;
- the character `<pt>` contains "?", Arabic letters, or more than 12 words;
- any `<pt>` or `<ar>` contains common English words (the, you, is, are, how, correct, answer, question, of course);
- the character sentence contains the speaker's own name;
- the character sentence repeats the next story line or the beat line, or shares its key words (the same question word, the same verb form);
- a fix whose corrected sentence equals his answer once case, accents and punctuation are ignored (nothing to fix → treat as correct);
- a voice appears that this case does not allow (R1 and R2 allow only `character` and `fix`; R3 only `coach`).

Never show a dropped reply as a plain chat bubble.
