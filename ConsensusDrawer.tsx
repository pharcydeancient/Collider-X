import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Animated, PanResponder, Modal, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { useCollider, ConsensusRun, ChatMessage } from "../state";
import { Glass } from "./Glass";
import { GlossSurface } from "./GlossSurface";
import { SearchBar, useSearch } from "../features";
import { styles, SCREEN_W, SCREEN_H, fontFamilyForWeight, FONT_MONO, FONT_MONO_SEMIBOLD, GLASS_CARD } from "../styles/theme";
import { modelById, ModelDef } from "../models";
import { scoreConsensus } from "../services/chat";
import { useToast } from "./Toast";
import { CollideButton } from "./CollideButton";

const DISSENT_THRESHOLD = 0.5;

// Small deterministic starfield — fixed per field size, no true randomness needed.
function backgroundStars(fieldW: number, fieldH: number, count = 36) {
  const stars: { x: number; y: number; r: number; o: number }[] = [];
  for (let i = 0; i < count; i++) {
    const x = (fieldW * ((i * 37 + 11) % 100)) / 100;
    const y = (fieldH * ((i * 53 + 29) % 100)) / 100;
    const r = 0.5 + ((i * 13) % 10) / 10;
    const o = 0.12 + ((i * 7) % 10) / 30;
    stars.push({ x, y, r, o });
  }
  return stars;
}

// Force-directed x-only layout for dissenter stars: mutually disagreeing models
// repel toward opposite ends, affine ones cluster, and higher-consensus-score
// dissenters get a mild pull toward center.
function computeDissenterX(
  n: number,
  simMatrix: number[][],
  scores: number[],
  fieldW: number,
  centerX: number,
) {
  if (n === 0) return [];
  if (n === 1) return [centerX];
  const margin = 44;
  let xs = Array.from({ length: n }, (_, i) => centerX + (i - (n - 1) / 2) * (fieldW / (n + 1)));
  const iterations = 55;
  const step = 0.05;
  for (let iter = 0; iter < iterations; iter++) {
    const forces = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const s = simMatrix[i][j];
        const dx = xs[i] - xs[j];
        const sign = dx === 0 ? (i < j ? 1 : -1) : Math.sign(dx);
        const dist = Math.max(Math.abs(dx), 8);
        const repulse = ((1 - s) * 900) / (dist * dist);
        const attract = s * dist * 0.02;
        forces[i] += sign * repulse - sign * attract;
      }
      const toCenter = centerX - xs[i];
      forces[i] += toCenter * (0.02 + scores[i] * 0.05);
    }
    for (let i = 0; i < n; i++) xs[i] += forces[i] * step;
  }
  return xs.map((x) => Math.max(margin, Math.min(fieldW - margin, x)));
}

export function ConsensusModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { state, dispatch } = useCollider();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<"current" | "history" | "settings">("current");
  // Spec §Consensus item 4: a tab pair in front of the map area — Dissent is
  // tab 1, Total is tab 2. Total shows every model; Dissent shows only models
  // below the agreement threshold.
  const [mapTab, setMapTab] = useState<"dissent" | "total">("dissent");
  const [selectedRun, setSelectedRun] = useState<ConsensusRun | null>(null);
  // Dissenting views can be read two ways: inline on the map (next to each
  // model's sphere, in context of where it sits) or as the list below. Both
  // are useful for different things (spatial read vs. scanning all of them),
  // so it's a toggle, not an either/or — the list always renders regardless.
  const [showMapLabels, setShowMapLabels] = useState(true);

  const conv = state.conversations.find(
    (c) => c.id === state.activeConversationId[state.activeCategory],
  );
  const replies = state.selectedModelIds[state.activeCategory]
    .map((id) => ({
      model: modelById(id),
      last: [...(conv?.threads[id] || [])].reverse().find((m) => m.role === "assistant" && m.content),
    }))
    .filter((x) => x.model && x.last) as { model: ModelDef; last: ChatMessage }[];

  // Pairwise affinity for the force layout's x-axis.
  //
  // Spec: "horizontal position = force-directed based on MUTUAL AGREEMENT with
  // other dissenters." This previously fed `sim()` — bag-of-words token overlap
  // — which measures topical vocabulary, not agreement. "Rust is faster than
  // Go" and "Rust is not faster than Go" share nearly every token and scored
  // ~1.0 similar while being exact opposites, so the map asserted agreement
  // between models that flatly contradicted each other. It also meant the two
  // axes of one map measured two different quantities (y used the arbiter's
  // semantic score, x used vocabulary).
  //
  // Both axes now derive from the arbiter's alignment score: two models that
  // land at the same distance from consensus are treated as mutually affine.
  // `1 - |si - sj|` is the honest first approximation available from data the
  // arbiter already returns. It's directional-agnostic (two models can dissent
  // for different reasons and still score alike), so a pairwise matrix from the
  // arbiter would be strictly better — but this is correct in kind, where token
  // overlap was correct in neither kind nor degree.
  const agreementAffinity = (si: number, sj: number) => 1 - Math.abs(si - sj);

  // Token overlap survives ONLY as the offline fallback score (used when the
  // arbiter is unreachable), never as a layout input.
  const tokens = (str: string) => (str.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  const bags = replies.map((r) => new Set(tokens(r.last.content)));
  const sim = (a: Set<string>, b: Set<string>) => {
    if (!a.size || !b.size) return 0;
    let inter = 0; a.forEach((t) => { if (b.has(t)) inter++; });
    return inter / Math.sqrt(a.size * b.size);
  };

  // Real LLM-synthesized consensus + per-model alignment scores.
  // Same completeness rule as the Collide bar (CollideBanner.tsx): wait for
  // EVERY selected model to reply before synthesizing. Previously this
  // drawer synthesized from whatever subset had replied so far, while the
  // bar waited for all of them — same feature, two different answers
  // (e.g. bar: "Not available", drawer: "7/8") depending on which one you
  // looked at. Aligned to one rule.
  const selectedIds = (state.selectedModelIds[state.activeCategory] || []).filter((id) => modelById(id));
  const allIn = selectedIds.length >= 2 && replies.length === selectedIds.length;
  const [consensusResult, setConsensusResult] = useState<{ verdict: string; scores: Record<string, number> } | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const repliesKey = replies.map((r) => `${r.model.id}:${r.last.content.length}`).join("|");

  // Bumping this re-runs the arbiter on the same replies — the COLLIDE
  // button's job. Kept as a dependency of the same effect rather than a
  // second code path, so a manual re-run and an automatic one cannot drift
  // into producing different results from identical input.
  const [runNonce, setRunNonce] = useState(0);
  const runSynthesis = () => setRunNonce((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !allIn) { setConsensusResult(null); return; }
    setSynthesizing(true);
    scoreConsensus(replies.map((r) => ({ modelId: r.model.id, label: r.model.label, content: r.last.content })))
      .then((res) => { if (!cancelled) setConsensusResult(res); })
      .catch(() => { if (!cancelled) setConsensusResult(null); })
      .finally(() => { if (!cancelled) setSynthesizing(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, repliesKey, allIn, runNonce]);

  const scores = consensusResult?.scores || {};
  const fallbackScore = (i: number) => {
    // Deterministic bag-of-words score, used only when the arbiter hasn't
    // resolved or failed. Two prior defects: the `* 1.8` multiplier meant any
    // model with maxSim > 0.556 clamped to exactly 1.0, flattening the top 44%
    // of the range to a single value; and taking `max` similarity against any
    // ONE other model scored a model that agreed with a single outlier as full
    // consensus. Mean similarity against all others, ungained, preserves
    // ordering across the whole range and reflects agreement with the field
    // rather than with its nearest neighbour.
    const others = bags.filter((_, j) => j !== i);
    if (!others.length) return 0;
    const mean = others.reduce((acc, b) => acc + sim(bags[i], b), 0) / others.length;
    return Math.max(0, Math.min(1, mean));
  };
  const scoredReplies = replies.map((r, i) => ({
    ...r,
    score: scores[r.model.id] ?? fallbackScore(i),
  }));

  const agrees = scoredReplies.filter((r) => r.score >= DISSENT_THRESHOLD).length;
  const ratioN = allIn ? agrees : 0;
  const ratioM = Math.max(selectedIds.length, 1);
  // A consensus drawn from a partial scope isn't a smaller consensus, it's
  // not a consensus — so the only two states are complete (real verdict) or
  // incomplete, one word, regardless of which reason (too few replies in,
  // still synthesizing) makes it incomplete. Matches CollideBanner.tsx.
  const verdict = !allIn
    ? "Incomplete"
    : synthesizing
    ? "Synthesizing consensus…"
    : (consensusResult?.verdict || "Incomplete");

  const dissenters = scoredReplies
    .filter((r) => r.score < DISSENT_THRESHOLD)
    .map((r) => ({ modelId: r.model.id, point: r.last.content.slice(0, 120), score: r.score }));
  const lastUserPrompt = [...(conv?.threads[replies[0]?.model.id || ""] || [])].reverse().find((m) => m.role === "user")?.content || "";

  // No more drawer animation logic

  // Track last saved prompt to prevent duplicate archives
  const lastSavedPrompt = useRef("");

  const saveConsensusRun = () => {
    if (replies.length > 0 && lastUserPrompt && lastUserPrompt !== lastSavedPrompt.current) {
      dispatch({
        type: "consensus",
        run: {
          prompt: lastUserPrompt,
          category: state.activeCategory,
          ratioN,
          ratioM,
          verdict: verdict.slice(0, 500),
          dissenters,
        },
      });
      lastSavedPrompt.current = lastUserPrompt;

      if (state.autoWipeOnConsensus) {
        dispatch({ type: "newConversation", category: state.activeCategory });
        toast("Consensus archived. Active grid conversations cleared.");
      } else {
        toast("Consensus archived.");
      }
    }
  };

  // Removed panResponder and pulse animation

  const agreementPct = Math.round((ratioN / ratioM) * 100);
  const scoreColor = agreementPct >= 66 ? "#7ee2a8" : agreementPct >= 40 ? "#f5e000" : "#ff6a5c"; // mid-tier was orange/gold — banned accent per SPEC.md; true yellow instead

  // Galaxy map: vertical position = alignment with consensus (higher = nearer
  // top), horizontal position = force-directed layout from pairwise affinity.
  // The map is the primary content of this view — it gets most of the
  // screen's height, not a token box squeezed between other elements.
  const fieldW = SCREEN_W - 32;
  // Field height follows whichever tab is showing. Keying this on
  // `dissenters.length` alone collapsed the map to 160px whenever consensus was
  // unanimous — correct for the Dissent tab (nothing to plot) but wrong for
  // Total, which still has every agreeing model to place.
  const visibleCount = mapTab === "dissent" ? dissenters.length : replies.length;
  const fieldH = visibleCount === 0 ? 160 : (showMapLabels ? 380 : 260);
  const centerX = fieldW / 2;
  // Center node sits at the field's center, matching the design system's
  // `.node-center{top:44%}`. It was previously pinned to y=30 (the top edge)
  // with dissenters strung beneath it — that reads as a hierarchy/tree, not
  // the "2.5D constellation" the spec calls for.
  const centerY = Math.round(fieldH * 0.44);
  const stars = backgroundStars(fieldW, fieldH);

  // Reserve extra bottom margin when labels can render below each sphere —
  // otherwise a low-score node (placed near the bottom of the field) gets its
  // label box clipped by the map's overflow:hidden edge. Worst case: 36px
  // sphere + 4px margin + up to a 3-line padded label (~56px) = 78px below the
  // sphere's own y; 120px leaves real margin instead of an exact-fit number
  // that breaks the next time label sizing changes.
  const bottomReserve = showMapLabels && visibleCount > 0 ? 120 : 56;
  const topReserve = 26;

  // Vertical position = agreement level (spec), computed per tab.
  //
  // DISSENT tab shows only score < DISSENT_THRESHOLD, so normalizing across
  // [0,1] would confine every node to the lower half of the field and throw
  // away half the axis's resolution. Normalizing within the dissent band
  // instead spreads the actually-occupied range over the full height.
  //
  // TOTAL tab shows every model, so it normalizes across the real [0,1] range,
  // which puts high agreement at the top, the center node at its own 44%
  // consensus line, and dissent below — the constellation the spec describes.
  const bandTop = topReserve;
  const bandH = Math.max(40, fieldH - bottomReserve - bandTop);
  const yForScore = (score: number, tab: "dissent" | "total") => {
    const s0 = Math.min(Math.max(score, 0), 1);
    const norm = tab === "dissent"
      ? 1 - Math.min(s0, DISSENT_THRESHOLD) / DISSENT_THRESHOLD
      : 1 - s0;
    return bandTop + norm * bandH;
  };

  // Nodes for the active tab. DISSENT = dissenters only (each gets a line to
  // the center). TOTAL = every model, and per spec §4 the dissenting views
  // "do not have a line drawn to them" there — so links render for agreers
  // only. Agreeing models previously all collapsed onto one hardcoded
  // coordinate, which was invisible while the render filtered to dissenters
  // but would have stacked the entire agreeing set in a single pile the moment
  // the Total map existed.
  const activeNodes = (mapTab === "dissent" ? scoredReplies.filter((r) => r.score < DISSENT_THRESHOLD) : scoredReplies)
    .map((r) => ({ reply: r, score: r.score }));

  const nodeScores = activeNodes.map((nd) => nd.score);
  const simMatrix = nodeScores.map((si, i) =>
    nodeScores.map((sj, j) => (i === j ? 1 : agreementAffinity(si, sj)))
  );
  const xs = computeDissenterX(activeNodes.length, simMatrix, nodeScores, fieldW, centerX);

  const mappedPoints = activeNodes.map((nd, i) => ({
    reply: nd.reply,
    x: xs[i] ?? centerX,
    y: yForScore(nd.score, mapTab),
    isDissent: nd.score < DISSENT_THRESHOLD,
    point: dissenters.find((d) => d.modelId === nd.reply.model.id)?.point || "",
  }));

  // No widening cast — it erased ConsensusRun and made setSelectedRun reject
  // the filtered rows it was fed.
  const consSearch = useSearch(state.consensusRuns, (r) => `${r.prompt} ${r.verdict}`);

  return (
    <>
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      {/* RN Web's Modal doesn't always portal as a true full-viewport
          overlay — it can render inline in normal document flow, leaving
          the app header/search bar visible above it. StyleSheet.absoluteFill
          plus an explicit "fixed" position (ignored on native, load-bearing
          on web) forces real full-screen coverage regardless. */}
      <View style={[StyleSheet.absoluteFill, { position: "fixed" as any, backgroundColor: "rgba(0,0,0,0.8)" }]}>
        {/* True full-screen per spec — was a 90%-height bottom sheet, which
            still read as a drawer/modal rather than the dedicated full-page
            view this feature is supposed to be. */}
        <View style={[StyleSheet.absoluteFillObject, { paddingTop: insets.top, borderRadius: 0 }]} onStartShouldSetResponder={() => true}>
          <GlossSurface />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}>
            <Text style={{ color: "rgba(238,241,246,0.6)", fontSize: 10, fontFamily: FONT_MONO, letterSpacing: 3 }}>CONSENSUS</Text>
            <Pressable onPress={() => { saveConsensusRun(); onClose(); }} style={{ padding: 4, width: 32, height: 32, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16 }}>
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "300" }}>×</Text>
            </Pressable>
          </View>
          
          <View style={{ flex: 1 }}>
            {/* Drawer Tabs */}
            <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", padding: 6, gap: 4 }}>
          {(["current", "history", "settings"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
                activeTab === tab && { backgroundColor: "rgba(255,255,255,0.04)" },
              ]}
            >
              <Text style={{ fontSize: 11, fontWeight: "700", fontFamily: fontFamilyForWeight(700), color: activeTab === tab ? "#fff" : "rgba(238,241,246,0.45)", letterSpacing: 0.5 }}>
                {tab.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flex: 1, padding: 16, paddingBottom: 16 }}>
          {activeTab === "current" && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              {/* Score is the headline metric — its own centered line, not
                  squeezed to one side of a row (that's what was wrong: it
                  read as left-aligned because it was sharing a row with the
                  summary instead of being the primary, centered element). */}
              <View style={{ alignItems: "center", marginTop: 4 }}>
                <Text
                  style={{
                    color: scoreColor, fontSize: 52, fontFamily: FONT_MONO_SEMIBOLD, lineHeight: 56,
                    textShadowColor: scoreColor, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 40,
                  }}
                >
                  {ratioN}/{ratioM}
                </Text>
                <Text style={{ color: "rgba(238,241,246,0.4)", fontSize: 8, fontFamily: FONT_MONO, letterSpacing: 3, textAlign: "center", marginTop: 6 }}>MODELS ALIGNED</Text>
              </View>

              {/* The collision itself. The bar above the composer reports the
                  result passively; this is the event, and it is the only
                  place in the app you can re-run one on demand. Its motion
                  carries the arbiter's state — continuous while out, a single
                  settling pass when a verdict lands, still when the scope is
                  incomplete and there is nothing to run. */}
              <View style={{ alignItems: "center", marginTop: 2 }}>
                <CollideButton
                  state={!allIn ? "blocked" : synthesizing ? "working" : "settled"}
                  label={synthesizing ? "COLLIDING" : "RE-COLLIDE"}
                  sublabel={
                    !allIn
                      ? `WAITING ON ${Math.max(0, selectedIds.length - replies.length)} OF ${ratioM}`
                      : synthesizing
                      ? "ARBITER OUT"
                      : "RUN AGAIN"
                  }
                  onPress={() => {
                    if (!allIn || synthesizing) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    runSynthesis();
                  }}
                />
              </View>

              {/* Verdict sits in a centered glass panel below the score,
                  aligned under the map's own center column. */}
              <View style={{ alignItems: "center" }}>
                <View style={{ width: fieldW * 0.78, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.11)", maxHeight: 72 }}>
                  <LinearGradient colors={GLASS_CARD} start={{ x: 0.1, y: 0 }} end={{ x: 0.7, y: 1 }} style={StyleSheet.absoluteFill} />
                  <View style={{ padding: 12 }}>
                    <Text
                      style={{ color: "rgba(238,241,246,0.9)", fontSize: 12, lineHeight: 17, fontFamily: fontFamilyForWeight(400), textAlign: "center" }}
                      numberOfLines={3}
                    >
                      {synthesizing ? "Synthesizing consensus…" : verdict.slice(0, 260)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* The map is the primary content here — it gets most of the
                  vertical space instead of being squeezed between other
                  elements. Built from plain Views/LinearGradient, not
                  react-native-svg — Circle/Line/SvgText/RadialGradient
                  render blank on web in this environment. */}
              <View style={{ alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: fieldW, marginBottom: 4 }}>
                  {/* Spec: Dissent is tab 1, Total is tab 2. */}
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {(["dissent", "total"] as const).map((t) => (
                      <Pressable
                        key={t}
                        onPress={() => setMapTab(t)}
                        style={{
                          paddingVertical: 3, paddingHorizontal: 9, borderRadius: 8,
                          backgroundColor: mapTab === t ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                        }}
                      >
                        <Text style={{ color: mapTab === t ? "#e2e8f0" : "rgba(238,241,246,0.45)", fontSize: 10, fontWeight: "800", fontFamily: fontFamilyForWeight(800), letterSpacing: 0.8 }}>
                          {t === "dissent" ? "DISSENT" : "TOTAL"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {visibleCount > 0 && (
                    <Pressable onPress={() => setShowMapLabels((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, backgroundColor: showMapLabels ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)" }}>
                      <Text style={{ color: showMapLabels ? "#e2e8f0" : "rgba(238,241,246,0.45)", fontSize: 10, fontWeight: "800", fontFamily: fontFamilyForWeight(800) }}>
                        {showMapLabels ? "LABELS ON" : "LABELS OFF"}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <View style={{ width: fieldW, height: fieldH, backgroundColor: "#000000", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                  {stars.map((s, i) => (
                    <View key={`star_${i}`} style={{ position: "absolute", left: s.x - s.r, top: s.y - s.r, width: s.r * 2, height: s.r * 2, borderRadius: s.r, backgroundColor: "#ffffff", opacity: s.o }} />
                  ))}

                  {/* Dashed lines from center to each dissenter — a row of
                      short rotated segments, since RN has no native dash
                      pattern for a plain View "line". */}
                  {mappedPoints.filter((pt) => (mapTab === "dissent" ? pt.isDissent : !pt.isDissent)).map(({ reply, x, y, isDissent }) => {
                    const dx = x - centerX, dy = y - centerY;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                    const segLen = 4, gapLen = 3, segCount = Math.floor(length / (segLen + gapLen));
                    return (
                      <View
                        key={`line_${reply.model.id}`}
                        style={{ position: "absolute", left: centerX, top: centerY, width: length, height: 1.5, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: `${angle}deg` }], transformOrigin: "0 0" } as any}
                      >
                        {Array.from({ length: segCount }).map((_, i) => (
                          <View key={i} style={{ position: "absolute", left: i * (segLen + gapLen), width: segLen, height: 1.5, backgroundColor: isDissent ? "rgba(255,106,92,0.5)" : "rgba(120,160,240,0.4)" }} />
                        ))}
                      </View>
                    );
                  })}

                  {/* Center node — binary agree/disagree is what this whole
                      feature measures, so blue/red duality lives here, not
                      on the Collide button itself. */}
                  {/* Was a bare gradient fill with no edge definition — every
                      other glossy sphere/button in the app gets a border +
                      shadow to read as a dimensional object, not a flat
                      circle; this was missed. Shadow lives on this outer
                      wrapper (not the inner clipped View) for the same
                      reason noted in ModelCard.tsx: overflow:hidden (needed
                      to clip the gradient to a circle) would clip a shadow
                      applied on the same node to nothing. */}
                  {/* Spec: "Center node uses blue/red duality (binary
                      agree/disagree is literally what this feature measures)."
                      This was a pure-blue gradient — the red half of the
                      required duality was simply absent. The design system
                      composites a blue radial with a red bloom at 70%/75%
                      under `background-blend-mode:screen`; RN has no blend
                      mode on gradients, so the red is layered as a second
                      absolutely-positioned gradient fading to transparent,
                      which reads the same way over a dark field. */}
                  <View style={{
                    position: "absolute", left: centerX - 20, top: centerY - 20, width: 40, height: 40, borderRadius: 20,
                    shadowColor: "#5a82e6", shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6,
                  }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, overflow: "hidden", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)" }}>
                      <LinearGradient colors={["#8fb8ff", "#3d6bd8", "#0c1230"]} start={{ x: 0.35, y: 0.3 }} end={{ x: 1, y: 1 }} style={{ width: "100%", height: "100%" }} />
                      <LinearGradient
                        colors={["rgba(255,90,77,0.85)", "rgba(255,90,77,0)"]}
                        start={{ x: 0.7, y: 0.75 }}
                        end={{ x: 0.15, y: 0.2 }}
                        style={{ position: "absolute", width: "100%", height: "100%" }}
                      />
                    </View>
                  </View>

                  {/* Dissenter stars — model-colored glossy sphere + the
                      model's own abbreviated label centered on it, plus
                      (toggleable) the dissenting point itself right below
                      the sphere it belongs to — visual analysis instead of
                      having to cross-reference a separate list. */}
                  {mappedPoints.map(({ reply, x, y, isDissent, point }) => {
                    const size = isDissent ? 36 : 28;
                    return (
                      <View key={reply.model.id} style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, alignItems: "center" }}>
                        {/* Agreeing nodes render smaller than dissenters, as in
                            the design system (26px vs 34px) — dissent is the
                            signal this view exists to surface. */}
                        <View style={{
                          width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", overflow: "hidden",
                          shadowColor: reply.model.color, shadowOpacity: 0.7, shadowRadius: 9, shadowOffset: { width: 0, height: 0 }, elevation: 5,
                        }}>
                          <LinearGradient colors={["#ffffff", reply.model.color, "#0a0512"]} start={{ x: 0.35, y: 0.35 }} end={{ x: 1, y: 1 }} style={{ width: "100%", height: "100%", position: "absolute" }} />
                          <Text style={{ color: "#fff", fontSize: isDissent ? 9 : 8, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>{reply.model.short.slice(0, 4)}</Text>
                        </View>
                        {showMapLabels && point && (
                          <View style={{ marginTop: 4, width: 128, marginLeft: -(64 - size / 2), backgroundColor: "rgba(8,6,14,0.92)", borderRadius: 6, borderWidth: 1, borderColor: `${reply.model.color}55`, padding: 6 }}>
                            <Text style={{ color: "#f2eef7", fontSize: 10.5, lineHeight: 14, fontFamily: fontFamilyForWeight(400), textAlign: "center" }} numberOfLines={3}>
                              {point}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>

              <View>
                <Text style={[styles.kicker, { marginBottom: 4 }]}>Dissenting Views ({dissenters.length})</Text>
                {dissenters.length === 0 ? (
                  <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 11, fontFamily: fontFamilyForWeight(400) }}>No deviations. Full consensus achieved.</Text>
                ) : (
                  dissenters.map((d) => (
                    <View key={d.modelId} style={{ backgroundColor: "rgba(12,14,19,0.6)", borderColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 3 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: modelById(d.modelId)?.color || "#fff" }} />
                        <Text style={{ color: "#f4f7fb", fontWeight: "700", fontFamily: fontFamilyForWeight(700), fontSize: 10, letterSpacing: 1 }}>
                          {modelById(d.modelId)?.label?.toUpperCase()}
                        </Text>
                        <Text style={{ marginLeft: "auto", color: "#ff6a5c", fontFamily: FONT_MONO, fontSize: 8, letterSpacing: 1 }}>DISSENT</Text>
                      </View>
                      <Text style={{ color: "rgba(238,241,246,0.65)", fontSize: 11, lineHeight: 16, fontFamily: fontFamilyForWeight(400) }}>{d.point}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          )}

          {activeTab === "history" && (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 12 }}>
                <SearchBar value={consSearch.q} onChange={consSearch.setQ} placeholder="Search past runs" />
                {consSearch.filtered.length === 0 ? (
                  <Text style={styles.muted}>No past runs archived yet.</Text>
                ) : (
                  consSearch.filtered.map((run) => (
                    <Pressable key={run.id} onPress={() => setSelectedRun(run)}>
                      <Glass style={{ padding: 12, borderRadius: 14, marginBottom: 8, borderColor: "rgba(255,255,255,0.08)" }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={{ color: "#fff", fontWeight: "700", fontFamily: fontFamilyForWeight(700), fontSize: 13, flex: 1 }} numberOfLines={1}>
                            {run.prompt}
                          </Text>
                          <Text style={{ color: "rgba(255,255,255,0.6)", fontWeight: "800", fontFamily: fontFamilyForWeight(800), fontSize: 12, marginLeft: 8 }}>
                            {run.ratioN}/{run.ratioM}
                          </Text>
                        </View>
                        <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 11, marginTop: 4 }} numberOfLines={1}>
                          {run.verdict}
                        </Text>
                      </Glass>
                    </Pressable>
                  ))
                )}
              </View>
            </ScrollView>
          )}

          {activeTab === "settings" && (
            <View style={{ gap: 16 }}>
              <View style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)", paddingBottom: 8 }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontFamily: fontFamilyForWeight(700), fontSize: 14, marginBottom: 4 }}>Consensus Summary Auto-Generated</Text>
                <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 11, marginBottom: 12 }}>
                  Fill the Collide bar with a live synthesis as soon as 2+ models reply — no need to open this drawer to see whether they agree.
                </Text>
                <Pressable
                  onPress={() => dispatch({ type: "setAutoConsensusSummary", value: !state.autoConsensusSummary })}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10 }}
                >
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", fontFamily: fontFamilyForWeight(600) }}>Auto-fill Collide bar</Text>
                  <Text style={{ color: state.autoConsensusSummary ? "rgba(255,255,255,0.6)" : "rgba(238,241,246,0.45)", fontSize: 18, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>
                    {state.autoConsensusSummary ? "✓" : "○"}
                  </Text>
                </Pressable>
              </View>

              <View style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)", paddingBottom: 8 }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontFamily: fontFamilyForWeight(700), fontSize: 14, marginBottom: 4 }}>Auto-Wipe Conversations</Text>
                <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 11, marginBottom: 12 }}>
                  Automatically archive active grid conversations when a new consensus is generated.
                </Text>
                <Pressable
                  onPress={() => dispatch({ type: "setAutoWipeOnConsensus", value: !state.autoWipeOnConsensus })}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10 }}
                >
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", fontFamily: fontFamilyForWeight(600) }}>Wipe grid on consensus save</Text>
                  <Text style={{ color: state.autoWipeOnConsensus ? "rgba(255,255,255,0.6)" : "rgba(238,241,246,0.45)", fontSize: 18, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>
                    {state.autoWipeOnConsensus ? "✓" : "○"}
                  </Text>
                </Pressable>
              </View>

              <View>
                <Text style={{ color: "#fff", fontWeight: "700", fontFamily: fontFamilyForWeight(700), fontSize: 14, marginBottom: 4 }}>Auto-Archive on New Chat</Text>
                <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 11, marginBottom: 12 }}>
                  Automatically save and archive previous models' threads on conversation resets.
                </Text>
                <Pressable
                  onPress={() => dispatch({ type: "setAutoArchiveOnNew", value: !state.autoArchiveOnNew })}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10 }}
                >
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", fontFamily: fontFamilyForWeight(600) }}>Archive threads on reset</Text>
                  <Text style={{ color: state.autoArchiveOnNew ? "rgba(255,255,255,0.6)" : "rgba(238,241,246,0.45)", fontSize: 18, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>
                    {state.autoArchiveOnNew ? "✓" : "○"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
      </View>
    </Modal>

      {/* Historical Consensus Detail Popup Modal */}
      <Modal visible={!!selectedRun} transparent animationType="fade" onRequestClose={() => setSelectedRun(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedRun(null)}>
          <View style={[styles.editSheet, { width: SCREEN_W - 32, maxHeight: "80%", overflow: "hidden" }]} onStartShouldSetResponder={() => true}>
            <GlossSurface borderRadius={22} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)", paddingBottom: 10, marginBottom: 12 }}>
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", fontFamily: fontFamilyForWeight(800) }}>Historical Consensus Detail</Text>
              <Pressable onPress={() => setSelectedRun(null)} style={{ padding: 4, width: 32, height: 32, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16 }}>
                <Text style={{ color: "#fff", fontSize: 18, fontWeight: "300" }}></Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedRun && (
                <View style={{ gap: 14 }}>
                  <View>
                    <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 10, fontWeight: "800", fontFamily: fontFamilyForWeight(800), letterSpacing: 1 }}>PROMPT</Text>
                    <Text style={{ color: "#fff", fontSize: 13, marginTop: 4, fontWeight: "600", fontFamily: fontFamilyForWeight(600) }}>{selectedRun.prompt}</Text>
                  </View>

                  <View>
                    <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 10, fontWeight: "800", fontFamily: fontFamilyForWeight(800), letterSpacing: 1 }}>CONSENSUS VERDICT ({selectedRun.ratioN}/{selectedRun.ratioM} aligned)</Text>
                    <View style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 12, marginTop: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}>
                      <Text style={{ color: "#e8e6eb", fontSize: 12, lineHeight: 18 }}>{selectedRun.verdict}</Text>
                    </View>
                  </View>

                  <View>
                    <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 10, fontWeight: "800", fontFamily: fontFamilyForWeight(800), letterSpacing: 1 }}>DISSENTERS</Text>
                    {selectedRun.dissenters.length === 0 ? (
                      <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 11, fontStyle: "italic", marginTop: 4 }}>No dissenters in this run.</Text>
                    ) : (
                      selectedRun.dissenters.map((d, i) => (
                        <View key={i} style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 10, marginTop: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" }}>
                          <Text style={{ color: modelById(d.modelId)?.color || "#fff", fontWeight: "700", fontFamily: fontFamilyForWeight(700), fontSize: 11 }}>
                            {modelById(d.modelId)?.label || d.modelId}
                          </Text>
                          <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 11, marginTop: 2 }}>{d.point}</Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
