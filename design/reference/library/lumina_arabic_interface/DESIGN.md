---
name: Lumina Arabic Interface
colors:
  surface: '#e5fff8'
  surface-dim: '#c4e0d9'
  surface-bright: '#e5fff8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#defaf3'
  surface-container: '#d8f4ed'
  surface-container-high: '#d2eee7'
  surface-container-highest: '#cde8e2'
  on-surface: '#061f1c'
  on-surface-variant: '#3d4947'
  inverse-surface: '#1c3530'
  inverse-on-surface: '#dbf7f0'
  outline: '#6d7a77'
  outline-variant: '#bcc9c6'
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
  tertiary: '#00694c'
  on-tertiary: '#ffffff'
  tertiary-container: '#008561'
  on-tertiary-container: '#f5fff7'
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
  tertiary-fixed: '#71fbc7'
  tertiary-fixed-dim: '#50deac'
  on-tertiary-fixed: '#002115'
  on-tertiary-fixed-variant: '#00513a'
  background: '#e5fff8'
  on-background: '#061f1c'
  surface-variant: '#cde8e2'
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
    letterSpacing: '0'
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: '0'
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

This design system delivers an airy, focused, and culturally distinguished environment engineered for immersive language learning. Drawing from contemporary editorial clarity and high-end botanical Scandinavian minimalism, it rejects the cartoonish gamification typical of consumer ed-tech in favor of an academic yet accessible luxury. 

The aesthetic marries clinical legibility with warm, organic undertones. It relies on subtle mint-tinted surfaces, deep woodland pigments, and hyper-crisp emerald indicators to foster calm concentration and intellectual presence. Visual rhythm is achieved through deliberate breathing room, disciplined typographic scale, and luminous boundary lines that evoke high-grade tactile stationery.

## Colors

The palette is anchored by deep pine neutrals and illuminated with lively botanical greens over light-drenched, tinted whites. 

- **Background Canvas:** Clean warm white suffused with subtle mint (`#F8FCFA` base, `#F4F9F7` inset variant). Surfaces feel organic rather than sterile blue-white.
- **Deep Pigments (Text & Hierarchy):** Core headers and primary text leverage deep pine (`#0D2622` and `#0A1C19`), delivering razor-sharp contrast against pale backdrops without the harshness of pure black. Secondary copy leans into muted teal-slate (`#2D4A43`).
- **Interactive Accents:** Interactive elements, progression tracks, and correct status signals use a triumvirate of emerald and mint hues (`#0FA87E`, `#14B889`, and deep teal `#0D9488`).
- **Borders & Dividers:** Subtle mint-tinted borders (`#E0EDE8`) delineate cards and modules with quiet structure, ensuring clarity without heavy drop shadows.

## Typography

The typographic architecture is built on structured dualism: IBM Plex Sans provides structural, authoritative weight for headings, labels, and bi-directional bilingual headers (seamlessly bridging Latin and Arabic script geometry), while Inter powers Latin body passages with neutral, ergonomic cadence.

For Arabic script rendering:
- Always pair IBM Plex Sans with its corresponding Naskh-inspired Arabic companion (`IBM Plex Sans Arabic`).
- Maintain a minimum line-height multiplier of 1.4x for Arabic text strings to prevent diacritic clipping (tashkeel).
- Arabic vocabulary showcase cards and phonetics display text must scale up by 15-20% relative to Latin counterparts at equivalent semantic hierarchy levels.

## Layout & Spacing

The interface employs a fluid 12-column grid on desktop screens (scaling downward to 6 columns on tablet and 4 columns on mobile), capped at a 1280px master max-width to protect line reading length.

- **Desktop (1024px+):** Canvas margins sit generously at `margin: 2.5rem` with column `gutter: 1.5rem`. Language study decks and side-by-side verification consoles sit comfortably within a 2-column or 3-column split view.
- **Tablet (768px - 1023px):** Margins adjust to `1.5rem`, stacking metadata sidebars into bottom sheets or collapsible horizontal trays.
- **Mobile (&lt;768px):** Margins condense to `1.25rem` and gutters to `1rem`. Action buttons, choice tokens, and audio scrubbers span full width to maximize touch accuracy during rapid drills.

## Elevation & Depth

Depth is conveyed through luminous planar stacking, low-contrast ghost borders, and faint emerald-tinted atmospheric glows, purposefully avoiding heavy grey dropshadows.

- **Base Canvas:** The default backdrop `#F8FCFA` provides passive depth.
- **Surface Level 1 (Cards & Modules):** Pure `#FFFFFF` or translucent `#FFFFFFEE` backplates, framed by a continuous `1px` stroke of `#E0EDE8`. Shadows, if deployed, take the form of an ultra-soft atmospheric ambient: `0 8px 24px -4px rgba(13, 38, 34, 0.04)`.
- **Surface Level 2 (Floating Controls & Popovers):** Elevated `#FFFFFF` surfaces with subtle mint edge glows: `0 12px 32px -8px rgba(15, 168, 126, 0.08), 0 0 0 1px #E0EDE8`.
- **Active Focus & Correct States:** Interacted nodes cast a soft, diffused mint-tinted radiance (`box-shadow: 0 0 16px 2px rgba(20, 184, 137, 0.16)`), accentuating completion and success states with pristine crispness.

## Shapes

The shape system adopts a balanced, tailored corner geometry (`roundedness: 2`, where base components use `0.5rem / 8px`, card panels use `1rem / 16px`, and modal containers employ `1.5rem / 24px`). 

This curvature preserves modern architectural precision while softening the user journey. Rounded capsules (`9999px`) are reserved strictly for interactive state chips, progress trackers, and character stroke indicators.

## Components

### Buttons
- **Primary:** Filled in deep teal `#0D9488` or emerald `#0FA87E` with pure white label typography. Slight lift on hover with a faint emerald aura (`0 4px 14px rgba(15, 168, 126, 0.24)`). Height: `44px` (desktop), `48px` (mobile). Corner radius: `8px`.
- **Secondary / Ghost:** `#FFFFFF` background with a crisp `1px` border of `#E0EDE8` and primary pine text `#0D2622`. On hover, background shifts to `#F4F9F7` and border tightens to `#14B889`.
- **Audio Practice Buttons:** Circular controls (`44px` to `56px`) with tinted mint backgrounds (`#EAF5F1`), an emerald speaker icon (`#0FA87E`), and micro-scale interactions on tap.

### Chips & Vocabulary Tokens
- Inline grammar chips and vocabulary pills feature a roundedness of `9999px`, height of `32px`, and background of `#F4F9F7`. Border is `1px solid #E0EDE8`.
- Selected or active chips invert to `#0FA87E` with white text, or adopt an emerald-tinted wash (`#E6F7F2`) with an active `#0D9488` border and text weight bumped to `600`.

### Cards & Lesson Tiles
- Built with crisp white surfaces, `16px` border radii, and continuous `#E0EDE8` borders.
- Hover states transition the border to `#14B889` (at 40% opacity) paired with a 2px vertical translation and an ultra-subtle mint ambient illumination.
- Internal padding adheres consistently to `1.5rem` (`space-lg`).

### Form Inputs & Text Prompts
- Input fields display an inner fill of `#FFFFFF` over a `1px` border of `#E0EDE8` and a height of `48px`.
- Focused state replaces the neutral border with `#0FA87E` alongside a `3px` outer ring in `rgba(15, 168, 126, 0.12)`. Placeholder text sits at `#6A857E`.

### Selection Controls (Radio & Checkbox)
- Checkboxes and radio discs feature a base size of `20px`, enclosed in `#D5E5DF`.
- Checked states trigger a fluid scale animation into a filled `#0FA87E` surface with a crisp white check or center pip, providing immediate visual confirmation.

### Progress & Audio Waveform Meters
- Segmented linear tracks use `#E0EDE8` as the unfilled channel with active progress rendered in an unbroken `#14B889` fill.
- Waveform and diacritic stroke visualization components render stroke paths with a vibrant `#0FA87E` foreground over a `#EAF5F1` guide baseline.