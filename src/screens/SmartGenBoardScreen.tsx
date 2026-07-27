// Smart Gen Board — every Smart Gen item (project / reminder / memory /
// artifact) as a card on one kanban surface. A card's position against the
// board's linear backdrop carries its meaning by relativity — no table to
// parse, no dashboard to learn. Cards embed into each other in either
// direction without type bounds, convert freely between types, and carry
// per-card custom attributes on top of globally-managed per-type defaults.
// The Ask tab is the same MiniMax M3 model that does Smart Gen's background
// extraction, with the whole board as context and the power to change it.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, Pressable, ScrollView, StyleSheet, TextInput,
  LayoutAnimation, Modal, ActivityIndicator, Dimensions, KeyboardAvoidingView, Platform,
  Animated, PanResponder, Image,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  useCollider, newId, findCard,
  type AppState, type CardEmbed, type LinkKind, type Reminder,
  type BoardGroupBy, type BoardSortBy, type BoardView, type FieldDef, type FieldType,
  type CardOrigin, type CardMedia, type CardTemplate, BUILTIN_FIELDS, NOTEBOOK_PAGE_SIZE,
  collapsePriority,
} from "../state";
import { Glass } from "../components/Glass";
import { Page } from "../components/Page";
import { Picker } from "../components/Picker";
import { styles, withFont, fontFamilyForWeight } from "../styles/theme";
import { useToast } from "../components/Toast";
import { Markdown } from "../components/Markdown";
import { smartGenChat, parseBoardActions, type BoardAction, type BoardCardBrief } from "../services/minimax";
import { friendlyErrorMessage } from "../services/chat";
import { scheduleReminder, pickImage, takePhoto } from "../services/media";

const SCREEN_W = Dimensions.get("window").width;

export const KIND_COLORS: Record<LinkKind, string> = {
  project: "#5dbdff",
  reminder: "#a78bfa",
  memory: "#34d399",
  artifact: "#e2e8f0",
};
// The paper itself is tinted by type. Pale enough that the card still reads as
// paper and the text keeps its contrast, saturated enough that four cards side
// by side sort themselves by colour before a single word is read — the accent
// stripe alone was doing that job at 4px, which is not enough signal.
const KIND_PAPER: Record<LinkKind, string> = {
  project: "#e9f1fa",
  reminder: "#efeafb",
  memory: "#e8f5ee",
  artifact: "#f1f0ec",
};
// Deep, legible ink of the same hue — used for the type glyph and the card's
// own title, so potency comes from saturation of the mark, not of the field.
const KIND_INK: Record<LinkKind, string> = {
  project: "#1c5e93",
  reminder: "#513a91",
  memory: "#186449",
  artifact: "#4a4a52",
};
const KIND_ICONS: Record<LinkKind, keyof typeof Ionicons.glyphMap> = {
  project: "briefcase-outline",
  reminder: "alarm-outline",
  memory: "sparkles-outline",
  artifact: "layers-outline",
};
const ALL_KINDS: LinkKind[] = ["project", "reminder", "memory", "artifact"];
// "memorys" is what naive pluralisation produced on every apply-to-type
// button; a label the user reads is worth four lines of table.
const KIND_PLURAL: Record<LinkKind, string> = {
  project: "projects", reminder: "reminders", memory: "memories", artifact: "artifacts",
};
const RECURRING_OPTIONS: NonNullable<Reminder["recurring"]>[] = ["daily", "weekdays", "weekends", "weekly", "monthly", "yearly"];
const FIELD_TYPES = ["text", "number", "date", "datetime", "checkbox", "select"] as const;
// Stored on customFields; "yes" = checked so absence and unchecked read the same.
const CHECKED = "yes";
const HIDE_COUNTDOWN_FIELD = "Hide timer";

// ── Unified card shape ──────────────────────────────────────────────────────
export type BoardCard = {
  ref: CardEmbed;
  kind: LinkKind;
  title: string;
  body: string;
  due?: number;
  recurring?: Reminder["recurring"];
  priority: "high" | "none";
  // Binary by design: the only state that changes anything is done or not.
  // "none" = the kind has no completion semantics (memories/artifacts) —
  // grouped as Reference, never forced into a fake task state. Intermediate
  // states live in the write-in "Status" attribute for anyone who needs them.
  progress: "open" | "done" | "none";
  tags: string[];
  projectId?: string;
  ts: number;
  embeds: CardEmbed[];
  customFields: Record<string, string>;
  origin?: CardOrigin;
  media?: CardMedia[];
  layout?: string[];
  rows?: string[];
  template?: CardTemplate;
};

function memoryTitle(content: string): string {
  return content.split(/[.!?\n]/)[0].trim().slice(0, 80) || "Memory";
}

export function unifyCards(state: AppState): BoardCard[] {
  const cards: BoardCard[] = [];
  for (const p of state.projects) {
    const done = p.tasks.length > 0 && p.tasks.every((t) => t.done);
    // A project has no deadline of its own, and urgency without a deadline is
    // a claim with nothing behind it. So a project is urgent only when
    // something inside it is actually due — and it then shows THAT deadline,
    // the soonest one, so the countdown is a fact rather than a flag.
    const inner = state.reminders.filter(
      (r) => !r.done && r.due != null && (r.projectId === p.id || (p.embeds || []).some((e) => e.kind === "reminder" && e.id === r.id))
    );
    const soonestUrgent = inner
      .filter((r) => collapsePriority(r.priority) === "high")
      .reduce<number | undefined>((min, r) => (min == null || r.due! < min ? r.due! : min), undefined);
    cards.push({
      ref: { kind: "project", id: p.id }, kind: "project", title: p.name,
      body: p.tasks.length ? `${p.tasks.filter((t) => t.done).length}/${p.tasks.length} tasks done` : "No tasks yet",
      due: soonestUrgent,
      priority: soonestUrgent != null ? "high" : "none",
      progress: done ? "done" : "open",
      tags: [], ts: 0, embeds: p.embeds || [], customFields: p.customFields || {}, origin: p.origin, media: p.media, layout: p.layout, rows: p.rows, template: p.template,
    });
  }
  for (const r of state.reminders) {
    cards.push({
      ref: { kind: "reminder", id: r.id }, kind: "reminder", title: r.title, body: "",
      due: r.due, recurring: r.recurring, priority: collapsePriority(r.priority),
      progress: r.done ? "done" : "open",
      tags: r.tags || [], projectId: r.projectId, ts: r.ts, embeds: r.embeds || [], customFields: r.customFields || {}, origin: r.origin, media: r.media, layout: r.layout, rows: r.rows, template: r.template,
    });
  }
  for (const m of state.memories) {
    cards.push({
      // body only when the title had to truncate it — a short memory's full
      // text IS its title, and repeating it as body reads as a glitch.
      ref: { kind: "memory", id: m.id }, kind: "memory", title: memoryTitle(m.content), body: m.content.length > 84 ? m.content : "",
      priority: collapsePriority(m.priority), progress: "none",
      tags: m.tags || [], projectId: m.projectId, ts: m.ts, embeds: m.embeds || [], customFields: m.customFields || {}, origin: m.origin, media: m.media, layout: m.layout, rows: m.rows, template: m.template,
    });
  }
  for (const a of state.artifacts) {
    cards.push({
      ref: { kind: "artifact", id: a.id }, kind: "artifact", title: a.title, body: a.content,
      priority: "none", progress: "none",
      tags: [], projectId: a.projectId, ts: a.ts, embeds: a.embeds || [], customFields: a.customFields || {}, origin: a.origin, media: a.media, layout: a.layout, rows: a.rows, template: a.template,
    });
  }
  return cards;
}

// ── Live countdown ──────────────────────────────────────────────────────────
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// Digital countdown — status, not judgment. Includes y/mo/d components when
// applicable so "urgent but a month out" reads as exactly that, never as a
// panic signal.
export function formatCountdown(due: number, now: number): { text: string; overdue: boolean; urgent: boolean } {
  const diff = due - now;
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const s = Math.floor(abs / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  const y = Math.floor(d / 365), mo = Math.floor((d % 365) / 30);
  let text: string;
  if (y >= 1) text = `${y}y ${mo}mo ${d % 365 % 30}d`;
  else if (mo >= 1) text = `${mo}mo ${d % 30}d ${h % 24}h`;
  else if (d >= 2) text = `${d}d ${h % 24}h`;
  else if (h >= 1) text = `${h}h ${m % 60}m`;
  else text = `${m}m ${(s % 60).toString().padStart(2, "0")}s`;
  return { text: overdue ? `${text} overdue` : text, overdue, urgent: !overdue && diff < 3600e3 };
}

// ── Grouping / sorting ──────────────────────────────────────────────────────
type Column = { key: string; label: string; color: string; cards: BoardCard[] };

function groupCards(cards: BoardCard[], groupBy: BoardGroupBy, state: AppState): Column[] {
  const cols: Column[] = [];
  const col = (key: string, label: string, color: string) => {
    let c = cols.find((x) => x.key === key);
    if (!c) { c = { key, label, color, cards: [] }; cols.push(c); }
    return c;
  };
  if (groupBy === "type") {
    col("project", "Projects", KIND_COLORS.project); col("reminder", "Reminders", KIND_COLORS.reminder);
    col("memory", "Memories", KIND_COLORS.memory); col("artifact", "Artifacts", KIND_COLORS.artifact);
    for (const c of cards) col(c.kind, c.kind, KIND_COLORS[c.kind]).cards.push(c);
  } else if (groupBy === "status") {
    col("open", "Open", "#5dbdff"); col("done", "Done", "#34d399");
    for (const c of cards) {
      if (c.progress === "none") col("reference", "Reference", "rgba(238,241,246,0.6)").cards.push(c);
      else col(c.progress, c.progress === "done" ? "Done" : "Open", c.progress === "done" ? "#34d399" : "#5dbdff").cards.push(c);
    }
  } else if (groupBy === "priority") {
    col("high", "Urgent", "rgba(238,241,246,0.85)"); col("none", "Everything else", "rgba(238,241,246,0.6)");
    for (const c of cards) col(c.priority, "", "").cards.push(c);
  } else if (groupBy === "project") {
    for (const p of state.projects) col(p.id, p.name, KIND_COLORS.project);
    col("__none", "Unfiled", "rgba(238,241,246,0.6)");
    for (const c of cards) {
      if (c.kind === "project") continue; // a project card isn't filed inside itself
      col(c.projectId && state.projects.some((p) => p.id === c.projectId) ? c.projectId! : "__none", "", "rgba(238,241,246,0.6)").cards.push(c);
    }
  } else if (groupBy.startsWith("field:")) {
    // Swimlanes by any typed attribute: the field's defined options are the
    // prescriptive lanes (in their defined order), values observed on cards
    // extend them deductively, unset cards pool in "—".
    const fieldName = groupBy.slice(6);
    const def = state.fieldDefs?.[fieldName];
    for (const opt of def?.options || []) col(opt, opt, "#5dbdff");
    for (const c of cards) {
      const v = (c.customFields[fieldName] || "").trim();
      if (v) col(v, v, "#5dbdff");
    }
    col("__none", "—", "rgba(238,241,246,0.6)");
    for (const c of cards) {
      const v = (c.customFields[fieldName] || "").trim();
      col(v || "__none", v || "—", "#5dbdff").cards.push(c);
    }
  } else {
    for (const t of Array.from(new Set(cards.flatMap((c) => c.tags))).sort()) col(t, `#${t}`, "#a78bfa");
    col("__none", "Untagged", "rgba(238,241,246,0.6)");
    for (const c of cards) {
      if (!c.tags.length) { col("__none", "", "").cards.push(c); continue; }
      for (const t of c.tags) col(t, "", "").cards.push(c);
    }
  }
  // Keep the structural columns of status/type views even when empty (an
  // empty "Done" column is information); drop empty project/tag columns
  // (an empty project column is just noise at this altitude).
  return cols.filter((c) => c.cards.length > 0 || groupBy === "status" || groupBy === "type");
}

export const cardKey = (c: { ref: CardEmbed }) => `${c.ref.kind}:${c.ref.id}`;

function sortCards(cards: BoardCard[], sortBy: BoardSortBy, order: Record<string, number>): BoardCard[] {
  const arr = [...cards];
  // Manual is the default and the point: where you put a card is the sort.
  // Cards never placed by hand keep arriving at the top (newest first), so a
  // fresh card is visible without disturbing anything already positioned.
  if (sortBy === "manual") {
    arr.sort((a, b) => {
      const oa = order[cardKey(a)], ob = order[cardKey(b)];
      if (oa != null && ob != null) return oa - ob;
      if (oa != null) return -1;
      if (ob != null) return 1;
      return b.ts - a.ts;
    });
  }
  else if (sortBy === "due") arr.sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || b.ts - a.ts);
  else if (sortBy === "created") arr.sort((a, b) => b.ts - a.ts);
  else if (sortBy === "updated") arr.sort((a, b) => b.ts - a.ts);
  else if (sortBy === "type") arr.sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
  else if (sortBy === "priority") arr.sort((a, b) => (a.priority === b.priority ? (a.due ?? Infinity) - (b.due ?? Infinity) : a.priority === "high" ? -1 : 1));
  else if (sortBy.startsWith("field:")) {
    // Numeric when the values are numbers (a score), alphabetical otherwise;
    // blanks always sink rather than leading the column.
    const f = sortBy.slice(6);
    arr.sort((a, b) => {
      const va = (a.customFields[f] || "").trim(), vb = (b.customFields[f] || "").trim();
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      const na = parseFloat(va), nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return nb - na;
      return va.localeCompare(vb);
    });
  }
  else arr.sort((a, b) => a.title.localeCompare(b.title));
  return arr;
}

// ── Small visual pieces ─────────────────────────────────────────────────────
// onLight: chips sitting on the card's paper face need their own contrast;
// the same chip on a dark surface (embedded rows, modal header) keeps the
// original treatment.
function CountdownChip({ due, now, onLight }: { due: number; now: number; onLight?: boolean }) {
  const { text, overdue, urgent } = formatCountdown(due, now);
  const color = overdue ? (onLight ? "#b4413c" : "#f87171") : urgent ? (onLight ? "#946200" : "#fbbf24") : onLight ? "#2f6d9e" : "#5dbdff";
  return (
    <View style={[local.chip, { borderColor: `${color}${onLight ? "44" : "55"}`, backgroundColor: `${color}${onLight ? "12" : "14"}` }]}>
      <Ionicons name="time-outline" size={10} color={color} />
      <Text style={[local.chipText, { color }]}>{text}</Text>
    </View>
  );
}

function KindBadge({ kind }: { kind: LinkKind }) {
  const color = KIND_COLORS[kind];
  return (
    <View style={[local.chip, { borderColor: `${color}40`, backgroundColor: `${color}12` }]}>
      <Ionicons name={KIND_ICONS[kind]} size={10} color={color} />
      <Text style={[local.chipText, { color }]}>{kind.toUpperCase()}</Text>
    </View>
  );
}

function BoardCardView({ card, now, all, onOpen, compact, onToggleDone, dragging, layout, selected, template, expanded, onToggleExpand }: {
  card: BoardCard; now: number; all: BoardCard[]; onOpen: (ref: CardEmbed) => void; compact?: boolean;
  onToggleDone?: (card: BoardCard) => void; dragging?: boolean; layout?: string[]; selected?: boolean;
  template?: CardTemplate;
  // A card on the board is a summary. Tapping it opens it to full size in
  // place — the editor is a separate, deliberate step, not what a glance
  // costs you.
  expanded?: boolean; onToggleExpand?: (card: BoardCard) => void;
}) {
  const color = KIND_COLORS[card.kind];
  const isNotebook = (template || "card") === "notebook";
  const rows = card.rows || [];
  // Notebook paging and search are per-card, live-only state: which page of a
  // journal you are on is not a fact worth persisting.
  const [rowPage, setRowPage] = useState(0);
  const [rowQuery, setRowQuery] = useState("");
  const matchedRows = rowQuery.trim()
    ? rows.filter((r) => r.toLowerCase().includes(rowQuery.trim().toLowerCase()))
    : rows;
  const pageCount = Math.max(1, Math.ceil(matchedRows.length / NOTEBOOK_PAGE_SIZE));
  const page = Math.min(rowPage, pageCount - 1);
  const pageRows = matchedRows.slice(page * NOTEBOOK_PAGE_SIZE, page * NOTEBOOK_PAGE_SIZE + NOTEBOOK_PAGE_SIZE);
  // Open enough to read: expanded by tap, or a notebook, which is a reading
  // surface by definition and pointless at two lines.
  const open = !!expanded || (isNotebook && !compact);
  const embedded = card.embeds.map((e) => all.find((c) => c.ref.kind === e.kind && c.ref.id === e.id)).filter(Boolean) as BoardCard[];
  const isUrgent = card.priority === "high";
  const hideCountdown = card.customFields[HIDE_COUNTDOWN_FIELD] === CHECKED;
  const isDone = card.progress === "done";
  const writtenStatus = (card.customFields["Status"] || "").trim();
  // The card face is just its layout, rendered in order. Every element is a
  // field the user can move or remove — nothing is structurally privileged,
  // and an element with nothing in it takes no space.
  const order = card.layout || layout || ["title", "countdown", "recurring", "status", "search", "rows", "tags", "media", "body", "embeds"];

  const render = (key: string) => {
    switch (key) {
      case "title":
        return (
          <View key="title" style={{ gap: isNotebook ? 6 : 0 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 7 }}>
              {onToggleDone && card.progress !== "none" ? (
                <Pressable onPress={() => onToggleDone(card)} hitSlop={8} style={{ marginTop: 1 }}>
                  <Ionicons name={isDone ? "checkbox" : "square-outline"} size={16} color={isDone ? "#3f7a52" : "rgba(22,22,26,0.3)"} />
                </Pressable>
              ) : (
                <Ionicons name={KIND_ICONS[card.kind]} size={13} color={KIND_INK[card.kind]} style={{ marginTop: 2 }} />
              )}
              <Text
                style={[
                  local.cardTitle,
                  isNotebook && local.notebookHeader,
                  isDone && { textDecorationLine: "line-through", color: "rgba(22,22,26,0.4)" },
                ]}
                numberOfLines={open ? undefined : 2}
              >
                {card.title}
              </Text>
              {isUrgent && <Text style={local.urgentWord}>URGENT</Text>}
              {card.customFields["Critical"] === CHECKED && <Text style={local.criticalWord}>CRITICAL</Text>}
            </View>
            {/* A notebook's header is a header: it rules off from its rows. */}
            {isNotebook && <View style={[local.headerRule, { backgroundColor: `${KIND_INK[card.kind]}33` }]} />}
          </View>
        );
      // A search bar is a card tool, not a screen feature — placed on any card
      // that has rows worth searching, from the same layout list as every
      // other field.
      case "search": {
        if (!open || rows.length <= NOTEBOOK_PAGE_SIZE) return null;
        return (
          <View key="search" style={local.rowSearch}>
            <Ionicons name="search" size={11} color="rgba(22,22,26,0.4)" />
            <TextInput
              value={rowQuery}
              onChangeText={(t) => { setRowQuery(t); setRowPage(0); }}
              placeholder={`Search ${rows.length} entries...`}
              placeholderTextColor="rgba(22,22,26,0.35)"
              style={local.rowSearchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!!rowQuery && (
              <Pressable onPress={() => setRowQuery("")} hitSlop={6}>
                <Ionicons name="close-circle" size={12} color="rgba(22,22,26,0.4)" />
              </Pressable>
            )}
          </View>
        );
      }
      // Rows — the notebook body. Closed, they are a count; open, they are a
      // page of a journal with the page controls that go with it.
      case "rows": {
        if (!rows.length) return null;
        if (!open) {
          return (
            <View key="rows" style={[local.chip, { borderColor: `${KIND_INK[card.kind]}33`, backgroundColor: `${KIND_INK[card.kind]}0f` }]}>
              <Ionicons name="list-outline" size={10} color={KIND_INK[card.kind]} />
              <Text style={[local.chipText, { color: KIND_INK[card.kind] }]}>{rows.length} entries</Text>
            </View>
          );
        }
        return (
          <View key="rows" style={{ gap: 0 }}>
            {pageRows.map((r, i) => (
              <View key={`${page}-${i}`} style={local.notebookRow}>
                <Text style={local.notebookRowNum}>{page * NOTEBOOK_PAGE_SIZE + i + 1}</Text>
                <Text style={local.notebookRowText}>{r}</Text>
              </View>
            ))}
            {matchedRows.length === 0 && <Text style={local.notebookEmpty}>No entry matches "{rowQuery}".</Text>}
            {pageCount > 1 && (
              <View style={local.pagerRow}>
                <Pressable onPress={() => setRowPage(Math.max(0, page - 1))} disabled={page === 0} hitSlop={8} style={page === 0 ? { opacity: 0.25 } : undefined}>
                  <Ionicons name="chevron-back" size={14} color={KIND_INK[card.kind]} />
                </Pressable>
                <Text style={[local.pagerText, { color: KIND_INK[card.kind] }]}>{page + 1} / {pageCount}</Text>
                <Pressable onPress={() => setRowPage(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1} hitSlop={8} style={page >= pageCount - 1 ? { opacity: 0.25 } : undefined}>
                  <Ionicons name="chevron-forward" size={14} color={KIND_INK[card.kind]} />
                </Pressable>
              </View>
            )}
          </View>
        );
      }
      case "countdown":
        if (card.due == null || (isUrgent && hideCountdown)) return null;
        return <CountdownChip key="countdown" due={card.due} now={now} onLight />;
      case "recurring":
        if (!card.recurring) return null;
        return (
          <View key="recurring" style={[local.chip, { borderColor: "rgba(109,90,168,0.3)", backgroundColor: "rgba(109,90,168,0.09)" }]}>
            <Ionicons name="repeat-outline" size={10} color="#6d5aa8" />
            <Text style={[local.chipText, { color: "#6d5aa8" }]}>{card.recurring}</Text>
          </View>
        );
      case "status":
        if (!writtenStatus) return null;
        return (
          <View key="status" style={[local.chip, { borderColor: "rgba(22,22,26,0.14)", backgroundColor: "rgba(22,22,26,0.05)" }]}>
            <Text style={[local.chipText, { color: "rgba(22,22,26,0.6)" }]}>{writtenStatus}</Text>
          </View>
        );
      case "tags":
        if (!card.tags.length) return null;
        return <React.Fragment key="tags">{card.tags.slice(0, 4).map((t) => <Text key={t} style={local.tagText}>#{t}</Text>)}</React.Fragment>;
      case "media": {
        if ((compact && !open) || !card.media?.length) return null;
        const imgs = card.media.filter((m) => m.kind === "image").slice(0, open ? 12 : 3);
        const docs = card.media.filter((m) => m.kind !== "image").slice(0, open ? 12 : 2);
        return (
          <View key="media" style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
            {imgs.map((m, i) => <Image key={i} source={{ uri: m.url }} style={local.cardImage} resizeMode="cover" />)}
            {docs.map((m, i) => (
              <View key={`d${i}`} style={local.docPill}>
                <Ionicons name={m.kind === "video" ? "videocam-outline" : "document-outline"} size={10} color="rgba(22,22,26,0.6)" />
                <Text style={local.docPillText} numberOfLines={1}>{m.name || m.kind}</Text>
              </View>
            ))}
          </View>
        );
      }
      case "body":
        if ((compact && !open) || !card.body || card.kind === "reminder") return null;
        return <Text key="body" style={local.cardBody} numberOfLines={open ? undefined : 2}>{card.body}</Text>;
      case "origin":
        if (!card.origin) return null;
        return (
          <Text key="origin" style={local.fieldLine} numberOfLines={1}>
            <Text style={{ color: "rgba(22,22,26,0.42)" }}>from </Text>{card.origin.title}
          </Text>
        );
      case "embeds":
        if (!embedded.length) return null;
        return (
          <View key="embeds" style={{ gap: 4 }}>
            {embedded.map((e) => (
              <Pressable key={`${e.ref.kind}:${e.ref.id}`} onPress={() => onOpen(e.ref)} style={local.cardEmbedRow}>
                <Ionicons name={KIND_ICONS[e.kind]} size={11} color={KIND_COLORS[e.kind]} />
                <Text style={local.cardEmbedTitle} numberOfLines={1}>{e.title}</Text>
                {e.due != null && <CountdownChip due={e.due} now={now} onLight />}
              </Pressable>
            ))}
          </View>
        );
      default: {
        // Any custom attribute, shown only when it holds something.
        const v = (card.customFields[key] || "").trim();
        if (!v || key === HIDE_COUNTDOWN_FIELD) return null;
        if (key === "Critical") return null; // already marked beside the title
        return (
          <Text key={key} style={local.fieldLine} numberOfLines={1}>
            <Text style={{ color: "rgba(22,22,26,0.42)" }}>{key}: </Text>{v}
          </Text>
        );
      }
    }
  };

  // Chip-sized fields share a line instead of stacking; anything larger gets
  // its own row. Order still decides position either way.
  const INLINE = new Set(["countdown", "recurring", "status", "tags"]);
  const content: React.ReactNode[] = [];
  let run: React.ReactNode[] = [];
  const flush = () => {
    if (!run.length) return;
    content.push(<View key={`run${content.length}`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center" }}>{run}</View>);
    run = [];
  };
  for (const key of order) {
    const node = render(key);
    if (!node) continue;
    if (INLINE.has(key)) run.push(node);
    else { flush(); content.push(node); }
  }
  flush();

  return (
    // Tap opens the card in place when the board offers that; where it
    // doesn't (embedded previews, the pages view) tap still goes straight to
    // the editor, so no surface ends up with a dead card.
    <Pressable onPress={() => (onToggleExpand ? onToggleExpand(card) : onOpen(card.ref))}>
      <View style={[local.card, { backgroundColor: KIND_PAPER[card.kind] }, isNotebook && local.notebookCard, dragging && local.cardDragging, selected && local.cardSelected]}>
        {/* No corner tab. A card's type is already carried by its paper tint
            and by the mark beside its title — a third label saying the same
            word is ornament, and ornament is what makes a surface look dated. */}
        <View style={{ flex: 1, padding: 12, gap: 6 }}>
          {content}
          {/* Open cards offer the editor explicitly; closed ones stay silent. */}
          {open && !!onToggleExpand && (
            <View style={local.cardActions}>
              <Pressable onPress={() => onOpen(card.ref)} hitSlop={6} style={local.cardActionBtn}>
                <Ionicons name="create-outline" size={11} color={KIND_INK[card.kind]} />
                <Text style={[local.cardActionText, { color: KIND_INK[card.kind] }]}>Edit</Text>
              </Pressable>
              {!!expanded && (
                <Pressable onPress={() => onToggleExpand(card)} hitSlop={6} style={local.cardActionBtn}>
                  <Ionicons name="contract-outline" size={11} color="rgba(22,22,26,0.45)" />
                  <Text style={local.cardActionText}>Collapse</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ── Calendar sections ───────────────────────────────────────────────────────
function calendarSections(cards: BoardCard[], now: number) {
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const today0 = dayStart.getTime();
  const sections: { key: string; label: string; color: string; cards: BoardCard[] }[] = [
    { key: "overdue", label: "Overdue", color: "#f87171", cards: [] },
    { key: "today", label: "Today", color: "#fbbf24", cards: [] },
    { key: "tomorrow", label: "Tomorrow", color: "#a78bfa", cards: [] },
    { key: "week", label: "This week", color: "#5dbdff", cards: [] },
    { key: "later", label: "Later", color: "#34d399", cards: [] },
    { key: "nodate", label: "No date", color: "rgba(238,241,246,0.6)", cards: [] },
  ];
  for (const c of cards) {
    if (c.due == null) { sections[5].cards.push(c); continue; }
    if (c.due < now && c.progress !== "done") sections[0].cards.push(c);
    else if (c.due < today0 + 86400e3) sections[1].cards.push(c);
    else if (c.due < today0 + 2 * 86400e3) sections[2].cards.push(c);
    else if (c.due < today0 + 7 * 86400e3) sections[3].cards.push(c);
    else sections[4].cards.push(c);
  }
  for (const s of sections) s.cards.sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
  return sections.filter((s) => s.cards.length > 0);
}

// ── Board-chat action execution ─────────────────────────────────────────────
function parseDueString(due?: string | null): number | undefined {
  if (!due) return undefined;
  const m = due.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (!m) return undefined;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 9, m[5] ? +m[5] : 0).getTime();
}

function executeBoardActions(actions: BoardAction[], dispatch: any, getState: () => AppState): number {
  let applied = 0;
  for (const a of actions) {
    try {
      const state = getState();
      if (a.action === "create") {
        const id = newId(a.cardType === "artifact" ? "art" : a.cardType[0]);
        const projectId = a.projectName ? state.projects.find((p) => p.name.trim().toLowerCase() === a.projectName!.trim().toLowerCase())?.id : undefined;
        if (a.cardType === "memory") dispatch({ type: "memory", id, content: a.content || a.title, tags: a.tags, projectId, priority: a.priority, fingerprint: id });
        else if (a.cardType === "reminder") dispatch({ type: "reminder", id, title: a.title, due: parseDueString(a.due), priority: a.priority, projectId, tags: a.tags, isTask: a.isTask, recurring: a.recurring, fingerprint: id });
        else if (a.cardType === "project") dispatch({ type: "project", id, name: a.title, fingerprint: id });
        else dispatch({ type: "artifact", id, title: a.title, content: a.content || "", kind: "custom", projectId, fingerprint: id });
        if (a.fields && Object.keys(a.fields).length) dispatch({ type: "setCardFields", ref: { kind: a.cardType, id }, fields: a.fields });
        if (a.rows?.length) dispatch({ type: "addCardRows", ref: { kind: a.cardType, id }, rows: a.rows });
        if (a.template) dispatch({ type: "setCardTemplate", ref: { kind: a.cardType, id }, template: a.template });
        applied++;
      } else if (a.action === "update") {
        const ref = ALL_KINDS.map((k) => ({ kind: k, id: a.cardId })).find((r) => findCard(state, r));
        if (!ref) continue;
        const item: any = findCard(state, ref)!;
        if (ref.kind === "memory") dispatch({ type: "updateMemory", memory: { ...item, content: a.content ?? a.title ?? item.content, tags: a.tags ?? item.tags, priority: a.priority ?? item.priority } });
        else if (ref.kind === "reminder") dispatch({ type: "updateReminder", reminder: { ...item, title: a.title ?? item.title, due: a.due === null ? undefined : a.due !== undefined ? parseDueString(a.due) : item.due, priority: a.priority ?? item.priority, progress: a.progress ?? item.progress, done: a.progress ? a.progress === "done" : item.done, recurring: a.recurring === null ? undefined : a.recurring ?? item.recurring, tags: a.tags ?? item.tags } });
        else if (ref.kind === "project") dispatch({ type: "updateProject", project: { ...item, name: a.title ?? item.name } });
        else dispatch({ type: "updateArtifact", artifact: { ...item, title: a.title ?? item.title, content: a.content ?? item.content } });
        if (a.fields) dispatch({ type: "setCardFields", ref, fields: { ...(item.customFields || {}), ...a.fields } });
        if (a.rows) dispatch({ type: "setCardRows", ref, rows: a.rows });
        if (a.template) dispatch({ type: "setCardTemplate", ref, template: a.template });
        applied++;
      } else if (a.action === "addRows") {
        // The journal grows by appending. Nothing already written is touched.
        const ref = ALL_KINDS.map((k) => ({ kind: k, id: a.cardId })).find((r) => findCard(state, r));
        if (ref && a.rows?.length) { dispatch({ type: "addCardRows", ref, rows: a.rows }); applied++; }
      } else if (a.action === "convert") {
        const ref = ALL_KINDS.map((k) => ({ kind: k, id: a.cardId })).find((r) => findCard(state, r));
        if (ref) { dispatch({ type: "convertCard", ref, toKind: a.toType }); applied++; }
      } else if (a.action === "embed") {
        const cardRef = ALL_KINDS.map((k) => ({ kind: k, id: a.cardId })).find((r) => findCard(state, r));
        const hostRef = ALL_KINDS.map((k) => ({ kind: k, id: a.intoCardId })).find((r) => findCard(state, r));
        if (cardRef && hostRef) { dispatch({ type: "embedCard", host: hostRef, card: cardRef }); applied++; }
      } else if (a.action === "defineField") {
        dispatch({ type: "defineField", def: { name: a.name, type: a.fieldType, options: a.options }, cardTypes: a.cardTypes });
        applied++;
      } else if (a.action === "board") {
        const config: any = {};
        if (a.view) config.view = a.view;
        if (a.groupBy) config.groupBy = a.groupBy;
        if (a.sortBy) config.sortBy = a.sortBy;
        if (Object.keys(config).length) { dispatch({ type: "setBoardConfig", config }); applied++; }
      } else if (a.action === "createBoard") {
        if (a.name?.trim()) {
          const config: any = {};
          if (a.view) config.view = a.view;
          if (a.groupBy) config.groupBy = a.groupBy;
          dispatch({ type: "createBoard", id: newId("bd"), name: a.name, config });
          applied++;
        }
      } else if (a.action === "switchBoard") {
        const b = state.boards.find((x) => x.name.trim().toLowerCase() === (a.name || "").trim().toLowerCase());
        if (b) { dispatch({ type: "switchBoard", id: b.id }); applied++; }
      } else if (a.action === "renameBoard") {
        const b = state.boards.find((x) => x.name.trim().toLowerCase() === (a.name || "").trim().toLowerCase());
        if (b && a.newName?.trim()) { dispatch({ type: "renameBoard", id: b.id, name: a.newName }); applied++; }
      }
    } catch {
      // One malformed action never blocks the rest of the batch.
    }
  }
  return applied;
}

function toBriefs(cards: BoardCard[], state: AppState): BoardCardBrief[] {
  return cards.map((c) => ({
    id: c.ref.id,
    type: c.kind,
    title: c.title,
    due: c.due,
    priority: c.priority,
    progress: c.progress === "none" ? undefined : c.progress,
    recurring: c.recurring,
    tags: c.tags.length ? c.tags : undefined,
    projectName: c.projectId ? state.projects.find((p) => p.id === c.projectId)?.name : undefined,
    embeds: c.embeds.length || undefined,
    fields: Object.keys(c.customFields).length ? c.customFields : undefined,
    // Enough for the model to route a new row to the right notebook without
    // carrying every journal entry in the system prompt.
    template: c.template || state.cardTemplates?.[c.kind],
    rowCount: c.rows?.length || undefined,
    rowSample: c.rows?.length ? c.rows.slice(0, 3) : undefined,
  }));
}

// ── Shared view pieces ──────────────────────────────────────────────────────
// onPress (when the lane axis is user-owned) opens the lane editor — the
// Trello gesture of tapping a list's title to change it.
function ColumnHeader({ color, label, count, onPress }: { color: string; label: string; count: number; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ marginBottom: 9, paddingHorizontal: 2, gap: 5 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 7 }}>
        <Text style={local.colTitle}>{label}</Text>
        <Text style={local.colCount}>{count}</Text>
        {!!onPress && <Ionicons name="pencil-outline" size={9} color="rgba(238,241,246,0.35)" />}
      </View>
      <View style={{ height: 1.5, borderRadius: 1, backgroundColor: color, opacity: 0.45 }} />
    </Pressable>
  );
}

const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const sameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b);
// Week starts Monday — the working week people actually plan against.
function weekDays(now: number): number[] {
  const d = new Date(startOfDay(now));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(x.getDate() + i); return x.getTime(); });
}

function MonthGrid({ cards, now, onOpen }: { cards: BoardCard[]; now: number; onOpen: (r: CardEmbed) => void }) {
  const first = new Date(now); first.setDate(1); first.setHours(0, 0, 0, 0);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1).getTime()),
  ];
  const cellW = (SCREEN_W - 24 - 6 * 3) / 7;
  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
      <Text style={[local.colTitle, { marginBottom: 8 }]}>{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <Text key={i} style={[local.colCount, { width: cellW + 3, textAlign: "center" }]}>{d}</Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3 }}>
        {cells.map((t, i) => {
          const dayCards = t ? cards.filter((c) => c.due != null && sameDay(c.due, t)) : [];
          const isToday = t ? sameDay(t, now) : false;
          return (
            <View key={i} style={[local.monthCell, { width: cellW }, isToday && { borderColor: "rgba(251,191,36,0.5)" }]}>
              {t && <Text style={[local.monthDayNum, isToday && { color: "#fbbf24" }]}>{new Date(t).getDate()}</Text>}
              {dayCards.slice(0, 3).map((c) => (
                <Pressable key={cardKey(c)} onPress={() => onOpen(c.ref)} style={[local.monthPill, c.priority === "high" && { backgroundColor: "rgba(255,255,255,0.22)" }]}>
                  <Text style={local.monthPillText} numberOfLines={1}>{c.title}</Text>
                </Pressable>
              ))}
              {dayCards.length > 3 && <Text style={local.monthMore}>+{dayCards.length - 3}</Text>}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function PagesView({ cards, now, all, onOpen, onToggleDone }: {
  cards: BoardCard[]; now: number; all: BoardCard[]; onOpen: (r: CardEmbed) => void; onToggleDone: (c: BoardCard) => void;
}) {
  const { state, dispatch } = useCollider();
  const page = Math.min(state.smartBoard.page || 0, Math.max(0, cards.length - 1));
  const card = cards[page];
  const go = (delta: number) => {
    dispatch({ type: "setBoardConfig", config: { page: Math.max(0, Math.min(cards.length - 1, page + delta)) } });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };
  if (!card) return <Text style={[styles.muted, { textAlign: "center", marginTop: 60 }]}>No cards to page through.</Text>;
  return (
    <View style={{ flex: 1, padding: 14, gap: 12 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
        <BoardCardView card={card} now={now} all={all} onOpen={onOpen} onToggleDone={onToggleDone} />
        {!!card.body && (
          <View style={local.pageBody}>
            <Text style={{ color: "rgba(22,22,26,0.8)", fontSize: 13, lineHeight: 20 }}>{card.body}</Text>
          </View>
        )}
      </ScrollView>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable onPress={() => go(-1)} disabled={page === 0} style={[local.iconBtn, page === 0 && { opacity: 0.3 }]}>
          <Ionicons name="chevron-back" size={16} color="rgba(238,241,246,0.8)" />
        </Pressable>
        <Text style={local.colCount}>{page + 1} / {cards.length}</Text>
        <Pressable onPress={() => go(1)} disabled={page >= cards.length - 1} style={[local.iconBtn, page >= cards.length - 1 && { opacity: 0.3 }]}>
          <Ionicons name="chevron-forward" size={16} color="rgba(238,241,246,0.8)" />
        </Pressable>
      </View>
    </View>
  );
}

// ── Drag & drop ─────────────────────────────────────────────────────────────
// A card's position on screen is the user's own decision, and reading it back
// is how the board reflects their reasoning rather than an imposed order. So
// cards are picked up and put down directly. A short movement threshold keeps
// taps opening the card; anything past it becomes a drag.
type Rect = { x: number; y: number; w: number; h: number };
type DragCtx = {
  zones: React.MutableRefObject<Record<string, { ref: View | null; rect: Rect | null }>>;
  cardRects: React.MutableRefObject<Record<string, { ref: View | null; rect: Rect | null }>>;
  onDrop: (card: BoardCard, pageX: number, pageY: number) => void;
  onPickUp: () => void;
};

// Free placement: the card sits at an exact point on the canvas and a drag
// simply moves that point. No zone decides where it lands, nothing snaps it
// back, and nothing re-flows around it — a card stays where it was put until
// the user presses Align or picks a sort.
type FreeCtx = { x: number; y: number; width: number; onMove: (card: BoardCard, x: number, y: number) => void };

function DraggableCard({ card, ctx, children, free, elevated }: { card: BoardCard; ctx: DragCtx | null; children: React.ReactNode; free?: FreeCtx; elevated?: boolean }) {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef<View | null>(null);
  const key = cardKey(card);

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Capture-phase: the card's own Pressable becomes the responder on
        // touch-down, so a plain onMoveShouldSetPanResponder would never be
        // consulted and the card could never be dragged. Capturing on move
        // lets the drag take over from the tap once the finger travels past
        // the threshold — below it, taps still open the card.
        onMoveShouldSetPanResponderCapture: (_e, g) => (!!ctx || !!free) && (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8),
        onPanResponderGrant: () => {
          setDragging(true);
          ctx?.onPickUp();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        },
        // The surrounding ScrollViews ask for the responder as soon as the
        // finger moves sideways; granting it (the default) cancels the drag
        // mid-flight and the drop never lands. A drag in progress keeps the
        // responder until the finger lifts.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
        onPanResponderRelease: (e, g) => {
          setDragging(false);
          if (free) {
            // Where the finger let go IS the position. Nothing else consulted.
            free.onMove(card, Math.max(0, free.x + g.dx), Math.max(0, free.y + g.dy));
            pan.setValue({ x: 0, y: 0 });
            return;
          }
          const pageX = e.nativeEvent.pageX || g.moveX;
          const pageY = e.nativeEvent.pageY || g.moveY;
          ctx?.onDrop(card, pageX, pageY);
          // Snap home immediately — the card's real new position comes from
          // state on the next render, not from where the finger let go.
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderTerminate: () => { setDragging(false); pan.setValue({ x: 0, y: 0 }); },
      }),
    [ctx, card, free?.x, free?.y]
  );

  return (
    <Animated.View
      // On web a mouse-down on card text starts a native text selection,
      // which preempts the drag entirely (the card highlights instead of
      // lifting). Cards are objects to be moved, not passages to be selected.
      // @ts-expect-error userSelect is a react-native-web style prop
      dataSet={{ nodrag: "1" }}
      ref={(r: any) => {
        viewRef.current = r;
        if (ctx) ctx.cardRects.current[key] = { ref: r, rect: ctx.cardRects.current[key]?.rect ?? null };
      }}
      collapsable={false}
      style={[
        { transform: pan.getTranslateTransform(), zIndex: dragging ? 999 : elevated ? 500 : 0, opacity: dragging ? 0.93 : 1 },
        free ? ({ position: "absolute", left: free.x, top: free.y, width: free.width } as any) : null,
        Platform.OS === "web" ? ({ userSelect: "none", cursor: "grab" } as any) : null,
      ]}
      {...(ctx || free ? responder.panHandlers : {})}
    >
      {children}
    </Animated.View>
  );
}

// Scans a partially-streamed reply for action objects that have finished
// arriving (balanced braces inside the action array) and returns them. A
// half-written object is simply not there yet — it lands on a later token.
function completeActions(partial: string): BoardAction[] {
  const start = partial.indexOf("```collider-actions");
  if (start < 0) return [];
  const body = partial.slice(start + 19);
  const arrStart = body.indexOf("[");
  if (arrStart < 0) return [];
  const out: BoardAction[] = [];
  let depth = 0, objStart = -1, inStr = false, esc = false;
  for (let i = arrStart + 1; i < body.length; i++) {
    const ch = body[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") { if (depth === 0) objStart = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          const obj = JSON.parse(body.slice(objStart, i + 1));
          if (obj && typeof obj.action === "string") out.push(obj);
        } catch {}
        objStart = -1;
      }
    }
  }
  return out;
}

// ── Chat message shape (screen-local, session-scoped) ───────────────────────
type BoardChatMsg = { id: string; role: "user" | "assistant"; content: string; applied?: number; streaming?: boolean };

// ── Main screen ─────────────────────────────────────────────────────────────
export function SmartGenBoardScreen({ goBack }: { goBack: () => void }) {
  const { state, dispatch, getState } = useCollider();
  const { toast } = useToast();
  const { view, groupBy, sortBy, filter } = state.smartBoard;
  const [askMode, setAskMode] = useState(false);
  const [detailRef, setDetailRef] = useState<CardEmbed | null>(null);
  const [fieldsManagerOpen, setFieldsManagerOpen] = useState(false);
  // Trello's chrome: the board's name opens the switcher, the menu edits the
  // board you're standing on.
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [laneEdit, setLaneEdit] = useState<{ key: string; label: string } | null>(null);
  const activeBoard = state.boards.find((b) => b.id === state.activeBoardId);
  // Which cards are open to full size. More than one at a time is allowed —
  // comparing two open cards is the whole reason to open them in place rather
  // than in a modal that covers everything else.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const toggleExpand = (card: BoardCard) => {
    const k = cardKey(card);
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const allCards = useMemo(() => unifyCards(state), [state.projects, state.reminders, state.memories, state.artifacts]);
  const hasUrgent = allCards.some((c) => c.due != null && c.due - Date.now() < 3600e3 && c.due > Date.now() - 86400e3);
  const now = useNow(hasUrgent ? 1000 : 30000);

  const embeddedIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of allCards) for (const e of c.embeds) set.add(`${e.kind}:${e.id}`);
    return set;
  }, [allCards]);

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    // An embedded card lives inside its host at top level (same as a Trello
    // checklist row not also being a standalone card) — but text search
    // always reaches everything, embedded or not.
    let list = allCards.filter((c) => (f ? true : !embeddedIds.has(`${c.ref.kind}:${c.ref.id}`)));
    if (f) list = list.filter((c) => `${c.title} ${c.body} ${c.tags.join(" ")} ${Object.entries(c.customFields).flat().join(" ")}`.toLowerCase().includes(f));
    if (state.smartBoard.hideDone) list = list.filter((c) => c.progress !== "done");
    return sortCards(list, sortBy, state.smartBoard.order || {});
  }, [allCards, embeddedIds, filter, sortBy, state.smartBoard.order, state.smartBoard.hideDone]);

  const columns = useMemo(() => groupCards(visible, groupBy, state), [visible, groupBy, state.projects]);
  // Select mode. The bulk-remove reducers already existed for the per-type
  // screens; the board just had no way to reach them.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const openDetail = (ref: CardEmbed) => {
    if (!selectMode) { setDetailRef(ref); return; }
    const k = `${ref.kind}:${ref.id}`;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  // Creation lived only on the four per-type screens, so the board — the
  // surface this app actually puts in front of people — had no way to make
  // anything. A card is created, placed at the front of manual order, and
  // opened for editing in one action.
  const [newCardOpen, setNewCardOpen] = useState(false);
  const createCard = (kind: LinkKind) => {
    const id = newId(kind === "artifact" ? "art" : kind[0]);
    if (kind === "project") dispatch({ type: "project", id, name: "New project", fingerprint: id });
    else if (kind === "reminder") dispatch({ type: "reminder", id, title: "New reminder", fingerprint: id });
    else if (kind === "memory") dispatch({ type: "memory", id, content: "New memory", fingerprint: id });
    else dispatch({ type: "artifact", id, title: "New artifact", content: "", kind: "custom", fingerprint: id });
    const key = `${kind}:${id}`;
    dispatch({ type: "reorderCards", keys: [key, ...visible.map(cardKey)] });
    setNewCardOpen(false);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDetailRef({ kind, id });
  };
  const selectAllVisible = () => {
    const all = visible.map(cardKey);
    setSelected(selected.size >= all.length ? new Set() : new Set(all));
  };
  const deleteSelected = () => {
    const byKind: Record<string, string[]> = { memory: [], reminder: [], project: [], artifact: [] };
    for (const k of selected) {
      const kind = k.slice(0, k.indexOf(":"));
      const id = k.slice(k.indexOf(":") + 1);
      if (byKind[kind]) byKind[kind].push(id);
    }
    if (byKind.memory.length) dispatch({ type: "removeMemories", ids: byKind.memory });
    if (byKind.reminder.length) dispatch({ type: "removeReminders", ids: byKind.reminder });
    if (byKind.project.length) dispatch({ type: "removeProjects", ids: byKind.project });
    if (byKind.artifact.length) dispatch({ type: "removeArtifacts", ids: byKind.artifact });
    toast(`Deleted ${selected.size} card${selected.size === 1 ? "" : "s"}`);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    exitSelect();
  };

  // ── Trello-style lane editing ─────────────────────────────────────────────
  // Lanes are editable where the axis itself is user-owned: a select field's
  // options (add/rename/delete) and projects (add/rename). Structural axes —
  // status, type, priority — are what they are.
  const laneAxis: "field" | "project" | null = groupBy.startsWith("field:") ? "field" : groupBy === "project" ? "project" : null;
  const addLane = (raw: string) => {
    const name = raw.trim();
    if (!name || !laneAxis) return;
    if (laneAxis === "project") { dispatch({ type: "project", name }); return; }
    const fname = groupBy.slice(6);
    const def: FieldDef = state.fieldDefs[fname] || { name: fname, type: "select" };
    const options = def.options || [];
    if (options.some((o) => o.toLowerCase() === name.toLowerCase())) return;
    dispatch({ type: "defineField", def: { ...def, options: [...options, name] } });
  };
  const renameLane = (key: string, next: string) => {
    const name = next.trim();
    if (!name || !laneAxis || key === "__none" || name === key) return;
    if (laneAxis === "project") {
      const p = state.projects.find((x) => x.id === key);
      if (p && p.name !== name) dispatch({ type: "updateProject", project: { ...p, name } });
      return;
    }
    const fname = groupBy.slice(6);
    const def = state.fieldDefs[fname];
    if (def) dispatch({ type: "defineField", def: { ...def, options: Array.from(new Set((def.options || []).map((o) => (o === key ? name : o)))) } });
    // The lane IS the value on its cards — renaming one renames the other.
    for (const c of columns.find((col) => col.key === key)?.cards || []) {
      dispatch({ type: "setCardFields", ref: c.ref, fields: { ...c.customFields, [fname]: name } });
    }
  };
  const deleteLane = (key: string) => {
    if (laneAxis !== "field" || key === "__none") return;
    const fname = groupBy.slice(6);
    const def = state.fieldDefs[fname];
    if (def) dispatch({ type: "defineField", def: { ...def, options: (def.options || []).filter((o) => o !== key) } });
  };
  // Only an option-backed empty lane can be deleted — a lane holding cards is
  // those cards' value, and a lane a card conjured disappears with the value.
  const laneDeletable = (key: string) => laneAxis === "field" && (columns.find((c) => c.key === key)?.cards.length || 0) === 0;
  const laneHeaderPress = (c: Column) => (laneAxis && c.key !== "__none" ? () => setLaneEdit({ key: c.key, label: c.label }) : undefined);
  // Everything about how a card renders, resolved once: its type's layout and
  // face unless the card overrides them, plus its open/closed state.
  const cardFace = (card: BoardCard) => ({
    selected: selectMode && selected.has(cardKey(card)),
    layout: state.cardLayout?.[card.kind],
    template: card.template || state.cardTemplates?.[card.kind] || ("card" as CardTemplate),
    expanded: expandedKeys.has(cardKey(card)),
    onToggleExpand: toggleExpand,
  });

  // ── Canvas geometry ───────────────────────────────────────────────────────
  const CANVAS_CARD_W = Math.min(SCREEN_W * 0.62, 258);
  const CANVAS_GAP = 12;
  const canvasCols = Math.max(1, Math.floor((SCREEN_W - 24) / (CANVAS_CARD_W + CANVAS_GAP)));
  // Cards are different heights — an open notebook is not a two-line reminder
  // — so a fixed row pitch either overlaps them or leaves craters. Estimating
  // each card's height and packing columns independently keeps the untouched
  // cards tidy without ever moving a card the user placed.
  // Characters that fit on one line at the canvas card width — the basis for
  // every wrap estimate below. Deliberately conservative: a card packed with
  // a little too much room reads as breathing space, one packed with too
  // little reads as a bug.
  const CPL = Math.max(18, Math.floor(CANVAS_CARD_W / 6.6));
  const estimateHeight = (card: BoardCard): number => {
    const face = cardFace(card);
    const open = face.expanded || face.template === "notebook";
    const lines = (text: string, cpl = CPL) => Math.max(1, Math.ceil(text.length / cpl));
    let h = 30; // padding + type mark
    h += Math.min(open ? 4 : 2, lines(card.title, CPL - 6)) * 18;
    if (face.template === "notebook") h += 9; // header rule
    if (card.due != null || card.recurring || card.tags.length || card.customFields["Status"]) h += 26;
    if (card.rows?.length) {
      if (!open) h += 26;
      else {
        if (card.rows.length > NOTEBOOK_PAGE_SIZE) h += 32 + 28; // search bar + pager
        h += card.rows
          .slice(0, NOTEBOOK_PAGE_SIZE)
          .reduce((sum, r) => sum + 11 + lines(r, CPL - 3) * 16, 0);
      }
    }
    if (card.body && card.kind !== "reminder") h += open ? Math.min(360, lines(card.body) * 16) : 34;
    if (card.media?.length) h += 60;
    if (card.embeds.length) h += card.embeds.length * 28;
    if (face.expanded) h += 30; // the Edit / Collapse row
    return Math.round(h);
  };
  // Estimates get the first frame right; measurements get every frame after
  // it right. A card that has been laid out reports its true height, so
  // opening one in place re-packs the cards below it exactly.
  const [heights, setHeights] = useState<Record<string, number>>({});
  const noteHeight = (key: string, h: number) =>
    setHeights((prev) => (Math.abs((prev[key] ?? 0) - h) < 2 ? prev : { ...prev, [key]: h }));
  const heightOf = (card: BoardCard) => heights[cardKey(card)] ?? estimateHeight(card);
  // A card that has never been placed still needs somewhere to be: it flows
  // into the shortest column. Placed cards are read straight from state and
  // never take part in the packing.
  const flowPositions = useMemo(() => {
    const colY = new Array(canvasCols).fill(0);
    const out: Record<string, { x: number; y: number }> = {};
    for (const c of visible) {
      const k = cardKey(c);
      const placed = state.smartBoard.pos?.[k];
      if (placed) continue;
      let col = 0;
      for (let i = 1; i < canvasCols; i++) if (colY[i] < colY[col]) col = i;
      out[k] = { x: col * (CANVAS_CARD_W + CANVAS_GAP), y: colY[col] };
      colY[col] += heightOf(c) + CANVAS_GAP;
    }
    return out;
  }, [visible, state.smartBoard.pos, expandedKeys, canvasCols, heights]);
  const posFor = (key: string) => state.smartBoard.pos?.[key] || flowPositions[key] || { x: 0, y: 0 };
  const canvasSize = visible.reduce(
    (acc, c) => {
      const p = posFor(cardKey(c));
      return { w: Math.max(acc.w, p.x + CANVAS_CARD_W), h: Math.max(acc.h, p.y + heightOf(c)) };
    },
    { w: SCREEN_W - 24, h: 320 }
  );
  // Align — the one command that tidies everything, including cards that were
  // placed by hand. Reading order is the board's current order, so an active
  // sort is what alignment expresses; on manual sort it is the order you see.
  const alignNow = () => {
    const colY = new Array(canvasCols).fill(0);
    const positions: Record<string, { x: number; y: number }> = {};
    for (const c of visible) {
      let col = 0;
      for (let i = 1; i < canvasCols; i++) if (colY[i] < colY[col]) col = i;
      positions[cardKey(c)] = { x: col * (CANVAS_CARD_W + CANVAS_GAP), y: colY[col] };
      colY[col] += heightOf(c) + CANVAS_GAP;
    }
    dispatch({ type: "setCardPositions", positions });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    toast(`Aligned ${visible.length} cards — drag any of them anywhere again`);
  };

  // ── Drop targets ──────────────────────────────────────────────────────────
  const zones = useRef<Record<string, { ref: View | null; rect: Rect | null }>>({});
  const cardRects = useRef<Record<string, { ref: View | null; rect: Rect | null }>>({});
  const measureAll = () => {
    for (const entry of Object.values(zones.current)) {
      entry.ref?.measureInWindow?.((x, y, w, h) => { entry.rect = { x, y, w, h }; });
    }
    for (const entry of Object.values(cardRects.current)) {
      entry.ref?.measureInWindow?.((x, y, w, h) => { entry.rect = { x, y, w, h }; });
    }
  };

  const toggleDone = (card: BoardCard) => {
    if (card.kind === "reminder") dispatch({ type: "toggleReminder", id: card.ref.id });
    else if (card.kind === "project") {
      const p = state.projects.find((x) => x.id === card.ref.id);
      if (p) {
        const allDone = p.tasks.length > 0 && p.tasks.every((t) => t.done);
        dispatch({ type: "updateProject", project: { ...p, tasks: p.tasks.map((t) => ({ ...t, done: !allDone })) } });
      }
    }
  };

  // Dropping a card into a column means the column's own truth now applies to
  // it — that is the whole grammar of a board. Nothing else is implied.
  const applyZone = (card: BoardCard, zoneKey: string) => {
    const item: any = findCard(state, card.ref);
    if (!item) return;
    if (zoneKey.startsWith("day:")) {
      // Week/month grid: the lane IS the date.
      const day = parseInt(zoneKey.slice(4), 10);
      if (card.kind === "reminder") {
        const d = new Date(day);
        const prev = item.due ? new Date(item.due) : null;
        d.setHours(prev ? prev.getHours() : 9, prev ? prev.getMinutes() : 0, 0, 0);
        dispatch({ type: "updateReminder", reminder: { ...item, due: d.getTime() } });
      } else toast("Only reminders carry a date — convert this card first");
      return;
    }
    if (groupBy === "status") {
      if (card.kind === "reminder" && (zoneKey === "done") !== !!item.done) dispatch({ type: "toggleReminder", id: item.id });
      return;
    }
    if (zoneKey.startsWith("circle-") && state.smartBoard.circleField) {
      const f = state.smartBoard.circleField;
      dispatch({ type: "setCardFields", ref: card.ref, fields: { ...(item.customFields || {}), [f]: zoneKey === "circle-in" ? CHECKED : "" } });
      return;
    }
    if (groupBy === "priority" || zoneKey === "circle-in" || zoneKey === "circle-out") {
      if (card.kind !== "reminder") return;
      const wantUrgent = zoneKey === "high" || zoneKey === "circle-in";
      if (wantUrgent) {
        dispatch({ type: "updateReminder", reminder: { ...item, priority: "high", due: item.due ?? Date.now() + 12 * 3600e3 } });
        if (!item.due) toast("Deadline defaulted to 12h from now — adjust it on the card");
      } else if (collapsePriority(item.priority) === "high") {
        dispatch({ type: "updateReminder", reminder: { ...item, priority: "none" } });
        toast("Moved out of Urgent");
      }
      return;
    }
    if (groupBy === "type") {
      if (zoneKey !== card.kind) dispatch({ type: "convertCard", ref: card.ref, toKind: zoneKey as LinkKind });
      return;
    }
    if (groupBy === "project") {
      if (card.kind === "project") return;
      const projectId = zoneKey === "__none" ? undefined : zoneKey;
      const actionType = card.kind === "reminder" ? "updateReminder" : card.kind === "memory" ? "updateMemory" : "updateArtifact";
      const payloadKey = card.kind === "reminder" ? "reminder" : card.kind === "memory" ? "memory" : "artifact";
      dispatch({ type: actionType, [payloadKey]: { ...item, projectId } } as any);
      return;
    }
    if (groupBy === "tag") {
      const tag = zoneKey === "__none" ? null : zoneKey;
      const tags = tag ? Array.from(new Set([...(item.tags || []), tag])) : [];
      const actionType = card.kind === "reminder" ? "updateReminder" : card.kind === "memory" ? "updateMemory" : null;
      if (actionType) dispatch({ type: actionType, [card.kind === "reminder" ? "reminder" : "memory"]: { ...item, tags } } as any);
      return;
    }
    if (groupBy.startsWith("field:")) {
      const f = groupBy.slice(6);
      dispatch({ type: "setCardFields", ref: card.ref, fields: { ...(item.customFields || {}), [f]: zoneKey === "__none" ? "" : zoneKey } });
    }
  };

  const handleDrop = (card: BoardCard, pageX: number, pageY: number) => {
    // A card dropped ON another card goes INSIDE it — the same gesture the
    // physical act implies. Checked before columns, since a card always sits
    // within one and the more specific target must win.
    const myKey = cardKey(card);
    const onCard = Object.entries(cardRects.current).find(([k, c]) => {
      const r = c.rect;
      return k !== myKey && r && pageX >= r.x && pageX <= r.x + r.w && pageY >= r.y && pageY <= r.y + r.h;
    });
    if (onCard) {
      const [k] = onCard;
      const [hostKind, hostId] = [k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)];
      const host = { kind: hostKind as LinkKind, id: hostId };
      if (findCard(state, host)) {
        dispatch({ type: "embedCard", host, card: card.ref });
        toast(`Embedded in "${allCards.find((c) => cardKey(c) === k)?.title || "card"}"`);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        return;
      }
    }
    const hit = Object.entries(zones.current).find(([, z]) => {
      const r = z.rect;
      return r && pageX >= r.x && pageX <= r.x + r.w && pageY >= r.y && pageY <= r.y + r.h;
    });
    if (!hit) return;
    const [zoneKey] = hit;
    applyZone(card, zoneKey);
    // Position within the destination: insert above the first card whose
    // midpoint sits below the drop point.
    const target = columns.find((c) => c.key === zoneKey);
    const keys = (target?.cards || []).map(cardKey).filter((k) => k !== cardKey(card));
    let index = keys.length;
    for (let i = 0; i < keys.length; i++) {
      const r = cardRects.current[keys[i]]?.rect;
      if (r && pageY < r.y + r.h / 2) { index = i; break; }
    }
    keys.splice(index, 0, cardKey(card));
    dispatch({ type: "reorderCards", keys });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const circleField = state.smartBoard.circleField || "";
  const inCircle = (c: BoardCard) => (circleField ? c.customFields[circleField] === CHECKED : c.priority === "high");

  const dragCtx: DragCtx = { zones, cardRects, onDrop: handleDrop, onPickUp: measureAll };
  const registerZone = (key: string) => (r: any) => {
    zones.current[key] = { ref: r, rect: zones.current[key]?.rect ?? null };
  };


  const groupOptions = [
    { label: "Group: Status", value: "status" }, { label: "Group: Type", value: "type" },
    { label: "Group: Urgency", value: "priority" }, { label: "Group: Project", value: "project" },
    { label: "Group: Tag", value: "tag" },
    // Every defined attribute is a swimlane axis — select fields especially,
    // but any field's observed values can lane the board.
    ...Object.values(state.fieldDefs || {}).map((d) => ({ label: `Lanes: ${d.name}`, value: `field:${d.name}` })),
  ];
  const sortOptions = [
    { label: "Sort: Manual", value: "manual" }, { label: "Sort: Due", value: "due" },
    { label: "Sort: Created", value: "created" }, { label: "Sort: Urgency", value: "priority" },
    { label: "Sort: Title", value: "title" }, { label: "Sort: Type", value: "type" },
    ...Object.values(state.fieldDefs || {}).map((d) => ({ label: `Sort: ${d.name}`, value: `field:${d.name}` })),
  ];

  const colW = Math.min(SCREEN_W * 0.72, 300);

  return (
    <Page title="Smart Gen Board" goBack={goBack} noScroll>
      {/* The board inherits the app's own background — same wallpaper, same
          aurora, same field the home grid sits on. It is a surface within the
          app, not a separate one. "Cover" paints it opaque for anyone who
          wants the cards on a plain ground instead. */}
      <View style={{ flex: 1, backgroundColor: state.smartBoard.background || (state.smartBoard.coverBackground ? "#07080b" : "transparent") }}>
        {/* Board bar — Trello's top chrome: tap the name to switch boards,
            the menu to edit the one you're on. One card pool, many boards;
            each board is a named lens with its own lanes and layout. */}
        <View style={local.boardBar}>
          <Pressable onPress={() => setBoardsOpen(true)} style={local.boardNameBtn}>
            <Ionicons name="albums-outline" size={13} color="rgba(238,241,246,0.7)" />
            <Text style={local.boardName} numberOfLines={1}>{activeBoard?.name || "Board"}</Text>
            <Ionicons name="chevron-down" size={11} color="rgba(238,241,246,0.45)" />
          </Pressable>
          <Pressable onPress={() => setBoardMenuOpen(true)} style={local.iconBtn}>
            <Ionicons name="ellipsis-horizontal" size={15} color="rgba(238,241,246,0.7)" />
          </Pressable>
        </View>
        {/* View switcher — the board type is itself an adjustable attribute,
            for the user and for the model alike (board action "board"). */}
        <View style={local.switcherRow}>
          <View style={{ flex: 1 }}>
            <Picker
              value={askMode ? "__ask" : view}
              onChange={(v) => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                if (v === "__ask") setAskMode(true);
                else { setAskMode(false); dispatch({ type: "setBoardConfig", config: { view: v as BoardView } }); }
              }}
              options={[
                { label: "Canvas — free placement", value: "canvas" },
                { label: "Board — vertical lanes", value: "board" },
                { label: "Lanes — horizontal", value: "lanes" },
                { label: "List", value: "list" },
                { label: "Agenda", value: "calendar" },
                { label: "Week", value: "week" },
                { label: "Month", value: "month" },
                { label: "Pages — storyboard / journal", value: "pages" },
                { label: "Circle — in or out", value: "circle" },
                { label: "Ask", value: "__ask" },
              ]}
            />
          </View>
          <Pressable
            onPress={() => { setAskMode(true); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); }}
            style={[local.iconBtn, askMode && { backgroundColor: "rgba(167,139,250,0.16)", borderWidth: 1, borderColor: "rgba(167,139,250,0.45)" }]}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={15} color={askMode ? "#a78bfa" : "rgba(238,241,246,0.6)"} />
          </Pressable>
        </View>

        {!askMode && (
          <>
            {/* Controls: grouping, sorting, filter, global field manager */}
            <View style={local.controlsRow}>
              <View style={{ flex: 1 }}>
                <Picker value={groupBy} onChange={(v) => dispatch({ type: "setBoardConfig", config: { groupBy: v as BoardGroupBy } })} options={groupOptions} />
              </View>
              <View style={{ flex: 1 }}>
                <Picker value={sortBy} onChange={(v) => dispatch({ type: "setBoardConfig", config: { sortBy: v as BoardSortBy } })} options={sortOptions} />
              </View>
            </View>
            <View style={[local.controlsRow, { marginTop: 6 }]}>
              <Pressable onPress={() => setNewCardOpen(true)} style={local.iconBtn}>
                <Ionicons name="add" size={17} color="rgba(238,241,246,0.85)" />
              </Pressable>
              <Pressable
                onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}
                style={[local.iconBtn, selectMode && { backgroundColor: "rgba(167,139,250,0.18)" }]}
              >
                <Ionicons name={selectMode ? "checkmark-circle" : "ellipse-outline"} size={15} color={selectMode ? "#a78bfa" : "rgba(238,241,246,0.7)"} />
              </Pressable>
              <Pressable
                onPress={() => dispatch({ type: "setBoardConfig", config: { hideDone: !state.smartBoard.hideDone } })}
                style={[local.iconBtn, state.smartBoard.hideDone && { backgroundColor: "rgba(52,211,153,0.15)" }]}
              >
                <Ionicons name={state.smartBoard.hideDone ? "eye-off-outline" : "checkmark-done-outline"} size={15} color={state.smartBoard.hideDone ? "#34d399" : "rgba(238,241,246,0.7)"} />
              </Pressable>
              {/* Background — inherit the app's wallpaper (default) or let the
                  board cover it. */}
              <Pressable
                onPress={() => dispatch({ type: "setBoardConfig", config: { coverBackground: !state.smartBoard.coverBackground } })}
                style={[local.iconBtn, state.smartBoard.coverBackground && { backgroundColor: "rgba(93,189,255,0.15)" }]}
              >
                <Ionicons
                  name={state.smartBoard.coverBackground ? "square" : "image-outline"}
                  size={15}
                  color={state.smartBoard.coverBackground ? "#5dbdff" : "rgba(238,241,246,0.7)"}
                />
              </Pressable>
              {/* Align — the only thing that tidies the canvas, and only when
                  pressed. Nothing snaps on its own. */}
              {view === "canvas" && (
                <Pressable onPress={alignNow} style={local.iconBtn}>
                  <Ionicons name="grid-outline" size={15} color="rgba(238,241,246,0.7)" />
                </Pressable>
              )}
              <Pressable onPress={() => setFieldsManagerOpen(true)} style={local.iconBtn}>
                <Ionicons name="options-outline" size={15} color="rgba(238,241,246,0.7)" />
              </Pressable>
            </View>
            {selectMode && (
              <View style={local.selectBar}>
                <Pressable onPress={selectAllVisible} hitSlop={6}>
                  <Text style={local.selectBarText}>
                    {selected.size >= visible.length && visible.length > 0 ? "Select none" : `Select all ${visible.length}`}
                  </Text>
                </Pressable>
                <View style={{ flex: 1 }} />
                <Text style={[local.selectBarText, { opacity: 0.6 }]}>{selected.size} selected</Text>
                <Pressable onPress={deleteSelected} disabled={!selected.size} hitSlop={6} style={!selected.size ? { opacity: 0.35 } : undefined}>
                  <Text style={[local.selectBarText, { color: "#f87171" }]}>Delete</Text>
                </Pressable>
                <Pressable onPress={exitSelect} hitSlop={6}>
                  <Text style={local.selectBarText}>Done</Text>
                </Pressable>
              </View>
            )}
            <View style={{ paddingHorizontal: 12, marginTop: 6 }}>
              <View style={local.searchContainer}>
                <Ionicons name="search" size={13} color="rgba(255,255,255,0.4)" style={{ marginRight: 7 }} />
                <TextInput
                  value={filter}
                  onChangeText={(t) => dispatch({ type: "setBoardConfig", config: { filter: t } })}
                  placeholder="Filter cards..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={local.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {filter.length > 0 && (
                  <Pressable onPress={() => dispatch({ type: "setBoardConfig", config: { filter: "" } })} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={13} color="rgba(255,255,255,0.5)" />
                  </Pressable>
                )}
              </View>
            </View>

            {/* Canvas — free placement. A card goes exactly where it is put
                and stays there: no lane claims it, no sort re-flows it, no
                grid snaps it. Order and alignment happen only when the user
                asks (Sort, or the Align button above). Drag-to-embed is not
                wired here on purpose — on a surface whose entire point is
                putting a card next to another card, "on top of" must not
                silently mean "inside". Embedding lives in the card editor and
                in the lane views. */}
            {view === "canvas" && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12, paddingBottom: 60 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ width: canvasSize.w + 20, height: canvasSize.h + 40 }}>
                    {visible.map((card) => {
                      const k = cardKey(card);
                      const p = posFor(k);
                      return (
                        <DraggableCard
                          key={k}
                          card={card}
                          ctx={null}
                          free={{
                            x: p.x, y: p.y, width: CANVAS_CARD_W,
                            onMove: (c, x, y) => dispatch({ type: "setCardPos", key: cardKey(c), x, y }),
                          }}
                          // An open card overlays its neighbours instead of
                          // being clipped by them — opening is a foreground
                          // act, and nothing else moves out of its way.
                          elevated={expandedKeys.has(k)}
                        >
                          <View onLayout={(e) => noteHeight(k, e.nativeEvent.layout.height)}>
                            <BoardCardView card={card} now={now} all={allCards} onOpen={openDetail} onToggleDone={toggleDone} {...cardFace(card)} />
                          </View>
                        </DraggableCard>
                      );
                    })}
                    {visible.length === 0 && (
                      <Text style={[styles.muted, { textAlign: "center", marginTop: 60 }]}>No cards yet — Smart Gen fills this board from your conversations.</Text>
                    )}
                  </View>
                </ScrollView>
              </ScrollView>
            )}

            {/* Vertical swimlanes. Columns are drop zones; a card put in one
                takes on that column's meaning and keeps the position you
                gave it. */}
            {view === "board" && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 10 }}>
                {columns.map((c) => (
                  <View key={c.key} ref={registerZone(c.key)} collapsable={false} style={{ width: colW }}>
                    <ColumnHeader color={c.color} label={c.label} count={c.cards.length} onPress={laneHeaderPress(c)} />
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 30, minHeight: 90 }}>
                      {c.cards.map((card) => (
                        <DraggableCard key={cardKey(card)} card={card} ctx={dragCtx}>
                          <BoardCardView card={card} now={now} all={allCards} onOpen={openDetail} onToggleDone={toggleDone} {...cardFace(card)} />
                        </DraggableCard>
                      ))}
                      {c.cards.length === 0 && <Text style={local.emptyCol}>Drop here</Text>}
                    </ScrollView>
                  </View>
                ))}
                {/* Trello's "+ Add another list" — present only where the
                    lane axis is user-owned (a select field's options, or
                    projects), because there it genuinely creates a lane. */}
                {laneAxis && <AddLaneGhost width={colW} onAdd={addLane} />}
              </ScrollView>
            )}

            {/* Horizontal swimlanes — same lanes, laid across instead of down.
                Better when lanes are few and cards per lane are many. */}
            {view === "lanes" && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10, paddingBottom: 40, gap: 12 }}>
                {columns.map((c) => (
                  <View key={c.key} ref={registerZone(c.key)} collapsable={false} style={{ gap: 7 }}>
                    <View style={{ paddingHorizontal: 12 }}>
                      <ColumnHeader color={c.color} label={c.label} count={c.cards.length} onPress={laneHeaderPress(c)} />
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, minWidth: SCREEN_W }}>
                      {c.cards.map((card) => (
                        <DraggableCard key={cardKey(card)} card={card} ctx={dragCtx}>
                          <View style={{ width: colW * 0.86 }}>
                            <BoardCardView card={card} now={now} all={allCards} onOpen={openDetail} onToggleDone={toggleDone} {...cardFace(card)} />
                          </View>
                        </DraggableCard>
                      ))}
                      {c.cards.length === 0 && <Text style={[local.emptyCol, { paddingVertical: 24 }]}>Drop here</Text>}
                    </ScrollView>
                  </View>
                ))}
                {laneAxis && (
                  <View style={{ paddingHorizontal: 12 }}>
                    <AddLaneGhost onAdd={addLane} />
                  </View>
                )}
              </ScrollView>
            )}

            {view === "list" && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 40, gap: 8 }}>
                {columns.map((c) => (
                  <View key={c.key} style={{ gap: 8 }}>
                    <ColumnHeader color={c.color} label={c.label} count={c.cards.length} />
                    {c.cards.map((card) => (
                      <BoardCardView key={cardKey(card)} card={card} now={now} all={allCards} onOpen={openDetail} onToggleDone={toggleDone} compact {...cardFace(card)} />
                    ))}
                  </View>
                ))}
                {visible.length === 0 && <Text style={[styles.muted, { textAlign: "center", marginTop: 60 }]}>No cards yet — Smart Gen fills this board from your conversations.</Text>}
              </ScrollView>
            )}

            {/* Week — seven day lanes. Dropping a card on a day IS scheduling
                it; no date picker in between. */}
            {view === "week" && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
                {weekDays(now).map((d) => {
                  const dayCards = visible.filter((c) => c.due != null && sameDay(c.due, d));
                  const isToday = sameDay(now, d);
                  return (
                    <View key={d} ref={registerZone(`day:${d}`)} collapsable={false} style={{ width: colW * 0.78 }}>
                      <ColumnHeader
                        color={isToday ? "#fbbf24" : "#5dbdff"}
                        label={new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                        count={dayCards.length}
                      />
                      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 30, minHeight: 90 }}>
                        {dayCards.map((card) => (
                          <DraggableCard key={cardKey(card)} card={card} ctx={dragCtx}>
                            <BoardCardView card={card} now={now} all={allCards} onOpen={openDetail} onToggleDone={toggleDone} compact {...cardFace(card)} />
                          </DraggableCard>
                        ))}
                        {dayCards.length === 0 && <Text style={local.emptyCol}>Drop here</Text>}
                      </ScrollView>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* Month — the shape of the month itself; a day's load is legible
                at a glance from how full its cell is. */}
            {view === "month" && <MonthGrid cards={visible} now={now} onOpen={openDetail} />}

            {/* Pages — one card at a time, full width. This is the storyboard,
                the photobook, the lore book, the daily journal: same cards,
                read as a sequence instead of a pile. */}
            {view === "pages" && (
              <PagesView cards={visible} now={now} all={allCards} onOpen={openDetail} onToggleDone={toggleDone} />
            )}

            {/* Circle — in or out. Two zones, one meaning, nothing to read. */}
            {view === "circle" && (
              <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 12 }}>
                {/* Which attribute divides inside from outside is a choice —
                    urgency by default, any checkbox field otherwise. */}
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  <Text style={local.sectionLabel}>CIRCLE IS</Text>
                  <View style={{ flex: 1 }}>
                    <Picker
                      value={state.smartBoard.circleField || ""}
                      onChange={(v) => dispatch({ type: "setBoardConfig", config: { circleField: v } })}
                      options={[
                        { label: "Urgent", value: "" },
                        ...Object.values(state.fieldDefs || {}).filter((d) => d.type === "checkbox").map((d) => ({ label: d.name, value: d.name })),
                      ]}
                    />
                  </View>
                </View>
                <View ref={registerZone("circle-in")} collapsable={false} style={local.circleIn}>
                  <Text style={[local.colTitle, { textAlign: "center", marginBottom: 8 }]}>IN</Text>
                  <View style={{ gap: 8 }}>
                    {visible.filter(inCircle).map((card) => (
                      <DraggableCard key={cardKey(card)} card={card} ctx={dragCtx}>
                        <BoardCardView card={card} now={now} all={allCards} onOpen={openDetail} onToggleDone={toggleDone} compact {...cardFace(card)} />
                      </DraggableCard>
                    ))}
                    {!visible.some(inCircle) && <Text style={local.emptyCol}>Drop here</Text>}
                  </View>
                </View>
                <View ref={registerZone("circle-out")} collapsable={false} style={{ gap: 8, paddingTop: 4 }}>
                  <Text style={[local.colTitle, { textAlign: "center", opacity: 0.6 }]}>OUT</Text>
                  {visible.filter((c) => !inCircle(c)).map((card) => (
                    <DraggableCard key={cardKey(card)} card={card} ctx={dragCtx}>
                      <BoardCardView card={card} now={now} all={allCards} onOpen={openDetail} onToggleDone={toggleDone} compact {...cardFace(card)} />
                    </DraggableCard>
                  ))}
                </View>
              </ScrollView>
            )}

            {view === "calendar" && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 40, gap: 8 }}>
                {calendarSections(visible, now).map((s) => (
                  <View key={s.key} style={{ gap: 8 }}>
                    <View style={{ marginTop: 8 }}>
                      <ColumnHeader color={s.color} label={s.label} count={s.cards.length} />
                    </View>
                    {s.cards.map((card) => (
                      <View key={`${card.ref.kind}:${card.ref.id}`}>
                        {card.due != null && (
                          <Text style={local.calDate}>
                            {new Date(card.due).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                            {" · "}
                            {new Date(card.due).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          </Text>
                        )}
                        <BoardCardView card={card} now={now} all={allCards} onOpen={openDetail} />
                      </View>
                    ))}
                  </View>
                ))}
                {visible.length === 0 && <Text style={[styles.muted, { textAlign: "center", marginTop: 60 }]}>Nothing scheduled.</Text>}
              </ScrollView>
            )}
          </>
        )}

        {askMode && <BoardChat allCards={allCards} openDetail={openDetail} />}
      </View>

      {detailRef && (
        <CardDetailModal
          key={`${detailRef.kind}:${detailRef.id}`}
          cardRef={detailRef}
          allCards={allCards}
          now={now}
          onClose={() => setDetailRef(null)}
          onOpenOther={(r) => setDetailRef(r)}
        />
      )}
      {newCardOpen && (
        <Modal transparent animationType="fade" onRequestClose={() => setNewCardOpen(false)}>
          <Pressable style={local.modalBackdrop} onPress={() => setNewCardOpen(false)}>
            <Pressable style={[local.modalSheet, { maxWidth: 340 }]} onPress={() => {}}>
              <View style={{ padding: 16, gap: 10 }}>
                <Text style={local.sectionLabel}>NEW CARD</Text>
                {ALL_KINDS.map((k) => (
                  <Pressable key={k} onPress={() => createCard(k)} style={[local.layoutRow, { paddingVertical: 11 }]}>
                    <Ionicons name={KIND_ICONS[k]} size={15} color={KIND_COLORS[k]} />
                    <Text style={[local.fieldName, { flex: 1, maxWidth: undefined, textTransform: "capitalize" }]}>{k}</Text>
                    <Ionicons name="chevron-forward" size={13} color="rgba(238,241,246,0.4)" />
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {fieldsManagerOpen && <TypeFieldsManager onClose={() => setFieldsManagerOpen(false)} />}
      {boardsOpen && <BoardSwitcherModal onClose={() => setBoardsOpen(false)} />}
      {boardMenuOpen && <BoardMenuModal onClose={() => setBoardMenuOpen(false)} />}
      {laneEdit && (
        <LaneEditModal
          lane={laneEdit}
          canDelete={laneDeletable(laneEdit.key)}
          onRename={(next) => renameLane(laneEdit.key, next)}
          onDelete={() => deleteLane(laneEdit.key)}
          onClose={() => setLaneEdit(null)}
        />
      )}
    </Page>
  );
}

// ── Boards — Trello's model: many named boards over one card pool ───────────
const VIEW_LABELS: Record<string, string> = {
  canvas: "Canvas", board: "Board", lanes: "Lanes", list: "List", calendar: "Agenda",
  week: "Week", month: "Month", pages: "Pages", circle: "Circle",
};

function BoardSwitcherModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useCollider();
  const [newName, setNewName] = useState("");
  const create = () => {
    const name = newName.trim();
    if (!name) return;
    dispatch({ type: "createBoard", id: newId("bd"), name });
    setNewName("");
    onClose();
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={local.modalBackdrop} onPress={onClose}>
        <Pressable style={[local.modalSheet, { maxWidth: 360 }]} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }}>
            <Text style={local.sectionLabel}>YOUR BOARDS</Text>
            {state.boards.map((b) => {
              const active = b.id === state.activeBoardId;
              return (
                <Pressable key={b.id} onPress={() => { dispatch({ type: "switchBoard", id: b.id }); onClose(); }} style={[local.boardRow, active && local.boardRowActive]}>
                  <View style={[local.boardSwatch, { backgroundColor: b.config.background || "rgba(255,255,255,0.08)" }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={local.boardRowName} numberOfLines={1}>{b.name}</Text>
                    <Text style={local.boardRowMeta}>{VIEW_LABELS[b.config.view] || b.config.view}</Text>
                  </View>
                  {active && <Ionicons name="checkmark" size={14} color="#a78bfa" />}
                </Pressable>
              );
            })}
            <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="New board name"
                placeholderTextColor="rgba(255,255,255,0.3)"
                style={local.fieldInput}
                onSubmitEditing={create}
              />
              <Pressable onPress={create} style={[local.quickChip, { justifyContent: "center" }]}>
                <Text style={local.quickChipText}>Create</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Deep tints, not Trello's flat brights — this app's rule is that color is
// light and diffused, and the board's ground sits behind pale paper cards.
const BOARD_BACKGROUNDS: { label: string; value: string }[] = [
  { label: "Wallpaper", value: "" },
  { label: "Ocean", value: "#0c2233" },
  { label: "Forest", value: "#10281b" },
  { label: "Plum", value: "#221833" },
  { label: "Ember", value: "#2e1a12" },
  { label: "Rose", value: "#2c1420" },
  { label: "Slate", value: "#14171c" },
];

function BoardMenuModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useCollider();
  const { toast } = useToast();
  const active = state.boards.find((b) => b.id === state.activeBoardId);
  const [name, setName] = useState(active?.name || "");
  // Deleting a board is the one destructive act here — it takes two taps.
  const [armDelete, setArmDelete] = useState(false);
  if (!active) return null;
  const commitName = () => {
    if (name.trim() && name.trim() !== active.name) dispatch({ type: "renameBoard", id: active.id, name });
  };
  const close = () => { commitName(); onClose(); };
  return (
    <Modal transparent animationType="fade" onRequestClose={close}>
      <Pressable style={local.modalBackdrop} onPress={close}>
        <Pressable style={[local.modalSheet, { maxWidth: 360 }]} onPress={() => {}}>
          <View style={{ padding: 14, gap: 12 }}>
            <Text style={local.sectionLabel}>BOARD NAME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={commitName}
              onSubmitEditing={commitName}
              style={local.modalTitleInput}
              placeholder="Board name"
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
            <Text style={local.sectionLabel}>BACKGROUND</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {BOARD_BACKGROUNDS.map((bg) => {
                const selected = (state.smartBoard.background || "") === bg.value;
                return (
                  <Pressable
                    key={bg.label}
                    onPress={() => dispatch({ type: "setBoardConfig", config: { background: bg.value || undefined } })}
                    style={[local.bgSwatch, bg.value ? { backgroundColor: bg.value } : local.bgSwatchNone, selected && local.bgSwatchSelected]}
                  >
                    {!bg.value && <Ionicons name="image-outline" size={13} color="rgba(238,241,246,0.6)" />}
                    {selected && !!bg.value && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Pressable
                onPress={() => { commitName(); dispatch({ type: "duplicateBoard", id: active.id, newId: newId("bd") }); onClose(); toast("Board duplicated"); }}
                style={local.quickChip}
              >
                <Text style={local.quickChipText}>Duplicate board</Text>
              </Pressable>
              {state.boards.length > 1 && (
                <Pressable
                  onPress={() => {
                    if (!armDelete) { setArmDelete(true); return; }
                    dispatch({ type: "deleteBoard", id: active.id });
                    onClose();
                    toast("Board deleted");
                  }}
                  style={[local.quickChip, armDelete && { borderColor: "rgba(248,113,113,0.6)", backgroundColor: "rgba(248,113,113,0.12)" }]}
                >
                  <Text style={[local.quickChipText, armDelete && { color: "#f87171" }]}>{armDelete ? "Tap again to delete" : "Delete board"}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Tap a lane's title to rename it — the Trello gesture. Deleting is offered
// only for an empty option-backed lane; a lane with cards is their value.
function LaneEditModal({ lane, canDelete, onRename, onDelete, onClose }: {
  lane: { key: string; label: string };
  canDelete: boolean;
  onRename: (next: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(lane.label);
  const commit = () => { onRename(name); onClose(); };
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={local.modalBackdrop} onPress={onClose}>
        <Pressable style={[local.modalSheet, { maxWidth: 320 }]} onPress={() => {}}>
          <View style={{ padding: 14, gap: 10 }}>
            <Text style={local.sectionLabel}>LANE</Text>
            <TextInput value={name} onChangeText={setName} autoFocus style={local.modalTitleInput} onSubmitEditing={commit} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Pressable onPress={commit} style={local.quickChip}><Text style={local.quickChipText}>Rename</Text></Pressable>
              {canDelete && (
                <Pressable onPress={() => { onDelete(); onClose(); }} style={local.quickChip}>
                  <Text style={[local.quickChipText, { color: "#f87171" }]}>Delete lane</Text>
                </Pressable>
              )}
              <Pressable onPress={onClose} style={local.quickChip}><Text style={local.quickChipText}>Cancel</Text></Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Trello's "+ Add another list", as an inline composer at the end of the
// lanes — a ghost column that becomes an input when tapped.
function AddLaneGhost({ width, onAdd }: { width?: number; onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const commit = () => { onAdd(text); setText(""); setOpen(false); };
  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={[local.addLaneBtn, width ? { width } : null]}>
        <Ionicons name="add" size={14} color="rgba(238,241,246,0.6)" />
        <Text style={local.addLaneText}>Add lane</Text>
      </Pressable>
    );
  }
  return (
    <View style={[local.addLaneForm, width ? { width } : null]}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Lane name"
        placeholderTextColor="rgba(255,255,255,0.3)"
        // flex:1 is for row layouts; in this column form it would collapse
        // the input to zero height.
        style={[local.fieldInput, { flex: 0 }]}
        autoFocus
        onSubmitEditing={commit}
      />
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Pressable onPress={commit} style={local.quickChip}><Text style={local.quickChipText}>Add</Text></Pressable>
        <Pressable onPress={() => { setText(""); setOpen(false); }} style={local.quickChip}><Text style={local.quickChipText}>Cancel</Text></Pressable>
      </View>
    </View>
  );
}

// ── Ask tab — MiniMax M3 with the board as context, acting directly ─────────
function BoardChat({ allCards, openDetail }: { allCards: BoardCard[]; openDetail: (ref: CardEmbed) => void }) {
  const { state, dispatch, getState } = useCollider();
  const { toast } = useToast();
  const [messages, setMessages] = useState<BoardChatMsg[]>([]);
  const input = state.drafts["board-chat"] || "";
  const setInput = (v: string) => dispatch({ type: "setDraft", key: "board-chat", value: v });
  const [busy, setBusy] = useState(false);
  const [useWeb, setUseWeb] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput(""); // the message is committed; its draft is spent
    setBusy(true);
    const userMsg: BoardChatMsg = { id: newId("bc"), role: "user", content: prompt };
    const draftId = newId("bc");
    setMessages((prev) => [...prev, userMsg, { id: draftId, role: "assistant", content: "", streaming: true }]);
    try {
      const history = messages.map((m) => ({ id: m.id, role: m.role, content: m.content, ts: 0 }));
      const briefs = toBriefs(unifyCards(getState()), getState());
      // Cards arrive as they are produced, not as one dump at the end: each
      // complete action object in the streaming block is executed the moment
      // it closes. Nobody is waiting on a spinner for a stack.
      let streamedCount = 0;
      const raw = await smartGenChat(history as any, prompt, briefs, {
        webSearch: useWeb,
        fieldDefs: getState().fieldDefs,
        boards: getState().boards.map((b) => ({ name: b.name, active: b.id === getState().activeBoardId, view: b.config.view })),
        onToken: (partial) => {
          // Hide a half-received action block while streaming; it renders as
          // an "applied" chip once complete, never as raw JSON.
          const visible = partial.split("```collider-actions")[0];
          setMessages((prev) => prev.map((m) => (m.id === draftId ? { ...m, content: visible } : m)));
          const ready = completeActions(partial);
          if (ready.length > streamedCount) {
            const fresh = ready.slice(streamedCount);
            streamedCount = ready.length;
            const n = executeBoardActions(fresh, dispatch, getState);
            if (n) {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setMessages((prev) => prev.map((m) => (m.id === draftId ? { ...m, applied: (m.applied || 0) + n } : m)));
            }
          }
        },
      });
      const { prose, actions } = parseBoardActions(raw);
      // Anything already applied mid-stream is not applied twice.
      const applied = streamedCount > 0
        ? (getState(), streamedCount) + executeBoardActions(actions.slice(streamedCount), dispatch, getState)
        : executeBoardActions(actions, dispatch, getState);
      setMessages((prev) => prev.map((m) => (m.id === draftId ? { ...m, content: prose || (applied ? "Done." : ""), applied, streaming: false } : m)));
      if (applied) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === draftId ? { ...m, content: friendlyErrorMessage(e), streaming: false } : m)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 10, flexGrow: 1 }}
      >
        {messages.length === 0 && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20 }}>
            <Ionicons name="chatbubble-ellipses-outline" size={28} color="rgba(167,139,250,0.5)" />
            <Text style={[styles.muted, { textAlign: "center", fontSize: 12, lineHeight: 18 }]}>
              Ask about anything on your board — or ask for something new. "What's left to do in my case?" · "Did I start my favorite-movies list yet?" It answers from the board and makes the change in the same breath.
            </Text>
          </View>
        )}
        {messages.map((m) => (
          <View key={m.id} style={[local.bubble, m.role === "user" ? local.bubbleUser : local.bubbleAssistant]}>
            {m.role === "assistant" ? (
              <>
                {m.streaming && !m.content ? (
                  <ActivityIndicator size="small" color="#a78bfa" />
                ) : (
                  <Markdown content={m.content} fontSize={12.5} />
                )}
                {!!m.applied && (
                  <View style={local.appliedChip}>
                    <Ionicons name="checkmark-circle" size={11} color="#34d399" />
                    <Text style={{ color: "#34d399", fontSize: 10, fontWeight: "800", fontFamily: fontFamilyForWeight(800) }}>
                      {m.applied} board change{m.applied > 1 ? "s" : ""} applied
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <Text style={{ color: "#fff", fontSize: 12.5, lineHeight: 18 }}>{m.content}</Text>
            )}
          </View>
        ))}
      </ScrollView>
      <View style={local.chatInputRow}>
        <Pressable onPress={() => setUseWeb((w) => !w)} style={[local.iconBtn, useWeb && { backgroundColor: "rgba(93,189,255,0.15)", borderColor: "rgba(93,189,255,0.45)", borderWidth: 1 }]}>
          <Ionicons name="globe-outline" size={15} color={useWeb ? "#5dbdff" : "rgba(238,241,246,0.5)"} />
        </Pressable>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask your board..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          style={local.chatInput}
          multiline
          onSubmitEditing={send}
        />
        <Pressable accessibilityLabel="Send" onPress={send} disabled={busy || !input.trim()} style={[local.sendBtn, (busy || !input.trim()) && { opacity: 0.4 }]}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={16} color="#fff" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Card detail modal ───────────────────────────────────────────────────────
function CardDetailModal({ cardRef, allCards, now, onClose, onOpenOther }: {
  cardRef: CardEmbed; allCards: BoardCard[]; now: number; onClose: () => void; onOpenOther: (ref: CardEmbed) => void;
}) {
  const { state, dispatch } = useCollider();
  const { toast } = useToast();
  const item: any = findCard(state, cardRef);
  const card = allCards.find((c) => c.ref.kind === cardRef.kind && c.ref.id === cardRef.id);
  const [title, setTitle] = useState<string>(card?.title || "");
  const [body, setBody] = useState<string>(cardRef.kind === "memory" ? item?.content || "" : cardRef.kind === "artifact" ? item?.content || "" : "");
  const [embedPickerOpen, setEmbedPickerOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldType>("text");
  const [originPreview, setOriginPreview] = useState<CardOrigin | null>(null);
  const [newRow, setNewRow] = useState("");
  const [rowQuery, setRowQuery] = useState("");
  const [rowPage, setRowPage] = useState(0);
  if (!item || !card) return null;

  const color = KIND_COLORS[cardRef.kind];
  const typeDefaults = state.cardTypeFields[cardRef.kind] || [];
  const fields: Record<string, string> = { ...Object.fromEntries(typeDefaults.map((k) => [k, ""])), ...(item.customFields || {}) };

  // Committed on every keystroke, not on blur: a dead battery, a switched
  // app, or a closed modal must never cost words the user already typed.
  const saveText = (t = title, b = body) => {
    if (cardRef.kind === "memory") dispatch({ type: "updateMemory", memory: { ...item, content: b.trim() || item.content } });
    else if (cardRef.kind === "reminder") dispatch({ type: "updateReminder", reminder: { ...item, title: t.trim() || item.title } });
    else if (cardRef.kind === "project") dispatch({ type: "updateProject", project: { ...item, name: t.trim() || item.name } });
    else dispatch({ type: "updateArtifact", artifact: { ...item, title: t.trim() || item.title, content: b } });
  };
  // Layout is per-card once touched, falling back to the type default.
  const layout: string[] = item?.layout || state.cardLayout?.[cardRef.kind] || [];
  const setLayout = (next: string[]) => dispatch({ type: "setCardOwnLayout", ref: cardRef, layout: next });
  const moveField = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= layout.length) return;
    const next = [...layout];
    [next[i], next[j]] = [next[j], next[i]];
    setLayout(next);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };
  // Everything available but not currently placed — built-ins plus this
  // card's own attributes, so a removed field can always be put back.
  const hiddenFields = [
    ...BUILTIN_FIELDS.filter((f) => !layout.includes(f)),
    ...Object.keys({ ...Object.fromEntries((state.cardTypeFields[cardRef.kind] || []).map((k) => [k, ""])), ...(item?.customFields || {}) })
      .filter((f) => !layout.includes(f) && f !== HIDE_COUNTDOWN_FIELD),
  ];
  const media: CardMedia[] = item?.media || [];
  const addMedia = (m: CardMedia) => dispatch({ type: "setCardMedia", ref: cardRef, media: [...media, m] });
  // Face and rows — the notebook side of the editor. Template is per card,
  // falling back to the type default exactly like layout does.
  const template: CardTemplate = item?.template || state.cardTemplates?.[cardRef.kind] || "card";
  const setTemplate = (t: CardTemplate) => dispatch({ type: "setCardTemplate", ref: cardRef, template: t });
  const rows: string[] = item?.rows || [];
  const setRows = (next: string[]) => dispatch({ type: "setCardRows", ref: cardRef, rows: next });
  const matchedRows = rowQuery.trim()
    ? rows.map((r, i) => ({ r, i })).filter(({ r }) => r.toLowerCase().includes(rowQuery.trim().toLowerCase()))
    : rows.map((r, i) => ({ r, i }));
  const rowPageCount = Math.max(1, Math.ceil(matchedRows.length / NOTEBOOK_PAGE_SIZE));
  const rowPageSafe = Math.min(rowPage, rowPageCount - 1);
  const pagedRows = matchedRows.slice(rowPageSafe * NOTEBOOK_PAGE_SIZE, rowPageSafe * NOTEBOOK_PAGE_SIZE + NOTEBOOK_PAGE_SIZE);
  const setField = (k: string, v: string) => {
    dispatch({ type: "setCardFields", ref: cardRef, fields: { ...(item.customFields || {}), [k]: v } });
  };
  const removeField = (k: string) => {
    const nextFields = { ...(item.customFields || {}) };
    delete nextFields[k];
    dispatch({ type: "setCardFields", ref: cardRef, fields: nextFields });
  };
  const setDueQuick = (due?: number) => {
    dispatch({ type: "updateReminder", reminder: { ...item, due } });
  };
  const convert = (toKind: LinkKind) => {
    saveText();
    dispatch({ type: "convertCard", ref: cardRef, toKind });
    toast(`Converted to ${toKind}`);
    onClose();
  };
  const remove = () => {
    const actionMap: Record<LinkKind, string> = { memory: "removeMemory", reminder: "removeReminder", project: "removeProject", artifact: "removeArtifact" };
    dispatch({ type: actionMap[cardRef.kind], id: cardRef.id } as any);
    onClose();
  };

  const embedded = card.embeds.map((e) => allCards.find((c) => c.ref.kind === e.kind && c.ref.id === e.id)).filter(Boolean) as BoardCard[];
  const tomorrow9 = () => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); };
  const nextWeek9 = () => { const d = new Date(now); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d.getTime(); };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { saveText(); onClose(); }}>
      <View style={local.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { saveText(); onClose(); }} />
        <Glass style={local.modalSheet}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <KindBadge kind={cardRef.kind} />
              {card.due != null && <CountdownChip due={card.due} now={now} />}
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => { saveText(); onClose(); }} hitSlop={8}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>

            {cardRef.kind !== "memory" && (
              <TextInput value={title} onChangeText={(t) => { setTitle(t); saveText(t, body); }} style={local.modalTitleInput} placeholder="Title" placeholderTextColor="rgba(255,255,255,0.3)" multiline />
            )}
            {(cardRef.kind === "memory" || cardRef.kind === "artifact") && (
              <TextInput value={body} onChangeText={(t) => { setBody(t); saveText(title, t); }} style={local.modalBodyInput} placeholder={cardRef.kind === "memory" ? (template === "notebook" ? "Notebook header — what these entries are about" : "Memory content") : "Artifact content"} placeholderTextColor="rgba(255,255,255,0.3)" multiline />
            )}

            {/* Reminder-specific: urgency, deadline, recurrence. Urgent is a
                binary checkbox — there is no medium. Urgency is intrinsically
                attached to time, so checking it REQUIRES a deadline: one is
                defaulted 12h out if none exists (a working deadline, meant to
                be corrected), and clearing the deadline removes Urgent — the
                user is told, not silently overridden. */}
            {cardRef.kind === "reminder" && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  <Pressable
                    onPress={() => {
                      const nowUrgent = collapsePriority(item.priority) !== "high";
                      const due = nowUrgent && !item.due ? now + 12 * 3600e3 : item.due;
                      dispatch({ type: "updateReminder", reminder: { ...item, priority: nowUrgent ? "high" : "none", due } });
                      if (nowUrgent && !item.due) toast("Deadline defaulted to 12h from now — adjust it below");
                    }}
                    style={[local.quickChip, { flexDirection: "row", alignItems: "center", gap: 5 }, collapsePriority(item.priority) === "high" && { backgroundColor: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.35)" }]}
                  >
                    <Ionicons name={collapsePriority(item.priority) === "high" ? "checkbox" : "square-outline"} size={13} color={collapsePriority(item.priority) === "high" ? "#fff" : "rgba(238,241,246,0.5)"} />
                    <Text style={[local.quickChipText, collapsePriority(item.priority) === "high" && { color: "#fff" }]}>Urgent</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => dispatch({ type: "toggleReminder", id: item.id })}
                    style={[local.quickChip, { flexDirection: "row", alignItems: "center", gap: 5 }, item.done && { backgroundColor: "rgba(52,211,153,0.14)", borderColor: "rgba(52,211,153,0.45)" }]}
                  >
                    <Ionicons name={item.done ? "checkbox" : "square-outline"} size={13} color={item.done ? "#34d399" : "rgba(238,241,246,0.5)"} />
                    <Text style={[local.quickChipText, item.done && { color: "#34d399" }]}>Done</Text>
                  </Pressable>
                  {collapsePriority(item.priority) === "high" && item.due != null && (
                    <Pressable onPress={() => setField(HIDE_COUNTDOWN_FIELD, item.customFields?.[HIDE_COUNTDOWN_FIELD] === CHECKED ? "" : CHECKED)} style={local.quickChip}>
                      <Text style={local.quickChipText}>{item.customFields?.[HIDE_COUNTDOWN_FIELD] === CHECKED ? "Show timer" : "Hide timer"}</Text>
                    </Pressable>
                  )}
                </View>

                <Text style={local.sectionLabel}>DEADLINE — DATE</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {([["Today", 0], ["One week", 7], ["One month", 30], ["One year", 365]] as const).map(([label, days]) => (
                    <Pressable
                      key={label}
                      onPress={() => {
                        const base = new Date(now); base.setDate(base.getDate() + days);
                        const prev = item.due ? new Date(item.due) : null;
                        base.setHours(prev ? prev.getHours() : 17, prev ? prev.getMinutes() : 0, 0, 0);
                        setDueQuick(base.getTime());
                      }}
                      style={local.quickChip}
                    >
                      <Text style={local.quickChipText}>{label}</Text>
                    </Pressable>
                  ))}
                  {item.due != null && (
                    <Pressable
                      onPress={() => {
                        const wasUrgent = collapsePriority(item.priority) === "high";
                        dispatch({ type: "updateReminder", reminder: { ...item, due: undefined, priority: "none" } });
                        if (wasUrgent) toast("Deadline cleared — Urgent removed (urgency requires a deadline)");
                      }}
                      style={[local.quickChip, { borderColor: "rgba(248,113,113,0.4)" }]}
                    >
                      <Text style={[local.quickChipText, { color: "#f87171" }]}>Clear</Text>
                    </Pressable>
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={local.fieldName}>Time</Text>
                  <TextInput
                    key={`time-${item.due}`}
                    defaultValue={item.due ? `${new Date(item.due).getHours().toString().padStart(2, "0")}:${new Date(item.due).getMinutes().toString().padStart(2, "0")}` : ""}
                    placeholder="HH:MM"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    onEndEditing={(e) => {
                      const m = e.nativeEvent.text.match(/^(\d{1,2}):(\d{2})$/);
                      if (!m) return;
                      const d = new Date(item.due ?? now); d.setHours(Math.min(23, +m[1]), Math.min(59, +m[2]), 0, 0);
                      setDueQuick(d.getTime());
                    }}
                    style={[local.fieldInput, { maxWidth: 90 }]}
                  />
                  {item.due != null && (
                    <Text style={[styles.muted, { fontSize: 10.5 }]}>
                      {new Date(item.due).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </Text>
                  )}
                </View>

                {/* Notification lead time — optional, and only meaningful
                    once a deadline exists. Stored on the card so it survives
                    and can be changed; scheduling is fire-and-forget. */}
                {item.due != null && (
                  <>
                    <Text style={local.sectionLabel}>NOTIFY BEFORE</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {([["At time", 0], ["10 min", 10], ["1 hour", 60], ["1 day", 1440], ["1 week", 10080]] as const).map(([label, mins]) => {
                        const active = (item.customFields?.["Notify before"] || "") === String(mins);
                        return (
                          <Pressable
                            key={label}
                            onPress={() => {
                              const next = active ? "" : String(mins);
                              setField("Notify before", next);
                              if (next) {
                                const at = item.due - mins * 60000;
                                if (at > Date.now()) {
                                  scheduleReminder(item.title, at, `card_${item.id}`);
                                  toast(`Notifying ${mins ? label.toLowerCase() + " before" : "at the deadline"}`);
                                } else toast("That lead time has already passed");
                              }
                            }}
                            style={[local.quickChip, active && { backgroundColor: "rgba(93,189,255,0.15)", borderColor: "rgba(93,189,255,0.45)" }]}
                          >
                            <Text style={[local.quickChipText, active && { color: "#5dbdff" }]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}

                <Text style={local.sectionLabel}>REPEATS</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {RECURRING_OPTIONS.map((r) => (
                    <Pressable key={r} onPress={() => dispatch({ type: "updateReminder", reminder: { ...item, recurring: item.recurring === r ? undefined : r } })} style={[local.quickChip, item.recurring === r && { backgroundColor: "rgba(167,139,250,0.16)", borderColor: "rgba(167,139,250,0.5)" }]}>
                      <Text style={[local.quickChipText, item.recurring === r && { color: "#a78bfa" }]}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Face — which template the card wears. A card is a stack of
                fields; a notebook is a header over rows of plain text, paged
                and searchable. Both use the same fields and the same layout
                list; only the reading changes. */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={local.sectionLabel}>FACE</Text>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => { dispatch({ type: "setTypeTemplate", kind: cardRef.kind, template }); toast(`All ${KIND_PLURAL[cardRef.kind]} use the ${template} face`); }}
                style={local.quickChip}
              >
                <Text style={local.quickChipText}>Apply to all {KIND_PLURAL[cardRef.kind]}</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {(["card", "notebook"] as CardTemplate[]).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTemplate(t)}
                  style={[local.quickChip, { flexDirection: "row", alignItems: "center", gap: 5 }, template === t && { backgroundColor: `${color}18`, borderColor: `${color}55` }]}
                >
                  <Ionicons name={t === "notebook" ? "book-outline" : "square-outline"} size={12} color={template === t ? color : "rgba(238,241,246,0.5)"} />
                  <Text style={[local.quickChipText, template === t && { color }]}>{t}</Text>
                </Pressable>
              ))}
            </View>

            {/* Entries — the notebook's rows. Plain strings under one header:
                one card holds a whole journal instead of a card per line, and
                retrieval is paging and searching, not scrolling. */}
            {(template === "notebook" || rows.length > 0) && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={local.sectionLabel}>ENTRIES</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={local.typeChipText}>{rows.length}</Text>
                </View>
                {rows.length > NOTEBOOK_PAGE_SIZE && (
                  <View style={local.searchContainer}>
                    <Ionicons name="search" size={13} color="rgba(255,255,255,0.4)" style={{ marginRight: 7 }} />
                    <TextInput
                      value={rowQuery}
                      onChangeText={(t) => { setRowQuery(t); setRowPage(0); }}
                      placeholder="Search entries..."
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      style={local.searchInput}
                      autoCapitalize="none"
                    />
                  </View>
                )}
                <View style={{ gap: 4 }}>
                  {pagedRows.map(({ r, i }) => (
                    <View key={i} style={local.layoutRow}>
                      <Text style={local.notebookRowNumDark}>{i + 1}</Text>
                      <TextInput
                        defaultValue={r}
                        multiline
                        onEndEditing={(e) => {
                          const v = e.nativeEvent.text.trim();
                          const next = [...rows];
                          if (v) next[i] = v; else next.splice(i, 1);
                          setRows(next);
                        }}
                        style={[local.fieldInput, { flex: 1 }]}
                      />
                      <Pressable onPress={() => setRows(rows.filter((_, j) => j !== i))} hitSlop={6}>
                        <Ionicons name="close-circle-outline" size={15} color="rgba(255,255,255,0.35)" />
                      </Pressable>
                    </View>
                  ))}
                  {rowPageCount > 1 && (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, paddingTop: 4 }}>
                      <Pressable onPress={() => setRowPage(Math.max(0, rowPageSafe - 1))} disabled={rowPageSafe === 0} hitSlop={8} style={rowPageSafe === 0 ? { opacity: 0.3 } : undefined}>
                        <Ionicons name="chevron-back" size={15} color="rgba(238,241,246,0.8)" />
                      </Pressable>
                      <Text style={local.colCount}>{rowPageSafe + 1} / {rowPageCount}</Text>
                      <Pressable onPress={() => setRowPage(Math.min(rowPageCount - 1, rowPageSafe + 1))} disabled={rowPageSafe >= rowPageCount - 1} hitSlop={8} style={rowPageSafe >= rowPageCount - 1 ? { opacity: 0.3 } : undefined}>
                        <Ionicons name="chevron-forward" size={15} color="rgba(238,241,246,0.8)" />
                      </Pressable>
                    </View>
                  )}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <TextInput
                      value={newRow}
                      onChangeText={setNewRow}
                      placeholder="Add an entry..."
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      style={[local.fieldInput, { flex: 1 }]}
                      onSubmitEditing={() => { const v = newRow.trim(); if (v) { setRows([...rows, v]); setNewRow(""); } }}
                    />
                    <Pressable onPress={() => { const v = newRow.trim(); if (v) { setRows([...rows, v]); setNewRow(""); } }} style={local.iconBtn}>
                      <Ionicons name="add" size={15} color="rgba(238,241,246,0.7)" />
                    </Pressable>
                  </View>
                </View>
              </>
            )}

            {/* Card layout — every element on the face, in order, movable and
                removable. Photos are a field like any other, so they sit
                wherever the user puts them. Changes apply to this card; the
                "all cards of this type" button pushes the same order to the
                type default. */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={local.sectionLabel}>CARD LAYOUT</Text>
              <View style={{ flex: 1 }} />
              {!!item.layout && (
                <Pressable onPress={() => dispatch({ type: "setCardOwnLayout", ref: cardRef, layout: undefined })} style={local.quickChip}>
                  <Text style={local.quickChipText}>Reset</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => { dispatch({ type: "setCardLayout", kind: cardRef.kind, layout }); toast(`Applied to all ${KIND_PLURAL[cardRef.kind]}`); }}
                style={local.quickChip}
              >
                <Text style={local.quickChipText}>Apply to all {KIND_PLURAL[cardRef.kind]}</Text>
              </Pressable>
            </View>
            <View style={{ gap: 4 }}>
              {layout.map((f, i) => (
                <View key={f} style={local.layoutRow}>
                  <Ionicons name="reorder-three-outline" size={14} color="rgba(238,241,246,0.35)" />
                  <Text style={[local.fieldName, { flex: 1, maxWidth: undefined }]} numberOfLines={1}>{fieldLabel(f)}</Text>
                  <Pressable onPress={() => moveField(i, -1)} disabled={i === 0} hitSlop={6} style={i === 0 ? { opacity: 0.25 } : undefined}>
                    <Ionicons name="chevron-up" size={15} color="rgba(238,241,246,0.7)" />
                  </Pressable>
                  <Pressable onPress={() => moveField(i, 1)} disabled={i === layout.length - 1} hitSlop={6} style={i === layout.length - 1 ? { opacity: 0.25 } : undefined}>
                    <Ionicons name="chevron-down" size={15} color="rgba(238,241,246,0.7)" />
                  </Pressable>
                  <Pressable onPress={() => setLayout(layout.filter((x) => x !== f))} hitSlop={6}>
                    <Ionicons name="close-circle-outline" size={15} color="rgba(255,255,255,0.35)" />
                  </Pressable>
                </View>
              ))}
              {hiddenFields.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 2 }}>
                  {hiddenFields.map((f) => (
                    <Pressable key={f} onPress={() => setLayout([...layout, f])} style={[local.typeChip, { flexDirection: "row", alignItems: "center", gap: 4 }]}>
                      <Ionicons name="add" size={10} color="rgba(238,241,246,0.6)" />
                      <Text style={local.typeChipText}>{fieldLabel(f)}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Photos and documents live on the card. Adding one is two taps,
                and it renders on the card face, not behind a menu. */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={local.sectionLabel}>PHOTOS & FILES</Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={async () => { const img = await takePhoto(); if (img) addMedia({ kind: "image", url: img.dataUri }); }} style={local.iconBtn}>
                <Ionicons name="camera-outline" size={15} color="rgba(238,241,246,0.7)" />
              </Pressable>
              <Pressable onPress={async () => { const img = await pickImage(); if (img) addMedia({ kind: "image", url: img.dataUri }); }} style={local.iconBtn}>
                <Ionicons name="image-outline" size={15} color="rgba(238,241,246,0.7)" />
              </Pressable>
            </View>
            {!!media.length && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {media.map((m, i) => (
                  <View key={i}>
                    {m.kind === "image" ? (
                      <Image source={{ uri: m.url }} style={{ width: 74, height: 74, borderRadius: 8 }} resizeMode="cover" />
                    ) : (
                      <View style={[local.docPill, { paddingVertical: 8 }]}>
                        <Ionicons name="document-outline" size={12} color="rgba(22,22,26,0.6)" />
                        <Text style={local.docPillText} numberOfLines={1}>{m.name || "file"}</Text>
                      </View>
                    )}
                    <Pressable onPress={() => dispatch({ type: "setCardMedia", ref: cardRef, media: media.filter((_, j) => j !== i) })} style={{ position: "absolute", top: -4, right: -4 }}>
                      <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.75)" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {/* Origin — where this card came from. Not editable: origin is a
                fact about how the card exists. Tapping opens the conversation
                it was born in. */}
            {!!item.origin && (
              <Pressable onPress={() => setOriginPreview(item.origin)} style={local.originRow}>
                <Ionicons name="chatbubble-outline" size={12} color="rgba(238,241,246,0.5)" />
                <Text style={local.originText} numberOfLines={1}>
                  {item.origin.title} · {new Date(item.origin.ts).toLocaleDateString()}
                </Text>
                <Ionicons name="chevron-forward" size={12} color="rgba(238,241,246,0.4)" />
              </Pressable>
            )}

            {/* Custom attributes: global type defaults + per-card additions.
                The type's defaults always show (availability is the point);
                per-card fields extend them without ceremony. */}
            <Text style={local.sectionLabel}>ATTRIBUTES</Text>
            <View style={{ gap: 6 }}>
              {Object.entries(fields).filter(([k]) => k !== HIDE_COUNTDOWN_FIELD).map(([k, v]) => (
                <FieldRow
                  key={k}
                  name={k}
                  value={v}
                  def={state.fieldDefs?.[k]}
                  onChange={(nv) => setField(k, nv)}
                  onRemove={typeDefaults.includes(k) ? undefined : () => removeField(k)}
                />
              ))}
              {/* New attribute: name + type in one step. A field is not just a
                  label — its type decides how it's entered, shown, and laned. */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <TextInput
                  value={newFieldName}
                  onChangeText={setNewFieldName}
                  placeholder="Add attribute..."
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  style={[local.fieldInput, { flex: 1 }]}
                />
                <Pressable
                  onPress={() => {
                    const name = newFieldName.trim();
                    if (!name) return;
                    dispatch({ type: "defineField", def: { name, type: newFieldType, options: newFieldType === "select" ? [] : undefined } });
                    setField(name, "");
                    setNewFieldName("");
                  }}
                  style={local.iconBtn}
                >
                  <Ionicons name="add" size={15} color="rgba(238,241,246,0.7)" />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                {FIELD_TYPES.map((t) => (
                  <Pressable key={t} onPress={() => setNewFieldType(t)} style={[local.typeChip, newFieldType === t && { backgroundColor: "rgba(167,139,250,0.16)", borderColor: "rgba(167,139,250,0.5)" }]}>
                    <Text style={[local.typeChipText, newFieldType === t && { color: "#a78bfa" }]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Embeds — either direction, any type. */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={local.sectionLabel}>EMBEDDED CARDS</Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setEmbedPickerOpen(true)} style={[local.quickChip, { flexDirection: "row", alignItems: "center", gap: 4 }]}>
                <Ionicons name="add" size={12} color="rgba(238,241,246,0.7)" />
                <Text style={local.quickChipText}>Embed a card</Text>
              </Pressable>
            </View>
            {embedded.length === 0 ? (
              <Text style={[styles.muted, { fontSize: 11 }]}>Nothing embedded. Any card can hold any other card — a form inside a deadline, a list inside a project.</Text>
            ) : (
              <View style={{ gap: 6 }}>
                {embedded.map((e) => (
                  <View key={`${e.ref.kind}:${e.ref.id}`} style={[local.embedRow, { borderColor: `${KIND_COLORS[e.kind]}30` }]}>
                    <Ionicons name={KIND_ICONS[e.kind]} size={11} color={KIND_COLORS[e.kind]} />
                    <Pressable style={{ flex: 1 }} onPress={() => onOpenOther(e.ref)}>
                      <Text style={local.embedTitle} numberOfLines={1}>{e.title}</Text>
                    </Pressable>
                    <Pressable onPress={() => dispatch({ type: "unembedCard", host: cardRef, card: e.ref })} hitSlop={6}>
                      <Ionicons name="close-circle-outline" size={14} color="rgba(255,255,255,0.35)" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {/* Convert — form changes, identity and connections stay. */}
            <Text style={local.sectionLabel}>CONVERT TO</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {ALL_KINDS.filter((k) => k !== cardRef.kind).map((k) => (
                <Pressable key={k} onPress={() => convert(k)} style={[local.quickChip, { borderColor: `${KIND_COLORS[k]}45`, flexDirection: "row", alignItems: "center", gap: 4 }]}>
                  <Ionicons name={KIND_ICONS[k]} size={11} color={KIND_COLORS[k]} />
                  <Text style={[local.quickChipText, { color: KIND_COLORS[k] }]}>{k}</Text>
                </Pressable>
              ))}
            </View>

            {/* Publishing existed only for media generations, buried in the
                Generations drawer — an artifact the user made had no way out
                of the app at all. The Market's kinds are media, so a document
                publishes as its content under the "coding" kind, which is the
                one the Market treats as text. */}
            {cardRef.kind === "artifact" && (
              <Pressable
                onPress={() => {
                  dispatch({
                    type: "publishToMarket",
                    item: {
                      kind: "coding",
                      prompt: `${item.title}\n\n${(item.content || "").slice(0, 400)}`,
                      model: item.modelId || "global",
                      author: state.auth.kind === "guest" ? "@guest" : `@${(state.auth as any).email.split("@")[0]}`,
                      url: "",
                    },
                  });
                  toast("Published to Discover Market");
                }}
                style={[local.quickChip, { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }]}
              >
                <Ionicons name="share-outline" size={12} color="rgba(238,241,246,0.75)" />
                <Text style={local.quickChipText}>Publish to Market</Text>
              </Pressable>
            )}

            <Pressable onPress={remove} style={[local.quickChip, { alignSelf: "flex-start", borderColor: "rgba(248,113,113,0.4)", marginTop: 4 }]}>
              <Text style={[local.quickChipText, { color: "#f87171" }]}>Delete card</Text>
            </Pressable>
          </ScrollView>
        </Glass>
      </View>

      {originPreview && <OriginPreview origin={originPreview} onClose={() => setOriginPreview(null)} />}
      {embedPickerOpen && (
        <EmbedPicker
          host={cardRef}
          allCards={allCards}
          onClose={() => setEmbedPickerOpen(false)}
          onPick={(picked) => {
            dispatch({ type: "embedCard", host: cardRef, card: picked });
            setEmbedPickerOpen(false);
          }}
        />
      )}
    </Modal>
  );
}

// Field keys are shown to the user, so the built-ins get plain names rather
// than their internal identifiers.
const FIELD_LABELS: Record<string, string> = {
  title: "Title & done", countdown: "Timer", recurring: "Repeats", status: "Status",
  tags: "Tags", media: "Photos & files", body: "Description", embeds: "Embedded cards", origin: "Origin",
  rows: "Entries (notebook)", search: "Search bar",
};
function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key;
}

// ── Origin preview ──────────────────────────────────────────────────────────
// A small window onto the conversation the card came from: the last few
// messages, a way into the full chat, and dismissal by tapping anywhere off
// it. Read-only — this is a record of what happened, not a place to edit it.
function OriginPreview({ origin, onClose }: { origin: CardOrigin; onClose: () => void }) {
  const { state, dispatch } = useCollider();
  const conv = state.conversations.find((c) => c.id === origin.convId);
  const messages = conv
    ? Object.values(conv.threads).flat().sort((a, b) => a.ts - b.ts).slice(-6)
    : [];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={local.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Glass style={[local.modalSheet, { maxHeight: "60%" }]}>
          <View style={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="chatbubble-outline" size={13} color="rgba(238,241,246,0.6)" />
              <Text style={[local.colTitle, { flex: 1 }]} numberOfLines={1}>{origin.title}</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>
            <Text style={local.colCount}>{new Date(origin.ts).toLocaleString()}</Text>
            <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 8 }}>
              {messages.length === 0 && <Text style={[styles.muted, { fontSize: 11 }]}>That conversation is no longer in history.</Text>}
              {messages.map((m) => (
                <View key={m.id} style={[local.bubble, m.role === "user" ? local.bubbleUser : local.bubbleAssistant, { maxWidth: "100%" }]}>
                  <Text style={{ color: m.role === "user" ? "#fff" : "rgba(255,255,255,0.85)", fontSize: 11.5, lineHeight: 16 }} numberOfLines={6}>
                    {m.content}
                  </Text>
                </View>
              ))}
            </ScrollView>
            {!!conv && (
              <Pressable
                onPress={() => { dispatch({ type: "loadConversation", category: conv.tab, id: conv.id }); onClose(); }}
                style={[local.quickChip, { alignSelf: "flex-start" }]}
              >
                <Text style={local.quickChipText}>Open full conversation</Text>
              </Pressable>
            )}
          </View>
        </Glass>
      </View>
    </Modal>
  );
}

// ── Typed field row ─────────────────────────────────────────────────────────
// One editor per field type. Checkbox is a real toggle (binary attributes
// like Critical are yes/no, never a scale); select offers its defined
// options plus free entry, which is how a lane set grows deductively.
function FieldRow({ name, value, def, onChange, onRemove }: {
  name: string; value: string; def?: FieldDef; onChange: (v: string) => void; onRemove?: () => void;
}) {
  const { dispatch } = useCollider();
  const type: FieldType = def?.type || "text";
  const [adding, setAdding] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={local.fieldName} numberOfLines={1}>{name}</Text>
        {type === "checkbox" ? (
          <Pressable onPress={() => onChange(value === CHECKED ? "" : CHECKED)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name={value === CHECKED ? "checkbox" : "square-outline"} size={16} color={value === CHECKED ? "#5dbdff" : "rgba(238,241,246,0.45)"} />
            <Text style={[local.quickChipText, value === CHECKED && { color: "#5dbdff" }]}>{value === CHECKED ? "Yes" : "No"}</Text>
          </Pressable>
        ) : type === "select" ? (
          <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            {(def?.options || []).map((o) => (
              <Pressable key={o} onPress={() => onChange(value === o ? "" : o)} style={[local.typeChip, value === o && { backgroundColor: "rgba(93,189,255,0.16)", borderColor: "rgba(93,189,255,0.5)" }]}>
                <Text style={[local.typeChipText, value === o && { color: "#5dbdff" }]}>{o}</Text>
              </Pressable>
            ))}
            {adding ? (
              <TextInput
                autoFocus
                placeholder="new option"
                placeholderTextColor="rgba(255,255,255,0.25)"
                style={[local.fieldInput, { minWidth: 90 }]}
                onEndEditing={(e) => {
                  const v = e.nativeEvent.text.trim();
                  setAdding(false);
                  if (!v) return;
                  dispatch({ type: "defineField", def: { name, type: "select", options: [...(def?.options || []), v] } });
                  onChange(v);
                }}
              />
            ) : (
              <Pressable onPress={() => setAdding(true)} style={local.typeChip}>
                <Ionicons name="add" size={11} color="rgba(238,241,246,0.6)" />
              </Pressable>
            )}
          </View>
        ) : (
          <TextInput
            defaultValue={value}
            onEndEditing={(e) => onChange(e.nativeEvent.text)}
            placeholder={type === "number" ? "0" : type === "date" ? "YYYY-MM-DD" : type === "datetime" ? "YYYY-MM-DD HH:MM" : "—"}
            placeholderTextColor="rgba(255,255,255,0.25)"
            keyboardType={type === "number" ? "numeric" : "default"}
            style={local.fieldInput}
          />
        )}
        {onRemove && (
          <Pressable onPress={onRemove} hitSlop={6}>
            <Ionicons name="close-circle-outline" size={14} color="rgba(255,255,255,0.35)" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── Embed picker ────────────────────────────────────────────────────────────
function EmbedPicker({ host, allCards, onClose, onPick }: {
  host: CardEmbed; allCards: BoardCard[]; onClose: () => void; onPick: (ref: CardEmbed) => void;
}) {
  const [q, setQ] = useState("");
  const hostCard = allCards.find((c) => c.ref.kind === host.kind && c.ref.id === host.id);
  const candidates = allCards.filter((c) => {
    if (c.ref.kind === host.kind && c.ref.id === host.id) return false;
    if (hostCard?.embeds.some((e) => e.kind === c.ref.kind && e.id === c.ref.id)) return false;
    // A direct cycle (the candidate already embeds the host) can't render.
    if (c.embeds.some((e) => e.kind === host.kind && e.id === host.id)) return false;
    return !q.trim() || `${c.title} ${c.body}`.toLowerCase().includes(q.trim().toLowerCase());
  });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={local.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Glass style={[local.modalSheet, { maxHeight: "70%" }]}>
          <View style={{ padding: 16, gap: 10, flex: 1 }}>
            <Text style={local.sectionLabel}>EMBED A CARD — ANY TYPE, EITHER DIRECTION</Text>
            <View style={local.searchContainer}>
              <Ionicons name="search" size={13} color="rgba(255,255,255,0.4)" style={{ marginRight: 7 }} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search cards..." placeholderTextColor="rgba(255,255,255,0.3)" style={local.searchInput} autoFocus />
            </View>
            <ScrollView contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
              {candidates.map((c) => (
                <Pressable key={`${c.ref.kind}:${c.ref.id}`} onPress={() => onPick(c.ref)} style={[local.embedRow, { borderColor: `${KIND_COLORS[c.kind]}30` }]}>
                  <Ionicons name={KIND_ICONS[c.kind]} size={11} color={KIND_COLORS[c.kind]} />
                  <Text style={local.embedTitle} numberOfLines={1}>{c.title}</Text>
                </Pressable>
              ))}
              {candidates.length === 0 && <Text style={[styles.muted, { fontSize: 11, textAlign: "center", marginTop: 20 }]}>No embeddable cards match.</Text>}
            </ScrollView>
          </View>
        </Glass>
      </View>
    </Modal>
  );
}

// ── Global per-type field manager ───────────────────────────────────────────
function TypeFieldsManager({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useCollider();
  const [kind, setKind] = useState<LinkKind>("reminder");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  const fields = state.cardTypeFields[kind] || [];
  const add = () => {
    const name = newName.trim();
    if (!name || fields.includes(name)) return;
    // Defining and attaching are one action — a field always has a type.
    dispatch({ type: "defineField", def: { name, type: newType, options: newType === "select" ? [] : undefined }, cardTypes: [kind] });
    setNewName("");
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={local.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Glass style={[local.modalSheet, { maxHeight: "70%" }]}>
          <View style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={local.sectionLabel}>DEFAULT ATTRIBUTES PER CARD TYPE</Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {ALL_KINDS.map((k) => (
                <Pressable key={k} onPress={() => setKind(k)} style={[local.quickChip, kind === k && { backgroundColor: `${KIND_COLORS[k]}18`, borderColor: `${KIND_COLORS[k]}55` }]}>
                  <Text style={[local.quickChipText, kind === k && { color: KIND_COLORS[k] }]}>{k}</Text>
                </Pressable>
              ))}
            </View>
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 6 }}>
              {fields.map((f) => {
                const def = state.fieldDefs?.[f];
                return (
                  <View key={f} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={[local.fieldName, { flex: 1, maxWidth: undefined }]}>{f}</Text>
                      <Text style={local.typeChipText}>{def?.type || "text"}</Text>
                      <Pressable onPress={() => dispatch({ type: "setTypeFields", kind, fields: fields.filter((x) => x !== f) })} hitSlop={6}>
                        <Ionicons name="close-circle-outline" size={15} color="rgba(255,255,255,0.35)" />
                      </Pressable>
                    </View>
                    {/* Select fields carry their lane set — editing options
                        here is exactly how swimlanes are named and sized. */}
                    {def?.type === "select" && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, paddingLeft: 4 }}>
                        {(def.options || []).map((o) => (
                          <Pressable
                            key={o}
                            onPress={() => dispatch({ type: "defineField", def: { ...def, options: (def.options || []).filter((x) => x !== o) } })}
                            style={[local.typeChip, { flexDirection: "row", alignItems: "center", gap: 4 }]}
                          >
                            <Text style={local.typeChipText}>{o}</Text>
                            <Ionicons name="close" size={9} color="rgba(238,241,246,0.4)" />
                          </Pressable>
                        ))}
                        <TextInput
                          placeholder="+ lane"
                          placeholderTextColor="rgba(255,255,255,0.25)"
                          style={[local.fieldInput, { minWidth: 80, paddingVertical: 3 }]}
                          onEndEditing={(e) => {
                            const v = e.nativeEvent.text.trim();
                            if (v) dispatch({ type: "defineField", def: { ...def, options: [...(def.options || []), v] } });
                          }}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
              {fields.length === 0 && <Text style={[styles.muted, { fontSize: 11 }]}>No defaults for this type — every card of it starts clean.</Text>}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="New default attribute..."
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  style={[local.fieldInput, { flex: 1 }]}
                  onSubmitEditing={add}
                />
                <Pressable onPress={add} style={local.iconBtn}>
                  <Ionicons name="add" size={15} color="rgba(238,241,246,0.7)" />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                {FIELD_TYPES.map((t) => (
                  <Pressable key={t} onPress={() => setNewType(t)} style={[local.typeChip, newType === t && { backgroundColor: "rgba(167,139,250,0.16)", borderColor: "rgba(167,139,250,0.5)" }]}>
                    <Text style={[local.typeChipText, newType === t && { color: "#a78bfa" }]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Text style={[styles.muted, { fontSize: 10.5, lineHeight: 15 }]}>
              These appear on every {kind} card automatically. Individual cards can add their own attributes on top.
            </Text>
          </View>
        </Glass>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create(withFont({
  boardBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, marginTop: 8 },
  boardNameBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 11, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  boardName: { flexShrink: 1, color: "rgba(238,241,246,0.9)", fontSize: 12.5, fontWeight: "800", fontFamily: fontFamilyForWeight(800), letterSpacing: 0.2 },
  boardRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 8, paddingHorizontal: 9, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "transparent" },
  boardRowActive: { backgroundColor: "rgba(167,139,250,0.1)", borderColor: "rgba(167,139,250,0.35)" },
  boardRowName: { color: "rgba(238,241,246,0.9)", fontSize: 12, fontWeight: "700", fontFamily: fontFamilyForWeight(700) },
  boardRowMeta: { color: "rgba(238,241,246,0.4)", fontSize: 9.5, fontWeight: "700", fontFamily: fontFamilyForWeight(700), marginTop: 1 },
  boardSwatch: { width: 26, height: 20, borderRadius: 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  bgSwatch: { width: 40, height: 30, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  bgSwatchNone: { backgroundColor: "rgba(255,255,255,0.04)", borderStyle: "dashed" },
  bgSwatchSelected: { borderColor: "rgba(167,139,250,0.8)", borderWidth: 1.5 },
  addLaneBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 38, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.03)" },
  addLaneText: { color: "rgba(238,241,246,0.6)", fontSize: 11, fontWeight: "800", fontFamily: fontFamilyForWeight(800) },
  addLaneForm: { gap: 6, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.04)", alignSelf: "flex-start", minWidth: 180 },
  switcherRow: { flexDirection: "row", gap: 6, paddingHorizontal: 12, marginTop: 8 },
  switcherBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "transparent" },
  switcherBtnActive: { backgroundColor: "rgba(167,139,250,0.14)", borderColor: "rgba(167,139,250,0.4)" },
  switcherText: { color: "rgba(238,241,246,0.5)", fontSize: 10.5, fontWeight: "800", fontFamily: fontFamilyForWeight(800) },
  controlsRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, marginTop: 8 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  searchContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", paddingHorizontal: 10, height: 34 },
  searchInput: { flex: 1, color: "#fff", fontSize: 12, height: "100%", padding: 0 },
  colTitle: { color: "#fff", fontSize: 11.5, fontWeight: "900", fontFamily: fontFamilyForWeight(900), letterSpacing: 0.4, textTransform: "capitalize" },
  colCount: { color: "rgba(238,241,246,0.4)", fontSize: 10.5, fontWeight: "800", fontFamily: fontFamilyForWeight(800) },
  emptyCol: { color: "rgba(238,241,246,0.3)", fontSize: 11, textAlign: "center", paddingVertical: 20 },
  calDate: { color: "rgba(238,241,246,0.5)", fontSize: 10, fontWeight: "700", fontFamily: fontFamilyForWeight(700), marginBottom: 3, marginLeft: 2 },
  // Cards read as paper, not chrome: a light face, soft shadow, generous
  // radius. The dark tech-glass treatment fought the whole conceit — a card
  // is a simple object you move with your hand, not an instrument panel.
  card: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(247,246,243,0.94)",
    borderWidth: 0,
    flexDirection: "row",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  // The notebook face: same paper, squarer corners, so it reads as a page in
  // a book rather than a loose card.
  notebookCard: { borderRadius: 8 },
  cardActions: { flexDirection: "row", gap: 10, marginTop: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: "rgba(22,22,26,0.08)" },
  cardActionBtn: { flexDirection: "row", alignItems: "center", gap: 3 },
  cardActionText: { color: "rgba(22,22,26,0.45)", fontSize: 9.5, fontWeight: "800", fontFamily: fontFamilyForWeight(800), letterSpacing: 0.3 },
  notebookHeader: { fontSize: 14, fontWeight: "900", fontFamily: fontFamilyForWeight(900), letterSpacing: 0.2 },
  headerRule: { height: 1, marginTop: 1 },
  rowSearch: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(22,22,26,0.05)", borderRadius: 7, paddingHorizontal: 7, height: 26 },
  rowSearchInput: { flex: 1, color: "#16161a", fontSize: 11, height: "100%", padding: 0 },
  // Ruled rows: a journal's line, not a table's border.
  notebookRow: { flexDirection: "row", alignItems: "flex-start", gap: 7, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "rgba(22,22,26,0.07)" },
  notebookRowNumDark: { color: "rgba(238,241,246,0.35)", fontSize: 9.5, fontWeight: "800", fontFamily: fontFamilyForWeight(800), fontVariant: ["tabular-nums"], minWidth: 16 },
  notebookRowNum: { color: "rgba(22,22,26,0.3)", fontSize: 9, fontWeight: "800", fontFamily: fontFamilyForWeight(800), fontVariant: ["tabular-nums"], marginTop: 1.5, minWidth: 12 },
  notebookRowText: { flex: 1, color: "rgba(22,22,26,0.82)", fontSize: 11.5, lineHeight: 16 },
  notebookEmpty: { color: "rgba(22,22,26,0.4)", fontSize: 11, paddingVertical: 8 },
  pagerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 7 },
  pagerText: { fontSize: 9.5, fontWeight: "800", fontFamily: fontFamilyForWeight(800), fontVariant: ["tabular-nums"] },
  cardTitle: { flex: 1, color: "#16161a", fontSize: 13, fontWeight: "700", fontFamily: fontFamilyForWeight(700), lineHeight: 17 },
  cardBody: { color: "rgba(22,22,26,0.62)", fontSize: 11.5, lineHeight: 16 },
  // Selection reads as a ring on the card itself, not a checkbox bolted on:
  // in select mode the whole card is the target.
  cardSelected: { borderWidth: 2, borderColor: "#a78bfa" },
  cardDragging: { shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  urgentWord: { color: "rgba(22,22,26,0.55)", fontSize: 8.5, fontWeight: "800", fontFamily: fontFamilyForWeight(800), marginTop: 3, letterSpacing: 0.7 },
  criticalWord: { color: "rgba(47,109,158,0.85)", fontSize: 8.5, fontWeight: "800", fontFamily: fontFamilyForWeight(800), marginTop: 3, letterSpacing: 0.7 },
  chip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7, borderWidth: 1 },
  chipText: { fontSize: 9, fontWeight: "800", fontFamily: fontFamilyForWeight(800), fontVariant: ["tabular-nums"] },
  tagText: { color: "rgba(109,90,168,0.9)", fontSize: 9.5, fontWeight: "700", fontFamily: fontFamilyForWeight(700) },
  fieldLine: { color: "rgba(22,22,26,0.75)", fontSize: 10.5 },
  embedRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.03)" },
  embedTitle: { flex: 1, color: "rgba(255,255,255,0.85)", fontSize: 10.5, fontWeight: "700", fontFamily: fontFamilyForWeight(700) },
  cardEmbedRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, backgroundColor: "rgba(22,22,26,0.05)" },
  cardEmbedTitle: { flex: 1, color: "rgba(22,22,26,0.78)", fontSize: 10.5, fontWeight: "600", fontFamily: fontFamilyForWeight(600) },
  bubble: { maxWidth: "88%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: "rgba(167,139,250,0.16)", borderWidth: 1, borderColor: "rgba(167,139,250,0.3)" },
  bubbleAssistant: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  appliedChip: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: "rgba(52,211,153,0.1)", borderWidth: 1, borderColor: "rgba(52,211,153,0.3)" },
  chatInputRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  chatInput: { flex: 1, color: "#fff", fontSize: 12.5, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 12, paddingVertical: 9, maxHeight: 100 },
  sendBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(167,139,250,0.35)", borderWidth: 1, borderColor: "rgba(167,139,250,0.6)", alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalSheet: { width: "100%", maxWidth: 460, maxHeight: "85%", borderRadius: 20, overflow: "hidden", backgroundColor: "rgba(12,13,17,0.97)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  modalTitleInput: { color: "#fff", fontSize: 15, fontWeight: "800", fontFamily: fontFamilyForWeight(800), padding: 0 },
  modalBodyInput: { color: "rgba(255,255,255,0.85)", fontSize: 12.5, lineHeight: 18, padding: 0, minHeight: 60, textAlignVertical: "top" },
  sectionLabel: { color: "rgba(238,241,246,0.45)", fontSize: 9.5, fontWeight: "900", fontFamily: fontFamilyForWeight(900), letterSpacing: 1 },
  fieldName: { color: "rgba(238,241,246,0.7)", fontSize: 11, fontWeight: "700", fontFamily: fontFamilyForWeight(700), maxWidth: 110 },
  fieldInput: { flex: 1, color: "#fff", fontSize: 11.5, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", paddingHorizontal: 9, paddingVertical: 6 },
  selectBar: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 14, paddingVertical: 9, marginHorizontal: 12, marginTop: 6, borderRadius: 11, backgroundColor: "rgba(167,139,250,0.12)", borderWidth: 1, borderColor: "rgba(167,139,250,0.3)" },
  selectBarText: { color: "rgba(238,241,246,0.9)", fontSize: 11.5, fontWeight: "700", fontFamily: fontFamilyForWeight(700) },
  quickChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  circleIn: { borderWidth: 1.5, borderColor: "rgba(167,139,250,0.4)", borderRadius: 999, paddingVertical: 22, paddingHorizontal: 14, backgroundColor: "rgba(167,139,250,0.05)", minHeight: 150, justifyContent: "center" },
  monthCell: { minHeight: 62, borderRadius: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)", padding: 3, gap: 2 },
  monthDayNum: { color: "rgba(238,241,246,0.5)", fontSize: 9, fontWeight: "700", fontFamily: fontFamilyForWeight(700) },
  monthPill: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1.5 },
  monthPillText: { color: "rgba(255,255,255,0.85)", fontSize: 7.5 },
  monthMore: { color: "rgba(238,241,246,0.4)", fontSize: 7.5, paddingLeft: 3 },
  cardImage: { width: 62, height: 62, borderRadius: 7, backgroundColor: "rgba(22,22,26,0.06)" },
  docPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: "rgba(22,22,26,0.06)", maxWidth: 130 },
  docPillText: { color: "rgba(22,22,26,0.7)", fontSize: 9.5, fontWeight: "600", fontFamily: fontFamilyForWeight(600) },
  originRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 9, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.04)" },
  originText: { flex: 1, color: "rgba(238,241,246,0.7)", fontSize: 10.5, fontWeight: "600", fontFamily: fontFamilyForWeight(600) },
  pageBody: { marginTop: 12, backgroundColor: "rgba(247,246,243,0.94)", borderRadius: 12, padding: 14 },
  layoutRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.04)" },
  typeChip: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  typeChipText: { color: "rgba(238,241,246,0.65)", fontSize: 9.5, fontWeight: "700", fontFamily: fontFamilyForWeight(700) },
  quickChipText: { color: "rgba(238,241,246,0.75)", fontSize: 10.5, fontWeight: "700", fontFamily: fontFamilyForWeight(700) },
}));
