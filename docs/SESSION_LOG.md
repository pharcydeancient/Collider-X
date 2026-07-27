# Session Log — chronological reference

Narrative record of this working session, in order. Purpose: so state/decisions can be looked up here instead of re-reading the full chat transcript. Append new sessions below a `---` divider with a date heading; don't rewrite history.

## Session 1 — initial build-out (2026-07-12)

1. User supplied the full product spec (→ `docs/SPEC.md`). Explored the existing codebase; found it already scaffolded most of the spec (grid/card views, history/memory/reminders/projects/files/market/wallpapers/upgrade screens, Groq/OpenRouter chat, IAP). Recommended building on it, not restarting.
2. Ran a full audit against the spec (→ `docs/AUDIT.md`). Found: native `<select>` crash risk, inverted monetization logic, dishonest model routing/labels, grid view UX gaps, fake consensus math, mock-only Smart Gen and Market.
3. Did a first round of direct fixes myself: glyph restoration, `<select>` → cross-platform `Picker`, image-URL markdown bug, monetization gate direction, ModelCard scrollable history (first pass).
4. User authorized subagents. Dispatched three in sequence/parallel (file-scope separated to avoid collisions):
   - Grid/UI overhaul (dropdown category selector, density selector, toast system, Android elevation)
   - Consensus galaxy overhaul + model-routing honesty (real LLM arbiter, force-directed layout, honest labels)
   - Smart Gen artifacts (Artifact type, cross-linking, LLM extraction pass, right-drawer relocation)
5. User asked me to find their Supabase API key — discovered no project existed yet, created one via the browser (`collider-native`, ref `gmenftvasdbhkbinkdux`), pulled the publishable key, installed `@supabase/supabase-js`.
6. Dispatched a fourth agent to build the Market backend (schema + live wiring). It couldn't execute SQL directly (no DB tool available to it) — wrote a migration file instead. I ran that migration myself via the Supabase SQL editor in-browser (had to redo it once after a corrupted paste); verified 18 seed rows + RLS enabled on all 3 tables.
7. User clarified "no password" concern was about the Supabase DB password (not app auth) — explained it's never touched by the app (REST API + publishable key only, no raw DB connection).
8. User asked to also do Google Calendar/Tasks. They didn't have a bundle ID for OAuth — found the app already has one in `app.json` (`app.collider.native`). User logged into Google Cloud Console; I enabled Calendar+Tasks APIs, created a Web OAuth client, added a test user, and dispatched an agent to build the OAuth flow (`googleAuth.ts`) + Calendar/Tasks wrapper + RemindersScreen wiring.
9. **Cost checkpoint**: user flagged spending ~$5/4 messages with nothing to show — root cause was expensive live browser-click debugging loops. Fixed one real bug found along the way (CardScreen's COLLIDE button had no `<ConsensusModal>` wired) and stopped the loop.
10. User pushed back on "why Web app" for Google OAuth — clarified Web-application is just the *credential type* (matches the only testable path, `expo start --web`), not the app itself becoming a web app. Added an iOS OAuth client too (using the existing bundle ID) so it's ready for a future native build; Android deferred (needs a keystore that doesn't exist yet).
11. Did a real end-to-end test: started the dev server (`expo start --web`), found and fixed a Metro/Supabase bundler crash (missing `metro.config.js` — Supabase's ESM deps need `mjs` in `sourceExts`), then drove the running app in the browser. Confirmed: chat pipeline works (real multi-model responses), model labels honest, history/memory/files screens load, monetization tracks correctly, consensus produces a real LLM verdict.
12. User asked for aesthetic validation. Found and fixed: consensus view required scrolling (spec wants one page — shrank score/summary/map sizing), a composer "Default" chip rendering with a fixed-width circle behind overflowing text (react-native-web `width: undefined` override quirk — fixed with explicit `"auto"`). Repeatedly struggled to reliably click "Imagine Market" in the drawer — traced most of it to a screenshot-pixel-space vs. click-coordinate-space mismatch in my own tooling; some clicks may still be genuinely landing on the wrong item. Left as an open manual-verification item.
13. User asked for streaming responses and asked where global search lives (it didn't exist). Implemented real SSE streaming (web) with native fallback, throttled dispatch, and fixed the Smart Gen LLM-extraction effect so it doesn't fire on truncated streaming partials. Built a new cross-type global search overlay + toolbar icon. Both compile clean; the search icon's live click also hit the same automation-targeting problem as the Market item — flagged for manual check, not confirmed broken.
14. User reported grid card previews had "huge gaps" and no chat bubbles. Root-caused: `ModelCard.tsx` rendered messages as bare `<Text>` with no bubble background, and un-rendered `\n\n` inside model replies created large blank-looking gaps. Fixed with real per-message bubble styling (purple/right for user, gray/left for assistant) and blank-line collapsing. Confirmed visually against the already-persisted test conversation (no new API calls needed).
15. User asked for spec/audit/progress to be saved to files instead of carried in context → wrote `docs/SPEC.md`, `docs/AUDIT.md`, `docs/PROGRESS.md`. Then asked for this session-log file too, and to reopen the app in browser.

## Outstanding as of end of Session 1
See "Known open items" in `docs/PROGRESS.md` — search icon and Imagine Market both need a manual tap-test; Smart Gen "Convert to..." doesn't back-link yet; Android Google OAuth client pending a real build.

---

## Session 2 — Aurora-glass redesign (2026-07-21)

Adopted the uploaded `Collider_Redesign.dc.html` as the new design system across
every screen (a deliberate fork from the prior neutral black/white "gloss"
direction — reintroduces per-model color + a cool aurora field).

1. **Type system**: swapped Manrope → Instrument Sans (body) + IBM Plex Mono
   (all technical labels/tiers/scores/kickers). Added `@expo-google-fonts/
   instrument-sans` + `ibm-plex-mono`; rewired `useFonts`; `fontFamilyForWeight`
   now maps to Instrument Sans, plus `monoFamily`/`FONT_MONO*` helpers.
2. **Design tokens** (`theme.ts`): added `T` palette, `GLASS_CARD`/`GLASS_PANEL`
   gradients; retuned chrome to transparent floating glass; mono applied to
   kicker/score/verdictLabel/sheetKicker/tier badges.
3. **Ambient background**: replaced the solid-disc `ParallaxScene` with an
   `AuroraField` — drifting SVG radial aurora blobs (blue + wallpaper accent) +
   a seeded twinkling starfield + bottom vignette. Default wallpaper is now a
   pure graphite-radial aurora (no photo).
4. **Home**: gradient SVG `Wordmark`; glass `ModelCard` with color dot · name ·
   mono tier + per-model corner bloom; glass composer; new `CollideButton`
   (obsidian pill, specular orb, breathing glow + pulse ring); `CollideBanner`
   rebuilt as a horizontal glass bar with a mono ALIGN score cell.
5. **Consensus**: 52px mono score, MODELS ALIGNED, glass verdict panel, dissent
   cards with DISSENT badges; palette moved to green `#7ee2a8` / coral `#ff6a5c`.
6. **All screens/drawers**: global sweep of legacy surfaces (`#6b6478`,
   `#161619`, `#0a0a0c`, purple-grays, old `#07040d` bg) to the translucent
   cool-glass palette. Smart Gen ("ai-firstify") stays proactive-by-default
   (`autoGen: true`); drawer footer reworded to the "no permission prompts,
   just delivered" ethos.

Note: `react-native-svg` radial/text renders correctly on native (the ship
target) but is known to render blank on `expo start --web` in this repo — the
aurora/wordmark/orb are native-correct. Live web preview was blocked here
(Expo's version-check call is refused by the agent proxy), so verification was
by `tsc --noEmit` (clean) + close reading against the reference, not a render.

---

## Session 3 — cards open in place, canvas placement, notebooks (2026-07-25)

1. **Provider audit, done by calling the keys** rather than trusting the roster.
   Both Groq keys are `401`; OpenRouter is out of credit; Google is capped at 20
   req/day/model; NVIDIA NIM works. Recorded in `docs/VALIDATION_MINIMAX.md` and
   `TASKS.md`.
2. **Gemini's replacement as fallback #3**: `deepseek-ai/deepseek-v4-flash` on the
   existing NVIDIA key, chosen by round-tripping candidates (several models NVIDIA
   lists 404 on completion). Gemini stays as the last step, which is what still
   catches the call on web where NVIDIA has no CORS.
3. **Cards are summaries that open in place.** Tap expands a card to full size
   where it sits (multiple at once, so two can be compared); the editor is now an
   explicit "Edit" affordance on the open card rather than what a tap costs you.
4. **Canvas view — free placement, and it is the default.** A card goes exactly
   where it is dropped and stays there. Nothing snaps: `Align` (grid icon) is the
   only thing that tidies, and picking a sort is the only thing that re-orders.
   Unplaced cards flow into the shortest column using measured heights, so opening
   one re-packs the cards below it without moving any card placed by hand.
   Drag-to-embed is deliberately not wired on the canvas — "on top of" must not
   silently mean "inside" on a surface whose point is putting cards next to each
   other. It still works in the lane views.
5. **Type identity got potency without losing the pale paper**: per-type tinted
   paper, a deep same-hue ink for the glyph and header, and an always-present type
   mark in the corner that the done-checkbox can no longer displace.
6. **Notebook template.** A card can wear either face: `card` (a stack of fields)
   or `notebook` (a header, ruled rows of plain strings, paged 7 at a time, with
   its own embedded search bar). `rows` and `search` are ordinary layout fields —
   placeable, movable, removable on any card, from the same list as every other
   field.
7. **Memories are the model's journal, not the user's list.** Both capture paths
   (the LLM extractor and the regex pass) now file a memory as a ROW under a
   subject header, creating a notebook card only when no existing header covers
   the subject. Twenty things learned is one card of twenty rows. The board-chat
   protocol gained `addRows`, and the Smart Gen system prompt says plainly that
   memories are for the model and reminders are for the user.
8. **The board inherits the app's background.** It was painting `#07080b` over the
   wallpaper/aurora; it is transparent now, with a toggle to cover the background
   for anyone who wants a plain field.
9. Verified by driving the real app in a browser (`expo start --web` + Playwright):
   canvas placement, drag, expand-in-place, notebook paging/search, the editor's
   new Face/Entries sections, Align, and the background toggle were all
   screenshotted working. `tsc --noEmit` clean of new errors (4 pre-existing, all
   in files this session didn't touch).
