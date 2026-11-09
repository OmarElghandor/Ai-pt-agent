# Legacy partner UI — colors & design

> Scope: the dark teal shell used by `http://localhost:3000/` and its sub-pages  
> (`/`, `/chat`, `/lessons`, `/lessons/[lessonKey]`).  
> Source of truth: `app/globals.css` (legacy tokens + shell classes).  
> Not the Langify v2 Calm Kit (`docs/langify-v2/05-design-system.md`).

## Pages covered

| Route | File | Role |
|---|---|---|
| `/` | `app/page.tsx` | Partner picker (صديق / تمرين / اختبار) |
| `/chat?agent=friend` | `app/chat/page.tsx` + `components/ChatScreen.tsx` | Free talk |
| `/chat?agent=assessment` | same | Assessment chat |
| `/lessons` | `app/lessons/page.tsx` | Lesson plan list |
| `/lessons/[lessonKey]` | `app/lessons/[lessonKey]/page.tsx` | Practice session (reuses ChatScreen / VoiceScreen) |

Shared layout: `app/layout.tsx` — `lang="ar"` `dir="rtl"`, font IBM Plex Sans Arabic.

---

## Color tokens

Defined in `app/globals.css` under `@theme inline`. Tailwind maps `--color-*` → utilities like `bg-surface`, `text-muted`, `border-border`, `text-accent-mint`.

### Core palette

| Token | Hex / value | Tailwind | Use |
|---|---|---|---|
| `--color-bg` | `#04100e` | `bg-bg` | App background (near-black green) |
| body text | `#f2f7f5` | (body default) | Primary text |
| `--color-surface` | `#1a2220` | `bg-surface` | Cards, composer, menus |
| `--color-surface-elevated` | `#222b29` | `bg-surface-elevated` | Hover / dropdown panels |
| `--color-border` | `rgba(255,255,255,0.08)` | `border-border` | Hairlines |
| `--color-muted` | `#8a9996` | `text-muted` | Subtitles, placeholders, secondary |
| `--color-accent-mint` | `#3de0b5` | `text-accent-mint`, `border-accent-mint/*` | Links, chips, selected state |
| `--color-accent-teal` | `#17b9a0` | (gradients, checkbox accent) | Deeper accent |

### Bubble tokens (theme)

| Token | Hex | Intended use |
|---|---|---|
| `--color-bubble-user` | `#ffffff` | User bubble fill (token; UI often uses sky tint instead) |
| `--color-bubble-user-fg` | `#0a1210` | Text on white user bubble |
| `--color-bubble-assistant` | `#1a2220` | Assistant surface |

### Hardcoded accents used in components

| Value | Where |
|---|---|
| `#04100e` | Icon / send-button foreground on mint gradients |
| `#0e8f7c` | Deep stop of `.avatar-gradient` |
| `text-emerald-300` / `emerald-400` | PT text in bubbles; done badge |
| `bg-sky-700/40` | User chat bubble (`UserBubble`) |
| `bg-zinc-800/90` | Default assistant chat bubble |
| `amber-500/20` + `text-amber-200` | Assessment-due badge; coach / tip cards |
| `text-red-300` / `border-red-500/40` | Errors, destructive menu actions |
| `bg-black/70` | Modal scrim (lesson generating) |

---

## Gradients & shell effects

### `.app-shell`

- Full-viewport background: `--color-bg`
- Top teal glow (`::before`):

```css
radial-gradient(
  ellipse 80% 70% at 50% 0%,
  rgba(23, 185, 160, 0.45) 0%,
  rgba(61, 224, 181, 0.18) 35%,
  transparent 70%
);
```

Every listed page wraps content in `app-shell`.

### `.accent-gradient`

```css
linear-gradient(135deg, #3de0b5, #17b9a0);
```

Used for primary round actions (send button).

### `.avatar-gradient`

```css
linear-gradient(145deg, #3de0b5 0%, #17b9a0 55%, #0e8f7c 100%);
```

Used for home agent icons and the speaking orb.

### Motion

| Class | Effect |
|---|---|
| `.orb-pulse` | Scale + teal glow pulse (~2.2s) |
| `.orb-wave` | Horizontal/vertical drift (~3.5s) |
| `.ring-pulse` | Expanding fade ring |

---

## Typography & layout chrome

| Item | Value |
|---|---|
| Font | IBM Plex Sans Arabic (`--font-ibm-plex-arabic`) |
| Direction | RTL (`dir="rtl"`) |
| Max content width | `max-w-[430px]` (phone column, centered) |
| Radii tokens | `--radius-bubble: 1.5rem`, `--radius-card: 1.25rem` |
| Common radii in UI | `rounded-full` (chips/composer), `rounded-2xl` (cards/bubbles), `rounded-[1.5rem]` (home agent rows) |

---

## Component inventory by page

### `/` — Partner picker (`app/page.tsx`)

**Header**

| Element | Style |
|---|---|
| Eyebrow «شريك البرتغالي» | `text-sm text-muted` |
| Title «مين تحب تكلم؟» | `text-3xl font-semibold tracking-tight` (white) |
| Sub «اختار نوع المحادثة» | `text-sm text-muted` |

**Agent row (card)**

| Part | Style |
|---|---|
| Container | `rounded-[1.5rem] border-border bg-surface/80 backdrop-blur`; hover → `border-accent-mint/40` + `bg-surface-elevated` |
| Icon tile | `h-16 w-16 rounded-2xl avatar-gradient text-[#04100e]` + teal shadow |
| Title | `text-lg font-semibold text-white` |
| Subtitle | `text-sm text-muted` |
| Chevron | `text-muted` → hover `text-accent-mint` |

**Agents data**

| id | Title | Subtitle | href |
|---|---|---|---|
| `friend` | صديق | كلام حر بالبرتغالي | `/chat?agent=friend` |
| `practice` | تمرين | خطة دروس من اللي اتعلّمته | `/lessons` |
| `assessment` | اختبار | شوف إنت قادر لوحدك | `/chat?agent=assessment` |

---

### `/chat` — Friend & assessment (`app/chat/page.tsx`)

**Top bar**

| Element | Style |
|---|---|
| Back / menu icon buttons | `h-10 w-10 rounded-full text-white/80` |
| Title | `text-lg font-semibold` («صديق» or «اختبار») |
| Level pill | `rounded-full border-border bg-surface/80 text-xs text-accent-mint` |
| Level / overflow menus | `rounded-2xl border-border bg-surface-elevated shadow-xl`; row hover `bg-white/5`; selected level `text-accent-mint` |
| Subtitle (friend) | `text-xs text-muted` («كلام حر») |
| Destructive action | `text-red-300` |
| Checkbox accent | `#17B9A0` |

**ChatScreen (`components/ChatScreen.tsx`)**

| Element | Style |
|---|---|
| Empty state | centered `text-lg font-medium` |
| Composer shell | `rounded-full border-border bg-surface/90 backdrop-blur` |
| Input | `text-[15px] text-white`, placeholder `text-muted` |
| Voice toggle | `text-muted` → hover `text-accent-mint` |
| Send | `accent-gradient h-12 w-12 rounded-full text-[#04100e]` |
| Stop | `rounded-full bg-white/15` |
| Mint chip (e.g. كلمات المشهد) | `border-accent-mint/35 bg-accent-mint/10 text-accent-mint` |
| Busy / error | `text-muted` / `text-red-300` |

**Bubbles (`components/TypedBubble.tsx`)**

| Kind | Style |
|---|---|
| User | `rounded-2xl bg-sky-700/40` |
| Assistant chat | `rounded-2xl bg-zinc-800/90`; PT `text-emerald-300` |
| Coach / tip | amber border + `bg-amber-950/20` |
| Teach / info / scene cards | zinc / sky bordered panels; labels often `text-accent-mint` or sky/amber |
| Primary CTA in card | `accent-gradient … text-[#04100e]` |
| Secondary CTA | mint outline pill |

**Voice (`components/VoiceScreen.tsx` + `SpeakingOrb.tsx`)**

| Element | Style |
|---|---|
| Orb | large circle, `avatar-gradient`, inner disc `#04100e`, optional `.orb-pulse` |
| Mic | `h-16 w-16 rounded-full`; recording `bg-red-500`, idle `bg-accent-mint` |
| Side controls | `rounded-full border-border bg-surface/80` |
| Caption / chips | same mint outline language as chat |

---

### `/lessons` — Plan list (`app/lessons/page.tsx`)

| Element | Style |
|---|---|
| Header title / sub | `text-lg font-semibold` / `text-xs text-muted` |
| Lesson card | `rounded-2xl border-border bg-surface/80 px-4 py-3` |
| Situation line | `text-xs text-muted` |
| Action links | `text-accent-mint` |
| Badge `assessment_due` | `rounded-full bg-amber-500/20 text-amber-200` |
| Badge `done` | `text-emerald-400` |
| Generating modal | scrim `bg-black/70`; panel `rounded-2xl border-border bg-surface` |
| Gen error toast | `border-red-500/40 bg-zinc-900 text-red-200` |

---

### `/lessons/[lessonKey]` — Practice play

Same shell + chat/voice patterns as `/chat`, with practice chrome:

| Element | Style |
|---|---|
| Title «تمرين» | `text-lg font-semibold` |
| Lesson key sub | `text-xs text-muted` |
| End practice | `text-xs text-zinc-400 underline` |
| Stage / assessment headers | `LessonChrome` — zinc pills; active emerald/sky tints |

---

## Interaction states (shared)

| State | Treatment |
|---|---|
| Default card | `bg-surface/80` + soft border |
| Hover card / row | elevate surface; mint border tint or `bg-white/5` |
| Primary action | mint→teal gradient, dark green icon/text |
| Secondary action | mint text or mint outline pill |
| Disabled | `opacity-40` |
| Error / destructive | red-200 / red-300 (not loud solid red fills) |
| Attention / assessment | amber soft fill |
| Success / done | emerald |

---

## File map

| Concern | Path |
|---|---|
| Tokens + shell + gradients | `app/globals.css` |
| Root font / RTL | `app/layout.tsx` |
| Home agents | `app/page.tsx` |
| Chat shell | `app/chat/page.tsx` |
| Lessons list | `app/lessons/page.tsx` |
| Lesson play | `app/lessons/[lessonKey]/page.tsx` |
| Text chat UI | `components/ChatScreen.tsx` |
| Bubbles | `components/TypedBubble.tsx` |
| Voice mode | `components/VoiceScreen.tsx`, `components/SpeakingOrb.tsx` |
| Practice chrome | `components/LessonChrome.tsx` |

---

## Note vs v2

v2 screens under `app/(v2)` use the **Calm Kit** (ivory paper, sage primary) documented in `docs/langify-v2/05-design-system.md` and `app/(v2)/v2.css`. Do not mix Calm Kit tokens into this legacy partner shell unless intentionally migrating a screen.
