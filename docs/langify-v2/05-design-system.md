# 05 · Design system

> **Changed 2026-10-27:** v2 now uses the **Warm Editorial** look from the Stitch export `stitch_bilingual_grammar_notebook_app_5`. It replaces the earlier navy "Editorial Notebook" look. The old references are kept for history in `design/archive-v4/`. Don't copy colors from there. Phases 0–2 already built the components with the old tokens, so the switch is a token swap plus a few component changes (see "Migration from v4" at the end).

## The references

- **Screens:** `design/reference/*.png`, numbered by screen (see `06`).
- **HTML:** `design/stitch-html/*.html`, the Stitch HTML for every screen. Use it to read structure and spacing. Don't copy it: it's Tailwind CDN, LTR-first and full of English labels.
  - Two screens exist only as HTML, because their PNG exports are broken: `04-compare-o-a.html` and `11-practice-conversation.html`.
- **Design notes:** `design/stitch-DESIGN.md` has Stitch's own notes ("Warm Editorial Learning Mobile Experience").
- **Main content page reference:** `01-content-page-possessives.png` (O MEU · A MINHA). It sets the visual style for every content page. `02-conjugation-endings.png` is the reference for verb pages.

What makes these screens right, and must carry to every content page:
- **Warm cream paper background.** Content sits on white cards with large radii and soft shadows. No heavy outlines.
- **Header group:**
  - a small pill label on top (القواعد · LIÇÃO DE GRAMÁTICA);
  - a big serif title in deep teal (O MEU · A MINHA, AR · -ER · -IR);
  - one Arabic subtitle line.
- **Panels and columns with solid colored header strips:**
  - AR coral, ER teal…;
  - masculine teal, feminine coral.
- **Pronoun chips row:** a selector pill row (eu · tu · ele/ela · nós · eles/elas). The active chip is filled deep teal.
- **Active row:** pale-yellow fill with a gold border (the `nós` row in `02`). Rows not reached yet are faded.
- **Deep-teal callout bar** for the key rule (✨ + one line + an ending chip).
- **Mustard note card** for tips: 💡 icon, cream-yellow fill and a gold left border.
- **Primary actions:** coral pill buttons with a soft warm shadow. Secondary actions are outlined pills.
- **Illustration tiles:** rounded corners, inside the card, with a small caption chip.

## Tokens

Colors live in one theme file and are referenced by role. Content JSON never carries colors. It carries `group`, and the theme maps group → color.

| Role | Value | Use |
|---|---|---|
| paper | #FFF8F2 | App background (warm cream) |
| paper-deep | #FEF2E1 | Section fills, segmented-control track, header pill |
| card | #FFFFFF | Cards, bubbles, example rows |
| line | #ECE1D0 | Hairlines and inner dividers |
| ink | #201B11 | Main text |
| ink-muted | #8C8C86 | Secondary text, pronunciation |
| primary | #14545A | Deep teal: titles, headers, active chips, the caption bar, dark hero cards |
| primary-strong | #003C41 | Pressed teal, text on teal-tint fills |
| primary-tint | #B2EDF3 / #E6F4F5 | Teal-tint fills (row bands, badges) |
| action | #F56D4E | Coral: primary buttons, progress, "current" markers |
| action-strong | #A9361D | Coral text on light fills |
| action-tint | #FFDAD2 | Coral-tint fills |
| note | #FEE263 | Mustard: active row fill (at 35%), tip cards, duration labels |
| note-border | #E1C64A | Active row border, tip card border |
| success | #1B5E20 | Correct, graduated |
| attention | #E8A13A | Near-miss dot, the correction label (never red for learner mistakes) |
| danger | #BA1A1A | System errors only |

**Group → color**

| group | Color | Meaning |
|---|---|---|
| a | primary #14545A | First side of a comparison (SER) |
| b | action-strong #A9361D | Second side (ESTAR) |
| c | #6E5E00 on note fill | Third side |
| m | primary #14545A | Masculine (o, um, o meu) |
| f | action-strong #A9361D | Feminine (a, uma, a minha) |
| verb | primary-strong on primary-tint chip | The verb inside a sentence |
| prep | #6E5E00 | Prepositions and contractions |
| pron | #6B3FC0 | Pronouns |
| neg | danger text on #FFDAD6 | Negation (não, nada, nunca) |
| neutral | ink | Everything else |

**Verb class colors** (column headers, endings, verb tiles):
- -ar = coral #F56D4E header, ending text #A9361D.
- -er = deep teal #14545A.
- -ir = gold: header #C4AA30, ending text #6E5E00.
  - **Not** a second teal. The Stitch screen uses #1E6670 for -IR, which is too close to -ER. Don't copy that.
- **Irregular** forms stay purple #6B3FC0 with ⚡. It's the only purple in the app, so irregular forms stand out. The Stitch flashcard back draws `durmo` in coral; that's wrong.
- Regular forms are labeled "عادي" in ink-muted.

**Skill colors** (practice step dots, result tiles): listening = primary teal · reading #6B3FC0 purple · speaking = action coral · writing = gold #C4AA30.

## Type

| Role | Font | Use |
|---|---|---|
| Display + target text | Newsreader (serif), 600–700 | Page titles (O MEU · A MINHA), big words (DORMIR, o queijo), Portuguese sentences |
| Arabic (all) | Noto Sans Arabic, 400–700 | All Arabic text, including Arabic screen titles at 700. One size step larger than Latin at the same level |
| UI Latin | Inter | Chips, labels, numbers, buttons |

Scale (from `stitch-DESIGN.md`):
- headline-lg 32/40
- headline-md 24/32
- headline-sm 18/24
- body-lg 15/22
- body-md 14/20
- label 12/16
- label-sm 10/14

Barlow Condensed, Lalezar, IBM Plex Sans Arabic and Work Sans from v4 are dropped.

Load the fonts with `next/font/google`. Every text node that can hold mixed languages renders through one **RichText** component. It takes `rt` segments and renders each segment as a span with:
- its own `dir`: `rtl` for eg/ar, `ltr` for tl;
- `unicode-bidi: isolate`;
- its `group` color.

**In code:** define every token above as a CSS variable in `app/(v2)/v2.css` and expose it to Tailwind 4 with `@theme` (e.g. `--color-primary`, `--color-action`, `--color-group-m`, `--color-skill-listening`). Components use the Tailwind classes or the variables, never hex values.

## Shape and depth

- **Radius:**
  - 20–24px for cards and panels;
  - 14px for rows and inputs;
  - full (999px) for chips, pills, audio buttons and primary buttons.
- **Borders:** none on most cards. Where a frame is needed, use 1px in `line`. The active row is the only thick border: 2px `note-border`.
- **Shadows:** soft and diffuse, `0 8px 24px rgba(32,50,50,0.08)` for cards and floating buttons. No hard offsets. This replaces the v4 rule.
- **Spacing:** base 8 with 4 micro-steps. Screen side gutter: 16.
- **Touch targets:** at least 44×44.

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

## Icons (added 2026-10-28)

- **One family:** Material Symbols Rounded, weight 400, fill 0 (fill 1 only for the active state), the same family as the Stitch HTML. No emoji in the UI (✨ 💡 ⚡ become icons). The only exception is the irregular-verb mark: it's the `bolt` icon in purple.
- **Sizes:** 20 inside chips and rows, 24 in buttons and headers.
- **Colors:** primary by default, white on teal or coral fills, ink-muted when disabled. Never black.
- **Audio button:**
  - one size, 40px, with a primary-tint fill (#E6F4F5) and a primary icon;
  - 32px only inside chips;
  - never a white circle on a white card.
- **Rule rows** use the icon given in content (`icon`, a Material Symbols name). Without one, they show the number in a 32px primary-tint circle. Never use the same generic placeholder icon on every row.
- **Image placeholders** use a small `image` icon (24) centered on a paper-deep block with the same radius as the real image. They never stand as a big icon tile next to text.

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
- **CalloutBar:** the deep-teal key-rule bar.
- **NoteCard:** the mustard tip card. It replaces StickyNote.
- **CaptionBar:** a deep-teal bar with the tutor avatar, the Egyptian line, a waveform, pause, speed and chapter segments.
- **ProgressDots**, colored by skill. **ProgressBar**: a thin coral bar.
- **PrimaryButton** (coral pill) and **SecondaryButton** (outlined pill). **HeroCard**: a deep-teal card with a coral button (the "١٥ كارت · ٣ دقايق" card).
- **TimelineStep:** a numbered marker, a title (Arabic + Portuguese italic), minutes and a status. It's used on the day map and the path.
- **TabBar:** المسار · الكروت · المكتبة · أنا. White bar, teal active icon, coral dot for "today".

The 14 content blocks (`02`) are built from these components.

## Images

The Stitch screens use warm painted editorial illustrations: a Lisbon tram, a grocery shop, a café table. The dictionary screen (`05b`) uses product photos. **These are placeholders only.** The image style stays as agreed (confirmed 2026-10-27): a friendly educational cartoon with adult proportions, dark outlines, flat warm colors and a cream background, from the image templates in `03` and `00` §10. Image generation is off for now. Until images exist, illustration tiles show a soft `paper-deep` block with an icon.

## Things the designs got wrong that must not be copied

- **English or brand text in the UI:**
  - "Grammar Lesson Reader · LANGIFY", "Interactive Practice Session", "Active Study Session", "Flashcard Review", "Flashcards";
  - "(Masculine)/(Feminine)";
  - "EDIÇÃO PORTUGAL · GUIA DE CONVERSAÇÃO · FALOU";
  - the brand name **"Falou"** in the onboarding.

  Titles are Arabic (and Portuguese where it is the lesson content). The app name is **Langify**.
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
   - Barlow Condensed and Lalezar → Newsreader / Noto Sans Arabic;
   - IBM Plex Sans Arabic → Noto Sans Arabic;
   - Work Sans → Inter.
3. Component changes:
   - PrimaryButton navy → coral pill;
   - StickyNote → NoteCard;
   - TitleBadge → TitleBlock;
   - CaptionBar navy → deep teal;
   - card radius 16 → 20–24;
   - hard-offset shadow → soft shadow.
4. Re-check `/v2-dev` and the Day 6 player against `01-content-page-possessives.png` and `02-conjugation-endings.png`.
