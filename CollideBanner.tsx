import React, { useEffect, useState, useRef } from "react";
import { View, Pressable, Text, StyleSheet, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useCollider } from "../state";
import { modelById } from "../models";
import { scoreConsensus } from "../services/chat";
import { GLASS_CARD, FONT_MONO, FONT_MONO_SEMIBOLD } from "../styles/theme";
import { EASE } from "../motion";

const DISSENT_THRESHOLD = 0.5;
const SILVER = "#e6ecf4";

// Proactive-value bar: the user types a prompt, gets replies from every
// selected model, and the synthesis of what they said is sitting right
// here — above the composer, zero extra taps — instead of being locked
// behind a drawer only the curious would ever open. Tapping still opens the
// full Consensus drawer for the map/dissenter detail; this is the "give it
// to them before they ask" layer on top of that.
//
// A consensus is only a valid claim if it's drawn from a fully declared,
// bound scope — synthesizing from a partial subset and calling it
// "consensus" isn't a smaller consensus, it's not a consensus at all. So
// this only ever has two states: complete (show the real verdict/score) or
// incomplete (say so, plainly). "Consensus:" and the score are the bar's
// permanent identity — they don't disappear depending on which of the
// several reasons (too few selected, still waiting, a model errored) the
// scope isn't complete; the reason doesn't change what's true, so it
// collapses to one word: "Incomplete."
export function CollideBanner({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const { state } = useCollider();
  const cat = state.activeCategory;
  const conv = state.conversations.find((c) => c.id === state.activeConversationId[cat]);
  const selectedIds = (state.selectedModelIds[cat] || []).filter((id) => modelById(id));
  const replies = selectedIds
    .map((id) => ({
      id,
      last: [...(conv?.threads[id] || [])].reverse().find((m) => m.role === "assistant" && m.content),
    }))
    .filter((r) => r.last) as { id: string; last: { content: string } }[];

  // Wait for EVERY selected model to land (a real reply or an error both
  // count — either way there's nothing left pending) before synthesizing.
  const allIn = selectedIds.length >= 2 && replies.length === selectedIds.length;

  const repliesKey = replies.map((r) => `${r.id}:${r.last.content.length}`).join("|");
  const [result, setResult] = useState<{ verdict: string; scores: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const shimmerAnim = useRef(new Animated.Value(-1)).current;

  // A specular sweep, not a loading indicator: the highlight crosses, then
  // the bar rests before the next pass. The rest is what keeps it from
  // reading as "busy" on a bar whose whole point is that the work is done.
  // Linear across the face — an eased sweep would decelerate mid-bar, which
  // no real light travelling across a surface does.
  useEffect(() => {
    if (!allIn || disabled) { shimmerAnim.setValue(-1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(shimmerAnim, {
          toValue: 2,
          duration: 1150,
          easing: EASE.linear,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [allIn, disabled, shimmerAnim]);

  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [-1, 2],
    outputRange: [-180, 240],
  });

  useEffect(() => {
    let cancelled = false;
    if (!state.autoConsensusSummary || !allIn) { setResult(null); return; }
    setLoading(true);
    scoreConsensus(replies.map((r) => ({ modelId: r.id, label: modelById(r.id)?.label || r.id, content: r.last.content })))
      .then((res) => { if (!cancelled) setResult(res); })
      .catch(() => { if (!cancelled) setResult(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repliesKey, allIn, state.autoConsensusSummary]);

  // Fraction, not a percentage — a direct count you can sanity-check
  // against the panel, not a number you have to trust.
  const scores = result?.scores || {};
  const agreeCount = replies.filter((r) => (scores[r.id] ?? 0) >= DISSENT_THRESHOLD).length;
  const totalCount = replies.length;
  const ratio = totalCount ? agreeCount / totalCount : 0;
  const hasScore = !!result;
  const scoreColor = !hasScore ? SILVER : ratio >= 0.66 ? "#7ee2a8" : ratio >= 0.4 ? "#f5e000" : "#ff6a5c";
  const available = state.autoConsensusSummary && hasScore;

  return (
    <View style={{ marginHorizontal: 16, marginTop: 2 }}>
      <Pressable
        onPress={() => {
          if (disabled) return;
          if (!available) {
            onPress();
            return;
          }
          setExpanded(!expanded);
        }}
        disabled={disabled}
        style={[styles.bar, disabled && { opacity: 0.5 }]}
      >
        <LinearGradient
          colors={GLASS_CARD}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Glossy shimmer sweep — only once a real consensus is available. */}
        {available && !disabled && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { transform: [{ translateX: shimmerTranslateX }, { rotate: "18deg" }], width: 70, opacity: 0.16 },
            ]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={["transparent", "#ffffff", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        )}

        {/* Score cell — the mono "instrument readout": alignment fraction + a
            small ALIGN label, divided from the verdict by a hairline. */}
        <View style={styles.scoreCell}>
          <Text style={[styles.scoreNum, { color: scoreColor, textShadowColor: scoreColor }]}>
            {available ? `${agreeCount}/${totalCount}` : "–/–"}
          </Text>
          <Text style={styles.scoreLabel}>ALIGN</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.kicker}>CONSENSUS</Text>
          <Text style={styles.verdict} numberOfLines={expanded ? undefined : 2}>
            {available ? result!.verdict : "Waiting for all selected models to reply."}
          </Text>

          {available && (
            <View style={{ flexDirection: "row", gap: 4, marginTop: 6 }}>
              {replies.map((r) => {
                const agree = (scores[r.id] ?? 0) >= DISSENT_THRESHOLD;
                const m = modelById(r.id);
                return (
                  <View
                    key={r.id}
                    style={{
                      width: 6, height: 6, borderRadius: 3,
                      backgroundColor: agree ? (m?.color || SILVER) : "transparent",
                      borderWidth: agree ? 0 : 1,
                      borderColor: "rgba(255,255,255,0.4)",
                    }}
                  />
                );
              })}
            </View>
          )}

          {available && expanded && (
            <Pressable
              onPress={(e) => { e.stopPropagation(); onPress(); }}
              style={styles.exploreBtn}
            >
              <Text style={styles.exploreText}>EXPLORE DISSENT MAP ›</Text>
            </Pressable>
          )}
        </View>

        {!expanded && <Text style={styles.chev}>›</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 56,
    borderRadius: 15,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(10,12,18,0.4)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  scoreCell: {
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  scoreNum: {
    fontFamily: FONT_MONO_SEMIBOLD,
    fontSize: 17,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  scoreLabel: {
    fontFamily: FONT_MONO,
    fontSize: 7,
    letterSpacing: 1.6,
    color: "rgba(238,241,246,0.4)",
  },
  body: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    justifyContent: "center",
    gap: 3,
  },
  kicker: {
    fontFamily: FONT_MONO,
    fontSize: 8,
    letterSpacing: 2,
    color: "rgba(238,241,246,0.45)",
  },
  verdict: {
    color: "rgba(238,241,246,0.9)",
    fontSize: 11.5,
    lineHeight: 16,
  },
  chev: {
    alignSelf: "center",
    paddingHorizontal: 14,
    fontSize: 16,
    color: "rgba(238,241,246,0.5)",
  },
  exploreBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  exploreText: {
    color: "#f4f7fb",
    fontSize: 9,
    letterSpacing: 1.2,
    fontFamily: FONT_MONO,
  },
});
