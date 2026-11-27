# 19 · Image kinds and colour themes

Status: decided 2026-11-26. Author: Omar + Claude. Implementation: Cursor.

Read first: `00-decisions.md` §10. Where this document disagrees with §10 about word images, the lesson palette or the object template, **this document wins**.

No code in this document by design.

---

## 1. Why

Lesson word images all came out as the same café scene (a man and a barista at a counter), with the word itself small in a corner. Without the label you can't tell which word the picture is for, which also breaks «لاقي الصورة». Three things caused it:

- `STYLE_CORE` is added to every prompt, and it says the two main people look at each other and interact. So even object images get people.
- The object template asks for the object "in use in the lesson situation" and says "not an isolated sticker on empty cream".
- `IMAGE_FORBIDDEN` bans "isolated sticker characters with no setting" for every image.

The design references (`design/reference/` and the juice, sugar, glass and toast pictures from Stitch export 22) show the look we want for words: the thing alone, large, on white watercolour paper, with one sensory detail.

The second problem: one palette per lesson made every image in a lesson look the same. People scenes now rotate between the colour themes in `image-themes.json` (fourteen, including two extra daytime themes), image by image.

## 2. Image kinds

Every authored `image` in `content/v2/plan/pt-PT.core-items.json` now has `kind`:

| kind | used for | people | theme | ratio |
|---|---|---|---|---|
| `object` | concrete nouns, and nouns that can be shown as a thing (a bill → a saucer with a folded receipt) | none, not even hands | none | 1:1 |
| `action` | verbs (and later adjectives) | one cast member, or hands only | yes | 1:1 |
| `scene` | phrases, and words that only make sense in a moment (então) | two cast members interacting | yes | 4:3 (1:1 for a word card) |

If `kind` is missing: no characters → `object`; one character or a verb → `action`; two characters → `scene`.

## 3. Style per kind

Split the style block into a shared base and two add-ons.

- **Base (all kinds):** ink linework and soft watercolour washes on textured paper, adult realistic proportions where people appear, no text, no letters, no numbers, no logos, no flags, no speech bubbles, no watermark, not cartoonish, not 3D, not photorealistic.
- **Object add-on:** a single subject (or a small group of the same thing with its natural props) in the centre, filling about 55–65% of the frame, on clean white watercolour paper with a soft wash shadow under it and generous white space around it. Loose watercolour splashes in the subject's own colours are welcome. No people, no hands, no table scene, no room or background. Like a page from an illustrated food or object sketchbook.
- **Scene / action add-on:** today's people part of `STYLE_CORE` (lived-in generic setting, softer than the people, the two people look at each other), plus the theme line from §4.

`must_avoid` for objects: the usual forbidden list, plus people, hands, faces, background scenery, tabletop scenes, and any writing on packets, jars or labels. Remove "isolated sticker characters with no setting" from the object list only; it stays for scenes.

The template used when no authored prompt exists follows the same rules: the object template becomes the object add-on with the item's subject, and generated object specs never get a setting.

## 4. Colour themes

`content/v2/image-themes.json` holds the theme list (fourteen: twelve originals plus `denim_apricot` and `olive_lavender` for long daytime lessons), each with colours, light and the times of day it fits. For `scene` and `action` the final prompt adds one line built from the theme: "Colour theme: <colours>. Light: <light>."

Rules:
- No theme appears twice in the same lesson.
- Two images next to each other in the flow never share a theme.
- The theme must allow the moment's time of day (Boa noite only gets a theme that allows night).
- An authored `theme` is used as is. When it's missing, code picks one at random under these rules and **saves it on the spec**, so a regenerate keeps the same look.
- The old "one palette per lesson" rule is dropped for images. The lesson palette may still tint the lesson cover and the dictionary card.

## 5. Style references

- **Objects:** `content/v2/assets/style-anchor-object.png` (the orange juice picture). Upload it in admin as a second style anchor and attach it to every `object` call instead of the current anchor. The sugar picture is not used as an anchor because the word written on the bowl and the national symbols on the sachets would leak into other images.
- **Scenes and actions:** unchanged (the cast reference sheets; the current style anchor for `action` with hands only).

## 6. QA

- **object:** no people or hands, the subject fills at least half the frame, plain white background, no writing. The meaning check becomes stricter: "Without any label, would a learner say this picture shows <meaning>?"
- **scene / action:** unchanged, plus "the colours match the theme".

## 7. Content status

Days 1–6 have authored images for every word, verb and phrase. Days 1–2 kept their prompts and got `kind` and `theme`. Days 3–6 are new. The remaining days get prompts in batches after the pilot looks right.

**(2026-11-27) All of phase 1 (days 1–56) is authored:** every word, verb and phrase has an image (157 object, 44 action, 287 scene), and no lesson repeats a theme. Two daytime themes were added (`denim_apricot`, `olive_lavender`), so long daytime lessons don't run out of themes. How the hard items were handled:
- **No numbers or letters, even for numbers and time:** counting is shown with fingers, eggs and counters; clocks have tick marks only, with the hands at the right position; banknotes and coins are blank.
- **Days of the week:** a blank weekly planner with the day's column highlighted (Monday = first column), plus one small prop per day.
- **Pronouns, demonstratives, here/there:** pointing scenes where the distance or the person pointed at carries the meaning.
- **Opposites and comparatives** (caro · barato, novo · velho, mais · menos): two objects side by side.
- **Countries and nationalities:** a map with no names or flags, and people in an everyday moment. No landmarks.

## 8. Tasks

**I1 · Read the new fields**
- The authored-image reader keeps `kind` and `theme` instead of dropping them, with the defaults in §2.
- Done when: day 4 word.sugar loads as an object with no characters, and phrase.how_much_is_it as a scene with theme plum_ivory.

**I2 · Style split and object template**
- Base + object add-on + scene/action add-on as in §3, for both the authored path and the generated path. Object `must_avoid` as in §3.
- Done when: the built prompt for word.sugar contains nothing about people, settings or interaction.

**I3 · Themes**
- Load `image-themes.json`, add the theme line for scene and action, the random pick with the §4 rules when missing, saved on the spec.
- Tests: a lesson never gets the same theme twice; a night item never gets a day-only theme; regenerate keeps the saved theme.

**I4 · Object anchor and QA**
- Object calls attach the object anchor; QA rules from §6.

**I5 · Regenerate the pilot** (manual ops after I1–I4 land)
- From `/v2-admin` → الصور (or the day lesson images tab): regenerate all images for **days 1–6**. Keys stay the same; Cloudinary overwrite + invalidate refreshes URLs on lessons.
- Confirm object anchor is ready (`style_anchor_object` / `content/v2/assets/style-anchor-object.png`) before starting.
- Done when: Omar sees the day 4 vocab flow with the new word pictures and the phrases in seven different colour themes.
