# Collider — Task List

Updated: end of media-roster curation. **Done means written and typechecked, not verified on device.** Nothing below has been run on hardware.

Progress: **3 of 9 stages complete.**

```
Stage 0  Money path          ████████████████████ DONE
Stage 2  Media roster        ████████████████████ DONE
Stage 3  Consensus map       ████████████████████ DONE
Stage 1  Credit economy      ░░░░░░░░░░░░░░░░░░░░ NEXT
Stage 4  Collide duplicate   ░░░░░░░░░░░░░░░░░░░░
Stage 5  Smart Gen tables    ░░░░░░░░░░░░░░░░░░░░
Stage 6  Design system       ░░░░░░░░░░░░░░░░░░░░
Stage 7  Market parity       ░░░░░░░░░░░░░░░░░░░░
Stage 8  Verification        ░░░░░░░░░░░░░░░░░░░░
```

---

## DONE

### Stage 0 — Money path
- [x] Tier granted only after store confirms + receipt verifies (`UpgradeScreen`)
- [x] IAP rewritten listener-based; `finishTransaction` now runs (stores auto-refund unfinished transactions — every prior purchase reversed itself)
- [x] `restorePurchases` added (App Store rejects non-consumables without it)
- [x] Wallpaper purchases charge the real SKU (were local mock, "no real charge")
- [x] `refund` reducer action; wired to 4 failure sites
- [x] Locked-model early return no longer charges
- [x] `retryLast` now charges (was unlimited free re-rolls of a weight-30 model)
- [ ] **`verifyPurchase` returns `true`** — named seam, not implemented. Needs a Supabase edge function hitting Apple `/verifyReceipt` + Google `purchases.subscriptions.get`. **Client-trusted receipts are spoofable. Do not take real money at scale until this is real.**

### Stage 2 — Media roster (4 Pro + 4 Elite in every media category)
- [x] **2 dead image routes fixed** — app called `google/gemini-3.1-flash-image`; real slug is `…-preview`. Both 404'd on every call.
- [x] Category `music` → `audio` (type, ids, market kinds, composer, features)
- [x] Unquoted `music:` key in `CATEGORY_MIN_TIER` — would have dropped the Pro gate on all of Audio
- [x] New `openrouter-speech` provider + `callOpenRouterSpeech` (TTS returns raw bytes, not JSON)
- [x] **14 dangling market seed refs repointed** (`img/dalle-3`, `vid/luma-dream`, `elite/o1-code`…) — phantom models the roster had already dropped
- [x] Roster ↔ routes verified 1:1, both directions, programmatically
- [x] Curation pass: dropped `gpt-5-image` (superseded by cheaper newer `gpt-5.4-image-2`), dropped `kling-3-pro` (only edge over Pro-tier Standard was "higher quality" — a tier bump, not a capability) for **Wan 2.6** (lip-sync + voice/character insertion + multi-shot — unique in roster)
- [ ] **TTS path never executed.** Voice ids (`alloy`, `af_bella`, `Zephyr`) are per-provider; a wrong one is a 400. One live call per model needed.
- [ ] Video generation is **async** (job id → poll). Confirm `callOpenRouterVideo` polls rather than expecting a sync response.

### Stage 3 — Consensus map
- [x] x-axis was bag-of-words token overlap — "X is faster" vs "X is **not** faster" scored ~1.0 similar. Now derives from arbiter alignment score.
- [x] y-axis used only the bottom half of the field (dissenters are `score < 0.5` by definition). Normalized within the band.
- [x] Agreers had one shared hardcoded coordinate — would have stacked every model in one pile in Total view
- [x] Center node blue/red duality (spec-required, was pure blue)
- [x] Center moved to 44% — was pinned to top edge, read as a tree not a constellation
- [x] `Dissent | Total` tab pair; Total omits links to dissenters per spec §4 (design system draws them — spec wins)
- [x] Fallback score saturation fixed (`maxSim * 1.8` flattened the top 44% of range to 1.0)
- [ ] Map appearance unverified on device
- [ ] Arbiter affinity is `1 - |sᵢ - sⱼ|` — correct in kind, but a true pairwise matrix from the arbiter is better

---

## REMAINING

### Stage 1 — Credit economy — NEXT
- [ ] Weekly + monthly ceilings (**only a daily pool exists** — Pro's monthly API cost is currently unbounded)
- [ ] Decide Collide's cost for Pro/Elite. Every open fires Sonnet at `max_tokens: 8192`, billed to you, charged to nobody. Spec asks this be decided; it's currently "free" by omission.
- [ ] Recalibrate weights against the finished roster (audio TTS is far cheaper per call than music — flat weights overcharge narration)
- [ ] Surface usage in Settings

### Stage 4 — Collide duplicate
- [ ] Merge FAB (`App.tsx:686-765`) into `CollideBanner` header. Spec names this defect explicitly.

### Stage 5 — Smart Gen tables
- [ ] Build one shared `SortableTable` (5 screens of identical logic — building it 5× is the trap)
- [ ] Memories, Projects, Artifacts, History: **0 sortable columns each**
- [ ] Reminders: has 4, spec wants 6 (+ tags, project)
- [ ] History drawer: sortable date/model/datetime + Consensus tab lip

### Stage 6 — Design system
- [ ] **`Glass.tsx` has no blur** — gradients faking it, while 6 other surfaces use real `BlurView`. The primitive named for the aesthetic is the one not implementing it.
- [ ] Tokenize radii (17/15/13/22/24 against an 8/12/16/20 scale)
- [ ] **Playfair Display absent** — spec names it for headers; no display face is loaded. Body font (Instrument Sans) is a deliberate deviation, ratify it.
- [ ] Drawers: spec says fit in frame, no scrolls — verify each
- [ ] Easing tokens

### Stage 7 — Market parity
- [ ] Tag filters + my-assets are local-only, not Supabase-backed
- [ ] No real accounts (per-install UUID as pseudo-identity)
- [ ] `MarketScreen.tsx` is 1703 lines with its own `localStyles` — largest drift surface
- [ ] All tab categories represented (now that Audio is a real modality, its market kind needs TTS/voice items, not just music)

### Stage 8 — Verification
- [ ] **No test suite exists anywhere.** Nothing above is regression-protected.
- [ ] Grid toolbar search icon opens overlay
- [ ] Left drawer → Imagine Market navigates
- [ ] "Convert to…" back-links to source (known missing)
- [ ] Reminder push fires at due time
- [ ] Purchase → own → play pipeline end-to-end

---

## Blocked on you (not code)

0. **OpenRouter is out of credit** (checked live, see `docs/VALIDATION_MINIMAX.md`): `$10.26` spent of `$10.00`, which kills every `provider: "openrouter"` route — most of the roster, including all image/video/music generation. Groq was replaced 2026-07-26 with a working key and is healthy again. NVIDIA NIM is uncapped; Google works at 20 requests/day/model. **Topping up OpenRouter is a you-thing, not a code-thing.**
1. **Premium wallpaper assets.** `assets/themes/premium/` is empty. The store sells `premium_mock_aurora` — BigBuckBunny plus five SoundHelix test tracks. Billing is now correct; the inventory is samples. Ship-blocking regardless of code.
2. **Receipt verification endpoint.** Stage 0's open item — needs a server.
3. **Font ratification.** Spec says Manrope + Playfair; app ships Instrument Sans + IBM Plex Mono. Either amend the spec or add Playfair for headers.

## Standing caveat

Every "done" above is **typechecked, not run**. Baseline error count 96 before my changes, 96 after — identical set, all pre-existing (missing `@types`, `children` prop patterns). That proves I introduced no new type errors. It proves nothing about behaviour. `npm install && npx tsc --noEmit` against the real config, then a device build, is the actual gate.
