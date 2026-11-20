# 14c · Library design references and fixes

Status: 2026-11-14. Companion to `14-library.md`. Where this file disagrees with `14` (player, notes), **this file wins**; task L0 copies the notes decision (§2) into `00`.

Source: Stitch export `stitch_bilingual_grammar_notebook_app_15`. Copy it to `design/reference/library/`. Colors follow the "Stitch mint" theme (`app/(v2)/v2.css` and `app/globals.css` `@theme`), not Calm Kit.

---

## 1. Screens

| Ref | Stitch folder | Screen |
|---|---|---|
| L-home | `stitch_mint` | Library home |
| L-story | `a_farm_cia_2` | Story player |
| L-podcast | root (`screen.png`) | Podcast player |
| L-word | `d_i` | Word sheet |
| L-end | `a_farm_cia_1` (html only) | End of episode |
| L-deck | missing | "من المكتبة" deck: build from the custom-deck detail screen of `12` |

Images in the export are placeholders; real images come from the pipeline.

## 2. Decision: language notes and extra content (2026-11-14)

- **The goal of the library is real exposure, not a controlled lesson.** Sentences, words and facts outside the curriculum and outside the 1000-word list are welcome, as long as the level's rough targets (`14` §2.4) hold.
- **Language notes are kept** (the note cards in L-story and L-podcast): short Egyptian notes between lines about how people really use something, or a small cultural fact. For example: why "se faz favor" is used at the counter, that "Diga" isn't rude.
  - Generated in the same script call as the field `notes`: each note has `after_line` (index), `eg` (1–2 sentences, Egyptian, mixed text as `rt` with the TL words marked), and an optional `focus` (the TL words it's about; tapping them opens the word sheet).
  - **0–3 per episode.** Notes never interrupt playback: they sit in the transcript and the audio keeps going.
  - **Pt-PT vs Brazilian comparisons are not a priority.** The prompt doesn't ask for them, and no note type, check or UI is built around them.
  - Checks (warnings only): `after_line` exists, the note isn't empty, at most 3, any `focus` word appears in the line before it.
  - **Color:** the note surface `#defaf3` with the `#bcc9c6` hairline, **not** the gold attention color, which stays for corrections. The lightbulb icon stays.
- The pt-PT checks of `14` §2.6 stay (they're cheap); they're never a reason to drop otherwise good content.

## 3. Fixes for Cursor (build from the refs with these changes)

**Everywhere**
- No CEFR labels (A1.1, A1.2, A2). Only our level labels: سهل جداً · سهل · متوسط · أصعب شوية · صعب.
- No place badges or real-city captions ("LISBOA · ALFAMA", "لشبونة القديمة"). Scene captions, if any, are generic ("صيدلية", "مكالمة").

**L-home**
- As designed: search, type tabs, level chips, "كمّل من حيث وقفت" card, sections per level with "عرض الكل (N)", tiles with ✓ or play, bottom nav (المسار · الكروت · المكتبة · أنا).
- The demo data puts the landlord call under سهل; the real order comes from the episodes.

**L-story**
- Header title is the episode title (e.g. "الصيدلية"), not "Player".
- Keep the "now speaking" caption card over the scene image (speaker, live line with the current word highlighted, time). Its Arabic line shows only when "اظهر المعنى كله" is on.
- Bubbles as designed: the other speaker right with avatar, the learner left in the tint color; each bubble has play and "المعنى".
- Bottom player: play/pause, back **5 s** (not 10), speed, **"كرر الجملة"** (loop), and a time track (elapsed / total), not "المقطع ١ / ٤".
- Language notes between bubbles (§2), in the note color.

**L-podcast**
- One type/level label in the header, not two.
- Remove the mic and "جاري الاستماع" from the learner's line; the library is listening only. The current line is marked by the highlight alone.
- Upcoming lines are faded and never show their meaning before they're played.
- Replace "توضيح" with "كرر الجملة" (or remove it).
- Keep the timestamps per line, the share and bookmark icons, and the "إخفاء الترجمة / اظهر الترجمة" toggle (same setting as "اظهر المعنى كله").

**L-word**
- Keep the layout: word, lemma arrow, `say` pill, meaning, tense chip, sound button, the episode sentence card with play, the add button and the "في كروتك ✓" state.
- Remove "فعل مجوف" (an Arabic grammar term that doesn't apply) and the level chip; keep "المصدر الأصلي: doer".
- The after-adding line says "هتلاقيها في ديك «من المكتبة»", not "مراجعة كروت اليوم" (library cards are never in the daily deck, `14` §2.10).

**L-end**
- As designed: title, saved-word count, "جمل هتحتاجها" with play and "ضيفها", the optional collapsed "فهمت إيه؟ · ٣ أسئلة" with "تخطي", "الحلقة الجاية" and "اسمعها تاني". No scores.
