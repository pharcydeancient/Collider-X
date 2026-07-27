import React, { useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, LayoutAnimation } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCollider, ChatMessage } from "../state";
import { Glass } from "./Glass";
import { Markdown } from "./Markdown";
import { styles, withFont, fontFamilyForWeight, FONT_MONO } from "../styles/theme";
import { ModelDef, canUse } from "../models";

export function ModelCard({
  model, open, openUpgrade, onLongPress, height,
}: {
  model: ModelDef;
  open: () => void;
  openUpgrade: () => void;
  onLongPress: (msg: ChatMessage) => void;
  height: number;
}) {
  const { state, dispatch } = useCollider();
  const conv = state.conversations.find(
    (c) => c.id === state.activeConversationId[state.activeCategory],
  );
  const thread = conv?.threads[model.id] || [];
  const last = thread[thread.length - 1];
  const usable = canUse(state.tier, model);

  // Windowed history: render the tail, reveal more as the user scrolls up —
  // avoids mounting hundreds of bubbles in a shrunk grid card.
  const PAGE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const shown = thread.slice(Math.max(0, thread.length - visibleCount));
  const hasMore = visibleCount < thread.length;
  const scrollRef = useRef<ScrollView>(null);
  const wasAtBottom = useRef(false);
  // Scroll to the TOP of the latest message, not the bottom of it — a new
  // reply should let you read from its start, not dump you at its end. Same
  // pattern as the full CardScreen detail view's chat log.
  //
  // Tracks message id, not the last y value: gating on "has y changed" let a
  // stale early-streaming measurement (taken before the previous bubble had
  // finished laying out) lock in permanently, since the target bubble's own
  // y offset barely moves once set — the result was landing a few lines
  // into the tail of the PREVIOUS message instead of the top of the new
  // one, with no further correction as the reply kept streaming in below.
  // Re-issuing scrollTo on every layout pass lets it self-correct as
  // measurements settle; only the first jump to a genuinely new message
  // animates, so mid-stream corrections don't look like repeated jank.
  const lastMessageIdRef = useRef<string | null>(null);
  const [showDesc, setShowDesc] = useState(false);

  const handleCardPress = () => {
    if (usable) open();
    else openUpgrade();
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    dispatch({ type: "toggleModel", category: state.activeCategory, modelId: model.id });
  };

  return (
    <Pressable
      onPress={handleCardPress}
      onLongPress={() => {
        if (last) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onLongPress(last);
        }
      }}
      delayLongPress={380}
      style={{
        height, marginBottom: 4,
        // Drop shadow lives on this outer wrapper, not inside Glass — Glass's
        // own View clips via overflow:hidden (needed for its corner-highlight
        // gradient), which would clip a shadow applied there to nothing.
        // Radius/offset kept tight (well under CardGrid's 6px inter-card
        // gap) so the shadow stays on its own card instead of bleeding onto
        // the neighbor beside or below it — a shadow that overlaps another
        // element isn't a deliberate shadow, it's a rendering accident.
        // Opacity raised for real black, not a gray smudge.
        shadowColor: "#000", shadowOpacity: 0.65, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4,
      }}
    >
      <Glass
        isCard
        style={styles.modelCard}
      >
        {/* No corner bloom. A 110px disc of the model's hue sat here at
            top:-30/left:-30 — a flat-colour ornament, which the card rules
            rule out outright: "no flat-colour ornament, no glowing dots, no
            corner type tabs." The model's identity is already carried by the
            title and the dot in the header row; the disc restated it as
            decoration and was the loudest thing on an empty card. */}
        {/* Header strip: color dot + name (left, one line) + tier badge. The
            dismiss X sits as a subtle corner affordance so the header row
            stays clean, matching the dot·name·tier rhythm. */}
        <View style={localStyles.cardHeader}>
          {/* Flat, not glowing — same rule. It marks which model this is; it
              is not a status light and has nothing to announce. */}
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: model.color }} />
          <Text
            style={[
              styles.cardTitle,
              { color: "#f2f5fa", flex: 1, fontSize: 10, lineHeight: 13, letterSpacing: 1.2 },
            ]}
            numberOfLines={1}
          >
            {model.label.toUpperCase()}
          </Text>
          <Text style={localStyles.tierBadge}>{model.tier.toUpperCase()}</Text>
          <Pressable
            onPress={handleDismiss}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 6 }}
            style={localStyles.dismissBtn}
          >
            <Ionicons name="close" size={10} color="rgba(238,241,246,0.4)" />
          </Pressable>
        </View>

        {/* Off by default (Settings > Display > Show model descriptions) —
            it cost real space on every card for text read once, if ever
            (measured: 25% of card height at 3-row density before any
            actual model output was visible). Still available for anyone
            who wants it back, opt-in via that setting, not a permanent tax. */}
        {state.showModelDescriptions && !!model.desc && (
          <Pressable
            onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowDesc((v) => !v); }}
            style={localStyles.descRow}
          >
            <Text
              style={[styles.cardDesc, localStyles.descText]}
              numberOfLines={showDesc ? undefined : 1}
            >
              {model.desc}
            </Text>
            <Ionicons
              name={showDesc ? "chevron-up" : "chevron-down"}
              size={9}
              color="rgba(255,255,255,0.3)"
              style={{ marginLeft: 4, marginTop: 1 }}
            />
          </Pressable>
        )}

        {/* Scrollable full-thread body — same conversation as card detail view */}
        <ScrollView
          ref={scrollRef}
          style={[styles.cardBody, { flex: 1 }]}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            wasAtBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 24;
            if (contentOffset.y < 24 && hasMore) setVisibleCount((v) => v + PAGE);
          }}
          scrollEventThrottle={100}
        >
          {!last ? (
            <Text style={[styles.placeholder, { fontSize: 11.5, lineHeight: 16 }]}>Tap to start a conversation.</Text>
          ) : (
            <>
              {hasMore && <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 9, textAlign: "center", marginBottom: 4 }}>Loading earlier…</Text>}
              {shown.map((m, i) => (
                <View
                  key={m.id}
                  onLayout={(e) => {
                    if (i !== shown.length - 1) return;
                    const y = e.nativeEvent.layout.y;
                    const isNewMessage = lastMessageIdRef.current !== m.id;
                    if (isNewMessage) lastMessageIdRef.current = m.id;
                    scrollRef.current?.scrollTo({ y, animated: isNewMessage });
                  }}
                  style={[
                    localStyles.miniBubble,
                    m.role === "user"
                      ? localStyles.miniBubbleUser
                      : { alignSelf: "flex-start", backgroundColor: "rgba(23,16,38,0.15)", borderWidth: 1, borderColor: `${model.color}22` },
                  ]}
                >
                  {m.role === "assistant" ? (
                    <Markdown
                      content={(m.content || "…").replace(/\n{2,}/g, "\n")}
                      color="#fff"
                      fontSize={11}
                    />
                  ) : (
                    <Text style={[styles.bodyText, { fontSize: 11, lineHeight: 15 }]}>
                      {(m.content || "").replace(/\n{2,}/g, "\n")}
                    </Text>
                  )}
                </View>
              ))}
            </>
          )}
        </ScrollView>

        {!usable && (
          <View style={[StyleSheet.absoluteFill, styles.fogContainer, { overflow: "hidden" }]}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[styles.lockedContainer, { width: "100%", height: "100%", justifyContent: "center", alignItems: "center", backgroundColor: "rgba(22, 14, 35, 0.4)" }]}>
              {/* Was gold (#ffd166) — banned accent per SPEC.md. Muted gray is
                  also the spec-correct call here regardless: "a muted/
                  desaturated look is reserved for genuinely disabled/locked
                  states" — this is exactly that, not decoration. */}
              <Ionicons name="lock-closed" size={16} color="rgba(255,255,255,0.55)" style={{ marginBottom: 4 }} />
              <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: "900", fontFamily: fontFamilyForWeight(900), letterSpacing: 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.55)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 4 }}>LOCKED</Text>
              <Text style={[styles.lockText, { fontSize: 9.5 }]}>Locked ({model.tier.toUpperCase()})</Text>
            </View>
          </View>
        )}
      </Glass>
    </Pressable>
  );
}

// See RemindersScreen.tsx for why withFont is required here: without it,
// fontWeight 700+ resolves to synthetic faux-bold instead of the real
// static Manrope Bold/ExtraBold file.
const localStyles = StyleSheet.create(withFont({
  miniBubble: {
    maxWidth: "92%",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 5,
  },
  // Assistant bubble is styled inline (needs the current model's color for
  // its border/tint) — see the render call site.
  miniBubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    paddingBottom: 6,
    gap: 7,
  },
  tierBadge: {
    fontFamily: FONT_MONO,
    fontSize: 8,
    letterSpacing: 1,
    color: "rgba(238,241,246,0.4)",
    flexShrink: 0,
  },
  accentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  dismissBtn: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  descRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 2,
    marginTop: 2,
    marginBottom: 2,
  },
  descText: {
    flex: 1,
    lineHeight: 12,
  },
}));
