# Micro clips (لقطات) — web → React Native map

The web player is intentionally a thin translation target for RN. Do not add web-only behaviour here.

| Web piece | RN primitive |
|---|---|
| `div` / `button` + `onClick` / long-press via `onContextMenu` (♡ button) | `Pressable` (`onPress` / `onLongPress`) |
| `PlaceholderBar` solid width bar | `View` with fixed height + approximate width |
| `ScenePicture` percent boxes | `View` + `onLayout` → multiply fractions by width/height |
| Full-image dim overlay | `View` absolute fill with `backgroundColor` + opacity |
| Region ring | bordered `View`; label `Text` pill |
| CSS opacity / translate transitions | Reanimated / Animated (`opacity`, `scale`, `translateY`) |
| Vertical clip pager (`ClipPager`) | `FlatList` `pagingEnabled` vertical |
| `playSpeech` → `/api/tts` | `expo-av` / `expo-audio` one queue, `onPlaybackStatusUpdate` ended |
| Cloudinary `<img>` | `Image` with PNG/WebP URI |
| Separate AR / TL text nodes | Two `Text` nodes (never one mixed run) |
| Admin box drag (admin only) | **Web only** — not ported |

Forbidden in this module: CSS `blur` / `backdrop-filter`, SVG masks, `clip-path`, `mix-blend-mode`, hover-only meaning, Web Audio API, emoji-as-icons, Lottie.
