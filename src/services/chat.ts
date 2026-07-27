// Direct provider calls. User explicitly requested the keys be shipped in-app.
// Groq is primary; OpenRouter is fallback for models Groq doesn't host.
// Image generation uses Pollinations (free, no key) plus real OpenRouter
// image models. Audio STT uses Groq whisper.
// Web search: Exa (primary, raw results) → Tavily (fallback, raw results).
// Gemini grounded search was removed deliberately — the user's Gemini key is
// their own personal dev-usage key (heavily used for app development
// elsewhere), not a dedicated search budget, and it was already showing
// 429 RESOURCE_EXHAUSTED in live testing. Exa + Tavily are both independent,
// dedicated search-API keys with their own quotas.
import type { ChatMessage, Memory } from "../state";
// Deliberate module cycle (minimax.ts imports webSearch/readSSEStream from
// here): both sides only call each other's hoisted function declarations at
// request time, never during module init, so Metro resolves it fine.
import { callMiniMax } from "./minimax";

// Provider errors below (Groq/OpenRouter) intentionally carry the raw
// response body for debugging — but that raw text (rate-limit JSON,
// provider internals) was reaching end users verbatim as a chat bubble.
// A clean app never shows a user "OpenRouter 429: {"error":{"message"...".
// This translates any thrown Error into copy a user should actually see;
// callers display the result, never error.message directly.
export function friendlyErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  // providerError() below already produced a sentence meant for the user, and
  // it says more than anything inferable from a status code (which credit ran
  // out, which key was refused). Pattern-matching it a second time would flatten
  // it back to the generic line, so it passes through untouched.
  if (error instanceof Error && (error as any).userFacing) return msg;
  if (/\b429\b/.test(msg)) return "This model is getting a lot of requests right now — try again in a moment.";
  if (/\b401\b|\b403\b/.test(msg)) return "This model couldn't be reached with your current access — try again or switch models.";
  if (/timeout|network|fetch/i.test(msg)) return "Couldn't reach this model — check your connection and try again.";
  if (/\b5\d\d\b/.test(msg)) return "This model is temporarily unavailable. Try again shortly.";
  return "Something went wrong generating a response. Try again.";
}

// Expo/Metro only inlines env vars into the client bundle when prefixed
// EXPO_PUBLIC_ — a bare process.env.FOO here would silently resolve to
// undefined at runtime with no build error, since there's no babel/dotenv
// plugin in this project doing the inlining for unprefixed names.
// NOTE: EXPO_PUBLIC_ vars are still bundled into the shipped JS and are
// extractable by anyone who unpacks the app — this keeps keys out of git
// source, it does not make them a real secret. A server-side proxy (see
// TASKS.md B1) is the only fix for that; out of scope for this pass.
// Keys ship in-app by explicit owner decision (same stance as minimax.ts).
// The env var still wins when set, so a rotated key never needs a code
// change — but an environment without a .env no longer silently loses every
// provider, which is what an env-only setup caused.
const GROQ_KEYS = (process.env.EXPO_PUBLIC_GROQ_API_KEYS || "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").split(",").filter(Boolean);
const OPENROUTER_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || "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";
const EXA_KEY = process.env.EXPO_PUBLIC_EXA_API_KEY || "324b68a6-2633-4b9e-b3b4-f5cd960d595b";
const TAVILY_KEY = process.env.EXPO_PUBLIC_TAVILY_API_KEY || "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";
// Google's key is NOT shipped in source: GitHub's secret scanning blocks the
// push outright (unlike the other providers' formats, which it doesn't
// recognise). Put it in .env as EXPO_PUBLIC_GOOGLE_API_KEY — without it, the
// Gemini routes below fail and the app falls through to its other providers.
const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY || "";

// ── Exa search (primary) ─────────────────────────────────────────────────────
// Exa free tier: 1,000 queries/month, no credits system.
// Returns a formatted block of raw results ready to inject into system prompt.
async function exaSearch(query: string): Promise<string> {
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": EXA_KEY },
      body: JSON.stringify({
        query,
        numResults: 5,
        useAutoprompt: true,
        contents: { text: { maxCharacters: 500 } },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[Exa] HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return "";
    }
    const json = await res.json();
    const results = Array.isArray(json.results) ? json.results : [];
    const parts: string[] = [];
    results.forEach((r: any, i: number) => {
      if (!r?.title) return;
      const snippet = (r?.text || r?.summary || "").slice(0, 500);
      parts.push(`[${i + 1}] ${r.title} (${r.url})\n${snippet}`);
    });
    if (!parts.length) console.warn("[Exa] No results:", JSON.stringify(json).slice(0, 300));
    return parts.join("\n\n");
  } catch (e) {
    console.warn("[Exa] Network error:", e);
    return "";
  }
}

// ── Tavily search (fallback) ─────────────────────────────────────────────────
// Kicks in only if Exa returns nothing. Same raw-results shape as Exa so
// webSearch() can treat them interchangeably.
async function tavilySearch(query: string): Promise<string> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: TAVILY_KEY, query, max_results: 5 }),
    });
    if (!res.ok) {
      console.warn(`[Tavily] HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return "";
    }
    const json = await res.json();
    const results = Array.isArray(json.results) ? json.results : [];
    const parts: string[] = [];
    results.forEach((r: any, i: number) => {
      if (!r?.title) return;
      parts.push(`[${i + 1}] ${r.title} (${r.url})\n${(r?.content || "").slice(0, 500)}`);
    });
    if (!parts.length) console.warn("[Tavily] No results:", JSON.stringify(json).slice(0, 300));
    return parts.join("\n\n");
  } catch (e) {
    console.warn("[Tavily] Network error:", e);
    return "";
  }
}

// ── Unified web search ───────────────────────────────────────────────────────
// Exa (neural search) primary for every mode, Tavily as fallback — both
// dedicated search-API keys, no dependency on the user's personal Gemini
// quota (see the removal note above these functions).
//
// sendChat runs once per selected model, and every one of those calls hits
// this same query independently — without caching that's N separate live
// searches for what's supposed to be "one search, injected into every
// model." Exa's autoprompt rewriting isn't deterministic call-to-call and
// either provider can silently fail/rate-limit on any single one of those N
// calls, so models were actually seeing different search results (or none)
// despite the UI implying a shared lookup. Caching by query+mode makes every
// concurrent model call share one real network round trip and one identical
// result set.
const searchCache = new Map<string, Promise<string>>();
// Exported for minimax.ts (Smart Gen's own model) — same shared cache, so a
// board-chat lookup and a grid-chat lookup of the same query cost one call.
export async function webSearch(query: string, mode?: string): Promise<string> {
  const key = `${mode || "default"}::${query}`;
  const cached = searchCache.get(key);
  if (cached) return cached;
  const promise = (async () => {
    const exa = await exaSearch(query);
    if (exa) return exa;
    return tavilySearch(query);
  })();
  searchCache.set(key, promise);
  promise.finally(() => { setTimeout(() => searchCache.delete(key), 5000); });
  return promise;
}


type Route = {
  // "openrouter-audio" = chat-completions with modalities:["audio","text"]
  // (music generation and conversational voice). "openrouter-speech" = the
  // dedicated /api/v1/audio/speech endpoint used by TTS models, which returns a
  // RAW BYTE STREAM rather than JSON — a genuinely different call shape, not a
  // variant of the same one, so it gets its own provider rather than a flag.
  provider: "groq" | "google" | "openrouter" | "pollinations-image" | "openrouter-image" | "openrouter-video" | "openrouter-audio" | "openrouter-speech";
  // TTS models require a voice id; each model exposes its own set.
  voice?: string;
  remote: string;
  vision?: boolean;
  systemOverride?: string;
  imageAfter?: string; // pollinations style used to generate a reference frame after the chat reply
};
const ROUTES: Record<string, Route> = {
  // ── General · Free — real current models, verified against OpenRouter's
  // live catalog (fetched directly), not guessed ────────────────────────────
  "free/claude-haiku-4-5":       { provider: "openrouter", remote: "anthropic/claude-haiku-4.5" },
  "free/gemini-3-6-flash":       { provider: "google",     remote: "gemini-3.6-flash",              vision: true },
  "free/mistral-small":          { provider: "openrouter", remote: "mistralai/mistral-small-3.2-24b-instruct" },
  "free/command-r":              { provider: "openrouter", remote: "cohere/command-r-08-2024" },
  "free/minimax-m3":             { provider: "openrouter", remote: "minimax/minimax-m3" },

  // ── General · Pro ─────────────────────────────────────────────────────────
  // Groq Compound was added and then removed: it is a harness over
  // openai/gpt-oss-120b (named by Groq's own rate-limit error), so it
  // reintroduced a model family cut from the roster, and its one unique
  // contribution — server-side search — is already provided here by the
  // Exa/Tavily pass that feeds every model.
  "pro/grok-4-5":                { provider: "openrouter", remote: "x-ai/grok-4.5",                 vision: true },

  // ── General · Elite — no Opus, no Fable ───────────────────────────────────
  "elite/sonar-reasoning-pro":   { provider: "openrouter", remote: "perplexity/sonar-reasoning-pro" },
  "elite/mistral-large":         { provider: "openrouter", remote: "mistralai/mistral-large-2512" },

  // ── Coding · Free ─────────────────────────────────────────────────────────

  // ── Coding · Pro ─────────────────────────────────────────────────────────

  // ── Coding · Elite — no Opus ───────────────────────────────────────────────
  "elite/codestral-2508":        { provider: "openrouter", remote: "mistralai/codestral-2508" },
  "elite/kimi-k2-7-code":        { provider: "openrouter", remote: "moonshotai/kimi-k2.7-code" },

  // ── Image generation — real OpenRouter image models for Pro/Elite (already
  // using the app's existing OpenRouter key), plus one genuinely-keyless
  // Pollinations model kept for the free tier — nobody's account is billed
  // for that one, so it's a reasonable free taste of the category instead
  // of Image being entirely locked for free users.
  "img/flux-free":               { provider: "pollinations-image", remote: "flux" },
  "img/gemini-3-1-flash-image":  { provider: "openrouter-image", remote: "google/gemini-3.1-flash-image-preview" },
  "img/gpt-5-image-mini":        { provider: "openrouter-image", remote: "openai/gpt-5-image-mini" },
  "img/gemini-3-pro-image":      { provider: "openrouter-image", remote: "google/gemini-3-pro-image-preview" },

  // ── Video generation — real video files via OpenRouter's async /videos job
  // API (create → poll → download), confirmed live: created a real job
  // against google/veo-3.1-fast, polled it to completion (~30s, $0.48 for a
  // 4s clip), and downloaded an actual video/mp4. Model IDs confirmed
  // against OpenRouter's own /api/v1/videos/models capability list, not
  // guessed — the previous entries here routed to a TEXT model that wrote a
  // storyboard description, no video ever produced.
  // Pro-tier video routes — IDs confirmed against the same
  // /api/v1/videos/models list (google/veo-3.1-lite, kwaivgi/kling-v3.0-std,
  // x-ai/grok-imagine-video), added to fill SPEC.md's "3 pro" video
  // requirement, which the tier had 0 models against after the fake
  // runway/pika/kling/luma entries were removed.
  "img/seedream-4-5":            { provider: "openrouter-image", remote: "bytedance-seed/seedream-4.5" },
  "img/flux-2-klein":            { provider: "openrouter-image", remote: "black-forest-labs/flux.2-klein-4b" },
  "img/flux-2-max":              { provider: "openrouter-image", remote: "black-forest-labs/flux.2-max" },
  "img/gpt-5-4-image-2":         { provider: "openrouter-image", remote: "openai/gpt-5.4-image-2" },

  "vid/veo-3-1-lite":       { provider: "openrouter-video", remote: "google/veo-3.1-lite" },
  "vid/kling-3-standard":   { provider: "openrouter-video", remote: "kwaivgi/kling-v3.0-std" },
  "vid/grok-imagine-video": { provider: "openrouter-video", remote: "x-ai/grok-imagine-video" },

  "vid/sora-2":  { provider: "openrouter-video", remote: "openai/sora-2-pro" },
  "vid/veo-3":   { provider: "openrouter-video", remote: "google/veo-3.1" },
  "vid/seedance-2-fast": { provider: "openrouter-video", remote: "bytedance/seedance-2.0-fast" },
  "vid/seedance-2":      { provider: "openrouter-video", remote: "bytedance/seedance-2.0" },
  "vid/wan-2-6":         { provider: "openrouter-video", remote: "alibaba/wan-2.6" },

  // ── Music generation — real sung/instrumental audio via Google's Lyria 3,
  // the only music-generation model actually available through OpenRouter
  // (there is no real Suno/Udio API access here — those brand names were
  // wrong regardless of backing, see the models.ts relabel to "Lyria 3
  // Clip/Pro"). Confirmed live: Lyria's audio output requires stream:true
  // (a non-streaming request 400s and says so explicitly) and arrives as
  // base64 chunks in each SSE delta's `audio.data` field, concatenated here
  // into one playable file — same category of bug as video: the previous
  // entries routed to a text model writing lyrics, no audio ever produced.
  "aud/lyria-3-clip":  { provider: "openrouter-audio", remote: "google/lyria-3-clip-preview" },
  "aud/gpt-audio-mini": { provider: "openrouter-audio", remote: "openai/gpt-audio-mini" },
  "aud/gpt-audio":      { provider: "openrouter-audio", remote: "openai/gpt-audio" },
  // TTS — note the non-obvious slug suffixes; OpenRouter's docs call this out
  // explicitly ("gpt-4o-mini-tts-2025-12-15, not gpt-4o-mini-tts"). Dropping
  // them 404s.
  "aud/gpt-4o-mini-tts":   { provider: "openrouter-speech", remote: "openai/gpt-4o-mini-tts-2025-12-15", voice: "alloy" },
  "aud/kokoro-82m":        { provider: "openrouter-speech", remote: "hexgrad/kokoro-82m", voice: "af_bella" },
  "aud/gemini-3-1-flash-tts": { provider: "openrouter-speech", remote: "google/gemini-3.1-flash-tts-preview", voice: "Zephyr" },
  "aud/voxtral-mini-tts":  { provider: "openrouter-speech", remote: "mistralai/voxtral-mini-tts-2603" },
  "aud/lyria-3-pro":  { provider: "openrouter-audio", remote: "google/lyria-3-pro-preview" },
};


export function isRoutable(modelId: string) {
  return !!ROUTES[modelId];
}

// Providers occasionally return HTTP 200 with an empty message body (rate
// throttling, moderation no-ops, transient upstream hiccups) — sendChat
// can't tell that apart from "the model genuinely said nothing", so callers
// that want resilience against it should go through this wrapper instead of
// calling sendChat directly. One silent retry, no caller-visible change.
export async function sendChatWithRetry(
  modelId: string,
  history: ChatMessage[],
  prompt: string,
  memories: Memory[] = [],
  opts: ChatOptions = {},
): Promise<string> {
  const first = await sendChat(modelId, history, prompt, memories, opts);
  if (first) return first;
  return sendChat(modelId, history, prompt, memories, opts);
}

export type Attachment = { kind: "image"; dataUri: string; mime: string };
export type ChatOptions = {
  mode?: "default" | "research" | "deep";
  webSearch?: boolean;
  // Was collected in the AgentSkillsDrawer's Rules tab and saved to state,
  // but never actually reached a model — the whole "Console Control"
  // panel was cosmetically complete and functionally inert. Wired here the
  // same way memories/webSearch already are.
  customInstructions?: string;
  // Same "collected but never reached a model" bug as customInstructions,
  // for the Agents tab: a created agent's persona/instructions previously
  // had no path into an actual request. Wired the same way.
  agentInstructions?: string;
  // Same bug again, for the Skills tab: toggling a skill saved its id to
  // state.activeSkills but nothing ever read that list back out. Callers
  // resolve the active skill ids to their instruction text and pass it
  // through here.
  skillInstructions?: string[];
  attachments?: Attachment[];
  // Called with the accumulated text so far as tokens arrive. On web this
  // streams in real time (browser fetch supports ReadableStream); on native,
  // fetch's body reader isn't reliably available, so it fires once with the
  // full text when the response completes — callers must handle both.
  onToken?: (partial: string) => void;
};

export async function sendChat(
  modelId: string,
  history: ChatMessage[],
  prompt: string,
  memories: Memory[] = [],
  opts: ChatOptions = {},
): Promise<string> {
  const route = ROUTES[modelId];
  if (!route) return "This model is visible in the tray but not yet wired to a provider.";

  if (route.provider === "pollinations-image") {
    return generateImageUrl(prompt, route.remote);
  }

  if (route.provider === "openrouter-image") {
    return callOpenRouterImage(route.remote, prompt || "abstract art");
  }

  if (route.provider === "openrouter-video") {
    return callOpenRouterVideo(route.remote, prompt || "a short abstract scene");
  }

  if (route.provider === "openrouter-audio") {
    return callOpenRouterAudio(route.remote, prompt || "a short instrumental piece");
  }
  if (route.provider === "openrouter-speech") {
    return callOpenRouterSpeech(route.remote, prompt || "Hello from Collider.", route.voice);
  }

  const messages: any[] = [];
  const sysParts: string[] = [
    route.systemOverride || "You are Collider, a concise, helpful assistant.",
    // Never offer-then-wait ("I could look that up / write that / generate
    // that — want me to?"). If you're capable of producing the thing, and
    // the user would plausibly say yes, just produce it now in this same
    // reply. Asking permission for something you could just deliver wastes
    // a turn for no reason — the user can ignore or discard it if unwanted.
    "Do not dangle offers. If you can produce something useful (an answer, a draft, a lookup, a generation), do it now in this reply rather than asking permission first.",
  ];
  if (opts.agentInstructions?.trim()) {
    sysParts.push(`You are acting as a custom agent with this role — stay in this role for every reply:\n${opts.agentInstructions.trim()}`);
  }
  if (opts.skillInstructions?.length) {
    sysParts.push(`Compiled skills are active for this conversation — apply each of these:\n${opts.skillInstructions.map((s) => `- ${s}`).join("\n")}`);
  }
  if (opts.customInstructions?.trim()) {
    sysParts.push(`User's global instructions — follow these for every reply:\n${opts.customInstructions.trim()}`);
  }
  // This answer gets saved as a real Artifact document (see
  // saveResearchArtifact in App.tsx) — it needs to read as a standalone
  // report someone opens later, not a chat reply that only makes sense
  // in-context.
  if (opts.mode === "research") sysParts.push("Research mode: produce a structured research report with a short title line, a summary, a '## Key Findings' section as a list, and a '## Sources' section citing which search result each finding came from. Note any uncertainty explicitly.");
  if (opts.mode === "deep") sysParts.push("Deep mode: produce a thorough structured report — title line, '## Analysis' walking through the reasoning step-by-step, '## Edge Cases & Caveats', and '## Conclusion'. This should read as a standalone document, not a conversational reply.");
  // The globe toggle in the composer, and research/deep mode, all land here.
  // Results are folded into the system message BEFORE the provider is chosen,
  // so every route — Groq, Google, OpenRouter — gets the same search context.
  // Exa is primary with Tavily behind it; both keys verified answering live.
  const wantsSearch = opts.webSearch || opts.mode === "research" || opts.mode === "deep";
  if (wantsSearch && prompt) {
    const results = await webSearch(prompt, opts.mode);
    if (results) {
      sysParts.push(`Live web search results for the user's query — use these as your source of truth for anything time-sensitive or outside your training data, and cite which result each fact came from:\n\n${results}`);
    } else {
      sysParts.push("Web search was attempted but returned no results — say so explicitly rather than guessing.");
    }
  }
  if (memories.length) {
    const lines = memories.slice(0, 40).map((m) => `- ${m.content}`).join("\n");
    sysParts.push("Persistent user memories (do not repeat unless asked):\n" + lines);
  }
  messages.push({ role: "system", content: sysParts.join("\n\n") });
  for (const m of history) messages.push({ role: m.role, content: m.content });

  const attachments = opts.attachments || [];
  const hasImages = attachments.some((a) => a.kind === "image");
  if (hasImages && route.vision) {
    const content: any[] = [{ type: "text", text: prompt || "Describe what you see." }];
    for (const a of attachments) {
      if (a.kind === "image") content.push({ type: "image_url", image_url: { url: a.dataUri } });
    }
    messages.push({ role: "user", content });
  } else {
    const noteImg = hasImages && !route.vision ? "\n\n[Note: user attached image(s) but this model has no vision — describe based on prompt only]" : "";
    messages.push({ role: "user", content: (prompt || "Describe the attachment.") + noteImg });
  }

  // Video/music routes append a second generated asset after the text reply —
  // streaming the intro text still helps (storyboard/lyrics are the slow part).
  const onTok = route.imageAfter ? undefined : opts.onToken;
  const reply = route.provider === "groq"
    ? await callGroq(route.remote, messages, onTok)
    : route.provider === "google"
    ? await callGoogle(route.remote, messages, onTok)
    : await callOpenRouter(route.remote, messages, onTok);

  // Video routes: append a rendered reference frame using the storyboard's REFERENCE FRAME line.
  if (route.imageAfter && reply) {
    const refMatch = reply.match(/REFERENCE FRAME:\s*(.+)/i);
    const framePrompt = (refMatch?.[1] || prompt).trim().slice(0, 240);
    const full = `${reply}\n\n---\n\n${generateImageUrl(framePrompt, route.imageAfter)}`;
    opts.onToken?.(full);
    return full;
  }
  return reply;
}

// Parses an OpenAI-compatible SSE stream, calling onToken with the
// accumulated text as chunks arrive. Falls back to a single onToken call
// with the full text if the runtime's fetch doesn't expose a body reader
// (React Native's native fetch, unlike react-native-web's browser fetch).
export async function readSSEStream(res: Response, onToken?: (partial: string) => void): Promise<string> {
  const body: any = res.body;
  if (!body || typeof body.getReader !== "function") {
    const json = await res.json();
    const full = json.choices?.[0]?.message?.content ?? "";
    onToken?.(full);
    return full;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let full = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) { full += delta; onToken?.(full); }
      } catch {
        // Ignore partial/malformed chunk boundaries — the next read fills them in.
      }
    }
  }
  return full;
}

// Provider failures are shown to the user verbatim, so they have to read as
// sentences rather than as a pasted HTTP body. Only the states a person can
// actually do something about get their own wording; everything else keeps
// the status code and a trimmed detail so a real bug stays diagnosable.
async function providerError(label: string, res: Response): Promise<Error> {
  const body = await res.text().catch(() => "");
  let detail = "";
  try { detail = JSON.parse(body)?.error?.message || ""; } catch { /* body wasn't JSON */ }

  // `userFacing` tells friendlyErrorMessage this text is already final. Unset
  // on the last line: an unrecognised status is a bug, not a user's problem,
  // so it keeps the raw detail and gets the generic copy at display time.
  const speak = (m: string) => Object.assign(new Error(m), { userFacing: true });

  if (res.status === 401 || res.status === 403) return speak(`${label} rejected the API key.`);
  if (res.status === 402) return speak(`${label} is out of credit. Top up to use this model.`);
  if (res.status === 429) return speak(`${label} is rate limited right now. Try again in a moment.`);
  if (res.status === 404) return speak(`${label} no longer offers this model.`);
  if (res.status >= 500) return speak(`${label} is having trouble right now. Try again shortly.`);
  return new Error(`${label} ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
}

export async function callGroq(model: string, messages: any[], onToken?: (partial: string) => void) {
  let lastErr: any = null;
  for (const key of GROQ_KEYS) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1024, stream: !!onToken }),
      });
      if (res.status === 401 || res.status === 429) { lastErr = new Error(`Groq ${res.status}`); continue; }
      if (!res.ok) throw await providerError("Groq", res);
      if (!onToken) {
        const json = await res.json();
        return json.choices?.[0]?.message?.content ?? "";
      }
      return await readSSEStream(res, onToken);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Groq unavailable");
}

// Exported for minimax.ts: NVIDIA's NIM endpoint has no CORS headers, so on
// web builds the direct MiniMax call can never succeed from the browser —
// the same model routed through OpenRouter (which does allow browser CORS)
// is the fallback there. opts widen the fixed defaults for callers that
// need arbiter-sized outputs.
export async function callOpenRouter(model: string, messages: any[], onToken?: (partial: string) => void, opts?: { temperature?: number; maxTokens?: number }) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "https://collider.app",
      "X-Title": "Collider",
    },
    body: JSON.stringify({ model, messages, temperature: opts?.temperature ?? 0.7, max_tokens: opts?.maxTokens ?? 1024, stream: !!onToken }),
  });
  if (!res.ok) throw await providerError("OpenRouter", res);
  if (!onToken) {
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? "";
  }
  return await readSSEStream(res, onToken);
}

// ── Google Gemini, called directly ─────────────────────────────────────────
// Not OpenAI-compatible: system text goes in systemInstruction, turns are
// "contents" with parts, roles use "model" rather than "assistant", and the
// key is a query parameter (a Bearer header is rejected — verified live).
// Vision attachments ride along as inlineData parts.
export async function callGoogleModel(
  model: string,
  messages: any[],
  onToken?: (partial: string) => void,
  opts?: { temperature?: number; maxTokens?: number },
) {
  return callGoogle(model, messages, onToken, opts);
}

async function callGoogle(model: string, messages: any[], onToken?: (partial: string) => void, opts?: { temperature?: number; maxTokens?: number }) {
  const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const parts: any[] = [];
      if (typeof m.content === "string") parts.push({ text: m.content });
      else if (Array.isArray(m.content)) {
        for (const c of m.content) {
          if (c.type === "text") parts.push({ text: c.text });
          else if (c.type === "image_url") {
            const uri: string = c.image_url?.url || "";
            const match = uri.match(/^data:([^;]+);base64,(.*)$/);
            if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          }
        }
      }
      return { role: m.role === "assistant" ? "model" : "user", parts };
    });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
        generationConfig: { temperature: opts?.temperature ?? 0.7, maxOutputTokens: opts?.maxTokens ?? 2048 },
      }),
    }
  );
  if (!res.ok) throw await providerError("Google", res);
  const json = await res.json();
  const text = (json.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("").trim();
  // Non-streaming: report the whole answer once so callers that expect
  // progressive updates still receive one.
  onToken?.(text);
  return text;
}

// ── Image generation via OpenRouter's image-output models ──────────────────
// Same key/endpoint as every other OpenRouter route in this file — the
// difference is `modalities: ["image", "text"]`, which tells these models to
// return a generated image instead of (or alongside) text. Response comes
// back as a data: URI on message.images, same shape renderers already
// expect from a plain URL string (Image components don't care which).
async function callOpenRouterImage(model: string, prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "https://collider.app",
      "X-Title": "Collider",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) throw await providerError("Image generation", res);
  const json = await res.json();
  const msg = json.choices?.[0]?.message;
  const imageUrl = msg?.images?.[0]?.image_url?.url;
  if (imageUrl) return imageUrl;
  // Fell through without an image — surface whatever text came back (often
  // a refusal/explanation) instead of silently returning nothing.
  return msg?.content || "Image generation returned no image.";
}

// Pure-JS base64 encoder — no new dependency, works identically on web and
// native. Used to turn downloaded video/audio bytes into a data: URI so
// playback never needs to smuggle an Authorization header through a native
// <Video>/<Audio> component (OpenRouter's file endpoints 401 without one —
// confirmed live, a plain unauthenticated fetch of a finished video's
// content URL fails).
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i], b2 = bytes[i + 1], b3 = bytes[i + 2];
    out += B64_CHARS[b1 >> 2];
    out += B64_CHARS[((b1 & 3) << 4) | (b2 >> 4 || 0)];
    out += i + 1 < bytes.length ? B64_CHARS[((b2 & 15) << 2) | (b3 >> 6 || 0)] : "=";
    out += i + 2 < bytes.length ? B64_CHARS[b3 & 63] : "=";
  }
  return out;
}

// ── Video generation via OpenRouter's async /videos job API ────────────────
// Real video, not the storyboard-as-text stand-in this replaced. Generation
// takes real time (confirmed live: ~30s for a 4s veo-3.1-fast clip, $0.48),
// so this is create → poll → download, not a single request/response like
// every other route here. Downloads the finished file and returns it as a
// data: URI — same reasoning as the base64 helper above.
async function callOpenRouterVideo(model: string, prompt: string): Promise<string> {
  const arMatch = prompt.match(/--ar\s+(\S+)/);
  const durMatch = prompt.match(/--duration\s+(\d+)/);
  const aspect_ratio = arMatch ? arMatch[1] : undefined;
  const duration = durMatch ? parseInt(durMatch[1]) : 4;
  
  // Clean prompt for the model
  const cleanPrompt = prompt
    .replace(/--ar\s+\S+/g, "")
    .replace(/--duration\s+\S+/g, "")
    .replace(/--quality\s+\S+/g, "")
    .replace(/--motion\s+\S+/g, "")
    .trim();

  const createRes = await fetch("https://openrouter.ai/api/v1/videos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "https://collider.app",
      "X-Title": "Collider",
    },
    body: JSON.stringify({ 
      model, 
      prompt: cleanPrompt || "a short abstract scene", 
      duration,
      aspect_ratio
    }),
  });
  if (!createRes.ok) throw await providerError("Video generation", createRes);
  const job = await createRes.json();
  const pollUrl: string = job.polling_url || `https://openrouter.ai/api/v1/videos/${job.id}`;

  let status: string = job.status;
  let contentUrl: string | undefined = job.unsigned_urls?.[0];
  const deadline = Date.now() + 5 * 60 * 1000; // video gen can take several minutes
  while (status === "pending" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8000));
    const pollRes = await fetch(pollUrl, { headers: { Authorization: `Bearer ${OPENROUTER_KEY}` } });
    if (!pollRes.ok) throw await providerError("Video generation", pollRes);
    const polled = await pollRes.json();
    status = polled.status;
    contentUrl = polled.unsigned_urls?.[0];
  }
  if (status !== "completed" || !contentUrl) {
    throw new Error(status === "pending" ? "Video generation timed out" : `Video generation ${status || "failed"}`);
  }

  const fileRes = await fetch(contentUrl, { headers: { Authorization: `Bearer ${OPENROUTER_KEY}` } });
  if (!fileRes.ok) throw new Error(`OpenRouter video download ${fileRes.status}`);
  const bytes = new Uint8Array(await fileRes.arrayBuffer());
  return `data:video/mp4;base64,${toBase64(bytes)}`;
}

// ── Music generation via Google Lyria (through OpenRouter) ─────────────────
// Real audio, not the lyrics-as-text stand-in this replaced. Confirmed live:
// Lyria's audio output only comes back with stream:true (a non-streaming
// request 400s with "Audio output requires stream: true"), delivered as
// base64 chunks in each SSE delta's `audio.data` field — concatenated here
// into one file. A short clip completes fast enough that this reads the
// whole SSE body at once rather than needing token-by-token onToken calls.
// TTS via OpenRouter's dedicated speech endpoint. Unlike every other call in
// this file the response is not JSON — it is raw audio bytes — so it is read as
// a blob and converted to a data URI for the same downstream handling the audio
// chat path produces.
async function callOpenRouterSpeech(model: string, input: string, voice?: string): Promise<string> {
  const fmtMatch = input.match(/--format\s+(\S+)/);
  const voiceMatch = input.match(/--voice\s+(\S+)/);
  const format = fmtMatch ? fmtMatch[1] : "mp3";
  const chosenVoice = voiceMatch ? voiceMatch[1] : voice;
  const text = input.replace(/--format\s+\S+/g, "").replace(/--voice\s+\S+/g, "").trim();

  const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "https://collider.app",
      "X-Title": "Collider",
    },
    body: JSON.stringify({
      model,
      input: text || "Hello from Collider.",
      ...(chosenVoice ? { voice: chosenVoice } : {}),
      response_format: format,
    }),
  });
  if (!res.ok) throw await providerError("Speech generation", res);
  const blob = await res.blob();
  const b64: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read speech audio."));
    reader.readAsDataURL(blob);
  });
  if (!b64) throw new Error("Speech generation returned no audio.");
  return `data:audio/${format};base64,${b64}`;
}

async function callOpenRouterAudio(model: string, prompt: string): Promise<string> {
  const vocalsMatch = prompt.match(/--vocals\s+(\S+)/);
  const bitrateMatch = prompt.match(/--bitrate\s+(\S+)/);
  const formatMatch = prompt.match(/--format\s+(\S+)/);
  const tagsMatch = prompt.match(/--tags\s+"([^"]+)"/);

  const vocals = vocalsMatch ? vocalsMatch[1] : "vocal";
  const bitrate = bitrateMatch ? bitrateMatch[1] : "standard";
  const format = formatMatch ? formatMatch[1] : "mp3";
  const tags = tagsMatch ? tagsMatch[1] : "";

  // Clean prompt for the model
  const basePrompt = prompt
    .replace(/--vocals\s+\S+/g, "")
    .replace(/--bitrate\s+\S+/g, "")
    .replace(/--format\s+\S+/g, "")
    .replace(/--tags\s+"[^"]+"/g, "")
    .trim();

  // Combine into a structured instructional prompt for Lyria 3
  const finalPrompt = `${basePrompt || "a short instrumental piece"}.\nOptions:\n- Vocals: ${vocals}\n- Quality: ${bitrate}\n- Format: ${format}\n- Genre/Style tags: ${tags}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "https://collider.app",
      "X-Title": "Collider",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: finalPrompt }],
      modalities: ["audio", "text"],
      stream: true,
    }),
  });
  if (!res.ok) throw await providerError("Music generation", res);
  const body = await res.text();
  let audioB64 = "";
  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
    try {
      const piece = JSON.parse(line.slice(6)).choices?.[0]?.delta?.audio?.data;
      if (piece) audioB64 += piece;
    } catch {}
  }
  if (!audioB64) throw new Error("Music generation returned no audio.");
  return `data:audio/mp3;base64,${audioB64}`;
}

// ── Image generation via Pollinations (no key) ─────────────────────────────
// Returns a markdown image URL that renderers can display or copy.
export function generateImageUrl(prompt: string, model = "flux"): string {
  const seed = Math.floor(Math.random() * 1_000_000);
  const encoded = encodeURIComponent(prompt.trim() || "abstract art");
  // Plain URL only — renderers use message.content directly as an <Image> uri.
  return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&model=${model}&seed=${seed}`;
}

// ── Consensus arbiter ───────────────────────────────────────────────────────
// MiniMax M3 synthesizes all model replies into a unified consensus verdict
// with per-model alignment scores.
// Deterministic local fallback if the arbiter call fails.
export type ConsensusReply = { modelId: string; label: string; content: string };
export type ConsensusResult = { verdict: string; scores: Record<string, number> };

const consensusTokens = (s: string) => (s.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
function consensusSim(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0; a.forEach((t) => { if (b.has(t)) inter++; });
  return inter / Math.sqrt(a.size * b.size);
}

function fallbackConsensus(replies: ConsensusReply[]): ConsensusResult {
  if (!replies.length) return { verdict: "Not enough responses yet.", scores: {} };
  const bags = replies.map((r) => new Set(consensusTokens(r.content)));
  const scores: Record<string, number> = {};
  replies.forEach((r, i) => {
    const others = bags.filter((_, j) => j !== i);
    const maxSim = others.length ? Math.max(...others.map((b) => consensusSim(bags[i], b))) : 0;
    scores[r.modelId] = Math.max(0, Math.min(1, maxSim * 1.8));
  });
  // The verdict states the actual position, not the vote — how many models
  // aligned is already shown separately as a count, so restating it in
  // prose here would just be the arbiter describing its own process
  // instead of answering the question.
  const sorted = [...replies].sort((a, b) => (scores[b.modelId] ?? 0) - (scores[a.modelId] ?? 0));
  const anchor = sorted[0];
  const DISSENT = 0.28;
  const dissenters = replies.filter((r) => (scores[r.modelId] ?? 0) < DISSENT);
  const thesis = anchor.content.split(/[.!?]/)[0]?.trim();
  let verdict = thesis && thesis.length > 20 ? `${thesis}.` : anchor.content.slice(0, 200).trim();
  if (dissenters.length) {
    const altThesis = dissenters[0].content.split(/[.!?]/)[0]?.trim();
    if (altThesis && altThesis.length > 20) verdict += ` ${dissenters[0].label} instead holds: ${altThesis}.`;
  }
  return { verdict: verdict.trim(), scores };
}

export async function scoreConsensus(replies: ConsensusReply[]): Promise<ConsensusResult> {
  if (!replies.length) return { verdict: "Not enough responses yet.", scores: {} };
  try {
    const sys =
      "You are an impartial arbiter evaluating multiple AI model replies to the same prompt. " +
      "Read every reply fully, identify the core shared position, and note where individual models diverge in logic, emphasis, or conclusion. Treat any reply that is an error message (failed request, rate limit, etc.) as absent, not as a position — silently ignore it when forming the synthesis. " +
      "Respond with STRICT JSON only — no markdown, no code fences, no commentary — matching exactly this shape:\n" +
      '{"verdict": "2-3 sentence synthesis", "scores": {"<modelId>": 0.0-1.0, ...}}\n' +
      "The verdict states the position itself, as information — not a narrative about the position, and not a report about the models. Two separate failure modes to avoid:\n" +
      "1. Meta-commentary about the models: never mention which ones answered, how many did, that one 'provided a substantive response,' or anything else about the polling process — that's shown separately in the UI as a count, so restating it here is redundant.\n" +
      "2. Editorializing / hedging register: no evaluative or normative words — 'correct,' 'better,' 'best,' 'right,' 'wrong,' 'should,' 'ideal.' No hedge-qualifiers like 'universally,' 'generally,' 'typically,' 'it depends.' No advisor-voice framing ('the key consideration is...', 'ultimately...'). State the substance as a flat, direct claim — what the position IS and, if relevant, the concrete condition under which it holds — not a value judgment on it. " +
      "The only exception: if every reply is an error with nothing usable to synthesize from, state that plainly ('No model returned a usable answer.') — that IS the fact in that case. " +
      "Scores: 1.0 = fully aligned with consensus, 0.0 = directly contradicts it. Include a score for every modelId listed, using the exact id strings given — score an error reply 0.0.";
    const body = replies
      .map((r, i) => `Model ${i + 1} (id: ${r.modelId}, label: ${r.label}):\n${r.content.slice(0, 2000)}`)
      .join("\n\n---\n\n");
    const messages = [
      { role: "system", content: sys },
      { role: "user", content: body },
    ];
    // MiniMax M3 is the ONLY model that arbitrates — the same validated
    // judge that runs every other Smart Gen judgment. No other model's
    // judgment enters this loop: a different-model fallback would silently
    // swap the qualified chain for an unqualified one exactly when things
    // degrade. callMiniMax itself already handles transport (NVIDIA primary,
    // the identical model via OpenRouter when NVIDIA is unreachable). If the
    // model is truly unreachable, the deterministic local overlap heuristic
    // below takes over — arithmetic, not another model's opinion.
    const raw = await callMiniMax(messages, { temperature: 0.3, maxTokens: 8192 });
    let cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    // Reasoning models sometimes wrap the JSON in a sentence of preamble —
    // parse the outermost object, not the prose around it.
    const first = cleaned.indexOf("{"), last = cleaned.lastIndexOf("}");
    if (first > 0 && last > first) cleaned = cleaned.slice(first, last + 1);
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed.verdict !== "string" || typeof parsed.scores !== "object" || !parsed.scores) {
      throw new Error("malformed arbiter response");
    }
    const scores: Record<string, number> = {};
    for (const r of replies) {
      const v = parsed.scores[r.modelId];
      scores[r.modelId] = typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
    }
    return { verdict: parsed.verdict.slice(0, 600), scores };
  } catch (e) {
    console.warn("[Consensus] Arbiter failed, using local fallback:", e);
    return fallbackConsensus(replies);
  }
}

// ── Speech-to-text via Groq Whisper ────────────────────────────────────────
export async function transcribeAudio(audioUri: string, mime = "audio/m4a"): Promise<string> {
  // React Native: build FormData with the file uri directly.
  const form = new FormData();
  form.append("file", { uri: audioUri, name: `voice.${mime.split("/")[1] || "m4a"}`, type: mime } as any);
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "json");
  let lastErr: any = null;
  for (const key of GROQ_KEYS) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form as any,
      });
      if (res.status === 401 || res.status === 429) { lastErr = new Error(`STT ${res.status}`); continue; }
      if (!res.ok) throw await providerError("Transcription", res);
      const json = await res.json();
      return json.text || "";
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Transcription unavailable");
}
