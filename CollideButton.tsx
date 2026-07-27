import React, { useEffect, useRef } from "react";
import { View, Pressable, Text, StyleSheet, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient as SvgRadial, Stop, Ellipse, Rect } from "react-native-svg";
import { fontFamilyForWeight, FONT_MONO } from "../styles/theme";
import { wave, useAmbientPhase, DUR, EASE } from "../motion";

// ── COLLIDE ───────────────────────────────────────────────────────────────
//
// This pill existed in App.tsx as a fully-built component that was never
// rendered anywhere — an obsidian capsule with a specular orb, a breathing
// inner glow and an expanding halo ring, sitting as dead code. Meanwhile the
// Consensus drawer, which is where a collision is actually observed, had no
// action element at all: you opened it and read a number that had already
// been computed.
//
// So the two are merged here rather than one being deleted. The banner above
// the composer keeps its job — the passive, glanceable readout you never have
// to ask for. This keeps its own — the active event. Same feature, two
// honest halves.
//
// The animation is the part that changes. Previously all three loops ran
// forever at fixed rates regardless of what was happening, which is
// decoration: motion that reports nothing. Here the motion IS the state:
//
//   working  — the arbiter is out. Continuous, seamless, no beginning or end,
//              because the wait has no known duration and pretending
//              otherwise (a progress bar, a countdown) would be a lie about
//              information we do not have.
//   settled  — a verdict landed. The loops stop and the ring makes exactly
//              one outward pass, then rests. A resolved event is the one
//              thing here that has earned a beginning and an end.
//   blocked  — scope is incomplete. No motion at all. Stillness is the
//              honest report; a pulsing disabled button is a button lying
//              about being available.
export type CollideState = "working" | "settled" | "blocked";

export function CollideButton({
  onPress, state = "settled", label, sublabel, width = 210,
}: {
  onPress?: () => void;
  state?: CollideState;
  label?: string;
  sublabel?: string;
  width?: number;
}) {
  const working = state === "working";
  const blocked = state === "blocked";

  // Ambient loops — seamless, phase-derived, native-driven. Mounted always
  // but only consulted while working, so entering the working state never
  // has to spin an animation up from zero (which would itself read as a
  // "beginning" and give the wait a false starting gun).
  const phase = useAmbientPhase(2600);
  const ringPhase = useAmbientPhase(3400);

  // One-shot settle pass, fired when a verdict actually lands.
  const settle = useRef(new Animated.Value(0)).current;
  const wasWorking = useRef(working);
  useEffect(() => {
    if (wasWorking.current && !working && !blocked) {
      settle.setValue(0);
      Animated.timing(settle, {
        toValue: 1,
        duration: 620,
        easing: EASE.enter,
        useNativeDriver: true,
      }).start();
    }
    wasWorking.current = working;
  }, [working, blocked, settle]);

  const glowOpacity = working
    ? phase.interpolate(wave(0.19, 0, 24, 0.42))
    : blocked ? 0.08 : 0.24;

  const scale = working ? phase.interpolate(wave(0.012, 0.1, 24, 1.012)) : 1;

  return (
    <View style={{ alignItems: "center" }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        {/* Expanding halo. While working it runs continuously off the ambient
            phase — it leaves the pill edge, fades out, and the next one is
            already on its way, so there is no moment where the element is
            idle between pulses. On settle it makes a single wider pass. */}
        {working && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
              borderRadius: 23, borderWidth: 1, borderColor: "rgba(230,236,244,0.35)",
              opacity: ringPhase.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0.45, 0, 0.45] }),
              transform: [{ scale: ringPhase.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0.96, 1.3, 0.96] }) }],
            }}
          />
        )}
        {!working && !blocked && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
              borderRadius: 23, borderWidth: 1, borderColor: "rgba(230,236,244,0.5)",
              opacity: settle.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              transform: [{ scale: settle.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.42] }) }],
            }}
          />
        )}

        <Pressable
          onPress={blocked ? undefined : onPress}
          disabled={blocked || !onPress}
          style={{
            height: 46, width, borderRadius: 23,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
            borderWidth: 1, borderColor: blocked ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.18)",
            overflow: "hidden", opacity: blocked ? 0.45 : 1,
            shadowColor: "rgba(230,236,244,0.4)", shadowOpacity: blocked ? 0 : 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: blocked ? 0 : 8,
          }}
        >
          <LinearGradient colors={["#16181f", "#0a0b10"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />

          <Animated.View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, opacity: glowOpacity }}>
            <Svg width="100%" height="100%">
              <Defs>
                <SvgRadial id="collide-glow" cx="50%" cy="50%" r="60%">
                  <Stop offset="0" stopColor="#ffffff" stopOpacity={0.32} />
                  <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
                </SvgRadial>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#collide-glow)" />
            </Svg>
          </Animated.View>

          {/* Specular orb — the one element that keeps moving while working,
              drifting a hair off-center so the capsule has a light source
              that is alive rather than a printed highlight. */}
          <Animated.View style={{ transform: working ? [{ translateY: phase.interpolate(wave(1.1, 0)) }] : [] }}>
            <Svg width={14} height={14}>
              <Defs>
                <SvgRadial id="collide-orb" cx="40%" cy="35%" r="65%">
                  <Stop offset="0" stopColor="#ffffff" />
                  <Stop offset="0.6" stopColor="#aab6c9" />
                  <Stop offset="1" stopColor="#5c6778" />
                </SvgRadial>
              </Defs>
              <Ellipse cx={7} cy={7} rx={7} ry={7} fill="url(#collide-orb)" />
            </Svg>
          </Animated.View>

          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", fontFamily: fontFamilyForWeight(700), letterSpacing: 4, color: "#f4f7fb" }}>
              {label || "COLLIDE"}
            </Text>
            {!!sublabel && (
              <Text style={{ fontSize: 7, fontFamily: FONT_MONO, letterSpacing: 1.6, color: "rgba(238,241,246,0.45)", marginTop: 2 }}>
                {sublabel}
              </Text>
            )}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}
