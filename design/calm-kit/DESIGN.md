---
name: Calm Kit
colors:
  surface: '#FBF8F3'
  surface-dim: '#dbdad7'
  surface-bright: '#fbf9f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f1'
  surface-container: '#efeeeb'
  surface-container-high: '#e9e8e5'
  surface-container-highest: '#e4e2e0'
  on-surface: '#1b1c1a'
  on-surface-variant: '#434843'
  inverse-surface: '#30312f'
  inverse-on-surface: '#f2f0ee'
  outline: '#737872'
  outline-variant: '#c3c8c1'
  surface-tint: '#506353'
  primary: '#4d6151'
  on-primary: '#ffffff'
  primary-container: '#667969'
  on-primary-container: '#f6fff4'
  inverse-primary: '#b7ccb8'
  secondary: '#536254'
  on-secondary: '#ffffff'
  secondary-container: '#d3e4d2'
  on-secondary-container: '#576758'
  tertiary: '#725458'
  on-tertiary: '#ffffff'
  tertiary-container: '#8d6c70'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d2e8d4'
  primary-fixed-dim: '#b7ccb8'
  on-primary-fixed: '#0d1f13'
  on-primary-fixed-variant: '#384b3c'
  secondary-fixed: '#d6e7d5'
  secondary-fixed-dim: '#bacbba'
  on-secondary-fixed: '#111f14'
  on-secondary-fixed-variant: '#3b4a3d'
  tertiary-fixed: '#ffd9dd'
  tertiary-fixed-dim: '#e4bdc1'
  on-tertiary-fixed: '#2b1519'
  on-tertiary-fixed-variant: '#5b3f43'
  background: '#fbf9f6'
  on-background: '#1b1c1a'
  surface-variant: '#e4e2e0'
  sage: '#6B7F6E'
  moss: '#A7B8A7'
  mist: '#D9E1D9'
  ivory: '#F4EFE8'
  sand: '#C9BDAF'
  ink: '#202A25'
  text-secondary: '#666963'
  border: '#E5DED5'
  success-soft: '#E5E9DF'
typography:
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-md:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Manrope
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

# Calm / Kit — Color & Icon Design System

A compact visual specification based on the supplied interface study. The system is warm, quiet, tactile, and minimal: muted botanical greens, soft neutral surfaces, restrained contrast, and simple rounded-line icons.

## 1. Color palette

| Token | Hex | Intended use |
|---|---|---|
| `sage` | `#6B7F6E` | Primary actions, active navigation, selected controls, progress fills, success indicators |
| `moss` | `#A7B8A7` | Secondary green, subtle accents, supporting surfaces |
| `mist` | `#D9E1D9` | Muted green-tinted backgrounds, inactive progress tracks, soft status surfaces |
| `ivory` | `#F4EFE8` | Main page background and warm neutral surfaces |
| `sand` | `#C9BDAF` | Neutral accents, avatar details, dividers, secondary decorative elements |

### Supporting UI colors

These are inferred supporting colors to complete the palette; treat them as implementation tokens rather than additional sampled swatches.

| Token | Suggested value | Use |
|---|---|---|
| `ink` | `#202A25` | Main text, headings, high-emphasis icons |
| `text-secondary` | `#666963` | Supporting text and metadata |
| `surface` | `#FBF8F3` | Cards and raised controls |
| `border` | `#E5DED5` | Hairlines, input boundaries, separators |
| `white` | `#FFFFFF` | Icon contrast on selected green surfaces |
| `success-soft` | `#E5E9DF` | Quiet success notification background |

### Color usage principles

- Keep the overall interface low-saturation and warm. Avoid introducing bright, highly saturated colors.
- Use `sage` as the single dominant action color. Do not use multiple competing primary colors.
- Use `ivory` for the canvas and slightly lighter warm surfaces for cards to create gentle separation.
- Use `mist` and `moss` for secondary states, not for primary text.
- Use `ink` for readable text and unselected icons.
- Reserve white iconography and text for controls with a sufficiently dark `sage` background.
- Check text contrast before implementation; the palette is intentionally soft, but accessibility takes priority over exact visual matching.

## 2. Icon design language

### Overall style

- Minimal, geometric, friendly outline icons.
- Use a consistent stroke weight across the icon set.
- Prefer rounded line caps and rounded joins.
- Avoid intricate detail, gradients, heavy shadows, and decorative fills.
- Icons should feel calm and approachable rather than technical or playful.
- Use filled shapes only to communicate a selected or active state.

### Recommended construction

| Property | Specification |
|---|---|
| Base grid | `24 × 24` |
| Default stroke | `1.8–2 px` at 24 px |
| Stroke line cap | `round` |
| Stroke line join | `round` |
| Default color | `ink` (`#202A25`) |
| Active color | `sage` (`#6B7F6E`) |
| On-primary color | `white` (`#FFFFFF`) |
| Fill | `none` by default |
| Optical alignment | Center each icon; adjust visually where shapes are asymmetrical |

Scale stroke weight proportionally when rendering at other sizes. Keep icons optically consistent rather than forcing every shape to occupy the exact same bounding box.

## 3. Icon inventory and visual guidance

| Icon | Suggested name / glyph | Design direction |
|---|---|---|
| Home | `house` | Simple roof and body; filled sage when active, white when shown on a dark selected tab |
| Search | `search` | Circular lens with a short diagonal handle; outline only |
| Favorites | `heart` | Soft symmetrical heart outline; no fill when inactive |
| Settings | `settings` / `gear` | Compact gear outline with a clear central opening |
| Projects | `grid-2x2` | Four evenly spaced rounded squares |
| Profile | `user-round` | Circular head above a simple shoulder/torso outline |
| Filter | `sliders-horizontal` | Three horizontal tracks with small circular or short-line handles |
| More actions | `ellipsis` | Three evenly spaced dots, centered |
| Location | `map-pin` | Rounded pin outline with a small central dot |
| Success | `check` | Clear diagonal check mark; white on a sage circular background |
| Dismiss | `x` | Two balanced diagonal strokes |
| Forward / action | `arrow-right` | Simple horizontal arrow with an open arrowhead |

Use the closest equivalent from the project's icon library, but preserve the stroke, proportion, and state behavior described here. Do not mix filled and outline icon families in the same inactive navigation row.

## 4. Icon states and placement

### Bottom navigation

- Four destinations: Home, Search, Favorites, Settings.
- Inactive icons use `ink` or a softened charcoal tone, with labels beneath.
- The active destination uses `sage`; show a small sage indicator dot below the label.
- Keep icon size and label alignment consistent across destinations.
- The segmented tab treatment may use a solid `sage` background for the selected segment, with a white filled icon and white label.

### Buttons

- Primary button: solid `sage`, white label, and a simple white trailing arrow where appropriate.
- Secondary button: transparent or warm surface, thin `sand`/`border` outline, and `ink` label.
- Keep button icons optically centered and visually subordinate to the label.

### Inputs and utility controls

- Search icon and filter icon use the default outline style.
- Keep icons separated from text by comfortable spacing.
- Use thin separators only when they improve grouping; avoid adding unnecessary borders.

### Status and feedback

- Success uses a sage circle with a white check.
- Dismiss uses a dark neutral outline icon.
- Status backgrounds should be pale and muted, not vivid green.

## 5. Component styling cues

- **Cards:** warm near-white surfaces, large rounded corners, subtle diffuse shadows, and restrained borders.
- **Controls:** pill-shaped buttons and search fields; thin outlines for secondary actions.
- **Toggles:** sage track when on, light neutral track when off; circular thumb remains white.
- **Checkboxes:** sage filled square with white check when checked; transparent/ivory square with a fine dark outline when unchecked.
- **Progress:** sage fill over a pale neutral track, with rounded ends.
- **Notifications:** pale muted surface, sage success icon, strong concise title, and subdued supporting copy.

## 6. Suggested design tokens

```css
:root {
  --color-sage: #6B7F6E;
  --color-moss: #A7B8A7;
  --color-mist: #D9E1D9;
  --color-ivory: #F4EFE8;
  --color-sand: #C9BDAF;

  --color-ink: #202A25;
  --color-text-secondary: #666963;
  --color-surface: #FBF8F3;
  --color-border: #E5DED5;
  --color-white: #FFFFFF;
  --color-success-soft: #E5E9DF;

  --icon-size: 24px;
  --icon-stroke-width: 1.9px;
  --icon-linecap: round;
  --icon-linejoin: round;

  --radius-card: 28px;
  --radius-control: 999px;
}
```

## 7. Do / Don't

**Do**
- Keep the palette muted, botanical, and warm.
- Use sage consistently for primary and active states.
- Use rounded outline icons with a consistent visual weight.
- Keep inactive navigation icons visually quiet.
- Use whitespace and subtle elevation to establish hierarchy.

**Don't**
- Add neon greens, saturated blues, or unrelated accent colors.
- Mix unrelated icon styles or inconsistent stroke weights.
- Use filled icons for every navigation item.
- Rely on color alone to communicate a state; pair it with a check, label, or indicator.
- Use heavy shadows or sharp, high-contrast borders.
