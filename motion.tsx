import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Pressable, Animated, Easing, StyleSheet, PanResponder } from "react-native";
import Svg, { Defs, RadialGradient as SvgRadial, Stop, Ellipse } from "react-native-svg";
import * as Haptics from "expo-haptics";

import { useCollider } from "./state";
import { CATEGORIES, isCategoryUnlocked, type Category } from "./models";
import { SCREEN_W, SCREEN_H } from "./styles/theme";

// ═══════════════════════════════════════════════════════════════════════════
//  MOTION — the ambient system and every component built on it.
//
//  Self-contained on purpose: this is one drop-in file plus CollideButton.tsx.
//  Nothing here reads from App.tsx; App.tsx imports from here.
//
//  The brief this implements, verbatim: "the key is in the start and end, and
//  their seamless looping. and their fps. if there is no beginning and end,
//  speed becomes difficult to ascertain. and soon, ambience is discovered by
//  the display of balance and conveyance of progress or direction. just,
//  movement as movement. natural."
//
//  That diagnosis condemns the pattern this app used everywhere:
//
//      Animated.loop(Animated.sequence([
//        Animated.timing(v, { toValue: 1, easing: Easing.inOut(Easing.sin) }),
//        Animated.timing(v, { toValue: 0, easing: Easing.inOut(Easing.sin) }),
//      ]))
//
//  A ping-pong. inOut easing decelerates to a dead stop at each turnaround, so
//  every cycle has a visible beginning and end — and once a viewer can find
//  those, they can clock the speed, and the motion stops reading as ambience.
//  It also makes every element a metronome: stop, go, stop, go.
//
//  The fix is not "slower". It is removing the turnaround. Ambient motion here
//  is a single monotonic phase 0→1 on LINEAR easing, looping forever, with
//  position derived from it. Because the derivation is periodic (f(0)===f(1))
//  the loop seam is mathematically invisible: no frame stops, reverses, or
//  snaps. Drift follows a closed orbit — direction and balance, no
//  destination. Movement as movement.
//
//  fps: every value here feeds transform/opacity only, so all of it runs on
//  the native driver (UI thread). A linear driver is also the cheapest
//  possible interpolation. That is what keeps the field smooth while the JS
//  thread is busy streaming tokens — precisely when the old JS-driven easings
//  used to visibly hitch.
// ═══════════════════════════════════════════════════════════════════════════

// ── Primitives ─────────────────────────────────────────────────────────────

/**
 * A piecewise-linear approximation of a sine wave, shaped for
 * `Animated.Value.interpolate` and driven by a linear 0→1 phase.
 *
 * The table is closed (last output === first) so a looping driver produces no
 * seam. 24 steps is smooth well past visibility at ambient speeds — residual
 * error is a fraction of a pixel at these amplitudes.
 *
 * `phase` (in turns, 0–1) offsets the wave so siblings sharing a period don't
 * move in lockstep. `phase: 0.25` yields a cosine, which is how a pair of
 * these compose into a circular orbit.
 */
export function wave(amplitude: number, phase = 0, steps = 24, center = 0) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    inputRange.push(t);
    outputRange.push(center + Math.sin((t + phase) * Math.PI * 2) * amplitude);
  }
  // Guarantee an exactly closed loop against float drift, so the seam can
  // never produce a one-frame jump.
  outputRange[steps] = outputRange[0];
  return { inputRange, outputRange };
}

/**
 * The ambient driver: a phase advancing 0→1 forever, linearly, never resting.
 * Everything ambient derives from one of these. Nothing about it is "an
 * animation that plays" — there is no start state to arrive from and no end
 * state to arrive at, which is the entire point.
 */
export function useAmbientPhase(period: number, autoStart = true) {
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!autoStart) return;
    const loop = Animated.loop(
      Animated.timing(phase, { toValue: 1, duration: period, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, period, autoStart]);
  return phase;
}

// ── Transition vocabulary ──────────────────────────────────────────────────
//
// Transitions are the opposite case from ambience: they SHOULD have a
// beginning and an end, because they report that a discrete thing happened.
// What separates professional from try-hard is that the ends get the care —
// an element leaves with a different curve than it arrives with, because
// leaving and arriving are not the same event.
//
// Arriving decelerates (out): already committed, settling into place. Leaving
// accelerates (in): commits to going and gets out of the way rather than
// lingering and drawing attention to its own exit. Symmetric easing on both
// is the single most common tell of an unconsidered transition — it makes
// every change feel like it is being demonstrated.
export const DUR = {
  /** Chip/indicator settle. Short enough to feel like direct response. */
  snap: 190,
  /** Standard element enter. */
  enter: 300,
  /** Standard element exit — faster than enter, on purpose. */
  exit: 240,
  /** Screen-level change. */
  screen: 320,
} as const;

export const EASE = {
  /** Arriving: decelerate into rest. */
  enter: Easing.out(Easing.cubic),
  /** Leaving: accelerate away. */
  exit: Easing.in(Easing.cubic),
  /** Tracking a gesture or a value already in motion. */
  move: Easing.bezier(0.4, 0, 0.2, 1),
  /** Ambient only — never for transitions. */
  linear: Easing.linear,
} as const;

export const timing = (
  value: Animated.Value,
  toValue: number,
  duration: number = DUR.enter,
  easing: (v: number) => number = EASE.enter,
) => Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });

// ── Ambient field ──────────────────────────────────────────────────────────

/**
 * A soft radial glow on a continuous orbit. SVG radial gradient so the edge
 * dissolves instead of reading as a hard disc.
 *
 * Was a ping-pong (drift out on inOut easing, drift back) that stopped dead at
 * both ends of every cycle. Now it traces a closed elliptical orbit from one
 * linear phase — x on a cosine, y on a sine, breathing on a third. Nothing
 * ever stops or reverses.
 */
export function AuroraBlob({
  gid, size, color, x, y, dx, dy, dur, peak = 1, phase = 0,
}: {
  gid: string; size: number; color: string; x: number; y: number;
  dx: number; dy: number; dur: number; peak?: number; phase?: number;
}) {
  // dur was previously a half-cycle (out, then back). Now it is one full
  // orbit, so double it to preserve the tuned apparent speed.
  const v = useAmbientPhase(dur * 2);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute", left: x, top: y, width: size, height: size,
        transform: [
          // Quarter-turn apart: together these describe an orbit, not a line.
          { translateX: v.interpolate(wave(dx, phase + 0.25)) },
          { translateY: v.interpolate(wave(dy, phase)) },
          // Breathing rides the same phase so scale and position stay
          // coherent — the blob is largest as it swings through, not on an
          // unrelated clock that makes the two read as separate effects.
          { scale: v.interpolate(wave(0.08, phase + 0.1, 24, 1.08)) },
        ],
      } as any}
    >
      <Svg width={size} height={size}>
        <Defs>
          <SvgRadial id={gid} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={peak} />
            <Stop offset="65%" stopColor={color} stopOpacity={peak * 0.32} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </SvgRadial>
        </Defs>
        <Ellipse cx={size / 2} cy={size / 2} rx={size / 2} ry={size / 2} fill={`url(#${gid})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * A single star, breathing on its own continuous phase.
 *
 * Was a ping-pong with a setTimeout stagger: every star decelerated to a hard
 * stop at full brightness and again at minimum, and the timeout meant the
 * field visibly "started" a few seconds after mount. Now brightness is a
 * closed sine off a linear phase, and the stagger is a phase offset rather
 * than a delay — so the field is already mid-motion on the first frame, with
 * no moment of onset and no two stars in lockstep.
 */
export function Star({ x, y, dur, phase, size }: { x: number; y: number; dur: number; phase: number; size: number }) {
  const v = useAmbientPhase(dur);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute", left: x, top: y, width: size, height: size, borderRadius: size,
        backgroundColor: "#dfe7f2",
        opacity: v.interpolate(wave(0.28, phase, 24, 0.42)),
      }}
    />
  );
}

// Deterministic pseudo-random so the starfield is stable across renders.
const seed = (n: number) => { const s = Math.sin(n * 999) * 10000; return s - Math.floor(s); };
const STARS = Array.from({ length: 22 }, (_, i) => ({
  x: seed(i) * SCREEN_W,
  y: seed(i + 40) * SCREEN_H,
  // Periods are deliberately not multiples of each other — the field as a
  // whole then has no common period, so it never visibly repeats.
  dur: 5200 + seed(i + 80) * 8400,
  phase: seed(i + 120),
  size: seed(i + 160) > 0.85 ? 2.5 : 1.6,
}));

/** Orbiting glows over a breathing starfield. */
export function AuroraField({ accent }: { tint?: string; accent: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Coprime-ish periods and opposed phases: the two glows drift through
          each other on their own clocks instead of pumping together, so the
          field reads as a balance of two slow bodies rather than one effect
          applied twice. */}
      <AuroraBlob gid="aur-blue" size={SCREEN_W * 1.15} color="#3c508c" peak={0.5} x={-SCREEN_W * 0.15} y={-SCREEN_H * 0.08} dx={SCREEN_W * 0.14} dy={SCREEN_H * 0.05} dur={26000} phase={0} />
      <AuroraBlob gid="aur-accent" size={SCREEN_W * 1.05} color={accent} peak={0.34} x={SCREEN_W * 0.3} y={SCREEN_H * 0.5} dx={-SCREEN_W * 0.1} dy={-SCREEN_H * 0.06} dur={37000} phase={0.5} />
      {STARS.map((s, i) => <Star key={i} {...s} />)}
    </View>
  );
}

// ── Transitions ────────────────────────────────────────────────────────────

/**
 * Arrival for a swapped subtree. `ordinal`, when supplied, is the new view's
 * position in an ordered set — content then enters from the side it actually
 * came from. Entering from the wrong side is what makes a tab change feel like
 * a page reload: the motion contradicts the gesture that caused it.
 */
export function ScreenTransition({ children, screenKey, ordinal }: { children?: ReactNode; screenKey: string; ordinal?: number }) {
  const anim = useRef(new Animated.Value(1)).current;
  const prevOrdinal = useRef(ordinal);
  const [dir, setDir] = useState(1);

  useEffect(() => {
    if (ordinal !== undefined && prevOrdinal.current !== undefined && ordinal !== prevOrdinal.current) {
      setDir(ordinal > prevOrdinal.current ? 1 : -1);
    }
    prevOrdinal.current = ordinal;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: DUR.enter, easing: EASE.enter, useNativeDriver: true }).start();
  }, [screenKey, ordinal, anim]);

  // Opacity leads position slightly: at halfway the content is already mostly
  // opaque but still moving. It reads as settling into place rather than
  // fading in and sliding as two separate effects.
  const opacity = anim.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0.92, 1] });
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [18 * dir, 0] });

  return <Animated.View style={{ flex: 1, opacity, transform: [{ translateX }] }}>{children}</Animated.View>;
}

/**
 * Presence wrapper for the Consensus banner.
 *
 * Consensus does not apply to media generation, so switching from a text
 * category to a media one used to pop the banner out of the layout in one
 * frame. Instead it sinks: slides down toward the composer while fading, with
 * its slot height collapsing in step — clipped by overflow:hidden so it
 * dissolves in place rather than ever passing behind the prompt box.
 */
export function SinkPresence({ show, children }: { show: boolean; children?: ReactNode }) {
  const v = useRef(new Animated.Value(show ? 1 : 0)).current;
  const [mounted, setMounted] = useState(show);
  // Measured content height, so the slot collapses from the banner's real
  // size (it grows when the verdict is expanded) instead of a guess that would
  // either clip at rest or lag the fade during collapse.
  const contentH = useRef(58);
  const [measuredH, setMeasuredH] = useState(58);

  useEffect(() => {
    if (show) {
      setMounted(true);
      Animated.timing(v, { toValue: 1, duration: DUR.enter, easing: EASE.enter, useNativeDriver: false }).start();
    } else {
      Animated.timing(v, { toValue: 0, duration: DUR.exit, easing: EASE.exit, useNativeDriver: false }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [show, v]);

  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents={show ? "auto" : "none"}
      style={{
        overflow: "hidden",
        opacity: v,
        height: v.interpolate({ inputRange: [0, 1], outputRange: [0, measuredH] }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      }}
    >
      <View
        onLayout={(e) => {
          const h = Math.ceil(e.nativeEvent.layout.height);
          if (h > 0 && h !== contentH.current) { contentH.current = h; setMeasuredH(h); }
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

// ── Category deck ──────────────────────────────────────────────────────────
//
// Categories were reachable only through a dropdown modal — two taps and a
// full-screen interruption to move one tab sideways. They are an ordered row
// of peers, so they should be traversable the way an ordered row of peers is:
// by pushing it.
//
// The swipe is rubber-banded and never pages content off-screen. A full
// slide-out would demand a synchronized offscreen render of the next
// category's grid, and at 8 cards each that is real cost for a gesture you
// finish in 200ms. Instead the deck yields under the finger to acknowledge the
// gesture, and the commit is carried by the rail indicator, the grid's
// re-entry, and the Consensus bar sinking or rising. The feedback is honest
// about what it is: a nudge, not a page turn.

const SWIPE_COMMIT = 52;  // px of travel that counts as intent
const SWIPE_YIELD = 44;   // max px the deck gives under the finger

export function CategoryDeck({ children, onLocked }: { children?: ReactNode; onLocked: () => void }) {
  const { state, dispatch } = useCollider();
  const idx = Math.max(0, CATEGORIES.findIndex((c) => c.id === state.activeCategory));
  const dragX = useRef(new Animated.Value(0)).current;
  // PanResponder is created once; its handlers close over the first render's
  // values, so anything that changes has to be read through a ref.
  const live = useRef({ idx, tier: state.tier });
  live.current = { idx, tier: state.tier };

  const settle = () =>
    Animated.spring(dragX, {
      toValue: 0,
      // Overshoot on a horizontal nudge would read as a bounce-back, i.e.
      // rejection. This should land, not rebound.
      bounciness: 0,
      speed: 14,
      useNativeDriver: true,
    }).start();

  const pan = useRef(
    PanResponder.create({
      // Only claim clearly-horizontal travel. The grid under this scrolls
      // vertically and cards are pressable, so the threshold has to be
      // decisive in both axes or it steals taps and scrolls.
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderMove: (_, g) => {
        // Asymptotic resistance: the deck can never travel past SWIPE_YIELD,
        // and approaches it ever more slowly. That ceiling tells the hand this
        // is a nudge and not a drag, without any text saying so.
        const d = g.dx;
        const eased = SWIPE_YIELD * (1 - Math.exp(-Math.abs(d) / SWIPE_YIELD));
        dragX.setValue(Math.sign(d) * eased);
      },
      onPanResponderRelease: (_, g) => {
        const { idx: i, tier } = live.current;
        // Velocity counts as intent too — a short fast flick should commit as
        // readily as a long slow push.
        const intent = g.dx < -SWIPE_COMMIT || g.vx < -0.35 ? 1 : g.dx > SWIPE_COMMIT || g.vx > 0.35 ? -1 : 0;
        const next = CATEGORIES[i + intent];
        if (intent && next) {
          if (!isCategoryUnlocked(tier, next.id)) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            onLocked();
          } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            dispatch({ type: "category", category: next.id });
          }
        }
        settle();
      },
      onPanResponderTerminate: settle,
    }),
  ).current;

  return (
    <Animated.View style={{ flex: 1, minHeight: 0, transform: [{ translateX: dragX }] }} {...pan.panHandlers}>
      {children}
    </Animated.View>
  );
}

/**
 * The rail: one segment per category, the active one lit.
 *
 * This is the "conveyance of balance and direction" the deck needs to be
 * legible — without it a swipe is an unexplained shove. It reports where you
 * are in a fixed set and which way there is more to go.
 *
 * Locked categories stay visible but dim: hiding them would misreport the size
 * of the set, and the size of the set is the one fact this element exists to
 * carry.
 */
export function CategoryRail({ onPick }: { onPick: (c: Category) => void }) {
  const { state } = useCollider();
  const idx = Math.max(0, CATEGORIES.findIndex((c) => c.id === state.activeCategory));
  const pos = useRef(new Animated.Value(idx)).current;

  useEffect(() => {
    Animated.timing(pos, { toValue: idx, duration: DUR.snap, easing: EASE.move, useNativeDriver: true }).start();
  }, [idx, pos]);

  const SEG = 18, GAP = 5, STEP = SEG + GAP;
  return (
    <View style={{ flexDirection: "row", alignSelf: "center", gap: GAP, marginBottom: 6, height: 3 }}>
      {CATEGORIES.map((c) => {
        const unlocked = isCategoryUnlocked(state.tier, c.id);
        return (
          <Pressable
            key={c.id}
            onPress={() => onPick(c.id)}
            // The segments are 3px tall; the touch target must not be.
            hitSlop={{ top: 12, bottom: 12, left: 3, right: 3 }}
            style={{
              width: SEG, height: 3, borderRadius: 2,
              backgroundColor: unlocked ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
            }}
          />
        );
      })}
      {/* The lit segment is one object that travels, not five that take turns
          lighting up — a moving thing is what makes the row read as a position
          on a track rather than five separate indicator lamps. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute", left: 0, top: 0, width: SEG, height: 3, borderRadius: 2,
          backgroundColor: "#f4f7fb",
          shadowColor: "#e6ecf4", shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
          transform: [{ translateX: Animated.multiply(pos, STEP) }],
        }}
      />
    </View>
  );
}
