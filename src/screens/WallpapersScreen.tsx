import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ImageBackground,
  useWindowDimensions
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Video, ResizeMode } from "expo-av";
import * as Haptics from "expo-haptics";
import { useCollider } from "../state";
import { Glass } from "../components/Glass";
import { Page } from "../components/Page";
import { styles, WALLPAPERS, FREE_THEMES, PREMIUM_THEMES, withFont, fontFamilyForWeight, SCREEN_W } from "../styles/theme";
import { useToast } from "../components/Toast";
import * as player from "../services/musicPlayer";
import { IAP_PRODUCTS, purchaseProduct, verifyPurchase } from "../services/iap";

export function WallpapersScreen({ goBack }: { goBack: () => void }) {
  const { state, dispatch } = useCollider();
  const { toast } = useToast();

  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const formatTime = (ms: number) => {
    if (isNaN(ms) || ms <= 0) return "0:00";
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handlePlayStatusUpdateFor = useCallback((trackId: string) => (status: any) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis || 0);
      setDuration(status.durationMillis || 0);
      if (status.didJustFinish) {
        const activeTheme = PREMIUM_THEMES.find(theme => theme.tracks?.some(t => t.id === trackId));
        if (activeTheme && activeTheme.tracks) {
          const enabledTracks = activeTheme.tracks.filter(t => !state.musicPlayer.disabledTrackIds.includes(t.id));
          if (enabledTracks.length > 0) {
            const currentIndex = enabledTracks.findIndex(t => t.id === trackId);
            const nextIndex = (currentIndex + 1) % enabledTracks.length;
            const nextTrack = enabledTracks[nextIndex];
            if (nextTrack) {
              player.playTrack(nextTrack.id, nextTrack.url, state.musicPlayer.muted ? 0 : state.musicPlayer.volume, handlePlayStatusUpdateFor(nextTrack.id));
              dispatch({ type: "playTrack", trackId: nextTrack.id });
            }
          }
        }
      }
    }
  }, [state.musicPlayer.volume, state.musicPlayer.muted, state.musicPlayer.disabledTrackIds, dispatch]);

  useEffect(() => {
    if (state.musicPlayer.trackId && state.musicPlayer.isPlaying) {
      player.setStatusListener(handlePlayStatusUpdateFor(state.musicPlayer.trackId));
    }
  }, [state.musicPlayer.trackId, state.musicPlayer.isPlaying, handlePlayStatusUpdateFor]);

  const SELECTED_BORDER = "#e2e8f0"; // Silver/chrome — the app's active/selected accent, not a hue
  const LOCK_COLOR = "rgba(238,241,246,0.45)"; // Locked/disabled is a legitimate desaturated case, not a soft-purple one
  // Preset gradient colorscapes: a plain Pro/Elite tier perk (unrelated to
  // the per-item purchase model below, which is specifically for live video
  // wallpapers — a static gradient isn't the thing SPEC.md's individual
  // $2.99–$7.99 pricing is about).
  const canUsePremium = state.tier !== "free";

  // Live wallpapers are gated per-item by purchase, not by tier (spec: "not
  // unlocked in bulk by Pro/Elite tier alone" — each is its own $2.99–$7.99
  // purchase). This is a MOCK purchase (adds to ownedWallpaperIds locally) —
  // no real IAP is wired in. Real billing (react-native-iap, App Store/Play
  // Store product config, receipt validation) needs explicit sign-off before
  // it touches actual money; this scaffolds everything else (data model,
  // gating UI, player) so that's a drop-in swap later, not a rebuild.
  const isOwned = (id: string) => state.ownedWallpaperIds.includes(id);
  // Every live wallpaper currently bills against one non-consumable SKU.
  // When per-wallpaper SKUs exist in App Store Connect / Play Console, map
  // theme.id -> its own product id here instead.
  const WALLPAPER_SKU = IAP_PRODUCTS[2];
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  const handleSelectWallpaper = (wId: string, locked?: boolean) => {
    if (locked) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      toast("This wallpaper is locked. Upgrade or purchase to use it.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    dispatch({ type: "wallpaper", wallpaper: wId });
  };

  // Real per-item purchase. Ownership is granted only after the store confirms
  // payment and the receipt verifies — the previous version dispatched
  // ownership locally and toasted "no real charge", so every premium wallpaper
  // was free despite carrying a price.
  const handlePurchase = async (wId: string, price?: string) => {
    if (purchasingId) return;
    setPurchasingId(wId);
    try {
      const result = await purchaseProduct(WALLPAPER_SKU);
      const ok = await verifyPurchase(result);
      if (!ok) {
        toast("Could not verify that purchase. You have not been charged for access.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      dispatch({ type: "purchaseWallpaper", wallpaperId: wId });
      toast(`Unlocked for ${price || "the listed price"}.`);
    } catch (e: any) {
      const msg = e?.message === "cancelled" ? "Purchase cancelled." : e?.message || "Purchase failed.";
      toast(msg);
    } finally {
      setPurchasingId(null);
    }
  };

  const isSelected = (id: string) => state.wallpaper === id;

  // A wallpaper is a portrait surface, so a preview of one has to be portrait
  // too. These tiles were width:"47%" with a fixed height:110 — a landscape
  // crop of a phone-shaped image, and two-per-row regardless of how much room
  // there was. Column count now follows the actual width and the tile keeps a
  // phone's proportions, so what you see is what lands behind the app.
  // Measured rather than derived: Page and the ScrollView each add their own
  // inset, so any arithmetic from window width is a guess that silently costs a
  // column. onLayout reports the real content box and survives rotation.
  const { width: winW } = useWindowDimensions();
  const GUTTER = 12;
  const [gridW, setGridW] = useState(0);
  const effW = gridW || winW - 52;
  const cols = Math.max(2, Math.min(6, Math.floor(effW / 180)));
  // −2 absorbs the 1.5px selection border on the active tile, which otherwise
  // pushes the last column past the edge and collapses the row.
  const tileW = Math.floor((effW - GUTTER * (cols - 1)) / cols) - 2;

  // One browsable surface instead of three lists you scroll past each other.
  const [filter, setFilter] = useState<"all" | "gradients" | "photos" | "live">("all");
  const FILTERS: { id: typeof filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: WALLPAPERS.length + FREE_THEMES.length + PREMIUM_THEMES.length },
    { id: "gradients", label: "Gradients", count: WALLPAPERS.length },
    { id: "photos", label: "Photos", count: FREE_THEMES.length },
    { id: "live", label: "Live", count: PREMIUM_THEMES.length },
  ];
  const show = (s: typeof filter) => filter === "all" || filter === s;

  return (
    <Page title="Theme Wallpapers" goBack={goBack}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        <View onLayout={(e) => setGridW(e.nativeEvent.layout.width)} style={{ height: 0 }} />

        <View style={{ flexDirection: "row", gap: 6, paddingTop: 4, paddingBottom: 10 }}>
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setFilter(f.id); }}
                style={{
                  paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999,
                  borderWidth: 1,
                  borderColor: on ? SELECTED_BORDER : "rgba(255,255,255,0.10)",
                  backgroundColor: on ? "rgba(226,232,240,0.10)" : "transparent",
                }}
              >
                <Text style={withFont({ fontSize: 11, fontWeight: "700", color: on ? "#fff" : "rgba(238,241,246,0.55)" })}>
                  {f.label} {f.count}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Preset colorscapes ── */}
        {show("gradients") && (<>
        <View style={wallStyles.sectionHead}>
          <Text style={wallStyles.sectionLabel}>PRESET COLORSCAPES</Text>
          <Text style={wallStyles.sectionHint}>{WALLPAPERS.length} preset gradients</Text>
        </View>
        <View style={[styles.grid, { gap: GUTTER }]}>
          {WALLPAPERS.map((wall) => {
            const active = isSelected(wall.id);
            return (
              <Pressable
                key={wall.id}
                onPress={() => handleSelectWallpaper(wall.id, wall.premium && !canUsePremium)}
                style={{ width: tileW, marginBottom: 4 }}
              >
                <Glass
                  style={[
                    styles.wallTile,
                    { padding: 0, overflow: "hidden", borderRadius: 16 },
                    active && { borderColor: SELECTED_BORDER, borderWidth: 1.5, shadowColor: SELECTED_BORDER, shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 },
                  ]}
                >
                  <LinearGradient colors={wall.colors} style={StyleSheet.absoluteFill} />
                  <LinearGradient colors={["transparent", "rgba(0,0,0,0.5)"]} style={StyleSheet.absoluteFill} />
                  
                  <View style={{ position: "absolute", bottom: 8, left: 8, right: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[styles.tileName, { fontSize: 11, fontWeight: "800", fontFamily: fontFamilyForWeight(800), color: "#fff", textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }]}>{wall.name}</Text>
                    {active ? (
                      <Ionicons name="checkmark-circle" size={14} color="#e2e8f0" />
                    ) : wall.premium && !canUsePremium ? (
                      // A bare padlock states that something is withheld without
                      // saying what would release it. Naming the tier is the
                      // whole of the answer and costs one word.
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Ionicons name="lock-closed" size={10} color={LOCK_COLOR} />
                        <Text style={withFont({ fontSize: 9, fontWeight: "800", color: LOCK_COLOR })}>PRO</Text>
                      </View>
                    ) : null}
                  </View>
                </Glass>
              </Pressable>
            );
          })}
        </View>
        </>)}

        {/* ── Free image themes (drop-in) ── */}
        {show("photos") && (<>
        <View style={wallStyles.sectionHead}>
          <Text style={wallStyles.sectionLabel}>FREE STATIC IMAGES</Text>
          <Text style={wallStyles.sectionHint}>{FREE_THEMES.length} loaded</Text>
        </View>

        {FREE_THEMES.length === 0 ? (
          <Text style={localStyles.mutedHint}>Drop custom .jpg assets in your project root to show themes here.</Text>
        ) : (
          <View style={[styles.grid, { gap: GUTTER }]}>
            {FREE_THEMES.map((theme) => {
              const active = isSelected(theme.id);
              return (
                <Pressable
                  key={theme.id}
                  onPress={() => handleSelectWallpaper(theme.id, false)}
                  style={{ width: tileW, marginBottom: 4 }}
                >
                  <Glass
                    style={[
                      styles.wallTile,
                      { padding: 0, overflow: "hidden", borderRadius: 16 },
                      active && { borderColor: SELECTED_BORDER, borderWidth: 1.5 },
                    ]}
                  >
                    <ImageBackground source={theme.source} style={StyleSheet.absoluteFill} imageStyle={{ width: "100%", height: "100%" }} resizeMode="cover" />
                    <LinearGradient colors={["transparent", "rgba(0,0,0,0.6)"]} style={StyleSheet.absoluteFill} />
                    
                    <View style={{ position: "absolute", bottom: 8, left: 8, right: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={[styles.tileName, { fontSize: 11, fontWeight: "800", fontFamily: fontFamilyForWeight(800), color: "#fff", textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }]}>{theme.name}</Text>
                      {active && <Ionicons name="checkmark-circle" size={14} color="#e2e8f0" />}
                    </View>
                  </Glass>
                </Pressable>
              );
            })}
          </View>
        )}
        </>)}

        {/* ── Premium live wallpapers (individual purchase, per spec) ── */}
        {show("live") && (<>
        <View style={wallStyles.sectionHead}>
          <Text style={wallStyles.sectionLabel}>PREMIUM LIVE WALLPAPERS</Text>
          <Text style={[wallStyles.sectionHint, { color: LOCK_COLOR }]}>{PREMIUM_THEMES.length} available · own individually</Text>
        </View>

        {PREMIUM_THEMES.length === 0 ? (
          <Text style={localStyles.mutedHint}>Drop custom .mp4 files into assets/themes/premium/ to unlock video backdrops.</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {PREMIUM_THEMES.map((theme) => {
              const active = isSelected(theme.id);
              const owned = isOwned(theme.id);
              const { trackId: playingTrackId, isPlaying } = state.musicPlayer;
              return (
                <View key={theme.id}>
                  <Pressable onPress={() => handleSelectWallpaper(theme.id, !owned)}>
                    <Glass
                      style={[
                        styles.wallTile,
                        { padding: 0, overflow: "hidden", height: 130, borderRadius: 16 },
                        active && { borderColor: SELECTED_BORDER, borderWidth: 1.5 },
                        !owned && { opacity: 0.6 },
                      ]}
                    >
                      {/* The video only plays once owned and applied, so for
                          everyone deciding whether to buy it, the poster IS the
                          product shot. Without it the tile is a black rectangle
                          with a price on it. The stills already ship alongside
                          each .mp4; they were simply never wired up. */}
                      <Video
                        source={theme.source}
                        posterSource={theme.poster}
                        usePoster={!(active && owned)}
                        posterStyle={{ resizeMode: "cover", width: "100%", height: "100%" } as any}
                        rate={1.0}
                        volume={0.0}
                        isMuted
                        resizeMode={ResizeMode.COVER}
                        shouldPlay={active && owned}
                        isLooping
                        style={StyleSheet.absoluteFill}
                        videoStyle={{ width: "100%", height: "100%" } as any}
                      />
                      <LinearGradient colors={["transparent", "rgba(0,0,0,0.6)"]} style={StyleSheet.absoluteFill} />

                      <View style={wallStyles.liveBadge}>
                        <Text style={wallStyles.liveText}>● VIDEO</Text>
                      </View>

                      <View style={{ position: "absolute", bottom: 8, left: 8, right: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.tileName, { fontSize: 11, fontWeight: "800", fontFamily: fontFamilyForWeight(800), color: "#fff", textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }]}>{theme.name}</Text>
                          {!!theme.tracks?.length && (
                            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 9.5, marginTop: 1 }}>{theme.tracks.length} tracks included</Text>
                          )}
                        </View>
                        {active ? (
                          <Ionicons name="checkmark-circle" size={14} color="#e2e8f0" />
                        ) : !owned ? (
                          <Ionicons name="lock-closed" size={12} color={LOCK_COLOR} />
                        ) : null}
                      </View>
                    </Glass>
                  </Pressable>

                  {!owned ? (
                    <Pressable
                      onPress={() => handlePurchase(theme.id, theme.price)}
                      style={wallStyles.buyBtn}
                    >
                      <Ionicons name="cart-outline" size={13} color="#eef1f6" />
                      <Text style={wallStyles.buyBtnText}>Own for {theme.price || "—"}</Text>
                    </Pressable>
                  ) : !!theme.tracks?.length && (
                    <View style={wallStyles.trackList}>
                      {theme.tracks.map((track) => {
                        const isThisPlaying = playingTrackId === track.id && isPlaying;
                        const disabled = state.musicPlayer.disabledTrackIds.includes(track.id);
                        return (
                          <View key={track.id} style={[wallStyles.trackRow, { flexDirection: "column", alignItems: "stretch" }]}>
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                              <Pressable
                                onPress={() => {
                                  if (disabled) return;
                                  if (isThisPlaying) {
                                    player.pauseTrack();
                                    dispatch({ type: "pausePlayer" });
                                  } else {
                                    player.playTrack(track.id, track.url, state.musicPlayer.muted ? 0 : state.musicPlayer.volume, handlePlayStatusUpdateFor(track.id));
                                    dispatch({ type: "playTrack", trackId: track.id });
                                  }
                                }}
                                disabled={disabled}
                                style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, opacity: disabled ? 0.4 : 1 }}
                              >
                                <Ionicons name={isThisPlaying ? "pause-circle" : "play-circle"} size={20} color="#e2e8f0" />
                                <Text style={wallStyles.trackTitle}>{track.title}</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  // Disabling a track that's currently playing
                                  // must actually stop it — otherwise "off"
                                  // only changes an icon while the audio keeps
                                  // going, which isn't what toggling it off means.
                                  if (!disabled && isThisPlaying) {
                                    player.pauseTrack();
                                    dispatch({ type: "pausePlayer" });
                                  }
                                  dispatch({ type: "toggleTrackEnabled", trackId: track.id });
                                }}
                              >
                                <Ionicons name={disabled ? "eye-off-outline" : "checkmark-circle"} size={16} color={disabled ? "rgba(238,241,246,0.45)" : "#4be6b1"} />
                              </Pressable>
                            </View>

                            {isThisPlaying && duration > 0 && (
                              <View style={{ marginTop: 8, width: "100%", paddingHorizontal: 4 }}>
                                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                                  <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 9 }}>{formatTime(position)}</Text>
                                  <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 9 }}>{formatTime(duration)}</Text>
                                </View>
                                <Pressable
                                  onPress={(e) => {
                                    const width = SCREEN_W - 56;
                                    const touchX = e.nativeEvent.locationX;
                                    const pct = Math.max(0, Math.min(1, touchX / width));
                                    player.seekTo(pct * duration);
                                  }}
                                  style={{ height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, overflow: "hidden", width: "100%" }}
                                >
                                  <View style={{ height: "100%", backgroundColor: "#e2e8f0", width: `${(position / duration) * 100}%` }} />
                                </Pressable>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
        </>)}
      </ScrollView>
    </Page>
  );
}

const localStyles = StyleSheet.create({
  mutedHint: {
    color: "rgba(238,241,246,0.45)",
    fontSize: 10.5,
    textAlign: "center",
    marginVertical: 14,
    marginHorizontal: 8,
    lineHeight: 16,
  }
});

// Overriding wallStyles for AAA presentation
const wallStyles = StyleSheet.create(withFont({
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 22,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionLabel: {
    color: "rgba(238,241,246,0.5)",
    fontSize: 9.5,
    letterSpacing: 2,
    fontWeight: "900", fontFamily: fontFamilyForWeight(900),
  },
  sectionHint: {
    color: "rgba(238,241,246,0.45)",
    fontSize: 10.5,
  },
  liveBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  liveText: {
    color: "#e2e8f0",
    fontSize: 8,
    fontWeight: "900", fontFamily: fontFamilyForWeight(900),
    letterSpacing: 1,
  },
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    borderRadius: 10,
    paddingVertical: 8,
    marginTop: 6,
  },
  buyBtnText: {
    color: "#eef1f6",
    fontSize: 11.5,
    fontWeight: "800", fontFamily: fontFamilyForWeight(800),
  },
  trackList: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    marginTop: 6,
    paddingVertical: 2,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  trackTitle: {
    color: "#e8e6eb",
    fontSize: 12,
  },
}));
