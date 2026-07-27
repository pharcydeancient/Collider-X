import React, { useState } from "react";
import { View, Text, Pressable, Modal, TextInput, ScrollView, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { useCollider, type SavedAsset } from "../state";
import { useToast } from "./Toast";
import { T, fontFamilyForWeight, FONT_MONO } from "../styles/theme";

/**
 * AssetActionBar — the single action-bar TEMPLATE for every generated or
 * imported asset in the app (Pattern 4: Content + Form).
 *
 * The spec fixes the minimum action set:
 *   "action bar with minimum: view (exploded view), use as context (multiple
 *    allowed), use as source (1 only), delete, share, save to collection
 *    (in app), favorite icon, delete and anymore needed... this isn't unique.
 *    this is standard."
 *
 * It also fixes HOW to build it: "no one by one development. create an
 * element, a family, a type, and simply change its parameters." So this is one
 * component parameterised by asset kind — NOT a per-surface reimplementation.
 * Market cards, generation-column items, exploded view, and in-chat
 * deliverables all mount this same bar.
 *
 * Actions the host owns (because only the host knows the target chat/message)
 * are passed in; everything storage-related is handled here so no caller can
 * get favorites or collections subtly wrong.
 */

export type AssetActionBarProps = {
  asset: SavedAsset;
  /** Exploded / full-screen view. */
  onView?: () => void;
  /** Use as context — spec allows MULTIPLE per message. */
  onUseAsContext?: () => void;
  /** Use as source — spec allows exactly ONE per message. */
  onUseAsSource?: () => void;
  onDelete?: () => void;
  /** Hide actions that don't apply on a given surface. */
  hide?: Array<"view" | "context" | "source" | "share" | "save" | "favorite" | "delete">;
  compact?: boolean;
};

export default function AssetActionBar({
  asset, onView, onUseAsContext, onUseAsSource, onDelete, hide = [], compact = false,
}: AssetActionBarProps) {
  // toast comes from the Toast provider, not useCollider — destructuring it
  // off the collider context left it undefined, so every favorite/save
  // action here was a guaranteed TypeError at tap time.
  const { state, dispatch } = useCollider();
  const { toast } = useToast();
  const [saveOpen, setSaveOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const isFav = state.favoriteAssetIds.includes(asset.id);
  const show = (k: NonNullable<AssetActionBarProps["hide"]>[number]) => !hide.includes(k);
  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  const toggleFav = () => {
    tap();
    dispatch({ type: "toggleFavoriteAsset", asset });
    toast(isFav ? "Removed from favorites" : "Added to favorites");
  };

  const share = async () => {
    tap();
    try {
      await Share.share({ message: `${asset.prompt}\n\n${asset.url}` });
    } catch {
      toast("Couldn't open the share sheet");
    }
  };

  const saveTo = (collectionId: string, name: string) => {
    dispatch({ type: "saveToCollection", collectionId, asset });
    setSaveOpen(false);
    toast(`Saved to ${name}`);
  };

  const createAndSave = () => {
    const name = newName.trim();
    if (!name) return;
    dispatch({ type: "createCollection", name, asset });
    setNewName("");
    setSaveOpen(false);
    toast(`Saved to ${name}`);
  };

  const size = compact ? 16 : 19;
  const btn = (
    key: string, icon: keyof typeof Ionicons.glyphMap, label: string,
    onPress: () => void, active?: boolean, tint?: string
  ) => (
    <Pressable
      key={key}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        alignItems: "center",
        paddingHorizontal: compact ? 7 : 10,
        paddingVertical: 6,
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Ionicons name={icon} size={size} color={active ? (tint || "#ff6a5c") : "rgba(238,241,246,0.72)"} />
      {!compact && (
        <Text style={{ color: "rgba(238,241,246,0.5)", fontSize: 8.5, marginTop: 3, letterSpacing: 0.3, fontFamily: FONT_MONO }}>
          {label}
        </Text>
      )}
    </Pressable>
  );

  return (
    <>
      <View
        style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-around",
          borderRadius: 12, overflow: "hidden",
          borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(12,14,20,0.55)",
        }}
      >
        {show("view") && onView && btn("view", "expand-outline", "VIEW", () => { tap(); onView(); })}
        {show("context") && onUseAsContext && btn("ctx", "layers-outline", "CONTEXT", () => { tap(); onUseAsContext(); })}
        {show("source") && onUseAsSource && btn("src", "git-branch-outline", "SOURCE", () => { tap(); onUseAsSource(); })}
        {show("favorite") && btn("fav", isFav ? "heart" : "heart-outline", "FAVORITE", toggleFav, isFav)}
        {show("save") && btn("save", "albums-outline", "SAVE", () => { tap(); setSaveOpen(true); })}
        {show("share") && btn("share", "share-outline", "SHARE", share)}
        {show("delete") && onDelete && btn("del", "trash-outline", "DELETE", () => { tap(); onDelete(); })}
      </View>

      {/* Save-to-collection picker. Spec: every menu must be escapable —
          "always include a back button, an x button or a swipe away." */}
      <Modal visible={saveOpen} transparent animationType="fade" onRequestClose={() => setSaveOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setSaveOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ maxHeight: "70%" }}>
            <BlurView intensity={40} tint="dark" style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden", borderTopWidth: 1, borderColor: "rgba(255,255,255,0.13)" }}>
              <View style={{ padding: 18, paddingBottom: 30, backgroundColor: "rgba(10,12,18,0.7)" }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <Text style={{ color: T.ink, fontSize: 15, fontWeight: "800", fontFamily: fontFamilyForWeight(800) }}>
                    Save to collection
                  </Text>
                  <Pressable onPress={() => setSaveOpen(false)} hitSlop={10} accessibilityLabel="Close">
                    <Ionicons name="close" size={20} color="rgba(238,241,246,0.6)" />
                  </Pressable>
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                  <TextInput
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="New collection name"
                    placeholderTextColor="rgba(238,241,246,0.35)"
                    onSubmitEditing={createAndSave}
                    returnKeyType="done"
                    style={{
                      flex: 1, color: T.ink, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10,
                      borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
                      backgroundColor: "rgba(255,255,255,0.05)", fontFamily: fontFamilyForWeight(400),
                    }}
                  />
                  <Pressable
                    onPress={createAndSave}
                    style={{ paddingHorizontal: 16, justifyContent: "center", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)" }}
                  >
                    <Ionicons name="add" size={20} color={T.ink} />
                  </Pressable>
                </View>

                <ScrollView>
                  {state.collections.length === 0 ? (
                    <Text style={{ color: "rgba(238,241,246,0.4)", fontSize: 12, textAlign: "center", paddingVertical: 20, fontFamily: fontFamilyForWeight(400) }}>
                      No collections yet — name one above.
                    </Text>
                  ) : (
                    state.collections.map((c) => {
                      const already = c.assetIds.includes(asset.id);
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => !already && saveTo(c.id, c.name)}
                          style={{
                            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                            paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6,
                            backgroundColor: "rgba(255,255,255,0.04)", opacity: already ? 0.5 : 1,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: T.ink, fontSize: 13, fontFamily: fontFamilyForWeight(600) }}>{c.name}</Text>
                            <Text style={{ color: "rgba(238,241,246,0.4)", fontSize: 10.5, marginTop: 2, fontFamily: FONT_MONO }}>
                              {c.assetIds.length} item{c.assetIds.length === 1 ? "" : "s"}
                            </Text>
                          </View>
                          <Ionicons
                            name={already ? "checkmark-circle" : "add-circle-outline"}
                            size={20}
                            color={already ? "#7ee2a8" : "rgba(238,241,246,0.55)"}
                          />
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
