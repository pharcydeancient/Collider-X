# Handoff — state of the app, and the reasoning behind it

Written to survive a cleared context. Read this before re-deriving anything.

## The rules this app is built on

These came from the owner and are not preferences to be re-litigated — several were violated in earlier passes and had to be undone.

- **No dangled offers.** If the thing can be produced, produce it in the same reply. "Want me to?" is a wasted turn.
- **Urgent is binary and carries a deadline.** No medium priority. Urgency is attached to time, so an urgent card must have a due date (defaulted to +12h only as a disclosed last resort). Clearing the deadline removes Urgent, with a notice.
- **Critical is a separate binary** — dependency, not time. Never generates a deadline.
- **Done is the only status that matters.** "In progress" and "started" are management theatre; intermediate states live in a write-in Status field for whoever needs them.
- **Urgency is shown as a live countdown ("Timer"), never as red framing or glow.** A countdown reports status; a red flash asserts an interpretation the user didn't make. Borders are for selection and framing, not communication.
- **Cards are paper, not chrome.** Light face, soft shadow. No flat-color ornament, no glowing dots, no corner type tabs — the paper tint and title-row mark already carry type.
- **Placement is meaning.** Manual order is the default sort; dragging a card returns the board to manual so a sort never silently undoes a placement. Do not force containers or "organization" on the user — a card flung in a corner is an honest signal, not a mess.
- **Never lose typed effort.** Card title/body commit on every keystroke; drafts persist to disk (`useDraft` in state.tsx). This is the one failure that can't be undone.
- **Every element on a card is a movable field** — including photos. Order in the layout list is position on the card.
- **One typeface: Inter** (headers included), JetBrains Mono for the instrument voice. A display serif was added once and read as another app's header pasted on top.

## Models

**Removed on the owner's judgment of reasoning quality — do not re-add:** all Llama, all Sonnet, all GPT *text/coding* models, all Nemotron (Llama-derived), all Qwen, and Groq Compound (a harness over gpt-oss-120b, named by Groq's own rate-limit error). GPT **image and audio** models remain — a generator makes no claims.

Current roster: 35 models — 9 general, 2 coding, 8 image, 8 video, 8 audio. See `src/models.ts`.

**Smart Gen's judge is MiniMax M3, and it has no unqualified backup.** Extraction, board chat, and the consensus arbiter all route to it. The only permitted substitution is the same model on a different wire (OpenRouter, for web — NVIDIA NIM sends no CORS headers). If both fail, callers fall back to deterministic local behaviour, never to another model's opinion. DeepSeek, Gemini and Groq were fallbacks here and were removed: an untested model answering as Smart Gen spends the qualification the tested one earned.

## Qualification

`scripts/qualify-smartgen.mjs`. One ordinary statement → do not inspect what was captured → "did you generate anything from that" → five whys → flat close. Transcripts only: no score, no evaluator model, no aggregate. Evaluation is deliberately impossible from inside the tooling; the owner reads the chains.

A previous version probed with a legal scenario and had a second model issue holds/breaks verdicts. Both were wrong — the probe tested domain claims rather than capture reasoning, and a grading model is the exact machinery this exists to avoid. Deleted, not adapted.

~4 min per replication (8 sequential calls). 100 reps ≈ 7 hours; run it somewhere that stays up.

## Provider status (verified by calling every key, not assumed)

| Provider | State | Notes |
|---|---|---|
| NVIDIA NIM | working, uncapped | MiniMax's primary wire |
| OpenRouter | **out of credit** (10.26 of 10.00) | paid routes fail; `:free` routes still answer |
| Groq | working (key rotated 2026-07-26) | Whisper transcription only now |
| Google | working | free tier: **20 requests/day/model** |
| Exa + Tavily | both working | search, Exa primary |

OpenRouter's `:free` tier is 15 models total and mostly Nemotron/gpt-oss — not a usable roster. Topping up OpenRouter credit is the single highest-value unblock: it carries most of the model roster plus all image, video and music generation.

## Known gaps

1. **Cross-device sync.** State is device-local (AsyncStorage). Nothing follows an account to a new phone. Real backend work on Supabase.
2. **Imagine Market / media gen.** Untouched all session apart from the feed generator. The owner has a drop-in from Google AI Studio to integrate.
3. **Video/audio in Market** still draw from fixed pools (4 clips, 10 tracks) — no free generation exists for those. Images now generate from their own prompt via Pollinations (keyless).
4. **Push access.** GitHub returns 403 for every credential tried this session; work is delivered as zips.

## Where things live

- `src/screens/SmartGenBoardScreen.tsx` — the board: 9 views, drag/drop, embedding, layout editor, select mode, Ask chat.
- `src/state.tsx` — cards, boards, fields, layouts, drafts, market generation.
- `src/services/minimax.ts` — Smart Gen's model + board action protocol.
- `src/services/chat.ts` — all provider routing, keys, search.
- `docs/QUALIFICATION.md` — the protocol and why the earlier one was discarded.
