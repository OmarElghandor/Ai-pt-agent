---
name: Legacy Partner UI
colors:
  surface: '#e5fff7'
  surface-dim: '#c1e1d8'
  surface-bright: '#e5fff7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#dbfaf2'
  surface-container: '#d5f5ec'
  surface-container-high: '#cfefe6'
  surface-container-highest: '#cae9e1'
  on-surface: '#02201b'
  on-surface-variant: '#424846'
  inverse-surface: '#193530'
  inverse-on-surface: '#d8f8ef'
  outline: '#727876'
  outline-variant: '#c1c8c5'
  surface-tint: '#4a635e'
  primary: '#000e0c'
  on-primary: '#ffffff'
  primary-container: '#0d2622'
  on-primary-container: '#758e89'
  inverse-primary: '#b1ccc6'
  secondary: '#006b5b'
  on-secondary: '#ffffff'
  secondary-container: '#71f9dd'
  on-secondary-container: '#007261'
  tertiary: '#1a0600'
  on-tertiary: '#ffffff'
  tertiary-container: '#3d1700'
  on-tertiary-container: '#d66c26'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cde8e2'
  primary-fixed-dim: '#b1ccc6'
  on-primary-fixed: '#061f1c'
  on-primary-fixed-variant: '#334b47'
  secondary-fixed: '#71f9dd'
  secondary-fixed-dim: '#50dcc1'
  on-secondary-fixed: '#00201a'
  on-secondary-fixed-variant: '#005144'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb68e'
  on-tertiary-fixed: '#331200'
  on-tertiary-fixed-variant: '#763300'
  background: '#e5fff7'
  on-background: '#02201b'
  surface-variant: '#cae9e1'
  surface-canvas: '#f8faf9'
  surface-canvas-subtle: '#f4f8f6'
  surface-card: '#ffffff'
  border-subtle: '#e2efea'
  pine-teal: '#14545a'
  mint-accent: '#3de0b5'
  mint-action: '#17b9a0'
  slate-muted: '#8a9996'
  tip-amber-surface: '#fef3c7'
  tip-amber-text: '#b45309'
typography:
  display-lg:
    fontFamily: IBM Plex Sans
    fontSize: 44px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: IBM Plex Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: IBM Plex Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: '0'
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.005em
  headline-sm:
    fontFamily: IBM Plex Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: IBM Plex Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2.5rem
  margin-mobile: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system establishes a tranquil, adult, and academically elevated language-learning interface. Centered on calm intellectual focus rather than frantic gamification, it combines high-end editorial clarity with organic botanical undertones. 

The aesthetic is clean modern minimalism enriched by soft mint tints, crisp structural borders, and deep forest typography. UI surfaces feel tangible and fresh—evoking premium tactile notebooks, archival botanical guides, and architectural spaces designed for uninterrupted deep work.

## Colors

The palette is anchored by deep pine greens, fresh mint action highlights, and warm, pale mint-tinted surfaces.

- **Canvas & Card Surfaces:** The foundational app background uses ultra-pale warm mint-tinted neutrals (`#f8faf9` and `#f4f8f6`). Interactive lesson tiles and content containers use pure white (`#ffffff`) to pop cleanly against the canvas.
- **Structural Outlines:** All borders and separators use `#e2efea`, providing a crisp, low-contrast boundary without heavy drop-shadows.
- **Primary Typography:** Deep pine teal (`#0d2622`) serves as the primary text color, delivering authoritative contrast and legibility without the harshness of pitch black. Sub-headings and active dark highlights utilize `#14545a`.
- **Primary Actions & Accents:** Vibrant mint hues (`#17b9a0` for interactive action buttons and focus indicators; `#3de0b5` for glowing highlights, active tab lines, and badges) signal progress and user agency.
- **Secondary & Muted Copy:** Captions, phonetic transcriptions, and secondary subtitles lean on soft sage-tinted slate (`#5c7972` and `#8a9996`).
- **Contextual Tips & Coach Notes:** Instructional tips, cultural insights, and grammatical coach alerts utilize a warm amber cream surface (`#fef3c7`) paired with a rich amber accent (`#b45309`).

## Typography

The design system uses **IBM Plex Sans** (paired with **IBM Plex Sans Arabic** for Arabic script elements) across all interface tiers. The letterforms feature clean modern contours with subtle soft transitions that match the rounded edge geometry of the system.

- **Arabic Script Considerations:** When displaying Arabic vocabulary, exercises, and phrases, always scale the font size by 15% to 20% relative to Latin text at the equivalent hierarchical tier to ensure vocalizations and diacritics (*tashkeel*) remain distinct and legible.
- **Line Heights:** Maintain an expanded line height (minimum 1.5x) for content blocks containing diacritics to avoid vertical clipping.
- **Hierarchy Tone:** Display and headline levels communicate stability and academic rigor using bold and semi-bold weights in deep pine (`#0d2622`), while body text preserves natural readability in regular weights.

## Layout & Spacing

The layout model uses a responsive fluid grid designed to keep focused study modules cleanly centered without horizontal clutter.

- **Desktop (1024px+):** Fluid 12-column system, max-width capped at 1280px. Outer margins sit at `2.5rem` (`margin`) with a column gutter of `1.5rem` (`gutter`). Multi-pane exercises (such as translation side-by-side or audio verification consoles) divide smoothly across 6-column splits.
- **Tablet (768px – 1023px):** 8-column layout with `1.5rem` margins and `1.25rem` gutters. Sidebars fold into tab bars or top-level switches.
- **Mobile (&lt;768px):** 4-column layout with `1.25rem` margins (`margin-mobile`) and `1rem` gutters (`gutter-mobile`). Action buttons and vocabulary response tiles span the full available width for thumb accessibility.

## Elevation & Depth

Visual hierarchy relies on crisp borders and soft tonal layering rather than heavy, murky drop shadows.

- **Canvas Foundation:** `#f8faf9` and `#f4f8f6` serve as resting canvas layers.
- **Surface Elevation (Cards, Panels):** Pure white (`#ffffff`) surfaces defined with a crisp, low-contrast outline (`1px solid #e2efea`). Elevated cards employ an ultra-subtle tinted ambient blur: `0 4px 20px -2px rgba(13, 38, 34, 0.04)`.
- **Floating Modals & Tooltips:** High-level interactive elements sit on `#ffffff` with a double boundary: a `1px` border of `#e2efea` accompanied by `0 12px 32px -4px rgba(13, 38, 34, 0.08)`.
- **Glowing Mint Accents:** Focused interactive items and successful completion milestones emit a soft, localized mint radiance (`box-shadow: 0 0 16px 2px rgba(61, 224, 181, 0.25)`).

## Shapes

The interface implements a balanced modern corner language (`roundedness: 2`).

- Base interactive inputs, button elements, and check containers use standard `0.5rem` (8px).
- Content cards, coach alert boxes, and lesson modules feature `1rem` (16px, `rounded-lg`).
- Modal sheets, dialog windows, and key study decks adopt `1.5rem` (24px, `rounded-xl`).
- Full pill radii (`9999px`) are reserved exclusively for vocabulary tokens, tag chips, audio player pills, and progress tracks.

## Components

### Buttons
- **Primary:** Filled in vibrant mint action `#17b9a0` with crisp deep pine `#0d2622` or white text. On hover, background shifts to `#3de0b5` with a subtle lift and mint glow (`0 4px 14px rgba(61, 224, 181, 0.3)`). Height: 44px (desktop), 48px (mobile). Corner radius: `0.5rem`.
- **Secondary / Subtle:** White `#ffffff` background with `1px` border in `#e2efea` and deep pine text `#0d2622`. On hover, border tightens to `#17b9a0` and background transitions to `#f4f8f6`.
- **Audio Replay Button:** Pill or circular control with `#f4f8f6` surface, `1px solid #e2efea`, and a `#14545a` icon. Active state pulses with a subtle `#3de0b5` ring.

### Chips & Vocabulary Selectors
- Unselected chips sit on `#ffffff` with a `1px solid #e2efea` border and `#5c7972` text.
- Selected or active chips fill with `#e2efea` or a mint wash, framed by a `1.5px` border in `#17b9a0`, and text rendered in `#0d2622` at `600` weight.

### Cards & Lesson Containers
- Constructed on clean `#ffffff` surfaces with a continuous `1px` border of `#e2efea` and `1rem` corner rounding.
- Exercises with audio examples include a 24px vertical internal rhythm, separating the prompt, pronunciation guide, and interactive answer bank cleanly.

### Form Inputs & Text Prompts
- Text fields utilize a `#ffffff` fill, `1px solid #e2efea` border, 48px height, and `0.5rem` radius.
- On focus, the border shifts to `#17b9a0` with an outer focus ring: `0 0 0 3px rgba(61, 224, 181, 0.2)`. Placeholder text rests at `#8a9996`.

### Checkboxes & Radio Selectors
- Standard size: 20px. Border: `1.5px solid #e2efea` over `#ffffff`.
- Active checked state: filled with `#17b9a0` displaying a pure white checkmark or centered radio dot.

### Contextual Tips & Coach Notes
- Enclosed modules with a soft amber-tinted cream background (`#fef3c7`), rounded to `1rem`, with a left-accent border (or right-accent for RTL layout) of `3px solid #b45309`.
- Typography within tips uses rich amber-brown `#b45309` for headings and `#0d2622` for descriptive commentary.