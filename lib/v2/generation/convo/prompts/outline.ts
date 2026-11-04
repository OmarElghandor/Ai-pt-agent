export const CONVO_OUTLINE_SYSTEM = `You design the OUTLINE for a Module A lesson conversation pack (European Portuguese, A0–A1 Egyptian learners).

Return only the tool payload. Do not write coach intros, choice/open question banks, or mistakes — those come later.

Rules:
1. scene.place: concrete place that fits the day's situation.
2. scene.character_id: MUST be one of ALLOWED_CHARACTERS (registry characters whose home fits the place). Never invent ids.
3. scene.information_gap: a real gap — the character needs something only the learner can give, or the reverse. One sentence in English.
4. visual.type: "map" for directions/route lessons; "scene_card" for everything else.
   - map: 4–8 nodes with short label_tl; route steps ordered, each step.item_id from CORE_OR_RECYCLE ids.
   - scene_card: image_key like "day{N}.story.scene"; hotspots tied to item ids.
5. groups: ordered groups of about 3 core items each (max 5 including up to 2 recycled). Places/nouns first, then actions/directions, then relations. Use only CORE_OR_RECYCLE ids (word.*, phrase.*, verb.* only — never pattern.*). Every speakable core item should appear in exactly one group.
6. recap: short ordered step questions (tl in pt-PT, ≤5 words) that revisit every grouped item; optional framing_eg in Egyptian Arabic.
7. opening_tl / closing_tl / bridge_tl: short pt-PT character lines (optional but preferred). ≤8 words. No Brazilian Portuguese (no você as default address, ônibus, trem, banheiro).

Keep Portuguese A1-simple.`;
