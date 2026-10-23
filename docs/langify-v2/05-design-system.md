# 05 · Design system

## The reference

Match `design/reference/01-grammar-page-guided-SER-ESTAR.png`. Take the **layout and components** from it. Ignore its text: it's Spanish with English glosses, and its tab bar is wrong. For tokens beyond this file, `design/stitch-DESIGN.md` has Stitch's own notes.

What makes that screen right, and must carry to every content page:
- A centered top badge with the key words in big framed tiles (SER vs ESTAR).
- Content split into bordered columns or panels, each with a solid colored header strip.
- Rule rows: a square illustration tile, a numbered bold title and one short line.
- Example rows: a white rounded card, a target sentence with the key word as a colored chip, the Arabic meaning under it and a round speaker button.
- The active row has a pale-yellow fill with a 2px amber border. Rows not reached yet are at 20% opacity.
- A navy caption bar pinned above the tab bar during guided pages.

## Tokens

Colors live in one theme file and are referenced by role. Content JSON never carries colors; it carries `group`, and the theme maps group → color.

| Role | Value | Use |
|---|---|---|
| paper | #FBF7EE | App background (warm cream) |
| card | #FFFFFF | Cards, bubbles, example rows |
| ink | #12235A | Main text, borders, primary buttons, caption bar |
| ink-muted | #5C6B8A | Secondary text, pronunciation |
| rule | #E5DECE | Hairlines, ruled-paper lines |
| highlight-fill | #FFF3CF | Active row, coach sticky note, tips |
| highlight-border | #F2B33D | Active row border |
| success | #2E7D32 | Correct, graduated |
| attention | #E8A13A | Near-miss dot, the correction label (never red for learner mistakes) |
| danger | #BA1A1A | System errors only |

**Group → color**

| group | Color | Meaning |
|---|---|---|
| a | #1F3A93 (navy-blue) | First side of a comparison (SER, -ar column header when compared) |
| b | #2E7D32 (green) | Second side (ESTAR) |
| c | #E8772E (orange) | Third side |
| m | #2956C6 (blue) | Masculine (o) |
| f | #E0584F (coral) | Feminine (a) |
| verb | #12235A chip on #DCE1FF | The verb inside a sentence |
| prep | #E8772E | Prepositions and contractions |
| pron | #6B3FC0 | Pronouns |
| neg | #BA1A1A text on #FFDAD6 | Negation (não, nada, nunca) |
| neutral | ink | Everything else |

**Verb class colors** (endings and verb tiles): -ar #E8772E orange · -er #2956C6 blue · -ir #2E7D32 green · irregular #6B3FC0 purple with ⚡ · regular forms labeled "عادي" in ink-muted.

**Skill colors** (practice beats, step dots, result tiles): listening #0F8B8D teal · reading #6B3FC0 purple · speaking #12235A navy · writing #E8772E orange.

## Type

| Role | Font | Use |
|---|---|---|
| Display (Latin) | Barlow Condensed 700 | Big target-language words in title tiles and verb posters (SER, DORMIR) |
| Display (Arabic) | Lalezar | Arabic screen titles ("الكروت", "خلّصت المشهد") |
| Target text | Newsreader (serif) | Portuguese sentences and examples |
| Arabic UI and body | IBM Plex Sans Arabic | All Arabic text; one size step larger than Latin at the same level |
| UI Latin | Work Sans | Chips, labels, numbers |

Load the fonts with `next/font/google`. Every text node that can hold mixed languages renders through one **RichText** component. It takes `rt` segments, renders each segment as a span with its own `dir` (`rtl` for eg/ar, `ltr` for tl) and `unicode-bidi: isolate`, and applies `group` colors.

**In code:** define every token above as a CSS variable in `app/(v2)/v2.css` and expose it to Tailwind 4 with `@theme` (e.g. `--color-ink`, `--color-group-a`, `--color-skill-listening`). Components use the Tailwind classes or variables, never hex values.

## Shape and depth

- Radius: 16px for cards and panels, 12px for rows, full for chips and audio buttons.
- Borders: 1–1.5px; navy for primary frames, the `rule` color for inner dividers.
- No blurred shadows. If a lift is needed, use a hard offset (2px 2px 0 ink at 12% opacity).
- Spacing base is 4. Screen side gutter: 16.

## Direction

- The v2 layout sets `<html dir="rtl" lang="ar">`. Target-language text is always LTR, isolated per segment.
- The layout is mobile-first at a 390px design width; on wider screens the app column is centered with a max width of 480px on the paper background. It must have no horizontal scroll at 360px.
- Navigation mirrors in RTL: back arrow on the right, primary actions on the left side of rows.
- Never rely on string concatenation for mixed text. Use RichText.

## Core components (build once, reuse everywhere)

- RichText.
- AudioButton (normal and slow).
- Chip (group-colored).
- SkillChip.
- TitleBadge: the framed word tiles.
- Panel, with a colored header strip.
- RuleRow.
- ExampleRow.
- StickyNote (coach and tips).
- CaptionBar: tutor avatar, Egyptian line, waveform, pause, speed and chapter segments.
- ProgressDots, colored by skill.
- PrimaryButton (navy fill) and SecondaryButton (outline).
- TabBar: المسار · الكروت · المكتبة · أنا.

The 14 content blocks (`02`) are built from these components.

## Things the designs got wrong that must not be copied

- Spanish or English UI text, English screen titles ("Flashcard Review", "Quiz Session", "Study Page Reader"), and a phone status bar drawn inside the screen.
- More than one tab bar style. There is one tab bar: المسار · الكروت · المكتبة · أنا.
- An irregular `eu` form drawn in blue. It must be purple with ⚡.
- The caption bar covering the last content. Scroll content needs bottom padding equal to the caption bar height.
