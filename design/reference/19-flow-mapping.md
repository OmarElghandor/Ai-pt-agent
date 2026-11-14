# Vocab flow designs (Stitch v14, mint) → existing code

Target: `components/v2/player/VocabFlowPlayer.tsx` + `lib/v2/vocabFlow/buildFlow.ts`. Rules: `00-decisions.md` §4 "One vocabulary flow" (navigation, real-world inside the flow, "من القصة" rule).

## Mapping

| Design | Slide in `buildFlow.ts` | Status in code | Work |
|---|---|---|---|
| 19a-flow-word | `item` (word) | exists | Restyle: 1:1 image card, serif tl with article color, say line, اسمع / بطيء pills, meaning box with "غطّي المعنى", chips (gender · plural). "من القصة" row only when the line adds context. |
| 19b-flow-phrase | `item` (phrase) + `phrase_in_use` row | exists | Restyle: 4:3 image with scrim + "جملة" badge, highlighted key word chip, one note line, story row at the bottom. |
| 19c-flow-real-world | **missing** (`item` with `real_world: true`) | not in flow | Add real-world items to the flow (placement rule in 00), tag chips "بيقولوها كده" + category, "إمتى تقولها" note, "+ ضيفها للكروت". |
| 19d-flow-check-image | `micro_check` · `pick_image` | exists | Restyle: "سؤال سريع" label, big speaker, 3 image cards, disabled "التالي", "تخطّى" link. |
| 19e-flow-check-right | `micro_check` answered right | exists | Teal border + "صح!" badge, others faded, one why line, "التالي" pulses once. |
| 19f-flow-check-wrong | `micro_check` answered wrong (`flashItemId`) | exists | Amber border + "مش دي", right one outlined "صح كانت دي", mini item card under the grid. |
| 19g-flow-check-text | `micro_check` · `choose_article`, `complete_phrase` | exists | Big o / a chips colored by gender; cloze stem with dashed gap and 3 chips. |
| 19h-flow-check-say | `micro_check` · `say_it` | exists (self-rate) | Cue + mic, then recording row vs model row + لسه / قريب / زيه بالظبط. |
| 19i-flow-tip | `tip` | exists | **No design yet** — use NoteCard on `--color-v2-note` with 2 example rows. |
| 19j-flow-breather | `breather` | exists | Ring "٦ من ١٢", playable chips, "كمّل". |
| 19k-flow-end | **missing** | not in flow | **No design yet** — add an end slide: summary line + up to 2 "watch" items (wrong first tries) + "كمّل للقاعدة". |
| Bottom bar (all) | — | partial (small round icon buttons) | Replace with fixed bottom bar: "التالي" wide filled (left in RTL), "السابق" outlined (right). |
| Step progress (all) | — | partial | Thin bar under the header with small dots at check positions; counter "٣ / ١٤" in Eastern digits. |

## Don't copy from the Stitch screens

- English chrome: "Vocabulary Lesson", "Listening Practice", "Quick Quiz", "QUIZ FEEDBACK", "Previous / Next". Header = close + "Dia N · الكلمات والجمل" pill only.
- IPA lines (/u kɐˈfɛ/). Only the Arabic-letter `say` line.
- Lisbon-specific images and badges ("Lisboa · Café", tram, calçada, "Café de Lisboa"). Images are generic (00 §10).
- Points / streak gamification (+15 نقطة, "استمرار التدريب"). No points in the flow.
- A mustard note on every card. At most one note per item card, and none on check slides except the why line.
- Broken image boxes with alt text, and the screenshot-inside-image artefact in 19f.
- Mixed counters ("14 / 3", "6 / 14"). Always "current / total" in Eastern digits.
- "تخطّى هذا السؤال مؤقتًا" → just "تخطّى".
- Discarded variants: `19a_word_card` / `19b_phrase_card` boards, `19k/19l/19m_o_pastel_de_nata`.
