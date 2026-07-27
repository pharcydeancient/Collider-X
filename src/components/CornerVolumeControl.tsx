// The persistent music widget (SPEC.md: "always reachable regardless of what
// screen is open"). Rendered once at the Shell root, only while something is
// actually loaded.
//
// What this replaced: a 57-line volume nub pinned to top-right, which
//   · could not be moved, and sat exactly on top of the Smart Gen button;
//   · could not be dismissed — pausing leaves trackId set, and nothing in the
//     app cleared it, so once music had played the nub was there for good;
//   · hid its own expansion behind a long-press on the mute button, with
//     nothing on screen suggesting that;
//   · never said what was playing, and could not change track.
//
// It is a player now: draggable and edge-snapping, collapsible, closable, and
// it names the track. Position and collapsed state persist, so wherever it is
// put is where it stays.
import React, { useEffect, useRef, useState } from "react";
import { Pressable, View, Text, PanResponder, Animated, useWindowDimensions, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCollider } from "../state";
import { PREMIUM_TRACKS, withFont } from "../styles/theme";
import * as player from "../services/musicPlayer";

// Wide enough for the play button (30) + the expand chevron (22) + padding
// (12). At 44 the chevron overflowed the pill and could not be tapped, so the
// widget could be collapsed but never reopened.
const COLLAPSED_W = 64;
// The fixed controls (play 30, prev/next 24 each, volume 24, close 24,
// chevron 22, padding 12, gaps ~24) come to ~184. At 208 the title got the
// remaining 24px and rendered as "D…", which is no better than not naming it.
const EXPANDED_W = 272;
const HEIGHT = 44;
const EDGE = 8;

export function CornerVolumeControl() {
  const { state, dispatch } = useCollider();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { trackId, isPlaying, volume, muted, disabledTrackIds, widget } = state.musicPlayer;

  const collapsed = widget?.collapsed ?? true;
  // Never wider than the screen it floats on — a narrow phone would otherwise
  // push the close button off the edge.
  const width = collapsed ? COLLAPSED_W : Math.min(EXPANDED_W, winW - EDGE * 2);

  // Default sits clear of both the header controls and the composer, rather
  // than under the Smart Gen button in the top-right corner.
  const defaultX = winW - width - EDGE;
  const defaultY = Math.round(winH * 0.42);
  const pos = useRef(new Animated.ValueXY({ x: widget?.x ?? defaultX, y: widget?.y ?? defaultY })).current;
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, y: 0 });

  // Keep the widget on screen when it resizes or the window does — a collapse
  // near the right edge would otherwise leave it half outside.
  useEffect(() => {
    const clampedX = Math.max(EDGE, Math.min((widget?.x ?? defaultX), winW - width - EDGE));
    const clampedY = Math.max(insets.top + EDGE, Math.min((widget?.y ?? defaultY), winH - HEIGHT - insets.bottom - EDGE));
    pos.setValue({ x: clampedX, y: clampedY });
  }, [winW, winH, width, widget?.x, widget?.y]);

  useEffect(() => {
    if (muted) player.setVolume(0);
    else player.setVolume(volume);
  }, [volume, muted]);

  const panResponder = useRef(
    PanResponder.create({
      // Capture-phase, past a threshold: below it the touch belongs to whatever
      // button is underneath, so dragging never eats a tap on play or close.
      onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        setDragging(true);
        start.current = { x: (pos.x as any)._value, y: (pos.y as any)._value };
      },
      onPanResponderMove: (_e, g) => {
        pos.setValue({ x: start.current.x + g.dx, y: start.current.y + g.dy });
      },
      // A parent ScrollView must not be able to steal the gesture mid-drag.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderRelease: () => {
        setDragging(false);
        const rawX = (pos.x as any)._value;
        const rawY = (pos.y as any)._value;
        const w = (widget?.collapsed ?? true) ? COLLAPSED_W : EXPANDED_W;
        // Snap to whichever side it was released nearer, so it always ends up
        // flush instead of floating somewhere arbitrary over the content.
        const snapX = rawX + w / 2 < winW / 2 ? EDGE : winW - w - EDGE;
        const clampY = Math.max(insets.top + EDGE, Math.min(rawY, winH - HEIGHT - insets.bottom - EDGE));
        Animated.spring(pos, { toValue: { x: snapX, y: clampY }, useNativeDriver: false, friction: 8 }).start();
        dispatch({ type: "setPlayerWidget", x: snapX, y: clampY });
      },
    })
  ).current;

  if (!trackId) return null;

  const enabled = PREMIUM_TRACKS.filter((t) => !disabledTrackIds.includes(t.id));
  const current = PREMIUM_TRACKS.find((t) => t.id === trackId);
  const idx = enabled.findIndex((t) => t.id === trackId);

  const go = (delta: number) => {
    if (!enabled.length) return;
    const next = enabled[(idx + delta + enabled.length) % enabled.length];
    if (!next) return;
    player.playTrack(next.id, next.url, muted ? 0 : volume);
    dispatch({ type: "playTrack", trackId: next.id });
  };

  const toggle = () => {
    if (isPlaying) { player.pauseTrack(); dispatch({ type: "pausePlayer" }); }
    else { player.resumeTrack(); dispatch({ type: "resumePlayer" }); }
  };

  const close = () => {
    player.stopAndUnload();
    dispatch({ type: "stopPlayer" });
  };

  const icon = muted || volume === 0 ? "volume-mute" : volume < 0.5 ? "volume-low" : "volume-high";

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width,
        height: HEIGHT,
        zIndex: 999,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 6,
        borderRadius: HEIGHT / 2,
        backgroundColor: "rgba(10,8,16,0.88)",
        borderWidth: 1,
        borderColor: dragging ? "rgba(226,232,240,0.55)" : "rgba(255,255,255,0.12)",
        ...(Platform.OS === "web" ? ({ userSelect: "none", cursor: dragging ? "grabbing" : "grab" } as any) : null),
      }}
    >
      <Pressable onPress={toggle} style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={16} color="#fff" />
      </Pressable>

      {collapsed ? null : (
        <>
          <Pressable onPress={() => go(-1)} style={{ width: 24, height: 30, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="play-skip-back" size={13} color="rgba(255,255,255,0.75)" />
          </Pressable>
          <Pressable onPress={() => go(1)} style={{ width: 24, height: 30, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="play-skip-forward" size={13} color="rgba(255,255,255,0.75)" />
          </Pressable>

          {/* Naming the track is the whole reason a player is not a volume knob. */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={withFont({ fontSize: 10.5, fontWeight: "700", color: "#fff" })}>
              {current?.title || "Playing"}
            </Text>
          </View>

          <Pressable onPress={() => dispatch({ type: "togglePlayerMute" })} style={{ width: 24, height: 30, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={icon as any} size={14} color={muted ? "rgba(238,241,246,0.45)" : "#fff"} />
          </Pressable>
          <Pressable onPress={close} style={{ width: 24, height: 30, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="close" size={14} color="rgba(238,241,246,0.6)" />
          </Pressable>
        </>
      )}

      <Pressable
        onPress={() => dispatch({ type: "setPlayerWidget", collapsed: !collapsed })}
        style={{ width: 22, height: 30, alignItems: "center", justifyContent: "center" }}
      >
        <Ionicons name={collapsed ? "chevron-back" : "chevron-forward"} size={14} color="rgba(238,241,246,0.6)" />
      </Pressable>
    </Animated.View>
  );
}
