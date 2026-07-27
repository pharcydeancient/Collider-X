# Working instructions for this repo

- Don't ask "want me to keep going / finish the rest / continue with X?" at the end of a turn. If there's obvious follow-through work (remaining items from a list the user already gave, fixing something you just found), just do it and report what changed when done. Only stop and ask when a decision genuinely needs the user's input (ambiguous intent, a destructive/irreversible action, or a real design fork with no clear default).

## Settled decisions — do not re-litigate or quietly reverse

These were each decided deliberately, and several were violated by later passes and had to be undone. Changing one requires saying so out loud, not folding it into an unrelated commit.

**Product semantics**
- **No dangled offers.** If the thing can be produced, produce it in this reply.
- **Urgent is binary and carries a deadline.** No medium. Urgency is attached to time; +12h is a disclosed last-resort default. Clearing the deadline removes Urgent, with a notice.
- **Critical is a separate binary** — dependency, not time. Never generates a deadline.
- **Done is the only status that matters.** "In progress"/"started" are management theatre; intermediate states go in a write-in Status field.
- **Placement is meaning.** Manual order is the default sort; a drag returns the board to manual. Never force containers or "organization" on the user.
- **Never lose typed effort.** Card text commits per keystroke; drafts persist (`useDraft`). This is the one unrecoverable failure.

**Visual**
- Urgency shows as a **live countdown ("Timer")** — never red framing, glow, or animation. A countdown reports; a red flash asserts an interpretation the user didn't make.
- **Cards are paper**: light face, soft shadow. No flat-colour ornament, no glowing dots, no corner type tabs.
- **One typeface: Inter**, headers included. JetBrains Mono for the instrument voice. A display serif was added once and read as another app's header pasted on top.
- Borders are for selection and framing, not communication.

**Models — removed on the owner's judgment, do not re-add**
All Llama, all Sonnet, all GPT *text/coding*, all Nemotron (Llama-derived), all Qwen, Groq Compound (a harness over gpt-oss-120b), and Gemini Pro from general chat. GPT **image and audio** models stay — a generator makes no claims.

The objection is not competence. The Market feed was built to *look* generated — 52 prompts with a counter suffix and stock photos — which is a decision to protect appearance over serving the need. That is the disqualifying pattern.

**Smart Gen's judge is MiniMax M3, with no unqualified backup.** Extraction, board chat and the consensus arbiter all route to it. The only permitted substitution is the same model on another wire (OpenRouter, for web — NVIDIA NIM sends no CORS headers). If both fail, fall back to deterministic local behaviour, never another model's opinion.

**Qualification** (`scripts/qualify-smartgen.mjs`, `docs/QUALIFICATION.md`): ordinary statement → do not inspect what was captured → "did you generate anything" → five whys → flat close. Transcripts only. No score, no evaluator model, no aggregate — evaluation is deliberately impossible from inside the tooling.

## Environment facts worth not rediscovering

- The dev server runs **inside this container**, not on the owner's machine. `localhost:8081` only works here. Deliver builds as zips.
- **Push is 403 for every credential tried.** Work is delivered by zip, not git.
- Verify provider keys by **calling them**, not by reading a roster — models get retired from catalogues silently (llama-4-scout, qwen3-coder:free both 404/retired while listed).
- OpenRouter: out of credit; `:free` routes still answer, paid ones don't. Google: 20 req/day/model. Groq and NVIDIA: working.

See `docs/HANDOFF.md` for fuller context and the file map.
