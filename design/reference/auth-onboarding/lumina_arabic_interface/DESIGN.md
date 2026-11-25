---
name: Lumina Arabic Interface
colors:
  surface: '#F2F5F4'
  surface-dim: '#d6dbda'
  surface-bright: '#f6faf9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f4f3'
  surface-container: '#eaefed'
  surface-container-high: '#e5e9e8'
  surface-container-highest: '#dfe3e2'
  on-surface: '#202927'
  on-surface-variant: '#5F6B67'
  inverse-surface: '#2c3131'
  inverse-on-surface: '#edf2f0'
  outline: '#6d7a77'
  outline-variant: '#D5DEDA'
  surface-tint: '#006a61'
  primary: '#00685f'
  on-primary: '#ffffff'
  primary-container: '#008378'
  on-primary-container: '#f4fffc'
  inverse-primary: '#6bd8cb'
  secondary: '#006c4f'
  on-secondary: '#ffffff'
  secondary-container: '#78f6c7'
  on-secondary-container: '#007153'
  tertiary: '#924628'
  on-tertiary: '#ffffff'
  tertiary-container: '#b05e3d'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#89f5e7'
  primary-fixed-dim: '#6bd8cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#7bf9ca'
  secondary-fixed-dim: '#5cdcae'
  on-secondary-fixed: '#002116'
  on-secondary-fixed-variant: '#00513b'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb59a'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#773215'
  background: '#FFFFFF'
  on-background: '#181d1c'
  surface-variant: '#dfe3e2'
typography:
  display-lg:
    fontFamily: IBM Plex Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
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
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: IBM Plex Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
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
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes an airy, focused, and culturally distinguished environment for immersive language learning. The visual direction combines contemporary editorial clarity with botanical minimalism. The interface should feel calm, precise, and premium rather than playful or overly gamified.

The updated palette uses a pure white page canvas with soft cool-neutral surfaces for panels and cards. Botanical teal and emerald remain the primary brand colors. A restrained terracotta accent adds warmth and creates a clear secondary visual signal, while neutral gray supports utility elements without competing with the brand colors.

## Colors

### 1. White canvas and layered surfaces

The page background must be pure white (`#FFFFFF`). Do not tint the entire application background green.

Use subtle neutral surfaces to create separation:
- **Main page canvas:** `#FFFFFF`.
- **Cards and primary content panels:** `#FFFFFF`, separated from the canvas by a visible `1px` border in `#D5DEDA`.
- **Sidebar and secondary regions:** `#F2F5F4`.
- **Nested panels and input backgrounds:** `#E8EDEC` or `#F7F9F8`.
- **Selected rows and active navigation:** `#D8F2EE`.

Never place a white card directly on a white background without a visible boundary, spacing, or a tinted parent surface. Avoid using the same white value for every layer without a separation cue.

### 2. Brand colors

- **Primary teal (`#0D9488`):** Main calls to action, primary buttons, active navigation icons, links, and key interactive states.
- **Secondary emerald (`#0FA87E`):** Progress indicators, completion states, positive feedback, and supporting actions.
- **Tertiary terracotta (`#C36D4B`):** Occasional warm highlights, secondary emphasis, edit actions, and non-critical category markers. Use sparingly; it must not compete with primary teal.
- **Neutral gray (`#737877`):** Neutral labels, utility icons, disabled-adjacent information, and low-priority controls. Do not use it for essential text when a darker text color is needed.

### 3. Text hierarchy

- **Primary text:** `#202927` for headings, body copy, and important labels.
- **Secondary text:** `#5F6B67` for descriptions, metadata, and supporting information.
- **Muted text:** `#737877` for low-priority metadata only.
- **Text on filled brand buttons:** White (`#FFFFFF`).
- **Text on pale colored containers:** Use the corresponding dark `on-*` token, never white.

### 4. Borders and dividers

Use `#D5DEDA` for standard borders and `#E1E7E4` for subtle separators. Borders should be visible enough to distinguish white surfaces without creating a heavy boxed-in appearance.

## Typography

The typographic system uses IBM Plex Sans for headings, labels, and bilingual headers. Inter is used for Latin body text to maintain a neutral, readable cadence, with Newsreader serif reserved for European Portuguese examples.

For Arabic script:
- Pair IBM Plex Sans with IBM Plex Sans Arabic.
- Maintain a minimum line-height multiplier of `1.4x` for Arabic text to prevent diacritic clipping.
- Arabic vocabulary and phonetics should be approximately 15–20% larger than Latin text at the same semantic hierarchy.
- Keep Arabic and Portuguese text visually balanced when displayed together.

## Layout & Spacing

Use a fluid 12-column grid on desktop, scaling to 6 columns on tablet and 4 columns on mobile. Cap the main content width at `1280px`.

- **Desktop (1024px+):** `2.5rem` outer margins and `1.5rem` gutters. Use two- or three-column layouts for lesson decks and practice consoles.
- **Tablet (768px–1023px):** `1.5rem` margins. Collapse sidebars into compact or collapsible navigation.
- **Mobile (<768px):** `1.25rem` margins and `1rem` gutters. Primary actions, answer choices, and audio controls should be easy to reach and tap.

## Elevation & Depth

Depth should come from surface contrast, clear borders, and restrained shadows rather than large or dark shadows.

- **Base canvas:** `#FFFFFF`.
- **Surface level 1 — cards and modules:** White (`#FFFFFF`) with a `1px` border in `#D5DEDA`. Optional shadow: `0 8px 24px -4px rgba(23, 31, 29, 0.05)`.
- **Surface level 2 — popovers and floating controls:** White with a subtle border and shadow: `0 12px 32px -8px rgba(23, 31, 29, 0.10)`.
- **Active focus:** Use a `3px` focus ring based on `rgba(13, 148, 136, 0.16)`.
- **Selected content:** Prefer a pale teal or emerald surface with a stronger colored border instead of a fully saturated background.

## Shapes

Use balanced, tailored corner geometry:
- Base controls: `8px`.
- Cards and panels: `16px`.
- Modal containers: `24px`.
- Pills: `9999px`, reserved for status chips, progress indicators, and compact category tokens.

## Components

### Buttons

- **Primary:** `#0D9488` background with white text. Use for the main action in a view.
- **Secondary:** `#E8EDEC` background with `#202927` text. Use for a secondary action.
- **Inverted:** `#2B302E` background with white text. Reserve for occasional high-contrast actions.
- **Outlined:** White background, `1px` border in `#89938F`, and `#202927` text.
- **Tertiary / warm action:** `#C36D4B` background with white text. Use sparingly for edit or contextual actions.
- Button height: `44px` desktop and `48px` mobile. Base corner radius: `8px`.

### Chips and vocabulary tokens

- Default chips use `#F2F5F4` background, `#D5DEDA` border, and `#5F6B67` text.
- Selected chips use `#D8F2EE` background, `#0D9488` border, and `#075E57` text.
- Positive or completed tokens may use `#DDF5EB` with `#075E47` text.
- Terracotta chips are reserved for occasional warm categories, not general selection states.

### Cards and lesson tiles

- Cards use a white background, `16px` radius, and a continuous `1px` border in `#D5DEDA`.
- On hover, strengthen the border toward `#0D9488` and apply a subtle `2px` lift.
- Keep internal padding consistent at `1.5rem`.
- When cards sit inside a tinted section, preserve white card surfaces to maintain hierarchy.

### Form inputs and text prompts

- Inputs use `#F7F9F8` or white backgrounds with a `1px` border in `#C8D2CD`.
- Input height: `48px`.
- Focus state: `#0D9488` border and a `3px` outer ring using `rgba(13, 148, 136, 0.16)`.
- Placeholder text uses `#737877`; entered text uses `#202927`.

### Selection controls

- Checkboxes and radio controls use a white or `#F7F9F8` base with a `1px` border in `#C8D2CD`.
- Checked state uses `#0D9488` with a white check or center mark.
- Use `#D8F2EE` for selected option containers where a larger selection area is needed.

### Progress and audio waveform meters

- Unfilled progress tracks use `#E1E7E4`.
- Primary progress uses `#0D9488`.
- Positive completion progress may use `#0FA87E`.
- Use terracotta (`#C36D4B`) only for a distinct secondary metric or category, not as a success color.
- Audio waveform foreground uses `#0FA87E` over a pale mint guide surface (`#DDF5EB`).

### Iconography and utility actions

- Main navigation and primary actions use teal.
- Positive or completed actions use emerald.
- Edit or contextual actions may use terracotta.
- Destructive actions use the error red (`#C62828`).
- Neutral utility icons use `#5F6B67` or `#737877`.
- Avoid placing multiple saturated icon colors together unless each color communicates a distinct action or status.