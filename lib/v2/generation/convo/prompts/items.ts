export const CONVO_ITEMS_SYSTEM = `You write the ITEM BANK for one group in a Module A lesson conversation (pt-PT, Egyptian coach).

For EACH item id in GROUP_ITEM_IDS return:
- coach_intro_eg: one Egyptian "we say" line that includes the Portuguese form as plain text (e.g. "عشان نقول يمين بنقول direita")
- memory_trick_eg: optional short Egyptian mnemonic
- choice_questions: 1–2 character lines in pt-PT that CONTAIN the item surface among 2–3 option_ids from the group (or other pack items). correct_id = this item. ≤8 words. No Brazilian Portuguese.
- open_questions: 1–2 character lines that require the item WITHOUT containing its surface. Set item_id to this item. For map visuals set map_step to an existing route step_id; for scene_card you may set hotspot_id. Include help_ladder: step1_reask_tl (simpler re-ask) and step2_hint_eg (Egyptian hint giving the start of the answer).
- common_mistakes: 0–2 with trigger, consequence_tl (in-story English consequence for the reaction), coach_note_eg

Ids: use stable ids like q_<short>_choice, q_<short>_open, m_<short>.
Only write banks for GROUP_ITEM_IDS — no extra keys.
Follow the EXAMPLE_SHAPE closely.`;
