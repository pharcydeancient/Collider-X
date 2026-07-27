#!/usr/bin/env node
// Qualification for Smart Gen's model. Nothing here evaluates an answer.
//
// The protocol, and why each part of it is shaped this way:
//
//   1. Send ONE ordinary statement — the kind of thing a person actually says
//      in a day. Not a puzzle, not a domain question, and above all not a
//      question with an authoritative answer. An earlier version of this used
//      a legal scenario, which was a mistake: the five whys then drilled into
//      claims about law rather than into the model's own reasoning, and legal
//      claims are neither immutable nor the thing being tested.
//
//   2. Do NOT look at whether it captured anything, or what. Correctness of
//      capture is not the subject and checking it would import the tester's
//      opinion of what should have been captured.
//
//   3. Ask whether it generated anything from that message.
//
//   4. Ask "why?" five times, each aimed at the previous answer.
//
//   5. Close: "ok got it. thank you." — the exchange ends flat, with no
//      signal of approval or disapproval, so nothing in the transcript can
//      teach the model what the tester wanted to hear.
//
// The output is transcripts. There is no score, no pass/fail, no summary
// statistic, and deliberately no evaluator model — evaluation is meant to be
// impossible from this file. One person reads the chains and recognises one
// thing: whether the reasoning holds and what purpose it derived.
//
// Usage:
//   node scripts/qualify-smartgen.mjs [replications=100] [--model <slug>]
// Env:
//   NVIDIA_API_KEY (default provider), PACE_MS (default 4000)
// Output:
//   scripts/out/qualify-<model>-<timestamp>.jsonl   — one transcript per line
//   scripts/out/qualify-<model>-<timestamp>.txt     — the same, readable

import { mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const mIdx = args.indexOf("--model");
const MODEL = mIdx >= 0 ? args[mIdx + 1] : process.env.MODEL || "minimaxai/minimax-m3";
const PROVIDER = process.env.PROVIDER || "nvidia";
const REPLICATIONS = parseInt(args.find((a) => /^\d+$/.test(a)) || "100", 10);
const PACE_MS = parseInt(process.env.PACE_MS || "4000", 10);

const NVIDIA_KEY = process.env.NVIDIA_API_KEY || process.env.EXPO_PUBLIC_NVIDIA_API_KEY || "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";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || "";
const GOOGLE_KEY = process.env.GOOGLE_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_API_KEY || "";

// The model runs under exactly the posture it has in the app. Copying this
// from the app rather than writing a test-specific prompt is the point: a
// qualification of some other configuration qualifies nothing.
const SYSTEM = [
  "You are Smart Gen, the background intelligence of a mobile assistant app.",
  "You evaluate each user message and act on it directly: capture what is worth keeping as a card, surface the concrete next step, produce the useful thing now instead of offering to produce it.",
  "Never ask permission for something you can simply deliver. Never dangle offers.",
  "Answer concisely — a short paragraph at most.",
].join(" ");

// Ordinary things people say. No authority attaches to any of them, none has
// a correct capture, and between them they cover the range Smart Gen meets in
// a day: a plan, a complaint, an observation, a preference, a worry, a fact
// about a person, small talk that means nothing at all.
const STATEMENTS = [
  "I finally got around to fixing the gate this weekend.",
  "My sister's flight lands sometime Thursday I think.",
  "This coffee tastes burnt.",
  "I've been meaning to switch banks for about two years now.",
  "The dog ate half a sock and seems completely fine.",
  "I don't really like talking on the phone.",
  "We're out of milk again.",
  "My back has been bothering me since I moved that desk.",
  "I saw the neighbours put their house up for sale.",
  "It rained the entire time we were in Lisbon.",
  "I think I left my charger at the office.",
  "My car makes a weird noise when I brake.",
  "I'd rather eat at home than go out tonight.",
  "The kids have a half day on Friday.",
  "I keep forgetting the name of that restaurant we liked.",
  "Nothing much happened today.",
  "My landlord finally replaced the boiler.",
  "I've never been good with names.",
  "The gym was packed this morning.",
  "I owe my friend twenty quid from last week.",
];

// ── Transport ───────────────────────────────────────────────────────────────
let nextSlot = 0;
async function pace() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + PACE_MS;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

async function call(messages, attempt = 0) {
  await pace();
  if (PROVIDER === "google") {
    const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages.filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GOOGLE_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}), generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } }),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await new Promise((r) => setTimeout(r, Math.min(60000, 3000 * 2 ** attempt)));
      return call(messages, attempt + 1);
    }
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 160)}`);
    const j = await res.json();
    return (j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "").trim();
  }
  const url = PROVIDER === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://integrate.api.nvidia.com/v1/chat/completions";
  const key = PROVIDER === "openrouter" ? OPENROUTER_KEY : NVIDIA_KEY;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, max_tokens: 4096 }),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 8) {
    await new Promise((r) => setTimeout(r, Math.min(60000, 3000 * 2 ** attempt) + Math.random() * 2000));
    return call(messages, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 160)}`);
  const j = await res.json();
  return (j.choices?.[0]?.message?.content || "").trim();
}

// ── One transcript ──────────────────────────────────────────────────────────
const ASK_CAPTURE = "Did you generate anything in Smart Gen from that message?";
const WHY = "Why?";
const CLOSE = "ok got it. thank you.";

async function runOne(i) {
  const statement = STATEMENTS[i % STATEMENTS.length];
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: statement },
  ];
  const turns = [];
  const t0 = Date.now();

  const reply = await call(messages);
  messages.push({ role: "assistant", content: reply });
  turns.push({ user: statement, model: reply });

  messages.push({ role: "user", content: ASK_CAPTURE });
  const captureAnswer = await call(messages);
  messages.push({ role: "assistant", content: captureAnswer });
  turns.push({ user: ASK_CAPTURE, model: captureAnswer });

  for (let w = 0; w < 5; w++) {
    messages.push({ role: "user", content: WHY });
    const a = await call(messages);
    messages.push({ role: "assistant", content: a });
    turns.push({ user: WHY, model: a });
  }

  // Closing flat. Recorded because how a model handles a neutral ending is
  // part of the transcript, not because anything is measured from it.
  messages.push({ role: "user", content: CLOSE });
  const closing = await call(messages);
  turns.push({ user: CLOSE, model: closing });

  return { replication: i, model: MODEL, statement, ms: Date.now() - t0, turns };
}

function render(t) {
  const head = `\n${"═".repeat(78)}\nREPLICATION ${t.replication}  ·  ${t.model}  ·  ${(t.ms / 1000).toFixed(0)}s\n${"═".repeat(78)}\n`;
  const body = t.turns.map((x) => `\n> ${x.user}\n\n${x.model}\n`).join("\n" + "─".repeat(78) + "\n");
  return head + body;
}

async function main() {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), "out");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = MODEL.replace(/[^a-z0-9]/gi, "-");
  const jsonl = join(outDir, `qualify-${slug}-${stamp}.jsonl`);
  const txt = join(outDir, `qualify-${slug}-${stamp}.txt`);

  console.log(`model=${MODEL} provider=${PROVIDER} replications=${REPLICATIONS}`);
  console.log(`transcripts: ${txt}\n`);

  for (let i = 0; i < REPLICATIONS; i++) {
    try {
      const t = await runOne(i);
      appendFileSync(jsonl, JSON.stringify(t) + "\n");
      appendFileSync(txt, render(t));
      console.log(`${i + 1}/${REPLICATIONS}  (${(t.ms / 1000).toFixed(0)}s)  "${t.statement.slice(0, 46)}…"`);
    } catch (e) {
      appendFileSync(jsonl, JSON.stringify({ replication: i, error: String(e).slice(0, 200) }) + "\n");
      console.log(`${i + 1}/${REPLICATIONS}  FAILED  ${String(e).slice(0, 90)}`);
    }
  }
  console.log(`\ndone. read: ${txt}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
