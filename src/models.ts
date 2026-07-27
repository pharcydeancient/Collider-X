export type Tier = "free" | "pro" | "elite";
export type Category = "general" | "image" | "video" | "audio" | "coding";

export type ModelDef = {
  id: string;
  label: string;
  short: string;
  desc: string;
  tier: Tier;
  category: Category[];
  weight: number;
  color: string;
  locked?: boolean;
};

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "general", label: "General" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "coding", label: "Coding" },
];

// ── Model roster — rebuilt 2026-07-13 against the live OpenRouter catalog ───
// (fetched directly, not guessed — see chat.ts ROUTES for the exact remote
// slugs). Curated for actual quality/reputation, not just "free = cheapest
// possible." No Opus, no Fable anywhere — this app offers unlimited
// messages, so per-request cost has to stay sane at every tier.
export const MODELS: ModelDef[] = [

  // ── General · Free (7) — real, current, reputable models per provider ────
  { id: "free/claude-haiku-4-5",    label: "Claude Haiku 4.5",   short: "Hai5", desc: "Anthropic's fast model. Sharp, reliable.",       tier: "free", category: ["general"],           weight: 1, color: "#f6a4c9" },
  { id: "free/gemini-3-6-flash",    label: "Gemini 3.6 Flash",   short: "G3.6F",desc: "Google's current flash model. 1M ctx.",          tier: "free", category: ["general"],           weight: 1, color: "#7fd8c4" },
  { id: "free/mistral-small",       label: "Mistral Small 3.2",  short: "MiSm", desc: "Mistral's current small model. Great value.",    tier: "free", category: ["general"],           weight: 1, color: "#ffb066" },
  { id: "free/command-r",           label: "Command R",          short: "CmdR", desc: "Cohere's generalist model.",                     tier: "free", category: ["general"],           weight: 1, color: "#f2c14e" },
  { id: "free/minimax-m3",          label: "MiniMax M3",         short: "MM3",  desc: "MiniMax's current flagship. 1M ctx.",            tier: "free", category: ["general"],           weight: 1, color: "#ff9e6b" },

  // ── General · Pro (4) ─────────────────────────────────────────────────────
  { id: "pro/grok-4-5",             label: "Grok 4.5",           short: "Gr4.5",desc: "xAI's current model. Real-time knowledge.",      tier: "pro",  category: ["general"],           weight: 5, color: "#ff9e6b" },

  // ── General · Elite (4) — stronger, not egregiously priced, no Opus ──────
  { id: "elite/sonar-reasoning-pro",label: "Sonar Reasoning Pro", short: "Sonr", desc: "Perplexity's reasoning model. Live web-grounded.",tier: "elite", category: ["general"],          weight: 6, color: "#6bb8ff" },
  { id: "elite/mistral-large",      label: "Mistral Large 2512", short: "MiLg", desc: "Mistral's current flagship. Excellent value.",   tier: "elite", category: ["general"],          weight: 6, color: "#ffb066" },

  // ── Coding · low-cost Pro (2) — there is no free-tier coding, full stop;
  // these two just cost the fewest credits within Pro/Elite, same as any
  // other low-weight model in another category. No "(free)" anywhere in
  // their text — that word doesn't apply to this category at all.

  // ── Coding · Pro (4) ──────────────────────────────────────────────────────

  // ── Coding · Elite (3) — no Opus ──────────────────────────────────────────
  { id: "elite/codestral-2508",     label: "Codestral 2508",     short: "Cst",  desc: "Mistral's elite coder. 256k ctx.",               tier: "elite", category: ["coding"],           weight: 6, color: "#ffb066" },
  { id: "elite/kimi-k2-7-code",     label: "Kimi K2.7 Code",     short: "K2.7C",desc: "Moonshot's dedicated coding model.",             tier: "elite", category: ["coding"],           weight: 7, color: "#4be6b1" },

  // ── Image · Pro (3) — SPEC.md: no free tier access to media gen. Pollinations
  // (flux-free) stays Pollinations-backed (genuinely keyless/free to us) but
  // moves to Pro, matching the tier rule instead of overriding it ──────────
  { id: "img/flux-free",              label: "FLUX",                    short: "Flux", desc: "Fast, free-to-generate image model.",       tier: "pro",  category: ["image"],             weight: 1, color: "#8ee878" },
  { id: "img/gemini-3-1-flash-image", label: "Gemini 3.1 Flash Image", short: "G3.1I", desc: "Google's fast image generator.",            tier: "pro",  category: ["image"],             weight: 2, color: "#7fd8c4" },
  { id: "img/gpt-5-image-mini",       label: "GPT-5 Image Mini",       short: "5Img-",desc: "OpenAI's compact image model.",              tier: "pro",  category: ["image"],             weight: 3, color: "#d9d3c7" },
  { id: "img/flux-2-klein",           label: "FLUX.2 Klein",           short: "FlxK", desc: "Fastest FLUX.2 tier; high-throughput.",      tier: "pro",  category: ["image"],             weight: 2, color: "#8ee878" },

  // ── Image · Elite (2) ────────────────────────────────────────────────────
  { id: "img/gemini-3-pro-image",     label: "Gemini 3 Pro Image",     short: "G3Img",desc: "Google's flagship image model.",             tier: "elite", category: ["image"],            weight: 6, color: "#7fd8c4" },
  { id: "img/flux-2-max",             label: "FLUX.2 Max",             short: "FlxM", desc: "Black Forest Labs' top tier; peak fidelity.",  tier: "elite", category: ["image"],            weight: 7, color: "#8ee878" },
  { id: "img/gpt-5-4-image-2",        label: "GPT-5.4 Image 2",        short: "54Im", desc: "OpenAI's newest image model, GPT Image 2.", tier: "elite", category: ["image"],            weight: 8, color: "#d9d3c7" },
  { id: "img/seedream-4-5",           label: "Seedream 4.5",           short: "Seed", desc: "ByteDance; strong editing consistency.",     tier: "elite", category: ["image"],            weight: 5, color: "#f0a35e" },

  // ── Video · Pro (3) — real routes confirmed live against OpenRouter's
  // /api/v1/videos/models pricing list (fetched directly, 2026-07-18), not
  // guessed. The old runway-gen2/pika-2/kling-ai/luma-dream entries had zero
  // real route and were removed rather than left as fake options — but that
  // left the pro tier with 0 models against SPEC.md's "3 pro" requirement.
  // These three are real, cheap-tier OpenRouter video models filling that
  // gap instead of leaving it empty.
  { id: "vid/veo-3-1-lite",         label: "Veo 3.1 Lite",       short: "VeoL", desc: "Fast, affordable AI video generation.",          tier: "pro",   category: ["video"],            weight: 12, color: "#ff6ba0" },
  { id: "vid/kling-3-standard",     label: "Kling Video v3.0",   short: "Klin", desc: "AI-generated video, standard quality.",           tier: "pro",   category: ["video"],            weight: 14, color: "#84cc16" },
  { id: "vid/grok-imagine-video",   label: "Grok Imagine Video", short: "Grk",  desc: "xAI's fast AI video generator.",                  tier: "pro",   category: ["video"],            weight: 10, color: "#4dcaff" },
  { id: "vid/seedance-2-fast",      label: "Seedance 2.0 Fast",  short: "SdcF", desc: "ByteDance; speed-optimized text/image-to-video.", tier: "pro",   category: ["video"],            weight: 12, color: "#f0a35e" },

  // ── Video · Elite (2) — real video generation via OpenRouter's async
  // /videos job API (openai/sora-2-pro, google/veo-3.1 — confirmed against
  // OpenRouter's own model catalog, not guessed).
  { id: "vid/sora-2",               label: "Sora 2",             short: "Sora", desc: "AI-generated video, up to 20s, synced audio.",    tier: "elite", category: ["video"],            weight: 30, color: "#3b82f6" },
  { id: "vid/veo-3",                label: "Veo 3.1",            short: "Veo",  desc: "AI-generated video, up to 1080p, native audio.",  tier: "elite", category: ["video"],            weight: 30, color: "#ff6ba0" },
  { id: "vid/seedance-2",           label: "Seedance 2.0",       short: "Sdc",  desc: "ByteDance; strong character/style consistency.",  tier: "elite", category: ["video"],            weight: 26, color: "#f0a35e" },
  { id: "vid/wan-2-6",              label: "Wan 2.6",            short: "Wan",  desc: "Lip-sync, voice+character insertion, multi-shot.", tier: "elite", category: ["video"],            weight: 24, color: "#a78bfa" },

  // ── Music · Pro/Elite (2) — real audio via Google's Lyria 3, the only
  // music-generation model actually reachable through OpenRouter. Relabeled
  // from "Suno"/"Udio" — there's no real Suno or Udio API access here, and
  // running Lyria output under those brand names would just be a different
  // flavor of the same "label doesn't match what it does" bug. musiclm,
  // riffusion, jukebox, and suno-pro had no route at all — removed.
  // ── Audio · Pro (4) ──────────────────────────────────────────────────────
  // Audio is a modality, not a genre: this tab covers music, narration/voice-
  // over, and conversational speech. Scoping it to "music" was what previously
  // made a 4+4 roster look impossible — OpenRouter lists only two music models,
  // but the audio surface (music + TTS + audio-output chat) is ~13 deep.
  // Pro tier = cost-efficient and high-volume.
  { id: "aud/lyria-3-clip",         label: "Lyria 3 Clip",       short: "LyC",  desc: "30s AI-generated instrumental/vocal clip.",       tier: "pro",  category: ["audio"],             weight: 8,  color: "#ff69c8" },
  { id: "aud/gpt-4o-mini-tts",      label: "GPT-4o Mini TTS",    short: "4oTT", desc: "Cost-efficient narration and voiceover.",         tier: "pro",  category: ["audio"],             weight: 3,  color: "#d9d3c7" },
  { id: "aud/kokoro-82m",           label: "Kokoro 82M",         short: "Koko", desc: "Lightweight TTS; 8 languages, 54 preset voices.", tier: "pro",  category: ["audio"],             weight: 2,  color: "#8ee878" },
  { id: "aud/gpt-audio-mini",       label: "GPT Audio Mini",     short: "GAuM", desc: "Conversational voice output, low latency.",       tier: "pro",  category: ["audio"],             weight: 4,  color: "#d9d3c7" },

  // ── Audio · Elite (4) ────────────────────────────────────────────────────
  // Elite = flagship fidelity or a capability no Pro model has (voice cloning,
  // inline emotion direction, full-length song structure).
  { id: "aud/lyria-3-pro",          label: "Lyria 3 Pro",        short: "LyP",  desc: "Full AI-generated song, up to ~3 min, vocals.",   tier: "elite", category: ["audio"],            weight: 10, color: "#ff8a65" },
  { id: "aud/gemini-3-1-flash-tts", label: "Gemini 3.1 Flash TTS", short: "G3TT", desc: "70+ languages, 200+ emotion tags, 2 speakers.", tier: "elite", category: ["audio"],            weight: 9,  color: "#7fd8c4" },
  { id: "aud/voxtral-mini-tts",     label: "Voxtral Mini TTS",   short: "Voxt", desc: "Zero-shot voice cloning, multilingual.",          tier: "elite", category: ["audio"],            weight: 12, color: "#f0a35e" },
  { id: "aud/gpt-audio",            label: "GPT Audio",          short: "GAud", desc: "OpenAI's flagship conversational audio model.",   tier: "elite", category: ["audio"],            weight: 14, color: "#d9d3c7" },
];

export const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, elite: 2 };
export const TIER_INFO: Record<Tier, { label: string; pool: number; price: string; color: string }> = {
  // Free tier has zero access to credit-spending categories (media gen,
  // coding — see SPEC.md tiers section), so a nonzero pool here was showing
  // users a "300 credits" number they could never actually spend on anything.
  // Colors match the spec-approved palette: silver/chrome (the app's fixed
  // accent), crimson (an approved bold exception), and true yellow (the
  // other approved bold exception — NOT orange/gold, which SPEC.md bans
  // outright regardless of shade). Elite was previously orange/gold
  // (#ffb74d) — that was a mistake carried over from an earlier session,
  // not actually spec-compliant; fixed here along with its other call
  // sites (PromptComposer Deep mode, the drawer Upgrade button, sort
  // chevrons, priority "med", artifact "statement" kind, agreement-score
  // mid-tier).
  // Previously free was green (#4be6b1) and pro was literal purple
  // (#a46cff) — both explicitly banned by the palette rule.
  free:  { label: "Free",  pool: 0,    price: "$0",       color: "#e2e8f0" },
  pro:   { label: "Pro",   pool: 3000, price: "$19.99/mo", color: "#dc2626" },
  elite: { label: "Elite", pool: 9000, price: "$49.99/mo", color: "#f5e000" },
};

// SPEC.md: "Free: ... No access to media gen (image/video/audio) or coding
// models" — categorical, independent of any individual model's own price
// tier. The two `tier: "free"` coding models exist so a Pro/Elite user has
// a no-credit-cost option within coding, not so a free-tier user gets
// coding access — that's a cost label, not an access label. Bug found by
// reading canUse() against the spec: it only checked model.tier, so those
// two models' "free" cost label was accidentally granting free-tier users
// access to the whole Coding category (isCategoryUnlocked included).
const CATEGORY_MIN_TIER: Partial<Record<Category, Tier>> = {
  image: "pro", video: "pro", audio: "pro", coding: "pro",
};

function effectiveMinTier(model: ModelDef): Tier {
  const catMin = model.category.reduce<Tier>((min, c) => {
    const m = CATEGORY_MIN_TIER[c];
    return m && TIER_RANK[m] > TIER_RANK[min] ? m : min;
  }, "free");
  return TIER_RANK[catMin] > TIER_RANK[model.tier] ? catMin : model.tier;
}

export function modelsForCategory(category: Category) {
  return MODELS.filter((m) => m.category.includes(category))
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.weight - b.weight);
}
export function modelById(id: string) { return MODELS.find((m) => m.id === id); }
export function canUse(tier: Tier, model: ModelDef) {
  return !model.locked && TIER_RANK[tier] >= TIER_RANK[effectiveMinTier(model)];
}
export function isCategoryUnlocked(tier: Tier, category: Category) {
  if (category === "general") return true;
  return MODELS.some((m) => m.category.includes(category) && TIER_RANK[tier] >= TIER_RANK[effectiveMinTier(m)]);
}
