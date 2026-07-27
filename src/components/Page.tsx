import React, { ReactNode } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styles } from "../styles/theme";
import { GlossSurface } from "./GlossSurface";

// Same chevron-back icon CardScreen's own header uses — the typographic "‹"
// glyph this used to render read as a different visual language next to
// Card view's Ionicons icon, even though the button chrome was identical.
function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.iconBtn}>
      <Ionicons name="chevron-back" size={20} color="#ffffff" />
    </Pressable>
  );
}

// Header treatment matches CardScreen's: the same gloss surface every other
// panel/header in the app uses, dissolving into the content below via a
// short gradient instead of a hard border line — keeps every "‹ Title"
// screen (History included) visually consistent with the Card view's own
// header.
// noScroll: screens that manage their own scroll surfaces (the Smart Gen
// board has horizontal columns, per-column vertical scroll, and a pinned
// chat input) get a plain flex container — nesting those inside this outer
// ScrollView breaks both scrolling and bottom-pinning.
export function Page({ title, goBack, children, noScroll }: { title: string; goBack: () => void; children?: ReactNode; noScroll?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    // Every screen shows the app's own wallpaper straight through: no scrim.
    // This used to sit under a 45% black wash, which meant the background the
    // user chose was only ever fully visible on the home screen.
    <View style={styles.flex}>
      <View style={[styles.header, { paddingTop: insets.top, height: 56 + insets.top, overflow: "hidden" }]}>
        <GlossSurface />
        <BackButton onPress={goBack} />
        <Text style={styles.pageTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      {/* The header dissolves into the content instead of ending on a line;
          it fades from the header's own glass to nothing, not from black —
          a black fade was a tint in its own right. */}
      <LinearGradient
        colors={["rgba(4,4,4,0.55)", "rgba(4,4,4,0)"]}
        style={{ height: 10, marginTop: -1 }}
        pointerEvents="none"
      />
      {noScroll ? <View style={styles.flex}>{children}</View> : <ScrollView contentContainerStyle={styles.page}>{children}</ScrollView>}
    </View>
  );
}

