---
name: Warm Editorial Learning Mobile Experience
colors:
  surface: '#FFFFFF'
  surface-dim: '#e4d9c8'
  surface-bright: '#fff8f2'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fef2e1'
  surface-container: '#f8ecdb'
  surface-container-high: '#f2e7d6'
  surface-container-highest: '#ece1d0'
  on-surface: '#201b11'
  on-surface-variant: '#404849'
  inverse-surface: '#363024'
  inverse-on-surface: '#fbefde'
  outline: '#70797a'
  outline-variant: '#bfc8c9'
  surface-tint: '#2c676d'
  primary: '#003c41'
  on-primary: '#ffffff'
  primary-container: '#14545a'
  on-primary-container: '#8dc6cd'
  inverse-primary: '#97d0d7'
  secondary: '#a9361d'
  on-secondary: '#ffffff'
  secondary-container: '#fe7354'
  on-secondary-container: '#6b1100'
  tertiary: '#6e5e00'
  on-tertiary: '#ffffff'
  tertiary-container: '#c4aa30'
  on-tertiary-container: '#4b3f00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b2edf3'
  primary-fixed-dim: '#97d0d7'
  on-primary-fixed: '#002023'
  on-primary-fixed-variant: '#0a4f54'
  secondary-fixed: '#ffdad2'
  secondary-fixed-dim: '#ffb4a3'
  on-secondary-fixed: '#3d0600'
  on-secondary-fixed-variant: '#881f06'
  tertiary-fixed: '#fee263'
  tertiary-fixed-dim: '#e1c64a'
  on-tertiary-fixed: '#221b00'
  on-tertiary-fixed-variant: '#534600'
  background: '#fff8f2'
  on-background: '#201b11'
  surface-variant: '#ece1d0'
  teal-700: '#1E6670'
  canvas: '#EEF2F2'
  text: '#242424'
  muted: '#8C8C86'
typography:
  headline-lg:
    fontFamily: Newsreader
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: Newsreader
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Newsreader
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 16px
  margin: 24px
  space-xs: 4px
  space-sm: 8px
  space-md: 16px
  space-lg: 24px
  space-xl: 32px
---

## Brand & Style

This design system establishes a friendly, calm, modern, and lightly playful mobile learning experience. The visual language blends soft editorial illustrations with crisp, scannable mobile UI components. 

- **Personality:** Approachable, encouraging, intellectually stimulating yet warm.
- **Target Audience:** Lifelong learners, students, and professionals seeking self-paced education in an aesthetically pleasing, low-friction environment.
- **Design Style:** A tactile, soft-editorial hybrid featuring generous whitespace, rounded geometry, subtle diffuse shadows, and deliberate color blocking. Avoid heavy borders, harsh black lines, or dense visual clutter.

## Colors

The color palette uses deep teal to anchor primary dark surfaces and headers, softened by a pervasive warm cream background. Coral orange is strictly reserved for primary actions, critical path items, and progress markers, while golden yellow provides cheerful highlights and metadata accents.

- **Primary (Deep Teal - `#14545A`):** Used for primary headers, phone frames, and prominent brand anchors.
- **Secondary (Coral Orange - `#F56D4E`):** Applied to primary buttons, interactive triggers, progress indicators, and focal illustration accents.
- **Tertiary (Golden Yellow - `#F5D95B`):** Employed for duration labels, small illustrative highlights, and secondary decorative elements.
- **Neutral (Warm Cream - `#FFF3E2` & White - `#FFFFFF`):** Creates an inviting canvas for content-rich surfaces and landing screens, supported by `#EEF2F2` for outer presentation contexts.

## Typography

Typography pairs a bold editorial serif display face with a clean, highly legible sans-serif for UI elements and body copy. 

- **Headlines:** Set in an authoritative, warm editorial serif (`Newsreader`) to convey literary quality and modern publishing aesthetics.
- **Body & Labels:** Set in a functional sans-serif (`Inter`) ensuring optimal legibility across compact mobile viewports without sacrificing the warm tone of the system.
- **Hierarchy:** Ensure headline scales never sacrifice readability. On smaller viewports, clamp large display text gracefully and maintain comfortable line spacing.

## Layout & Spacing

The layout model is built around a mobile-first, portrait-oriented frame structure utilizing an 8px base spacing grid (with 4px micro-increments).

- **Grid & Margins:** Content containers maintain consistent inner padding to ensure touch targets and text blocks never collide with rounded device boundaries. Generous outer margins isolate individual screens when presented on presentation canvases.
- **Responsive Adaptation:** Designed natively for narrow mobile viewports, scaling up horizontally through centered container max-widths on tablet and desktop viewports.

## Elevation & Depth

Visual hierarchy relies on soft tonal layering and diffuse ambient shadows rather than heavy borders or aggressive elevation steps.

- **Shadows:** Use low-opacity, highly diffused shadows (e.g., `0 8px 24px rgba(32, 50, 50, 0.08)`) to lift floating elements like primary call-to-action buttons and overlapping search bars.
- **Surfaces:** Contrast deep teal structural headers against crisp white content cards resting on warm cream or pale gray backgrounds. Avoid harsh black outlines; let color blocking and whitespace define boundaries.

## Shapes

The shape language is defined by generous, friendly rounding that reinforces the approachable nature of the learning product.

- **Device Frames & Cards:** Large radii (`20px` to `34px`) soften structural containers and course cards.
- **Controls & Pills:** Interactive elements, search inputs, and category filters utilize pill-shaped geometries (`999px`) or comfortable medium radii (`14px`) to invite touch interaction.

## Components

Reusable components must adhere strictly to the color, typography, and spacing tokens defined in this system.

- **Buttons:** Primary call-to-action buttons feature high-radius pill shapes, bold uppercase sans-serif text, coral orange backgrounds, and soft warm shadows.
- **Search Bar:** A white rounded pill container overlapping structural header boundaries, complete with a leading text prompt and a coral accent search action icon.
- **Course Cards:** Compact rectangular cards featuring colorful geometric square thumbnails, clear typographic hierarchy for titles and descriptions, and golden-yellow or muted duration metadata.
- **Category Tabs:** Horizontally scrollable pill tabs with distinct active states indicated by darker fills or contrast text.
- **Chapter Timeline:** A vertical sequence utilizing thin connector lines, numbered markers, and coral highlights for active/completed lessons, paired with right-aligned duration labels.
- **Navigation Headers:** Clean top bars featuring back actions, centered contextual titles, profile avatars, and utility triggers (share, menu) with generous touch targets (minimum 44x44px).