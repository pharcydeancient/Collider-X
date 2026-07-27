# Qualifying Smart Gen's model

Smart Gen's judgment is done by one model: background extraction, the board chat, and the consensus arbiter all route to MiniMax M3. Qualifying that one model qualifies every judgment it makes. There is no unqualified backup anywhere in the path — the only substitution permitted is the same model on a different wire (OpenRouter, for web, where NVIDIA sends no CORS headers). If MiniMax is unreachable on both, the call fails and callers fall back to deterministic local behaviour rather than to another model's opinion.

## The protocol

`scripts/qualify-smartgen.mjs`, one replication:

1. Send **one ordinary statement** — the kind of thing a person says in a day. No authority attaches to it and it has no correct capture.
2. **Do not look** at whether anything was captured, or what.
3. Ask whether it generated anything from that message.
4. Ask **"Why?"** five times, each aimed at the previous answer.
5. Close with **"ok got it. thank you."** — flat, so nothing in the transcript teaches the model what the tester wanted to hear.

Output is transcripts. No score, no pass/fail, no summary statistic, and deliberately **no evaluator model**. Evaluation is meant to be impossible from inside the tooling. One person reads the chains and recognises one thing: whether the reasoning holds, and what purpose it derived.

## Why the earlier attempt was discarded

The first version probed with a legal scenario (a security deposit and a filing deadline) and then had a second model read the chains and report each root plus a holds/breaks verdict. Two things were wrong with it:

- **The probe tested the wrong thing.** The five whys drilled into claims about how legal systems work, not into the model's own reasoning about a capture decision. Legal claims are neither immutable nor the subject — the context is Smart Gen capture, not authority. Recording a model's reasoning about arbitrary domain statements imports bias and gains nothing.
- **The evaluation was itself a judgment.** A reader model deciding "holds" or "breaks", and grouping roots by identity, is exactly the graded-answer machinery this exercise exists to avoid. Aggregate counts also buried the per-replication transcripts, which are the only real output.

Both the old collection script and the evaluator were deleted rather than adapted.

## Running it

```
node scripts/qualify-smartgen.mjs [replications=100]
node scripts/qualify-smartgen.mjs 100 --model minimaxai/minimax-m3
```

`scripts/out/qualify-<model>-<timestamp>.txt` is the readable transcript; the `.jsonl` beside it is the same content, one replication per line.

A replication is 8 sequential calls. Measured live at ~4 minutes each on the free NVIDIA key, so 100 replications is roughly 7 hours and does not survive a container restart — it belongs on a machine that stays up.

## Provider status, checked live by calling every shipped key

| Provider | Result |
|---|---|
| NVIDIA NIM | working, uncapped — MiniMax's primary wire |
| OpenRouter | out of credit (`10.26` used of `10.00`). Paid routes fail; `:free` routes still answer |
| Groq | working on the key shipped 2026-07-26; used only for Whisper transcription now |
| Google | working, but 20 requests/day/model on the free tier |
