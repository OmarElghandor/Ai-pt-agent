# 05 · Design system

> **Changed 2026-11-24:** v2 uses **Lumina White Theme v2** globally (path, lessons, cards, questions, talk, admin). Pure white canvas, botanical teal primary (`#0D9488`), emerald success/progress, restrained terracotta accents. Tokens live in `app/(v2)/v2.css` and `app/globals.css` `@theme`. Refs: `design/lumina/DESIGN.md` (authoritative palette and component notes). Review-chat measurements and extra roles: `18-review-chat-ui.md` §2. Layout structure may still follow older Stitch screens in `design/reference/`, but **do not copy Stitch hex when they disagree with Lumina**.
>
> **History:** Calm Kit (2026-11-09) and Warm Editorial (2026-10-27) are superseded. The navy Editorial Notebook (v4, `design/archive-v4/`) is archived. `.v2-free-talk` remains a layout hook that inherits the same shell tokens.

## The references

- **Lumina (visual source of truth):** `design/lumina/DESIGN.md`.
- **Review chat (layout + feedback):** `design/reference/review-chat/` (see `18-review-chat-ui.md` §1).
- **Screens (layout structure):** `design/reference/*.png`, numbered by screen (see `06`). Use for composition; recolor to Lumina.
- **HTML:** `design/stitch-html/*.html` — structure and spacing only. Don't copy colors or LTR English labels.
- **Learn map/session:** `design/onde-fica/` (recolor to Lumina).
- **Archived:** `design/calm-kit/`, `design/stitch-DESIGN.md` — history only.

What makes screens right under Lumina:
- **White canvas** (`#FFFFFF`). Cards and panels are white with a visible `1px` border in `#D5DEDA`, not tinted-on-tinted without separation.
- **Secondary regions** (`#F2F5F4`), nested panels (`#E8EDEC` / `#F7F9F8`), selected rows (`#D8F2EE`).
- **Primary actions:** teal pill, white label. Secondary: `#E8EDEC` + ink. Progress: teal fill on `#E1E7E4` track.
- **Learner mistakes:** amber warning tokens — never red (red is system errors only).
- **Icons:** Material Symbols, outline by default; fill only when active; teal when active on chrome.

## Tokens

Colors live in one theme file and are referenced by role. Content JSON never carries colors. It carries `group`, and the theme maps group → color. Full Lumina surface scale: `design/lumina/DESIGN.md`.

| Role | Value | Use |
|---|---|---|
| paper | #FFFFFF | App background (white canvas) |
| panel / surface | #F2F5F4 | Sidebars, secondary regions |
| card | #FFFFFF | Cards, bubbles (border `line`) |
| input | #F7F9F8 | Fields (border #C8D2CD) |
| nested | #E8EDEC | Nested panels, secondary buttons |
| paper-deep | #F2F5F4 | Tracks, section fills (alias of panel) |
| line | #D5DEDA | Standard borders |
| divider | #E1E7E4 | Subtle separators, progress track |
| ink | #202927 | Main text, titles |
| ink-muted | #5F6B67 | Secondary text |
| meta | #737877 | Low-priority metadata |
| primary | #0D9488 | Teal: CTA, links, active nav, progress fill |
| primary-strong | #075E57 | Text on soft teal fills |
| primary-tint | #D8F2EE | Selected chips, active row wash |
| action | #0D9488 | Primary buttons (alias of primary) |
| action-strong | #075E57 | Strong teal text |
| action-tint | #D8F2EE | Soft action wash |
| success | #0FA87E | Correct, completion (panel #DDF5EB, text #075E47) |
| attention / warning | #B7791F on #F9EACB, text #70450B | Near-miss / learner correction |
| note (grammar) | #F8E2D9, border #EFC5B5, text #78391F | Grammar note inside feedback |
| danger | #C62828 | System errors only |
| waveform | #0FA87E on #DDF5EB | Audio meters |
| focus ring | rgba(13,148,136,0.16) | 3px focus ring |

**Group → color** (botanical Lumina; keep roles distinct)

| group | Color | Meaning |
|---|---|---|
| a | #075E57 | First side of a comparison (SER) |
| b | #C36D4B | Second side (ESTAR) |
| c | #0B8064 | Third side |
| m | #075E57 | Masculine |
| f | #C36D4B | Feminine |
| verb | #075E57 on #DDF5EB | The verb inside a sentence |
| prep | #006C4F | Prepositions and contractions |
| pron | #5F6B67 | Pronouns (muted) |
| neg | danger text on #FFDAD6 | Negation |
| neutral | ink | Everything else |

**Verb class colors** (column headers, endings, verb tiles):
- -ar = #C36D4B header / #78391F text.
- -er = #075E57.
- -ir = #0FA87E / #075E47.
- **Irregular** forms stay muted `#5F6B67` with the `bolt` icon.
- Regular forms are labeled "عادي" in ink-muted.

**Skill colors:** listening `#0D9488` · reading `#5F6B67` · speaking `#0FA87E` · writing `#C36D4B`.

## Type

| Role | Font | Use |
|---|---|---|
| Headings + labels | IBM Plex Sans, 600–700 | Page titles, chips, UI chrome |
| Arabic (all) | IBM Plex Sans Arabic, 400–700 | All Arabic text (line-height ≥ 1.4×) |
| Portuguese + UI body | Inter, 400–500 | Target-language sentences, body, numbers |

Scale (from `design/lumina/DESIGN.md`):
- display-lg-mobile 32/40
- headline-md 24/32
- headline-sm 20/28
- body-md 16/24
- body-sm 14/20
- label-md 12/16

Newsreader, Manrope, Noto Sans Arabic and Barlow Condensed from older passes are dropped for new work.

Load the fonts with `next/font` (or local). Every text node that can hold mixed languages renders through one **RichText** component. It takes `rt` segments and renders each segment as a span with:
- its own `dir`: `rtl` for eg/ar, `ltr` for tl;
- `unicode-bidi: isolate`;
- its `group` color.

**In code:** define every token above as a CSS variable in `app/(v2)/v2.css` and expose it to Tailwind 4 with `@theme` (e.g. `--color-primary`, `--color-action`, `--color-group-m`, `--color-skill-listening`). Components use the Tailwind classes or the variables, never hex values.

## Shape and depth

- **Radius:**
  - 8px for controls, inputs, buttons;
  - 16px for cards, bubbles, panels;
  - 24px for sheets and modals;
  - full (9999px) for pills, chips, progress ends.
- **Borders:** white cards on white canvas need `1px` `line`. Selected state: `primary` border on `primary-tint` fill.
- **Shadows:** `0 8px 24px -4px rgba(23,31,29,0.05)` for cards; `0 12px 32px -8px rgba(23,31,29,0.10)` for popovers. Depth comes from borders and surface contrast first.
- **Spacing:** base 8 with 4 micro-steps. Screen side gutter: 16 (mobile 1.25rem per Lumina).
- **Touch targets:** at least 44×44 (48px on mobile primary actions).

## Spacing rules (added 2026-10-28)

One scale, used everywhere: 4 · 8 · 12 · 16 · 24 · 32.

| Where | Value |
|---|---|
| Screen side gutter | 16 |
| Space between blocks on a page | 24 |
| Space between a section label and its content | 8 |
| Gap between cards or columns in a row | 12 |
| Card and panel inner padding | 16 (12 for compact cards like word cards) |
| Row inner padding | 12 vertical, 16 horizontal |
| Space between a title and its subtitle | 4 |

- **No double gutters.** A page never sits inside another padded card. The content width at 390px is 358px (390 − 2×16).
- **Columns hug their content.** Compare columns don't stretch to equal height when one side is much shorter; they align to the top.
- **Header strips are full width.** A table header strip covers every column, including the row-label column.
- **Fixed bars float.** The CaptionBar is pinned to the bottom of the viewport, 16 from the sides and 12 from the bottom, never inside the page flow. The page gets bottom padding equal to its height + 24.

## Images: fixed sizes (added 2026-10-28)

Every image slot has a fixed aspect ratio. The image fills it with `object-fit: cover`, and the placeholder has the exact same box, so the layout never jumps when images arrive.

| Slot | Ratio | Width | Radius |
|---|---|---|---|
| Word card thumbnail, dictionary grid, quiz picture | 1:1 | fills its grid cell | 16 |
| Flashcard back illustration | 4:3 | card width minus padding, max 280px tall | 20 |
| Rule-row / example tile | 1:1 | 56px | 14 |
| Deck row thumbnail | 1:1 | 64px | 14 |
| Deck detail cover, day map cover, story panel | 16:9 | full content width | 20 |
| Character avatar | 1:1 | 32 / 40 / 56 | full |

Image generation uses the same ratios: 1024×1024 for 1:1, 1536×1152 for 4:3, 1536×864 for 16:9. A slot of one ratio never shows an image of another.

## Icons (updated 2026-11-09 · Calm Kit)

- **One family:** Material Symbols Rounded, weight 400, **outline by default** (`FILL` 0); `FILL` 1 only when active/selected. No emoji in the UI (✨ 💡 ⚡ become icons). Irregular-verb mark: `bolt` in muted purple.
- **Glassy chrome:** sticky headers and the TabBar use soft ivory/surface + `backdrop-blur`; icon buttons sit in round discs with mist wash; active tab may use a sage filled disc with white icon + a small sage indicator dot.
- **Sizes:** 20 inside chips and rows, 24 in buttons and headers.
- **Colors:** ink for inactive outline icons, sage when active, white on sage fills, ink-muted when disabled. Never pure black.
- **Audio button:** 40px mist/primary-tint disc with sage icon; 32px inside chips.
- **Rule rows** use the icon given in content (`icon`, a Material Symbols name). Without one, they show the number in a 32px mist circle.
- **Image placeholders** use a small `image` icon (24) centered on a mist/paper-deep block with the same radius as the real image.

## Direction

- The v2 layout sets `<html dir="rtl" lang="ar">`. Target-language text is always LTR and isolated per segment.
- **Bidi bugs in the Stitch screens. Don't copy them:**
  - Portuguese punctuation is flipped ("!Bom dia", "?Quanto é", "...Queria um café").
  - Endings show the hyphen on the wrong side ("o-", "AR-" instead of "-o", "-ar").
  - Both bugs disappear when every tl string goes through RichText as one isolated LTR segment. Endings are tl segments too.
- The layout is mobile-first at a 390px design width. On wider screens the app column is centered with a max width of 480px on the paper background. No horizontal scroll at 360px.
- Navigation mirrors in RTL: back arrow on the right, primary actions on the left side of rows.
- Never rely on string concatenation for mixed text. Use RichText.

## Core components (build once, reuse everywhere)

- **RichText.**
- **AudioButton**, normal and slow: a round white button with a teal speaker icon. Slow uses the turtle.
- **Chip**, group-colored. **PersonChips**: the pronoun selector row.
- **SkillChip.**
- **TitleBlock:** the pill label, the serif title and the Arabic subtitle. It replaces v4's TitleBadge tiles.
- **Panel**, with a solid colored header strip (class or gender color).
- **RuleRow**, **ExampleRow** (white card, sentence with the key word colored, Arabic under it, speaker).
- **CalloutBar:** the sage key-rule bar.
- **NoteCard:** the sand tip / coach card. It replaces StickyNote.
- **CaptionBar:** a sage bar with the tutor avatar, the Egyptian line, a waveform, pause, speed and chapter segments.
- **ProgressDots**, colored by skill. **ProgressBar**: sage fill on a mist track (pill).
- **PrimaryButton** (sage pill, optional trailing arrow) and **SecondaryButton** (surface + thin border). **HeroCard**: sage card with a sage CTA.
- **TimelineStep:** a numbered marker, a title (Arabic + Portuguese italic), minutes and a status. It's used on the day map and the path.
- **TabBar:** المسار · الكروت · المكتبة · أنا. Glassy ivory bar, sage active disc + indicator dot.
- **ItemViewer** (added 2026-10-30; replaces the CardCarousel on static pages; reference `design/stitch-html/05d-item-viewer.html`). Every static page with `cards` blocks (dictionary, phrases) shows **one word or phrase per screen**, full screen, without the tab bar.
  - **Top ~55% (hero):** the item's picture as a cover image (an ImageSlot until images exist), with a dark gradient at the top and bottom. Overlaid on it:
    - a back button;
    - a pill with "DIA N · title_tl" and the page title;
    - a "نمط الحفظ" toggle (memory mode: hides meanings and example translations);
    - a location chip (`situation_eg`);
    - prev/next round arrows on the sides, with "٣ من ٨ · <category>" between them;
    - a floating context card at the bottom of the hero: for phrases, "امتى تقولها" + `context_eg`; for words, the category and the article rule ("اسم مذكر · بتقول o قبلها"), with a coral play button.
  - **Bottom sheet** (white, rounded top, overlapping the hero by 16px, with a grab handle):
    - the target text in big serif, article colored, with a slow-audio button;
    - the code `say` line plus the gender word;
    - the "المعنى" card with إخفاء/إظهار, and a veil "المس عشان تشوف المعنى" when hidden;
    - the example card. It prefers the **story line** that uses the item ("من القصة" + the speaker), then a bank phrase that contains it. Its translation hides in memory mode;
    - dots;
    - the bottom nav: السابق · "الصفحة n من N" · coral التالي.
  - **Navigation:** swipe on the hero, the arrows, or the dots. التالي on the last item goes to the next page (after the last detail page, to "القصة تاني").
  - **The page's tip blocks** become one closing slide (a NoteCard) after the last item.
  - Memory mode defaults to on when the page's `cover` is `meaning`.
  - **Don't copy from the Stitch file:**
    - the IPA line;
    - "CAPÍTULO 1 · LIÇÃO 2" (use DIA N);
    - "Pág. 3 de 6" (use Arabic);
    - "Café Nicola" (use `situation_eg`);
    - the bookmark (no feature behind it yet);
    - the emoji;
    - the FALOU footer.
- **CardCarousel:** retired with guided mode (2026-10-31). Cards blocks open the ItemViewer.
- **SectionsPage** (2026-10-31), for grammar pages:
  - **Explain:** the main block (a FormulaStrip, compare table or conjugation table), then a NoteCard with the Egyptian explanation and a small speaker/pause chip. TTS plays once on open.
  - **Examples toggle:** a full-width outline pill "الأمثلة" with a chevron. It expands in place, with a 200ms height ease, to the examples list. Each example is a row with a speaker button and the TL line in its group colors. The Arabic sits under it in grey.
  - **Check:** a small header "فهمت؟" and 2–3 compact MCQ cards with chips. Right is a teal check; wrong is a coral underline plus the why line. Spacing uses the s-6 gap between parts.
- **StoryPlayer** (added 2026-10-29; reference `design/stitch-html/14b-story-player.html`). It renders every `story` page with a `dialogue` block. This is the interactive part of the day.
  - **Layout:** full screen, no tab bar.
    - **Top ~70%:** the scene (a 16:9 ImageSlot stretched as a cover image, with a dark gradient at the top and bottom).
    - **Overlaid top bar:** glass round buttons for back, meaning on/off and the transcript, plus "Dia N · title".
    - **Location chip:** shows `situation_eg`.
    - **Speech bubbles:** the current line and the previous one. Bubbles are white with a tail. The character's bubble sits on the left (RTL end) with a teal ring; the learner's sits on the right with a coral ring. The older bubble is faded.
  - **Controller** (bottom, cream, rounded top):
    - **Speaker row:** "ريتا بتتكلم" / "إنت بتقول" and "إعادة الجملة".
    - **Focus sentence:** big serif. The word being spoken is highlighted in coral (karaoke from TTS word timings, or an even split when there are none), and the item words are underlined.
    - **Under the sentence:** the code `say` line, the meaning, and the step's tip as a NoteCard ("coach").
    - **Progress:** "جملة n من N" with a teal→coral bar.
    - **Controls:** speed (0.75 / 1 / 1.25), previous, a big coral play/pause, next, repeat-one, and the transcript sheet.
  - **Interaction (changed 2026-10-31; test mode removed 2026-11-01):** the story **never stops to ask anything**.
    - Every line plays by itself, the learner's included, one after another. The controls only pause, step or repeat.
    - A tap on a line shows its meaning.
    - The coach NoteCard is not shown.
  - **End:** "خلّصت القصة · فتحت معنى n جمل", plus next page and "من الأول".
  - **Don't copy from the Stitch file:**
    - the IPA line;
    - "تم النطق";
    - "Áudio Completo · Fala Natural";
    - the English level labels;
    - the name "ياسين" (the learner is "أنت");
    - a 10-second seek (lines are the unit, not seconds).

The 14 content blocks (`02`) are built from these components.

## Images

The Stitch screens use warm painted editorial illustrations: a Lisbon tram, a grocery shop, a café table. The dictionary screen (`05b`) uses product photos. **These are placeholders only.** The image style stays as agreed (confirmed 2026-10-27): a friendly educational cartoon with adult proportions, dark outlines, flat warm colors and a cream background, from the image templates in `03` and `00` §10. Image generation is off for now. Until images exist, illustration tiles show a soft `paper-deep` block with an icon.

## Things the designs got wrong that must not be copied

- **English or brand text in the UI:**
  - "Grammar Lesson Reader · LANGIFY", "Interactive Practice Session", "Active Study Session", "Flashcard Review", "Flashcards";
  - "(Masculine)/(Feminine)";
  - "EDIÇÃO PORTUGAL · GUIA DE CONVERSAÇÃO · FALOU";
  - the brand name **"Falou"** in the onboarding.

  Titles are Arabic (and Portuguese where it is the lesson content). The app name is **A-Z Talkie**.
- **More than one header or tab bar style.** There is one tab bar: المسار · الكروت · المكتبة · أنا.
- **`04-compare-o-a.html` uses Stitch's blue "My Design System"** (#005CB8). Take its layout only. Its colors are wrong. The blue design system file is not part of the pack.
- **-IR in a second teal.** Use gold.
- **Irregular forms in coral.** Use purple with ⚡.
- **Flipped punctuation and hyphens** (see Direction).
- **The caption bar covering the last content.** Scroll content needs bottom padding equal to the caption bar height.

## Migration from v4 (for code already built in Phases 0–2)

1. Swap the token values in `app/(v2)/v2.css` to the tables above, keeping the variable names where the role is the same:
   - ink → primary for titles and headers;
   - add the action, note and line tokens.
2. Replace the fonts:
   - Newsreader / Manrope / Noto Sans Arabic → IBM Plex Sans / IBM Plex Sans Arabic / Inter.
3. Component changes:
   - PrimaryButton navy → coral pill;
   - StickyNote → NoteCard;
   - TitleBadge → TitleBlock;
   - CaptionBar navy → deep teal;
   - card radius 16 → 20–24;
   - hard-offset shadow → soft shadow.
4. Re-check `/v2-dev` and the Day 6 player against `01-content-page-possessives.png` and `02-conjugation-endings.png`.
