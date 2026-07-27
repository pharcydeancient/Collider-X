// LLM-based Smart Gen extraction — supplements (never replaces) the fast,
// free, instant regex-based smartGen() pass in smartgen.ts. This pass costs
// an API call, so it is meant to run as fire-and-forget background
// enrichment (see the AppProvider effect in state.tsx that watches new
// assistant replies and dispatches "applySmartBatch" once this resolves).
// On any failure — network, rate limit, malformed JSON — it silently
// resolves to an empty batch. Nothing in the UI ever waits on it.
import type { Artifact, Memory, Project, Reminder } from "../state";
import { callMiniMax } from "./minimax";
import { fingerprint } from "./smartgen";

// Binary by design — "if it's not urgent now, it's not a priority."
type Priority = "high" | "none";
type Progress = "todo" | "inprogress" | "done";
type ArtifactKind = Artifact["kind"];

// `notebook` is the subject header the memory belongs under. Memories are the
// model's own journal, so they are stored as rows under a header rather than
// as one card per line — a card per remembered fact buries the board and
// tells the model nothing a row wouldn't.
export type LLMMemory = { content: string; tags: string[]; projectId?: string; priority: Priority; fingerprint: string; notebook: string };
export type LLMReminder = {
  title: string; due?: number; priority: Priority; projectId?: string;
  progress: Progress; tags: string[]; fingerprint: string; isTask: boolean;
};
export type LLMProject = { name: string; fingerprint: string };
export type LLMArtifact = { title: string; content: string; kind: ArtifactKind; projectId?: string; fingerprint: string };

export type LLMBatch = {
  memories: LLMMemory[];
  reminders: LLMReminder[];
  projects: LLMProject[];
  artifacts: LLMArtifact[];
};

const EMPTY_BATCH: LLMBatch = { memories: [], reminders: [], projects: [], artifacts: [] };
const ARTIFACT_KINDS = new Set(["timeline", "statement", "document", "custom"]);

function findProjectIdByName(name: string | undefined, projects: Project[]): string | undefined {
  if (!name) return undefined;
  const lc = name.trim().toLowerCase();
  return projects.find((p) => p.name.trim().toLowerCase() === lc)?.id;
}

// A short per-project brief (its most recent memory/reminder titles) gives
// the model enough to judge *topical* relevance — "this is clearly the same
// ongoing matter" — not just literal name matching. Exact-name reuse alone
// missed the case this exists to solve: a new fact about an already-running
// project that never restates the project's name.
function projectBriefs(projects: Project[], memories: Memory[], reminders: Reminder[]): string {
  if (!projects.length) return "none";
  return projects.slice(0, 20).map((p) => {
    const relatedMem = memories.filter((m) => m.projectId === p.id).slice(0, 3).map((m) => m.content.slice(0, 60));
    const relatedRem = reminders.filter((r) => r.projectId === p.id).slice(0, 3).map((r) => r.title);
    const brief = [...relatedMem, ...relatedRem].join("; ") || "no items yet";
    return `- "${p.name}" (id-name match required to reuse) — about: ${brief}`;
  }).join("\n");
}

export async function smartGenLLM(
  conversationText: string,
  context: { projects: Project[]; memories: Memory[]; reminders: Reminder[]; artifacts: Artifact[]; activeProjectId?: string; source: "user" | "assistant" },
): Promise<LLMBatch> {
  if (!conversationText || conversationText.trim().length < 40) return EMPTY_BATCH;

  try {
    const existingArtifactTitles = context.artifacts.map((a) => a.title).slice(0, 30).join(", ") || "none";
    const existingMemorySnippets = context.memories.slice(0, 15).map((m) => `- ${m.content.slice(0, 80)}`).join("\n") || "none";
    // Existing notebook headers, so a new fact lands in the journal it belongs
    // to instead of starting a fresh one for the same subject.
    const existingHeaders = Array.from(new Set(context.memories.map((m) => m.content.split("\n")[0].trim()).filter(Boolean))).slice(0, 20);
    const activeProject = context.activeProjectId ? context.projects.find((p) => p.id === context.activeProjectId) : undefined;

    const sourceRules = context.source === "assistant"
      ? [
          "This text is the ASSISTANT's reply, not the user's own words. Extract ONLY concrete things the assistant told the user as fact or commitment about THEIR situation — a specific deadline, a specific number/date/requirement, an explicit next step the assistant identified. Never extract the assistant's generic advice, generic facts, or anything that isn't specific to what the user is dealing with.",
          "When the assistant surfaces a deadline or requirement with real urgency (a legal/medical/financial/travel deadline), also propose the obvious immediate next action as a task — the same way a competent human assistant would just go do it instead of asking permission first (e.g. a filing deadline implies a 'gather required documents' task). Only propose a follow-up when it's genuinely the obvious next step, not a guess — and never propose more than 2.",
        ]
      : [
          "This text is the USER's own message. Extract concrete facts, requests, and commitments they stated about their own situation.",
        ];

    const sys = [
      "You are Smart Gen, a background extraction engine for a multi-model AI chat app.",
      ...sourceRules,
      "Never invent facts, dates, or names not present in the text.",
      "Decide when the text warrants an Artifact: several dated events describing a matter → kind 'timeline'; an explicit ask like 'give me a statement' / 'write a timeline' / 'draft a document' → kind 'statement' or 'document'; another concrete reusable document-like output → kind 'custom'. Do not create an artifact for ordinary chit-chat or short answers.",
      "PROJECT ASSIGNMENT — this is the most important judgment call you make:",
      activeProject
        ? `This conversation is already the "${activeProject.name}" project. Default new items to it UNLESS the text explicitly says this is about a different, older matter (e.g. "my previous case", "the Henderson deal") — in that case, resolve to THAT project by name/topic instead, and never guess it's a continuation of "${activeProject.name}" just because both are legal/financial/personal matters of the same general type.`
        : "No project is active for this conversation yet. Only attach a new item to an EXISTING project when the text is either (a) explicitly referencing it by name/description, or (b) unmistakably continuing that project's own established topic per the briefs below — never on generic category similarity (two unrelated legal cases both being 'legal' is NOT a match). When genuinely unsure, prefer leaving projectName unset over guessing wrong — an unattached item is easy to file later; a wrongly-attached one contaminates the wrong matter's timeline.",
      `Existing projects and what each is actually about:\n${projectBriefs(context.projects, context.memories, context.reminders)}`,
      `Existing artifact titles (avoid near-duplicates of these): ${existingArtifactTitles}`,
      `Recent memories already captured (do not repeat these verbatim):\n${existingMemorySnippets}`,
      "MEMORIES ARE FOR YOU, NOT THE USER. A memory exists so a future model turn serves this person better — a preference, a constraint, a standing fact, how they want to be spoken to. Anything the USER needs to act on is a reminder, never a memory.",
      `Every memory carries a "notebook": a short subject header it is filed under. Reuse one of these existing headers whenever it fits — only invent a header when none of them covers the subject: ${existingHeaders.length ? existingHeaders.map((h) => `"${h}"`).join(", ") : "none yet"}.`,
      'A memory\'s "content" is ONE self-contained line under that header — already-parsed meaning, no conversation references, no timestamps.',
      "Respond with STRICT JSON only — no markdown, no code fences, no commentary — matching exactly this shape:",
      '{"memories":[{"content":"...","notebook":"subject header","tags":["..."],"priority":"none|high","projectName":"optional, exact existing name or omit"}],',
      '"reminders":[{"title":"...","due":"YYYY-MM-DD or null","priority":"none|high","isTask":false,"projectName":"optional","isFollowUp":false}],',
      '"projects":[{"name":"..."}],',
      '"artifacts":[{"title":"...","content":"...","kind":"timeline|statement|document|custom","projectName":"optional"}]}',
      "Omit any category entirely (empty array) when there is nothing confident to add.",
    ].join("\n");

    const messages = [
      { role: "system", content: sys },
      { role: "user", content: conversationText.slice(0, 4000) },
    ];

    // MiniMax M3 first — the one model whose logical chain is validated
    // (scripts/validate-logic-chain.mjs), so every Smart Gen judgment comes
    // from the same qualified judge. Groq llama stays as the fallback so a
    // MiniMax rate-limit never silently costs the user a capture.
    // MiniMax only — the one model whose chain was tested. Extraction is a
    // judgment, and an untested model making it would launder its reasoning
    // into the board under the tested one's name. On failure this returns an
    // empty batch, which costs a capture; a wrong capture costs trust.
    const raw = await callMiniMax(messages, { temperature: 0.3 });
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") return EMPTY_BATCH;

    const batch: LLMBatch = { memories: [], reminders: [], projects: [], artifacts: [] };
    const newProjectFps = new Set<string>();

    for (const p of Array.isArray(parsed.projects) ? parsed.projects : []) {
      const name = typeof p?.name === "string" ? p.name.trim() : "";
      if (!name || name.length < 2 || name.length > 60) continue;
      if (findProjectIdByName(name, context.projects)) continue;
      const fp = fingerprint("project", name);
      if (newProjectFps.has(fp)) continue;
      newProjectFps.add(fp);
      batch.projects.push({ name, fingerprint: fp });
    }

    const resolveProjectId = (projectName?: string): string | undefined => {
      if (!projectName || typeof projectName !== "string") return undefined;
      const existing = findProjectIdByName(projectName, context.projects);
      if (existing) return existing;
      const fp = fingerprint("project", projectName.trim());
      return newProjectFps.has(fp) ? `virt_${fp}` : undefined;
    };

    for (const m of Array.isArray(parsed.memories) ? parsed.memories : []) {
      const content = typeof m?.content === "string" ? m.content.trim() : "";
      if (!content || content.length < 4 || content.length > 400) continue;
      const priority: Priority = m?.priority === "high" ? "high" : "none";
      const tags: string[] = Array.isArray(m?.tags) ? m.tags.filter((t: any) => typeof t === "string").slice(0, 6) : [];
      // A model that skips the header still gets its row filed somewhere
      // sensible rather than minting a card of its own.
      const notebook = (typeof m?.notebook === "string" && m.notebook.trim().slice(0, 60)) || "Notes on this user";
      batch.memories.push({ content, tags, priority, notebook, projectId: resolveProjectId(m?.projectName), fingerprint: fingerprint("memory", content) });
    }

    for (const r of Array.isArray(parsed.reminders) ? parsed.reminders : []) {
      const title = typeof r?.title === "string" ? r.title.trim() : "";
      if (!title || title.length < 2 || title.length > 200) continue;
      const priority: Priority = r?.priority === "high" ? "high" : "none";
      let due: number | undefined;
      if (typeof r?.due === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.due)) {
        const t = new Date(r.due).getTime();
        if (!isNaN(t)) due = t;
      }
      const tags: string[] = Array.isArray(r?.tags) ? r.tags.filter((t: any) => typeof t === "string").slice(0, 6) : [];
      if (r?.isFollowUp && !tags.includes("auto-suggested")) tags.push("auto-suggested");
      const isTask = !!r?.isTask;
      batch.reminders.push({
        title, due, priority, progress: "todo", tags, isTask,
        projectId: resolveProjectId(r?.projectName),
        fingerprint: fingerprint("reminder", title, due),
      });
    }

    for (const a of Array.isArray(parsed.artifacts) ? parsed.artifacts : []) {
      const title = typeof a?.title === "string" ? a.title.trim() : "";
      const content = typeof a?.content === "string" ? a.content.trim() : "";
      if (!title || !content || content.length < 10) continue;
      const kind: ArtifactKind = ARTIFACT_KINDS.has(a?.kind) ? a.kind : "custom";
      batch.artifacts.push({
        title, content: content.slice(0, 6000), kind,
        projectId: resolveProjectId(a?.projectName),
        fingerprint: fingerprint("artifact", title),
      });
    }

    return batch;
  } catch {
    return EMPTY_BATCH;
  }
}
