---
name: Legacy Partner UI
colors:
  surface: '#1a2220'
  surface-dim: '#091614'
  surface-bright: '#2e3c39'
  surface-container-lowest: '#04100e'
  surface-container-low: '#111e1c'
  surface-container: '#152220'
  surface-container-high: '#1f2d2a'
  surface-container-highest: '#2a3735'
  on-surface: '#d7e6e2'
  on-surface-variant: '#bacac2'
  inverse-surface: '#d7e6e2'
  inverse-on-surface: '#263330'
  outline: '#85948d'
  outline-variant: '#3c4a44'
  surface-tint: '#3bdeb4'
  primary: '#62fdd0'
  on-primary: '#00382a'
  primary-container: '#3de0b5'
  on-primary-container: '#005f4a'
  inverse-primary: '#006b54'
  secondary: '#50dcc1'
  on-secondary: '#00382f'
  secondary-container: '#00b299'
  on-secondary-container: '#003d33'
  tertiary: '#ffdfbd'
  on-tertiary: '#472a00'
  tertiary-container: '#ffbb66'
  on-tertiary-container: '#774a00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#61fbcf'
  primary-fixed-dim: '#3bdeb4'
  on-primary-fixed: '#002118'
  on-primary-fixed-variant: '#00513f'
  secondary-fixed: '#71f9dd'
  secondary-fixed-dim: '#50dcc1'
  on-secondary-fixed: '#00201a'
  on-secondary-fixed-variant: '#005144'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#fdb965'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#091614'
  on-background: '#d7e6e2'
  surface-variant: '#2a3735'
  surface-elevated: '#222b29'
  muted: '#8a9996'
  border: rgba(255,255,255,0.08)
  bubble-user: '#ffffff'
  bubble-user-fg: '#0a1210'
  bubble-user-tint: rgba(3, 105, 161, 0.4)
  bubble-assistant: '#1a2220'
  accent-mint: '#3de0b5'
  accent-teal: '#17b9a0'
  accent-deep-teal: '#0e8f7c'
typography:
  headline-lg:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes an immersive, modern dark-mode conversational environment optimized for language learning and interactive practice. The aesthetic is deeply technical yet approachable, combining a profound dark teal shell with vibrant mint and teal gradients. 

- **Brand Personality:** Focused, immersive, supportive, and modern.
- **Target Audience:** Language learners and active partner-chat participants requiring a distraction-free, high-contrast, yet soft interface.
- **Emotional Response:** Calming focus combined with energetic encouragement, utilizing glowing accents to signal active engagement and progress.
- **Design Style:** A tailored variant of Modern Dark UI infused with subtle glassmorphic layers, radial background glows, and tactile gradient-driven action points.

## Colors

The color system is anchored by a deep near-black green shell (`#04100e`), illuminated by top radial teal glows and vibrant mint-to-teal gradients for primary interactive elements. Surfaces are structured using dark, low-saturation green-grays (`#1a2220` and `#222b29`) that recede into the background while maintaining crisp hierarchical separation via ultra-fine borders.

- **Primary (`#3de0b5`):** Used for key interactive links, chips, selection states, and gradient highlights.
- **Secondary (`#17b9a0`):** Provides depth in multi-stop gradients for avatars, speaking orbs, and primary action buttons.
- **Neutral (`#04100e`):** Serves as the fundamental viewport background beneath radial atmospheric lighting.
- **Surfaces & Accents:** Carefully calibrated slate-greens, soft ambers for warnings/assessments, and emerald indicators for completed states.

## Typography

The typography system relies exclusively on **IBM Plex Sans Arabic**, rendered in Right-to-Left (RTL) layout mode. Letterforms are chosen for their exceptional legibility at small sizes and structured, modern proportions at headline scales. 

- **Scale:** Tightly controlled steps from 30px down to 12px ensure clear hierarchy within constrained mobile viewports.
- **Weights:** Restricted primarily to Regular (400), Medium (500), and Semi-bold (600) to maintain a clean, uncluttered reading experience.

## Layout & Spacing

The layout model is optimized for focused, mobile-first conversational interfaces while gracefully scaling across viewports.

- **Container Model:** Content is centralized within a strict phone-column constraint (`max-w-[430px]`) wrapped in an atmospheric `.app-shell` background featuring a subtle top teal radial gradient.
- **Rhythm:** Spacing follows a predictable 4px/8px incremental rhythm, ensuring tight pairing between metadata and interactive elements.
- **Adaptation:** Outer margins automatically center the primary interaction column on larger screens while maintaining edge-to-edge touch targets on mobile devices.

## Elevation & Depth

Depth is communicated through tonal surface layering and low-contrast outlines rather than heavy drop shadows.

- **Surfaces:** Base background (`#04100e`) supports layered cards (`#1a2220`) and elevated hover states (`#222b29`).
- **Borders & Glows:** Hairline borders (`rgba(255,255,255,0.08)`) define boundaries, while active interactive elements utilize soft mint border tints (`border-accent-mint/40`) and atmospheric radial glows to indicate focus without visual clutter.

## Shapes

The shape language emphasizes approachable, heavily rounded containers that soften the high-contrast dark interface.

- **Radii:** Cards and structural blocks utilize generous rounding (`--radius-card: 1.25rem` / `rounded-2xl`), while chat bubbles, pills, and action buttons employ fully rounded pill geometry (`rounded-full`).
- **Consistency:** Icon containers and interactive avatar tiles maintain proportional rounded-2xl or rounded-full geometries throughout the component inventory.

## Components

- **Buttons:** Primary actions utilize the `.accent-gradient` (mint to teal) with dark green text (`#04100e`). Secondary actions use ghost or mint-outline pill styles.
- **Cards & Rows:** Built on surface backgrounds (`bg-surface/80`) with backdrop blur and soft borders. On hover, they elevate to `bg-surface-elevated` with a mint border tint.
- **Chat Bubbles:** User messages are styled with soft sky tints (`bg-sky-700/40`), while assistant messages anchor to dark zinc surfaces (`bg-zinc-800/90`) with highlighted foreign-language text.
- **Input Fields & Composers:** Fully rounded (`rounded-full`) shells featuring backdrop blur, high-contrast placeholder text, and integrated icon buttons for voice toggles and gradient send triggers.
- **Badges & Chips:** Compact pill elements utilizing semantic states—amber soft fills for warnings/assessments, emerald for success, and mint-tinted borders for tags and metadata.