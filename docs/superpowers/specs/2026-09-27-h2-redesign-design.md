# H2 redesign and Expo Router migration

Date: 2026-09-27 · Status: draft for review · Target: Android first (emulator `Medium_Phone_API_35`)

## Why

The current UI reads as AI-generated: the Bricolage Grotesque + DM Sans pairing with a plum/coral palette, every screen opening with a 37px title and a muted subtitle, identical white bordered cards, decorative orbit circles, and filler copy. The audience is young (Gen Z), so the app should be visual, colourful and short on words, without becoming noisy.

Navigation is also not native: sub-screens (chat, replies, person, editor) are `useState` switches inside a single route. The Android back button leaves the app, there are no transitions, and there is no pull-to-refresh.

## Decisions

1. **Visual direction: H2 "Night Out, restrained"** (mockup: `h2-night-restrained.html`, approved 2026-09-27). Dark only for v1; light mode is deferred.
2. **One accent per tab, one accent per screen.** People yellow, City pink, Chats cyan, You lime. On any screen the accent is used for at most three things: the active tab, the primary action, and one hero element. Everything else is neutral.
3. **Expo Router tabs + stack now**, in the same change as the reskin (user decision). The work is split into separately reviewable tasks so styling and routing can be isolated.
4. **No API, schema or server changes.** The post-detail route reads from the feed cache (see Risks).

## Foundations (`src/theme.ts`)

| Token | Value |
|---|---|
| `bg` | `#0D0D0E` |
| `surface` / `surface2` | `#18181A` / `#232326` |
| `ink` / `mute` / `line` | `#F2F0EB` / `#8C8A85` / `#2A2A2D` |
| `onAccent` | `#111111` |
| `danger` | `#FF6B6B` |
| `accent.people` / `city` / `chats` / `you` | `#FFD84A` / `#FF6BA6` / `#52D6FF` / `#B6F25A` |

- Type: display = Archivo ExtraCondensed Black (bundled TTF, OFL, from `github.com/Omnibus-Type/Archivo`), always uppercase. Body = Archivo 400/500/700/800 via `@expo-google-fonts/archivo`. Remove `@expo-google-fonts/bricolage-grotesque` and `@expo-google-fonts/dm-sans`.
- Radii: `sm 14`, `md 20`, `lg 24`, `pill 999`. Spacing: 4-point grid.
- Each screen imports its accent explicitly (`accent.city`). Nothing is inferred at runtime; a plain constant keeps it greppable.

## Components (`src/components/`)

`Title` (display text), `Pill` (filled accent / neutral, 44dp minimum touch target), `Chip` (neutral, emoji-friendly), `Avatar` (restyled round, optional accent ring), `PersonCard` (full-bleed photo card), `TabBar` (floating pill; active tab filled with its accent; neutral badges), `Fab`, `Bubble`, `EmptyState`, `Screen` (safe area + background). Screens stop defining their own buttons.

## Routes (`src/app/`)

```
_layout.tsx                 providers, fonts, root Stack with Stack.Protected guards
(auth)/welcome.tsx          signed out
(auth)/sign-in.tsx          signed out
onboarding.tsx              signed in, onboarding incomplete
(app)/_layout.tsx           SessionProvider, realtime subscription, Stack
(app)/(tabs)/_layout.tsx    Tabs with custom TabBar and badge counts
(app)/(tabs)/index.tsx      People
(app)/(tabs)/city.tsx       City feed
(app)/(tabs)/chats.tsx      Chats list
(app)/(tabs)/you.tsx        Profile
(app)/chat/[id].tsx         Conversation
(app)/person/[id].tsx       Public profile + connect
(app)/post/[id].tsx         Post replies
(app)/profile-edit.tsx      Profile editor
```

- **Session context** (`src/lib/session.tsx`): exposes `apiUrl`, `userId`, `getToken`, `profile` and `signOutLocal` to every screen. It replaces the current prop drilling of `apiUrl/getToken/onSessionExpired`, and centralises the session-expired → clear cache → sign out path.
- **Gate:** the root layout owns the profile query. `Stack.Protected` guards on `isSignedIn` and `profile.onboardingComplete` pick the group. The profile-error and missing-API-URL screens stay as they are, restyled.
- **Chat route:** `other` is resolved from the cached connections list, falling back to `GET /v1/people/{id}`.
- **Post route:** the post is read from the cached `['posts', userId, city]` pages. If it is missing (cold link), show "post not available" with a back action.

## Behaviour

- Pull-to-refresh (`RefreshControl`) on People, City, Chats and replies; the refresh icon buttons are removed.
- The feed and People lists move from `ScrollView` + `.map()` to `FlatList` with `onEndReached`, replacing "Load more" buttons. People-to-meet becomes a horizontal `FlatList` of `PersonCard`s.
- Android back and predictive back come from the native stack. Stack screens use the default platform transitions.
- Copy: short, lowercase labels ("wants in", "new here", "sent"). No eyebrows, no subtitles under titles.

## Screens not in the mockup

Chats list, person detail, replies, profile editor, welcome, sign-in and onboarding are restyled with the same tokens and components: display title, neutral surfaces, and the screen's accent on its primary action only. Welcome/sign-in/onboarding use yellow (the brand accent).

## Risks and tradeoffs

- **Post deep links:** without `GET /v1/posts/{id}`, a cold `post/[id]` link cannot render. Acceptable today because nothing links there. Push notifications would need the endpoint.
- **Big diff:** routing and styling land together. Mitigation: plan tasks are ordered foundations → components → routing shell → one screen per task, so each is reviewable alone.
- **Font bundling:** the ~150 KB TTF lives in `assets/fonts/`. Loaded via `expo-font`, so no native rebuild is needed. The Google Fonts packages change JS deps only.
- **Reversibility:** clean `git revert`. No data, schema or server residue.

## Verification

- `npm run typecheck`, `npm test` (the lib tests must still pass; they don't cover UI).
- Run on the Android emulator against the local Go API. Screenshot every screen with `adb exec-out screencap -p` and compare against the H2 mockup.
- Manually check: hardware back from chat/person/post/editor, pull-to-refresh, infinite scroll, tab badges, the sign-out → welcome flow.
