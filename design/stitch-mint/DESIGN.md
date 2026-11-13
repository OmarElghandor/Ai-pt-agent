# Stitch mint · light mode colors

Source: Stitch export *bilingual grammar notebook app* (path home).  
Implemented tokens live in `app/(v2)/v2.css` and `app/globals.css` `@theme` — keep those two in sync. Hex values belong only there (and in this doc).

## Atmosphere

- Soft mint paper background with translucent teal / aqua blur orbs (primary-fixed / secondary-fixed at low opacity).
- Cards are white with hairline mint borders and a soft diffuse shadow.
- Hero media uses a dark teal scrim at the bottom for badge contrast.

## Core palette (CSS roles)

| Role | Hex | CSS variable | Use |
| --- | --- | --- | --- |
| paper | `#f8faf9` | `--color-v2-paper` | App / shell background |
| paper-deep | `#cde8e2` | `--color-v2-paper-deep` | Road base, mist fills, locked tiles |
| card | `#ffffff` | `--color-v2-card` | Cards, raised surfaces |
| line | `#e2efea` | `--color-v2-line` | Hairlines, borders |
| ink | `#061f1c` | `--color-v2-ink` | Primary text, active tab |
| ink-muted | `#3d4947` | `--color-v2-ink-muted` | Secondary text |
| sand / outline | `#bcc9c6` | `--color-v2-sand` | Neutral accents, tip borders |
| primary | `#00685f` | `--color-v2-primary` | Brand teal, CTAs, progress |
| primary-strong | `#008378` | `--color-v2-primary-strong` | Hover / pressed primary, road dash |
| primary-tint | `#d8f4ed` | `--color-v2-primary-tint` | Soft teal fills, chip tracks |
| primary-fixed | `#89f5e7` | `--color-v2-primary-fixed` | Glow orbs, bright mint accent |
| secondary-fixed | `#7bf9ca` | `--color-v2-secondary-fixed` | Beacon pulse ring |
| action | `#00685f` | `--color-v2-action` | Same as primary (buttons, current) |
| action-strong | `#008378` | `--color-v2-action-strong` | Pressed action |
| action-tint | `#defaf3` | `--color-v2-action-tint` | Soft action wash, tip wash |
| note | `#defaf3` | `--color-v2-note` | Tip / coach surfaces |
| note-border | `#bcc9c6` | `--color-v2-note-border` | Tip borders |
| success | `#006c4f` | `--color-v2-success` | Done nodes, tertiary labels |
| attention | `#b8955a` | `--color-v2-attention` | Near-miss / correction (never red for mistakes) |
| danger | `#ba1a1a` | `--color-v2-danger` | System errors only |
| chrome-muted | `#4c9a93` | `--color-v2-chrome-muted` | Inactive tab icons / labels |
| tab-bar | `#f8fcfb` | `--color-v2-tab-bar` | Bottom nav background |
| tab-border | `#e7f3f2` | `--color-v2-tab-border` | Bottom nav top border |
| hero-scrim | `#1c3530` | `--color-v2-hero-scrim` | Hero image bottom gradient |

## Stitch Material map (reference)

Names from the Stitch Tailwind config; mapped into the roles above.

| Stitch token | Hex | Maps to |
| --- | --- | --- |
| background / surface | `#e5fff8` / `#f8faf9` | paper |
| surface-container-lowest | `#ffffff` | card |
| surface-container | `#d8f4ed` | primary-tint |
| surface-container-low | `#defaf3` | action-tint / note |
| surface-container-high | `#d2eee7` | (near paper-deep) |
| surface-container-highest | `#cde8e2` | paper-deep |
| primary | `#00685f` | primary / action |
| primary-container | `#008378` | primary-strong |
| primary-fixed | `#89f5e7` | primary-fixed |
| secondary | `#006c4f` | success |
| secondary-fixed | `#7bf9ca` | secondary-fixed |
| tertiary | `#00694c` | group-c / verb-ir |
| on-surface | `#061f1c` | ink |
| on-surface-variant | `#3d4947` | ink-muted |
| outline | `#6d7a77` | (muted outline; prefer sand for UI) |
| outline-variant | `#bcc9c6` | sand |
| inverse-surface | `#1c3530` | hero-scrim |
| error | `#ba1a1a` | danger |
| error-container | `#ffdad6` | group-neg-bg |

## Groups / verbs / skills

| Role | Hex |
| --- | --- |
| group-a / m / verb | `#00685f` |
| group-b / f / verb-ar | `#8a6b5c` |
| group-c / prep / verb-ir | `#00694c` |
| group-pron / verb-irregular | `#6b5b7a` |
| group-neg | `#ba1a1a` on `#ffdad6` |
| group-neutral | `#061f1c` |
| skill-listening | `#00685f` |
| skill-reading | `#6b5b7a` |
| skill-speaking | `#006c4f` |
| skill-writing | `#00694c` |

## Radii, space, shadow

| Token | Value |
| --- | --- |
| radius-card | `28px` |
| radius-row | `14px` |
| radius-chip | `9999px` |
| space 1…6 | `4 / 8 / 12 / 16 / 24 / 32px` |
| shadow-soft | `0 8px 24px rgba(6, 31, 28, 0.06)` |

## Path home chrome notes

- Sticky header: `paper` at ~90% + blur; bottom border `line`.
- Streak pill: white card + `line` border.
- Current node: primary tile + `secondary-fixed` beacon pulse (`.v2-beacon-pulse`).
- Done node: `success` tile + check.
- Locked node: `paper-deep` + `sand` icon.
- Tab bar: `tab-bar` / `tab-border`; active = `ink` filled icon; inactive = `chrome-muted`.

## Talk aliases (`--ft-*`)

Same light mode, mirrored for free-talk / voice chrome:

| Alias | Hex |
| --- | --- |
| ft-ivory | `#f8faf9` |
| ft-surface | `#ffffff` |
| ft-sage | `#00685f` |
| ft-sage-dark | `#008378` |
| ft-moss | `#6bd8cb` |
| ft-mist | `#cde8e2` |
| ft-sand | `#bcc9c6` |
| ft-ink | `#061f1c` |
| ft-text-secondary | `#3d4947` |
| ft-border | `#e2efea` |
| ft-coach / ft-highlight | `#defaf3` |
| ft-success-soft | `#d8f4ed` |
| ft-on-sage | `#ffffff` |
