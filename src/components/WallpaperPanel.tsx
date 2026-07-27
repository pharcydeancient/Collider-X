// Wallpaper picking as a panel over the app, not a place you travel to.
//
// It used to be a full screen: leave what you were doing, land somewhere that
// looks nothing like the app, choose blind from tiles the wrong shape for the
// thing they preview, then travel back to find out what you picked. Choosing a
// background is a small act and it was costing a whole context switch.
//
// This slides up over whatever is on screen and applies on tap, so the change
// happens behind the panel — the preview is the app itself, wearing it. The
// thumbnails are small and phone-shaped (1284:2778, the real asset ratio) so a
// row of them reads as a set rather than as a stack of billboards.
import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, ImageBackground, StyleSheet, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useCollider } from "../state";
import { WALLPAPERS, FREE_THEMES, PREMIUM_THEMES, withFont } from "../styles/theme";

// The assets are 1284x2778. A thumbnail that isn't this shape is showing a
// crop of the wallpaper rather than the wallpaper.
const PHONE_RATIO = 1284 / 2778;
const THUMB_W = 54;
const THUMB_H = Math.round(THUMB_W / PHONE_RATIO);

type Row = { id: string; name: string; kind: "gradient" | "photo" | "live"; colors?: any; source?: any; poster?: any; locked: boolean; price?: string };

export function WallpaperPanel({ visible, onClose, onOpenStore }: { visible: boolean; onClose: () => void; onOpenStore: () => void }) {
  const { state, dispatch } = useCollider();
  const { height: winH } = useWindowDimensions();
  const [filter, setFilter] = useState<"all" | "gradients" | "photos" | "live">("all");

  const canUsePremium = state.tier !== "free";
  const owned = (id: string) => state.ownedWallpaperIds.includes(id);

  const rows: Row[] = [
    ...WALLPAPERS.map((w: any) => ({ id: w.id, name: w.name, kind: "gradient" as const, colors: w.colors, locked: !!w.premium && !canUsePremium })),
    ...FREE_THEMES.map((t: any) => ({ id: t.id, name: t.name, kind: "photo" as const, source: t.source, locked: false })),
    ...PREMIUM_THEMES.map((t: any) => ({ id: t.id, name: t.name, kind: "live" as const, poster: t.poster, locked: !owned(t.id), price: t.price })),
  ];
  const shown = rows.filter((r) =>
    filter === "all" ? true : filter === "gradients" ? r.kind === "gradient" : filter === "photos" ? r.kind === "photo" : r.kind === "live"
  );

  const FILTERS: { id: typeof filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "gradients", label: "Gradients" },
    { id: "photos", label: "Photos" },
    { id: "live", label: "Live" },
  ];

  const pick = (r: Row) => {
    if (r.locked) {
      // Locked live wallpapers are a purchase, which is the one thing that does
      // deserve its own screen. Everything else applies in place.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      if (r.kind === "live") { onClose(); onOpenStore(); }
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    dispatch({ type: "wallpaper", wallpaper: r.id });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tapping away closes — the wallpaper behind stays whatever was last
          tapped, because each tap already applied it. */}
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View
        style={{
          maxHeight: Math.min(winH * 0.46, 400),
          backgroundColor: "rgba(11,9,16,0.985)",
          borderTopWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: 18,
        }}
      >
        <View style={{ alignItems: "center", paddingTop: 8, paddingBottom: 6 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)" }} />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 8 }}>
          <Text style={withFont({ fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 0.6 })}>BACKGROUND</Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={16} color="rgba(238,241,246,0.6)" />
          </Pressable>
        </View>

        <View style={{ height: 30 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 14, alignItems: "center" }}>
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={{
                  paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1,
                  borderColor: on ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.10)",
                  backgroundColor: on ? "rgba(255,255,255,0.14)" : "transparent",
                }}
              >
                <Text style={withFont({ fontSize: 10.5, fontWeight: "700", color: on ? "#fff" : "rgba(238,241,246,0.55)" })}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        </View>

        <ScrollView style={{ flex: 1, marginTop: 8 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 14, paddingBottom: 8 }}>
          {shown.map((r) => {
            const active = state.wallpaper === r.id;
            return (
              <Pressable key={r.id} onPress={() => pick(r)} style={{ width: THUMB_W }}>
                <View
                  style={{
                    width: THUMB_W, height: THUMB_H, borderRadius: 8, overflow: "hidden",
                    borderWidth: active ? 1.5 : 1,
                    borderColor: active ? "#e2e8f0" : "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.03)",
                  }}
                >
                  {r.kind === "gradient" ? (
                    <LinearGradient colors={r.colors} style={StyleSheet.absoluteFill} />
                  ) : (
                    <ImageBackground source={r.kind === "live" ? r.poster : r.source} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  )}
                  {r.locked && (
                    <View style={{ position: "absolute", right: 3, bottom: 3 }}>
                      <Ionicons name="lock-closed" size={9} color="rgba(255,255,255,0.8)" />
                    </View>
                  )}
                  {active && (
                    <View style={{ position: "absolute", right: 3, top: 3 }}>
                      <Ionicons name="checkmark-circle" size={11} color="#e2e8f0" />
                    </View>
                  )}
                </View>
                <Text numberOfLines={1} style={withFont({ fontSize: 8.5, color: "rgba(238,241,246,0.5)", marginTop: 3, textAlign: "center" })}>
                  {r.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
