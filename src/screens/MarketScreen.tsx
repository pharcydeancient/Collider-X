import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  TextInput,
  Image,
  ImageBackground,
  FlatList,
  Modal,
  Share,
  Dimensions,
  Platform,
  LayoutAnimation
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Video, ResizeMode, Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useCollider, type MarketItem, DEFAULT_MARKET_ITEMS, generateMoreMarketItems } from "../state";
import AssetActionBar from "../components/AssetActionBar";
import { GlossSurface } from "../components/GlossSurface";
import { Glass } from "../components/Glass";
import { Page } from "../components/Page";
import { styles, SCREEN_W, SCREEN_H, withFont, fontFamilyForWeight, FONT_MONO } from "../styles/theme";
import { CATEGORIES, MODELS, TIER_INFO, canUse, modelById, modelsForCategory } from "../models";
import { Picker } from "../components/Picker";
import { useToast } from "../components/Toast";
import {
  fetchMarketItems,
  publishMarketItem,
  toggleLike as toggleLikeRemote,
  fetchComments,
  addComment,
  getDeviceId,
  reportMarketItem,
  blockAuthor,
  getBlockedAuthors,
  type MarketComment,
} from "../services/market";

const MARKET_PAGE_SIZE = 20;

const COMMENT_AVATARS = ["🌌", "⚡", "🚀", "✨", "🛰️", "🌠", "🔭", "🪐"];
function avatarFor(label: string): string {
  let sum = 0;
  for (let i = 0; i < label.length; i++) sum += label.charCodeAt(i);
  return COMMENT_AVATARS[sum % COMMENT_AVATARS.length];
}
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type PrimaryTab = "discover" | "published" | "favorites" | "collections" | "my-assets";
type SortOption = "trending" | "likes" | "remixes" | "newest";

export function MarketScreen({ goBack }: { goBack: () => void }) {
  const { state, dispatch } = useCollider();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();

  // Search, Filtering & Nav States
  const [tab, setTab] = useState<PrimaryTab>("discover");
  const [activeKind, setActiveKind] = useState<MarketItem["kind"] | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("trending");

  // Detail Modal States
  const [selectedItem, setSelectedItem] = useState<MarketItem | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [itemComments, setItemComments] = useState<Record<string, MarketComment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [isParamsOpen, setIsParamsOpen] = useState(false);
  const [followedCreators, setFollowedCreators] = useState<Record<string, boolean>>({
    "@cosmic_render": true,
  });

  // Live Market Data States (Supabase-backed feed)
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [items, setItems] = useState<MarketItem[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketLoadingMore, setMarketLoadingMore] = useState(false);
  const [marketOffset, setMarketOffset] = useState(0);
  const [marketHasMore, setMarketHasMore] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  // Once the real (curated + published) feed runs dry, Discover keeps
  // scrolling forever like any real market by topping up with procedurally
  // generated items — same generator the old local-only fallback used, just
  // never capped. Published/My Assets stay real-only (they're scoped to
  // actual authored items, infinite filler would be meaningless there).
  const [realFeedExhausted, setRealFeedExhausted] = useState(false);
  const generatedCountRef = useRef(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Audio / Video playback control states
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  const [barHeights, setBarHeights] = useState<number[]>(Array(12).fill(12));

  // Publish Dialog States
  const [publishFile, setPublishFile] = useState<any | null>(null);
  const [publishPrompt, setPublishPrompt] = useState("");
  const [publishCategory, setPublishCategory] = useState<MarketItem["kind"]>("image");
  const [publishModel, setPublishModel] = useState("img/gemini-3-1-flash-image");
  const [publishTags, setPublishTags] = useState("");
  // Gate required by App Store Guideline 1.2 and Google Play's UGC policy:
  // users must affirmatively agree not to post objectionable content before
  // they can publish, every time — not just once at signup.
  const [agreedToGuidelines, setAgreedToGuidelines] = useState(false);

  // Moderation: report + block. Both policies also require an in-app way to
  // report content and block abusive users, and evidence reports get acted
  // on — reporting hides the item from this device immediately (client-side)
  // while queuing it for real review server-side (market_reports table).
  const [blockedAuthors, setBlockedAuthors] = useState<Set<string>>(new Set());
  const [reportSheetFor, setReportSheetFor] = useState<MarketItem | null>(null);

  const rotateAnim = useRef(new Animated.Value(0)).current;

  const videoUrls: Record<string, string> = {
    vid1: "https://assets.mixkit.co/videos/preview/mixkit-flying-through-a-futuristic-tunnel-with-neon-lights-42292-large.mp4",
    vid2: "https://assets.mixkit.co/videos/preview/mixkit-digital-circuit-board-background-42289-large.mp4",
    vid3: "https://assets.mixkit.co/videos/preview/mixkit-rotating-planet-earth-in-outer-space-42358-large.mp4",
    vid4: "https://assets.mixkit.co/videos/preview/mixkit-clockwork-clock-gears-moving-macro-32752-large.mp4",
  };

  const audioUrls: Record<string, string> = {
    mus1: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    mus2: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    mus3: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    mus4: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
  };

  // Tape rotation animation loop
  useEffect(() => {
    if (isPlaying) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 3500,
          useNativeDriver: true,
        })
      ).start();
    } else {
      rotateAnim.stopAnimation();
      rotateAnim.setValue(0);
    }
  }, [isPlaying]);

  const gearRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Soundwave equalizer fluctuations
  useEffect(() => {
    let timer: any;
    if (isPlaying) {
      timer = setInterval(() => {
        setBarHeights(Array(12).fill(0).map(() => Math.floor(Math.random() * 32) + 6));
      }, 100);
    } else {
      setBarHeights(Array(12).fill(10));
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  // Audio Playback Controller
  const playAudio = async (id: string) => {
    try {
      if (sound) {
        await sound.unloadAsync();
      }
      // No stand-in track. This fell back to a fixed stock song, so tapping
      // play on an item with no audio played someone else's music as if it
      // were that creation.
      const uri = audioUrls[id] || selectedItem?.url;
      if (!uri) {
        toast("That creation has no audio to play.");
        return;
      }
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, isLooping: true }
      );
      setSound(newSound);
      setIsPlaying(true);
      
      newSound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded && status.isPlaying) {
          setPlayProgress((status.positionMillis / (status.durationMillis || 1)) * 100);
        }
      });
    } catch (err) {
      console.log("Audio load error:", err);
    }
  };

  const stopAudio = async () => {
    if (sound) {
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch (e) {}
      setSound(null);
      setIsPlaying(false);
      setPlayProgress(0);
    }
  };

  useEffect(() => {
    if (selectedItem && selectedItem.kind === "audio") {
      playAudio(selectedItem.id);
    }
    return () => {
      stopAudio();
    };
  }, [selectedItem]);

  // Load the real comment thread for whichever item is open in the detail modal.
  useEffect(() => {
    if (!selectedItem) return;
    let cancelled = false;
    setCommentsLoading(true);
    fetchComments(selectedItem.id)
      .then((rows) => {
        if (!cancelled) setItemComments((prev) => ({ ...prev, [selectedItem.id]: rows }));
      })
      .catch((err) => console.log("fetchComments failed:", err))
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedItem?.id]);

  // Resolve/generate the stable per-install device id used as a pseudo
  // author-id for likes/comments/publishing (no real auth system yet).
  useEffect(() => {
    getDeviceId().then((id) => {
      setDeviceId(id);
      getBlockedAuthors(id)
        .then((authors) => setBlockedAuthors(new Set(authors)))
        .catch((err) => console.log("getBlockedAuthors failed:", err));
    });
  }, []);

  const handleReport = async (item: MarketItem, reason: string) => {
    if (!deviceId) return;
    try {
      await reportMarketItem(item.id, deviceId, reason, item.author);
      // Hide locally right away — the 24h response-time requirement is about
      // the report being actioned, and an immediate local hide plus a queued
      // server-side row is the correct minimum here since there's no backend
      // moderation team wired up yet.
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setReportSheetFor(null);
      setSelectedItem(null);
      toast("Reported — thanks. We review flagged content within 24 hours.");
    } catch (err) {
      console.log("report failed:", err);
      toast("Couldn't submit report — try again");
    }
  };

  const handleBlockAuthor = async (author: string) => {
    if (!deviceId || author === "@you") return;
    try {
      await blockAuthor(deviceId, author);
      setBlockedAuthors((prev) => new Set(prev).add(author));
      setSelectedItem(null);
      toast(`Blocked ${author} — you won't see their posts anymore.`);
    } catch (err) {
      console.log("block failed:", err);
      toast("Couldn't block — try again");
    }
  };

  // Debounce the search box so we don't hit Supabase on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const genMore = (n: number) => {
    let pool = generateMoreMarketItems(n, generatedCountRef.current);
    generatedCountRef.current += n;
    if (activeKind !== "all") pool = pool.filter((i) => i.kind === activeKind);
    if (debouncedSearch.trim()) {
      const term = debouncedSearch.toLowerCase().trim();
      pool = pool.filter((i) => i.prompt.toLowerCase().includes(term) || i.author.toLowerCase().includes(term));
    }
    return pool;
  };

  const loadMarketPage = async (reset: boolean) => {
    if (!deviceId) return;
    if (reset) { setMarketLoading(true); setRealFeedExhausted(false); generatedCountRef.current = 0; }
    else setMarketLoadingMore(true);
    try {
      // Discover, once the real feed is exhausted, tops up with generated
      // items forever instead of stopping — Published/My Assets never do
      // this since they're scoped to actually-authored items.
      if (!reset && realFeedExhausted && tab === "discover") {
        const generated = genMore(MARKET_PAGE_SIZE);
        setItems((prev) => [...prev, ...generated]);
        setMarketHasMore(true);
        setUsingFallback(false);
        return;
      }

      const nextOffset = reset ? 0 : marketOffset;
      const { items: fetched, hasMore } = await fetchMarketItems({
        offset: nextOffset,
        limit: MARKET_PAGE_SIZE,
        kind: activeKind,
        search: debouncedSearch,
        sortBy,
        deviceId,
        authorOnly: tab === "published" ? "@you" : undefined,
      });
      setItems((prev) => (reset ? fetched : [...prev, ...fetched]));
      setMarketOffset(nextOffset + fetched.length);
      if (!hasMore && tab === "discover") {
        setRealFeedExhausted(true);
        setMarketHasMore(true); // generated filler picks up next page
      } else {
        setMarketHasMore(hasMore);
      }
      setUsingFallback(false);
    } catch (err) {
      console.log("Market fetch error:", err);
      // Implement robust local fallback filtering & paging using state.marketItems (100+ items)
      const localFiltered = state.marketItems.filter((item) => {
        // Tab filter
        if (tab === "published" && item.author !== "@you") return false;
        // Favorites is a view over the app-wide favorite registry, not a
        // separate feed — an item favorited from a generation result and one
        // favorited in the Market are the same thing.
        if (tab === "favorites" && !state.favoriteAssetIds.includes(item.id)) return false;
        // Kind filter
        if (activeKind !== "all" && item.kind !== activeKind) return false;
        // Search query filter
        if (debouncedSearch && debouncedSearch.trim()) {
          const term = debouncedSearch.toLowerCase().trim();
          const matchesPrompt = item.prompt.toLowerCase().includes(term);
          const matchesAuthor = item.author.toLowerCase().includes(term);
          if (!matchesPrompt && !matchesAuthor) return false;
        }
        return true;
      });

      // Sort local items
      const sorted = [...localFiltered].sort((a, b) => {
        if (sortBy === "newest") return b.id.localeCompare(a.id); // Simple fallback sort order
        return b.likes - a.likes; // Default sort by likes / trending
      });

      const nextOffset = reset ? 0 : marketOffset;
      const sliced = sorted.slice(nextOffset, nextOffset + MARKET_PAGE_SIZE);

      // Fires on every failed load, not just the initial/reset one — a
      // pagination failure mid-scroll used to fail this same way with zero
      // visible signal (usingFallback was set but never rendered anywhere).
      toast(reset ? "Showing offline sample data" : "Live feed unavailable — showing cached results");

      // Same infinite top-up once the local sample set itself runs dry.
      let page = sliced;
      if (page.length < MARKET_PAGE_SIZE && tab === "discover") {
        page = [...page, ...genMore(MARKET_PAGE_SIZE - page.length)];
      }
      setItems((prev) => (reset ? page : [...prev, ...page]));
      setMarketOffset(nextOffset + sliced.length);
      setMarketHasMore(tab === "discover" ? true : nextOffset + sliced.length < sorted.length);
      setUsingFallback(true);
    } finally {
      setMarketLoading(false);
      setMarketLoadingMore(false);
    }
  };

  // Reload the feed whenever the active filters/tab change (server-side
  // kind/search/sort/author filtering — only the #tag pills stay client-side).
  useEffect(() => {
    if (!deviceId) return;
    loadMarketPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, tab, activeKind, debouncedSearch, sortBy]);

  const toggleLike = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!deviceId) return;
    const target = items.find((i) => i.id === id);
    if (!target) return;
    const wasLiked = !!target.likedByUser;
    const delta = wasLiked ? -1 : 1;

    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, likedByUser: !wasLiked, likes: Math.max(0, i.likes + delta) } : i)));
    setSelectedItem((prev) => (prev && prev.id === id ? { ...prev, likedByUser: !wasLiked, likes: Math.max(0, prev.likes + delta) } : prev));

    try {
      await toggleLikeRemote(id, deviceId, wasLiked);
    } catch (err) {
      console.log("toggleLike failed:", err);
      // Roll back the optimistic update.
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, likedByUser: wasLiked, likes: Math.max(0, i.likes - delta) } : i)));
      setSelectedItem((prev) => (prev && prev.id === id ? { ...prev, likedByUser: wasLiked, likes: Math.max(0, prev.likes - delta) } : prev));
      toast("Couldn't update like — try again");
    }
  };

  const handleScroll = (event: any) => {
    if (tab === "my-assets") return;
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 200;
    if (isCloseToBottom && marketHasMore && !marketLoading && !marketLoadingMore) {
      loadMarketPage(false);
    }
  };

  const handleShare = (item: MarketItem) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Share.share({
      message: `Check out this creation on Collider: "${item.prompt}" by ${item.author}`,
      url: `https://collider.ai/creation/${item.id}`,
    }).catch(() => {});
  };

  const handleDownload = (item: MarketItem) => {
    // Save the real asset or say there isn't one. This used to substitute a
    // picsum stock photo whenever the URL was missing — and for image items it
    // never even read item.url, so every image "download" handed the user a
    // stranger's photograph named market-<id>.png. It also announced success
    // before doing any work, and gave video and audio a .png extension.
    const url = item.kind === "video" ? videoUrls[item.id]
      : item.kind === "audio" ? audioUrls[item.id]
      : item.url;
    if (!url) {
      toast("That creation has no file to save.");
      return;
    }
    const ext = item.kind === "video" ? "mp4" : item.kind === "audio" ? "mp3" : "png";
    dispatch({
      type: "file",
      file: { name: `market-${item.id}.${ext}`, kind: "generated", url },
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast(`Saved: ${item.prompt.slice(0, 20)}`);
  };

  const handleRemix = (item: MarketItem) => {
    const cat = item.kind === "coding" ? "coding" : item.kind === "audio" ? "audio" : item.kind === "video" ? "video" : "image";
    dispatch({ type: "category", category: cat });
    
    if (!state.selectedModelIds[cat].includes(item.model)) {
      dispatch({ type: "toggleModel", category: cat, modelId: item.model });
    }
    dispatch({ type: "cardPrompt", category: cat, modelId: item.model, value: item.prompt });
    setSelectedItem(null);
    goBack();
  };

  const handleUse = (item: MarketItem) => {
    const cat = item.kind === "coding" ? "coding" : item.kind === "audio" ? "audio" : item.kind === "video" ? "video" : "image";
    dispatch({ type: "category", category: cat });
    setSelectedItem(null);
    goBack();
  };

  const handleFollowToggle = (author: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setFollowedCreators(prev => ({
      ...prev,
      [author]: !prev[author]
    }));
  };

  const handleAddComment = async () => {
    if (!newCommentText.trim() || !selectedItem || !deviceId) return;
    const content = newCommentText.trim();
    setNewCommentText("");
    try {
      const row = await addComment(selectedItem.id, deviceId, "@you", content);
      setItemComments((prev) => ({
        ...prev,
        [selectedItem.id]: [...(prev[selectedItem.id] || []), row],
      }));
    } catch (err) {
      console.log("addComment failed:", err);
      toast("Couldn't post comment — try again");
      setNewCommentText(content);
    }
  };

  const handleOpenPublish = (file: any) => {
    setPublishFile(file);
    setPublishPrompt(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
    
    // Guess category from file name
    let cat: MarketItem["kind"] = "image";
    if (file.name.includes("audio") || file.name.includes("audio") || file.name.includes(".mp3")) {
      cat = "audio";
    } else if (file.name.includes("video") || file.name.includes(".mp4")) {
      cat = "video";
    } else if (file.name.includes("code") || file.name.includes(".json") || file.name.includes(".txt")) {
      cat = "coding";
    }
    setPublishCategory(cat);
    
    const catModels = modelsForCategory(cat === "coding" ? "coding" : cat === "audio" ? "audio" : cat === "video" ? "video" : "image");
    setPublishModel(catModels[0]?.label || "Flux Schnell");
    setPublishTags("");
    setAgreedToGuidelines(false);
  };

  const handleConfirmPublish = async () => {
    if (!publishPrompt.trim() || !publishFile) return;

    try {
      let finalPrompt = publishPrompt.trim();
      if (publishTags.trim()) {
        const hashtags = publishTags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .map((t) => (t.startsWith("#") ? t : `#${t}`))
          .join(" ");
        if (hashtags) {
          finalPrompt = `${finalPrompt} ${hashtags}`;
        }
      }

      const created = await publishMarketItem({
        kind: publishCategory,
        prompt: finalPrompt,
        model: publishModel,
        author: "@you",
        url: publishFile.url,
      });
      setItems((prev) => [created, ...prev]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPublishFile(null);
      setTab("discover");
      setActiveKind("all");
    } catch (err) {
      console.log("publish failed:", err);
      toast("Couldn't publish — try again");
    }
  };

  const sortedItems = items.filter((i) => !blockedAuthors.has(i.author));

  const moreLikeThis = useMemo(() => {
    if (!selectedItem) return [];
    const real = items.filter((i) => {
      if (i.id === selectedItem.id) return false;
      return selectedItem.category ? i.category === selectedItem.category : i.kind === selectedItem.kind;
    });
    const needed = 8 - real.length;
    const generated = needed > 0
      ? generateMoreMarketItems(needed, 50000 + Math.floor(Math.random() * 50000), selectedItem.category, selectedItem.kind)
      : [];
    return [...real.slice(0, 8), ...generated];
  }, [selectedItem?.id, items]);

  return (
    <Page title="Discover Market" goBack={goBack}>
      {/* Cancels Page's own 14px scroll padding so the showcase grid below
          can run truly edge to edge — the tab bar and filters row add their
          own inset back so only the grid touches the screen edges. */}
      <View style={{ flex: 1, backgroundColor: "#07080b", marginHorizontal: -14 }}>

        {/* Same pill/chip tab convention as every other segmented control in
            the app (History's Conversations/Consensus switcher, CardScreen's
            sub-tab tray, Files' nav tabs) — this was previously an underline
            style found nowhere else in the app. */}
        <View style={localStyles.tabContainer}>
          <View style={{ flexDirection: "row", flex: 1, gap: 4, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 3, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
            {(["discover", "published", "favorites", "collections", "my-assets"] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setTab(t);
                }}
                style={[localStyles.navTab, tab === t && localStyles.navTabActive]}
              >
                <Text style={[localStyles.navTabText, tab === t && localStyles.navTabTextActive]}>
                  {t === "my-assets" ? "MY ASSETS" : t.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
          {tab !== "my-assets" && tab !== "collections" && (
            <Pressable
              onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSearchOpen((v) => !v); }}
              style={localStyles.sideSearchBtn}
            >
              <Ionicons name={searchOpen ? "close" : "search"} size={16} color="#fff" />
            </Pressable>
          )}
        </View>

        {tab === "collections" ? (
          <CollectionsPane />
        ) : tab !== "my-assets" ? (
          <>
            {searchOpen && (
              <View style={localStyles.searchBox}>
                <View style={localStyles.searchInner}>
                  <Ionicons name="search" size={14} color="rgba(255,255,255,0.4)" style={{ marginRight: 8 }} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search prompts, creators, or models..."
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    style={localStyles.searchInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                  {searchQuery.length > 0 && (
                    <Pressable onPress={() => setSearchQuery("")} style={{ padding: 4 }}>
                      <Ionicons name="close-circle" size={14} color="rgba(255,255,255,0.5)" />
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            {/* Kind filter — compact icon row, no verbose pills/dropdown */}
            <View style={localStyles.filtersRow}>
              {(["all", "image", "video", "audio", "coding"] as const).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setActiveKind(k)}
                  style={[localStyles.kindPill, activeKind === k && localStyles.kindPillActive]}
                >
                  <Text style={[localStyles.kindText, activeKind === k && localStyles.kindTextActive]}>
                    {k === "all" ? "All" : k === "coding" ? "Coding" : k.charAt(0).toUpperCase() + k.slice(1) + "s"}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setSortBy((s) => (s === "trending" ? "newest" : s === "newest" ? "likes" : "trending"))}
                style={localStyles.sortIconBtn}
              >
                <Ionicons name={sortBy === "newest" ? "time-outline" : sortBy === "likes" ? "heart-outline" : "flame-outline"} size={13} color="#fff" />
              </Pressable>
            </View>

            <View style={{ paddingHorizontal: 12, marginBottom: 8 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 12 }}>
                {["all", "#cyberpunk", "#3d", "#ambient", "#lofi", "#react", "#rust", "#finance", "#legal"].map((t) => {
                  const isSelected = (t === "all" && !searchQuery.startsWith("#")) || searchQuery === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        setSearchQuery(t === "all" ? "" : t);
                        if (t !== "all") setSearchOpen(true);
                      }}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                        backgroundColor: isSelected ? "#ffffff" : "rgba(255,255,255,0.05)",
                        borderWidth: 1,
                        borderColor: isSelected ? "#ffffff" : "rgba(255,255,255,0.08)",
                      }}
                    >
                      <Text style={{ fontSize: 9.5, fontWeight: "800", fontFamily: fontFamilyForWeight(800), color: isSelected ? "#000000" : "rgba(238,241,246,0.5)" }}>
                        {t.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Showcase grid — edge to edge, no outer gutter, hairline gaps
                between tiles only. This is what made it read "cartoony"
                before: a 12px gutter on every side plus 12px between tiles
                made images feel like stickers instead of a photo grid. */}
            {usingFallback && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Ionicons name="cloud-offline-outline" size={14} color="#ef4444" />
                <Text style={{ color: "#ef4444", fontSize: 11, fontWeight: "700", fontFamily: fontFamilyForWeight(700) }}>
                  Live feed unavailable — showing cached results
                </Text>
              </View>
            )}
            <ScrollView
              onScroll={handleScroll}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {marketLoading && sortedItems.length === 0 ? (
                <View style={{ paddingVertical: 80, alignItems: "center" }}>
                  <Ionicons name="sparkles-outline" size={32} color="rgba(255,255,255,0.15)" style={{ marginBottom: 12 }} />
                  <Text style={styles.muted}>Loading creations…</Text>
                </View>
              ) : sortedItems.length === 0 ? (
                <View style={{ paddingVertical: 80, alignItems: "center" }}>
                  <Ionicons name="sparkles-outline" size={32} color="rgba(255,255,255,0.15)" style={{ marginBottom: 12 }} />
                  <Text style={styles.muted}>No creations found matching parameters.</Text>
                </View>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {sortedItems.map((item) => {
                    const isLiked = !!item.likedByUser;
                    // No stand-in art. An item with no image renders as the
                    // bare tile — the kind badge and prompt already say what it
                    // is, and a stock photo here was indistinguishable from
                    // someone's actual creation.
                    const imgUrl = item.url || null;

                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => setSelectedItem(item)}
                        style={{ width: "50%", padding: 1 }}
                      >
                        <Glass style={[styles.marketTile, { padding: 0, overflow: "hidden", height: 220, borderRadius: 0, borderWidth: 0 }]}>
                          {imgUrl ? (
                            <ImageBackground source={{ uri: imgUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                          ) : null}
                          <LinearGradient
                            colors={["transparent", "rgba(7,4,13,0.95)"]}
                            style={StyleSheet.absoluteFill}
                          />

                          {/* Kind badge indicator icon top-left */}
                          <View style={localStyles.badgeContainer}>
                            <Ionicons 
                              name={item.kind === "video" ? "play" : item.kind === "audio" ? "musical-notes" : item.kind === "coding" ? "code-slash" : "image"} 
                              size={8} 
                              color="#fff" 
                              style={{ marginRight: 2 }}
                            />
                            <Text style={{ color: "#fff", fontSize: 8, fontWeight: "900", fontFamily: fontFamilyForWeight(900), textTransform: "uppercase" }}>{item.kind}</Text>
                          </View>

                          {/* Footer information overlay */}
                          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 10 }}>
                            <Text style={[styles.bodyText, { fontSize: 11, fontWeight: "600", fontFamily: fontFamilyForWeight(600) }]} numberOfLines={2}>
                              {item.prompt}
                            </Text>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6, alignItems: "center" }}>
                              <Text style={[styles.muted, { fontSize: 10 }]}>{item.author}</Text>
                              <Pressable
                                hitSlop={8}
                                onPress={() => toggleLike(item.id)}
                                style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" }}
                              >
                                <Ionicons name={isLiked ? "heart" : "heart-outline"} size={10} color={isLiked ? "#ef4444" : "rgba(238,241,246,0.45)"} />
                                <Text style={[styles.muted, { fontSize: 9, fontWeight: "700", fontFamily: fontFamilyForWeight(700) }, isLiked && { color: "#ef4444" }]}>{item.likes}</Text>
                              </Pressable>
                            </View>
                          </View>
                        </Glass>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {marketLoadingMore && (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <Text style={styles.muted}>Loading more…</Text>
                </View>
              )}
            </ScrollView>
          </>
        ) : (
          /* User files library publishing flow */
          <View style={{ flex: 1, paddingHorizontal: 12 }}>
            {state.files.length === 0 ? (
              <View style={localStyles.emptyFileState}>
                <Ionicons name="document-text-outline" size={36} color="rgba(255,255,255,0.2)" style={{ marginBottom: 12 }} />
                <Text style={[styles.textStrong, { fontSize: 13, marginBottom: 2 }]}>No generated files in vault</Text>
                <Text style={[styles.muted, { fontSize: 11, textAlign: "center", marginBottom: 20, maxWidth: 220 }]}>Generate images, code or audio inside workspace to publish them here.</Text>

                <Pressable onPress={goBack} style={localStyles.mockButtonSecondary}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800", fontFamily: fontFamilyForWeight(800) }}>Go to Workspace</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={{ marginVertical: 8 }}>
                  <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 10, fontWeight: "800", fontFamily: fontFamilyForWeight(800), letterSpacing: 1.5 }}>TAP FILE TO PUBLISH</Text>
                </View>

                <FlatList
                  data={state.files}
                  keyExtractor={(f) => f.id}
                  numColumns={2}
                  columnWrapperStyle={{ justifyContent: "space-between", marginBottom: 12 }}
                  renderItem={({ item: f }) => {
                    const isImg = f.name.endsWith(".png") || f.name.endsWith(".jpg") || f.url.startsWith("http");
                    return (
                      <Pressable onPress={() => handleOpenPublish(f)} style={{ width: "48%" }}>
                        <Glass style={{ borderRadius: 16, overflow: "hidden", height: 180, borderColor: "rgba(255,255,255,0.08)" }}>
                          {isImg ? (
                            <ImageBackground source={{ uri: f.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                          ) : (
                            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" }}>
                              <Ionicons name="document-text" size={32} color="rgba(255,255,255,0.3)" />
                            </View>
                          )}
                          <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={StyleSheet.absoluteFill} />
                          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 8 }}>
                            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", fontFamily: fontFamilyForWeight(700) }} numberOfLines={1}>{f.name}</Text>
                            <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 8, textTransform: "uppercase", marginTop: 2 }}>{f.kind} file</Text>
                          </View>
                        </Glass>
                      </Pressable>
                    );
                  }}
                />
              </>
            )}
          </View>
        )}
      </View>

      {/* Asset Previewer Modal Sheet */}
      {selectedItem && (
        <Modal transparent visible={!!selectedItem} animationType="fade" onRequestClose={() => setSelectedItem(null)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setSelectedItem(null)}>
            <View style={[styles.editSheet, { width: SCREEN_W - 24, maxHeight: "92%", padding: 0, borderRadius: 24, overflow: "hidden" }]} onStartShouldSetResponder={() => true}>
              <GlossSurface borderRadius={24} />
              {/* Header Title */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)", padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="sparkles" size={14} color="#ffffff" />
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900), letterSpacing: 1.5 }}>MARKET PREVIEW</Text>
                </View>
                <Pressable onPress={() => setSelectedItem(null)} style={{ padding: 4, width: 28, height: 28, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14 }}>
                  <Ionicons name="close" size={16} color="#fff" />
                </Pressable>
              </View>

              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                
                {/* Media Presentation Box */}
                <View style={{ height: SCREEN_W - 48, width: "100%", position: "relative", backgroundColor: "#07040a" }}>
                  {/* Video loop render */}
                  {selectedItem.kind === "video" ? (
                    <View style={{ flex: 1 }}>
                      <Video
                        source={{ uri: selectedItem.url || videoUrls[selectedItem.id] || "https://assets.mixkit.co/videos/preview/mixkit-flying-through-a-futuristic-tunnel-with-neon-lights-42292-large.mp4" }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode={ResizeMode.CONTAIN}
                        shouldPlay={isPlaying}
                        isLooping
                        useNativeControls={false}
                        onPlaybackStatusUpdate={(status: any) => {
                          if (status.isLoaded) {
                            setPlayProgress((status.positionMillis / (status.durationMillis || 1)) * 100);
                          }
                        }}
                      />
                      
                      {/* Play overlay button */}
                      {!isPlaying && (
                        <Pressable 
                          onPress={() => setIsPlaying(true)}
                          style={{ position: "absolute", alignSelf: "center", top: "40%", padding: 12, backgroundColor: "rgba(0, 0, 0, 0.6)", borderRadius: 30, width: 48, height: 48, alignItems: "center", justifyContent: "center", borderColor: "#fff", borderWidth: 1 }}
                        >
                          <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 3 }} />
                        </Pressable>
                      )}

                      {/* Video control bars */}
                      <View style={localStyles.mediaControlBar}>
                        <Pressable onPress={() => setIsPlaying(!isPlaying)} style={{ padding: 4 }}>
                          <Ionicons name={isPlaying ? "pause" : "play"} size={13} color="#fff" />
                        </Pressable>
                        <View style={{ flex: 1, height: 3, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
                          <View style={{ width: `${playProgress}%`, height: "100%", backgroundColor: "#ffffff" }} />
                        </View>
                        <Text style={{ color: "#fff", fontSize: 8, fontFamily: "monospace" }}>0:{Math.floor(playProgress * 0.18).toString().padStart(2, "0")}</Text>
                      </View>
                    </View>
                  ) : selectedItem.kind === "audio" ? (
                    /* Music cassette animated visualizer */
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0c10", padding: 16 }}>
                      {/* Cassette Plate Shell */}
                      <View style={localStyles.cassetteShell}>
                        {/* Sticker label */}
                        <LinearGradient colors={["#8a8a8a", "#e2e8f0"]} style={localStyles.cassetteSticker}>
                          <Text style={localStyles.cassetteTitle} numberOfLines={1}>COLLIDER AUDIO MIX</Text>
                        </LinearGradient>
                        
                        {/* Cutout window */}
                        <View style={localStyles.cassetteCutout}>
                          <View style={{ flexDirection: "row", gap: 28, alignItems: "center" }}>
                            {/* Left spinning wheel */}
                            <Animated.View style={{ transform: [{ rotate: gearRotation }] }}>
                              <View style={localStyles.cassetteGear}>
                                <View style={[localStyles.gearSpoke, { transform: [{ rotate: "0deg" }] }]} />
                                <View style={[localStyles.gearSpoke, { transform: [{ rotate: "60deg" }] }]} />
                                <View style={[localStyles.gearSpoke, { transform: [{ rotate: "120deg" }] }]} />
                                <View style={localStyles.gearCenter} />
                              </View>
                            </Animated.View>

                            {/* Right spinning wheel */}
                            <Animated.View style={{ transform: [{ rotate: gearRotation }] }}>
                              <View style={localStyles.cassetteGear}>
                                <View style={[localStyles.gearSpoke, { transform: [{ rotate: "30deg" }] }]} />
                                <View style={[localStyles.gearSpoke, { transform: [{ rotate: "90deg" }] }]} />
                                <View style={[localStyles.gearSpoke, { transform: [{ rotate: "150deg" }] }]} />
                                <View style={localStyles.gearCenter} />
                              </View>
                            </Animated.View>
                          </View>
                        </View>
                      </View>

                      {/* Equalizer soundwave bounces */}
                      <View style={localStyles.eqRow}>
                        {barHeights.map((h, i) => (
                          <View key={i} style={[localStyles.eqBar, { height: h }]} />
                        ))}
                      </View>

                      {/* Audio Controls */}
                      <View style={localStyles.mediaControlBar}>
                        <Pressable onPress={() => setIsPlaying(!isPlaying)} style={{ padding: 4 }}>
                          <Ionicons name={isPlaying ? "pause" : "play"} size={13} color="#fff" />
                        </Pressable>
                        <View style={{ flex: 1, height: 3, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
                          <View style={{ width: `${playProgress}%`, height: "100%", backgroundColor: "#ffffff" }} />
                        </View>
                        <Text style={{ color: "#fff", fontSize: 8, fontFamily: "monospace" }}>0:{Math.floor(playProgress * 1.8).toString().padStart(2, "0")}</Text>
                      </View>
                    </View>
                  ) : selectedItem.kind === "coding" ? (
                    /* Preset coding terminal board */
                    <View style={{ flex: 1, backgroundColor: "#120f18", padding: 14 }}>
                      <View style={{ flexDirection: "row", gap: 4, marginBottom: 8, alignItems: "center" }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#ef4444" }} />
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#eab308" }} />
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" }} />
                        <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 8, fontFamily: "monospace", marginLeft: 4 }}>preset.json // System Config</Text>
                      </View>
                      <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={{ color: "#47c8a6", fontSize: 10.5, lineHeight: 15, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
                          {`{\n  "model": "${selectedItem.model}",\n  "system_instruction": "${selectedItem.prompt}",\n  "parameters": {\n    "temperature": 0.7,\n    "top_p": 0.95,\n    "frequency_penalty": 0.1\n  }\n}`}
                        </Text>
                      </ScrollView>
                    </View>
                  ) : (
                    selectedItem.url ? (
                      <ImageBackground
                        source={{ uri: selectedItem.url }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <Ionicons name="image-outline" size={28} color="rgba(255,255,255,0.18)" />
                        <Text style={styles.muted}>No preview for this creation.</Text>
                      </View>
                    )
                  )}
                  
                  {/* Category overlay label */}
                  <View style={{ position: "absolute", top: 12, left: 12, backgroundColor: "rgba(0,0,0,0.65)", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
                    <Ionicons name="sparkles" size={8} color="#ffffff" />
                    <Text style={{ color: "#fff", fontSize: 8, fontWeight: "900", fontFamily: fontFamilyForWeight(900), letterSpacing: 0.5 }}>{selectedItem.kind.toUpperCase()}</Text>
                  </View>
                </View>

                {/* Sidebar details */}
                <View style={{ padding: 14, gap: 12 }}>
                  {/* Creator details follow card */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
                        <Text style={{ fontSize: 12 }}>🤖</Text>
                      </View>
                      <View>
                        <Text style={[styles.textStrong, { fontSize: 12.5 }]}>{selectedItem.author}</Text>
                        <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 9 }}>AI Creator</Text>
                      </View>
                    </View>
                    {selectedItem.author !== "@you" && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Pressable onPress={() => handleBlockAuthor(selectedItem.author)} hitSlop={8}>
                          <Ionicons name="ban-outline" size={15} color="rgba(238,241,246,0.45)" />
                        </Pressable>
                        <Pressable
                          onPress={() => handleFollowToggle(selectedItem.author)}
                          style={[
                            localStyles.followButton,
                            followedCreators[selectedItem.author] && localStyles.followButtonActive
                          ]}
                        >
                          <Text style={[
                            localStyles.followButtonText,
                            followedCreators[selectedItem.author] && localStyles.followButtonTextActive
                          ]}>
                            {followedCreators[selectedItem.author] ? "Following" : "Follow"}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>

                  {/* Core Prompt Box */}
                  <View style={localStyles.promptCard}>
                    <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 8, fontWeight: "900", fontFamily: fontFamilyForWeight(900), letterSpacing: 1.5, marginBottom: 4 }}>PROMPT</Text>
                    <Text style={{ color: "#fff", fontSize: 12.5, lineHeight: 18, fontWeight: "500" }} selectable>{selectedItem.prompt}</Text>
                  </View>

                  {/* Parameters sheet list */}
                  <View style={localStyles.paramsCard}>
                    <Pressable 
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setIsParamsOpen(!isParamsOpen);
                      }}
                      style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                    >
                      <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 9, fontWeight: "900", fontFamily: fontFamilyForWeight(900), letterSpacing: 1.2 }}>SETTINGS & CONFIG</Text>
                      <Ionicons name={isParamsOpen ? "chevron-up" : "chevron-down"} size={10} color="rgba(238,241,246,0.45)" />
                    </Pressable>

                    {isParamsOpen && (
                      <View style={{ marginTop: 10, gap: 6, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)", paddingTop: 8 }}>
                        <View style={localStyles.paramRow}>
                          <Text style={localStyles.paramLabel}>Creator Model</Text>
                          <Text style={localStyles.paramValue}>{selectedItem.model}</Text>
                        </View>
                        <View style={localStyles.paramRow}>
                          <Text style={localStyles.paramLabel}>Aspect Ratio</Text>
                          <Text style={localStyles.paramValue}>{selectedItem.kind === "video" ? "16:9" : selectedItem.kind === "image" ? "1:1" : "N/A"}</Text>
                        </View>
                        <View style={localStyles.paramRow}>
                          <Text style={localStyles.paramLabel}>CFG Guidance</Text>
                          <Text style={[localStyles.paramValue, { color: "#ffffff" }]}>7.5</Text>
                        </View>
                        <View style={localStyles.paramRow}>
                          <Text style={localStyles.paramLabel}>Steps</Text>
                          <Text style={localStyles.paramValue}>30</Text>
                        </View>
                        <View style={localStyles.paramRow}>
                          <Text style={localStyles.paramLabel}>Seed</Text>
                          <Text style={[localStyles.paramValue, { color: "#ffffff" }]}>{selectedItem.id.replace(/\D/g, '') || "582910398"}</Text>
                        </View>
                      </View>
                    )}
                  </View>

                  {/* More like this — branches off the open item instead of
                      just continuing the flat feed. Real items already in
                      the loaded feed come first (same category, or same
                      kind if the item has no category); generated items
                      from the same category top up the row so it's never
                      thin, same trick real markets use for "related". */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 9, fontWeight: "900", fontFamily: fontFamilyForWeight(900), letterSpacing: 1.2 }}>MORE LIKE THIS</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {moreLikeThis.map((rel) => {
                        const relImg = rel.kind === "image" ? rel.url : null;
                        return (
                          <Pressable key={rel.id} onPress={() => setSelectedItem(rel)} style={{ width: 96 }}>
                            <View style={{ width: 96, height: 96, borderRadius: 10, overflow: "hidden", backgroundColor: "#161119" }}>
                              {relImg ? (
                                <ImageBackground source={{ uri: relImg }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                              ) : null}
                            </View>
                            <Text numberOfLines={2} style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, marginTop: 4, lineHeight: 12 }}>{rel.prompt}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* Comment Section Panel */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 9, fontWeight: "900", fontFamily: fontFamilyForWeight(900), letterSpacing: 1.2 }}>COMMENTS ({ (itemComments[selectedItem.id] || []).length })</Text>

                    {/* Input box */}
                    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                      <TextInput
                        value={newCommentText}
                        onChangeText={setNewCommentText}
                        placeholder="Write comments..."
                        placeholderTextColor="rgba(255,255,255,0.25)"
                        style={localStyles.commentInput}
                      />
                      <Pressable
                        onPress={handleAddComment}
                        disabled={!newCommentText.trim()}
                        style={[localStyles.commentSubmit, !newCommentText.trim() && { opacity: 0.4 }]}
                      >
                        <Ionicons name="send" size={10} color="#ffffff" />
                      </Pressable>
                    </View>

                    {/* Comments list map */}
                    <View style={{ gap: 6 }}>
                      {commentsLoading && (itemComments[selectedItem.id] || []).length === 0 && (
                        <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 10 }}>Loading comments…</Text>
                      )}
                      {(itemComments[selectedItem.id] || []).map((c) => (
                        <View key={c.id} style={localStyles.commentBubble}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Text style={{ fontSize: 10 }}>{avatarFor(c.author_label)}</Text>
                              <Text style={{ color: "#fff", fontSize: 9.5, fontWeight: "700", fontFamily: fontFamilyForWeight(700) }}>{c.author_label}</Text>
                            </View>
                            <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 8 }}>{timeAgo(c.created_at)}</Text>
                          </View>
                          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, lineHeight: 14 }}>{c.content}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              </ScrollView>

              {/* Action panels */}
              <View style={{ flexDirection: "row", padding: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", gap: 8 }}>
                <Pressable
                  onPress={() => setReportSheetFor(selectedItem)}
                  style={[localStyles.actionBtn, { flex: 0, paddingHorizontal: 12 }]}
                >
                  <Ionicons name="flag-outline" size={13} color="#ef4444" />
                </Pressable>
                <Pressable onPress={() => handleShare(selectedItem)} style={localStyles.actionBtn}>
                  <Ionicons name="share-social-outline" size={13} color="#fff" style={{ marginRight: 2 }} />
                  <Text style={localStyles.actionBtnText}>SHARE</Text>
                </Pressable>
                <Pressable onPress={() => handleDownload(selectedItem)} style={localStyles.actionBtn}>
                  <Ionicons name="download-outline" size={13} color="#fff" style={{ marginRight: 2 }} />
                  <Text style={localStyles.actionBtnText}>SAVE</Text>
                </Pressable>
                <Pressable onPress={() => handleRemix(selectedItem)} style={[localStyles.actionBtn, { backgroundColor: "rgba(255,255,255,0.15)", borderColor: "rgba(255,255,255,0.3)" }]}>
                  <Ionicons name="refresh-outline" size={13} color="#ffffff" style={{ marginRight: 2 }} />
                  <Text style={[localStyles.actionBtnText, { color: "#ffffff" }]}>REMIX</Text>
                </Pressable>
                <Pressable onPress={() => handleUse(selectedItem)} style={localStyles.actionBtnPrimary}>
                  <Text style={localStyles.actionBtnPrimaryText}>USE ASSET</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Publish Form Modal Sheet */}
      {publishFile && (
        <Modal transparent visible={!!publishFile} animationType="slide" onRequestClose={() => setPublishFile(null)}>
          <View style={localStyles.publishContainer}>
            <View style={localStyles.publishSheet}>
              
              {/* Header */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)", paddingBottom: 10, marginBottom: 14 }}>
                <Text style={{ color: "#ffffff", fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900), letterSpacing: 1.5 }}>PUBLISH CREATION</Text>
                <Pressable onPress={() => setPublishFile(null)} style={{ padding: 4 }}>
                  <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
                </Pressable>
              </View>

              {/* Form Scroll Area */}
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 14 }}>
                {/* File preview */}
                <View style={{ flexDirection: "row", gap: 10, padding: 10, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.04)" }}>
                  {publishFile.name.endsWith(".png") || publishFile.name.endsWith(".jpg") ? (
                    <ImageBackground source={{ uri: publishFile.url }} style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden" }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="document-text" size={20} color="rgba(255,255,255,0.4)" />
                    </View>
                  )}
                  <View style={{ flex: 1, justifyContent: "center" }}>
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700", fontFamily: fontFamilyForWeight(700) }} numberOfLines={1}>{publishFile.name}</Text>
                    <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 8, textTransform: "uppercase", marginTop: 2 }}>{publishCategory} file</Text>
                  </View>
                </View>

                {/* Prompt Details */}
                <View style={{ gap: 4 }}>
                  <Text style={localStyles.publishFormLabel}>Prompt Details</Text>
                  <TextInput
                    value={publishPrompt}
                    onChangeText={setPublishPrompt}
                    multiline
                    numberOfLines={2}
                    placeholder="Enter generation prompt..."
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    style={localStyles.publishTextarea}
                  />
                </View>

                {/* Category selectors */}
                <View style={{ gap: 4 }}>
                  <Text style={localStyles.publishFormLabel}>Category type</Text>
                  <Picker
                    value={publishCategory}
                    onChange={(v) => {
                      const c = v as MarketItem["kind"];
                      setPublishCategory(c);
                      const catModels = modelsForCategory(c === "coding" ? "coding" : c === "audio" ? "audio" : c === "video" ? "video" : "image");
                      setPublishModel(catModels[0]?.label || "Flux Schnell");
                    }}
                    options={[
                      { label: "Image", value: "image" },
                      { label: "Video", value: "video" },
                      { label: "Music", value: "audio" },
                      { label: "Preset Code", value: "coding" },
                    ]}
                    style={localStyles.publishSelect}
                  />
                </View>

                {/* Model selection */}
                <View style={{ gap: 4 }}>
                  <Text style={localStyles.publishFormLabel}>Creator Model</Text>
                  <Picker
                    value={publishModel}
                    onChange={setPublishModel}
                    options={modelsForCategory(publishCategory === "coding" ? "coding" : publishCategory === "audio" ? "audio" : publishCategory === "video" ? "video" : "image").map(m => ({ label: m.label, value: m.label }))}
                    style={localStyles.publishSelect}
                  />
                </View>

                {/* Tags */}
                <View style={{ gap: 4 }}>
                  <Text style={localStyles.publishFormLabel}>Comma-separated Tags</Text>
                  <TextInput
                    value={publishTags}
                    onChangeText={setPublishTags}
                    placeholder="e.g. surreal, future, synthwave"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    style={localStyles.publishInput}
                  />
                </View>
              </ScrollView>

              {/* Community guidelines gate — required before publishing any
                  UGC per App Store Guideline 1.2 and Google Play's UGC
                  policy, not just a signup-time checkbox. */}
              <Pressable
                onPress={() => setAgreedToGuidelines((v) => !v)}
                style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8 }}
              >
                <Ionicons
                  name={agreedToGuidelines ? "checkbox" : "square-outline"}
                  size={16}
                  color={agreedToGuidelines ? "#ffffff" : "rgba(238,241,246,0.45)"}
                  style={{ marginTop: 1 }}
                />
                <Text style={{ color: "rgba(238,241,246,0.5)", fontSize: 10.5, flex: 1, lineHeight: 14 }}>
                  I confirm this doesn't violate Collider's Community Guidelines — no illegal, hateful, sexually exploitative, or infringing content.
                </Text>
              </Pressable>

              {/* Submit btn */}
              <Pressable
                onPress={handleConfirmPublish}
                disabled={!publishPrompt.trim() || !agreedToGuidelines}
                style={[localStyles.publishSubmit, (!publishPrompt.trim() || !agreedToGuidelines) && { opacity: 0.4 }]}
              >
                <Text style={{ color: "#ffffff", fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900), letterSpacing: 1.2 }}>CONFIRM & PUBLISH</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* Report reason sheet — the in-app flagging mechanism required by
          App Store Guideline 1.2 and Google Play's AI-Generated Content /
          UGC policies. */}
      {reportSheetFor && (
        <Modal transparent visible={!!reportSheetFor} animationType="fade" onRequestClose={() => setReportSheetFor(null)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setReportSheetFor(null)}>
            <View style={localStyles.reportSheet} onStartShouldSetResponder={() => true}>
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800", fontFamily: fontFamilyForWeight(800), marginBottom: 4 }}>Report this content</Text>
              <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 10.5, marginBottom: 12, lineHeight: 14 }}>
                It's removed from your feed immediately and queued for review.
              </Text>
              {["Sexual or exploitative", "Violent or harmful", "Spam or scam", "Copyright infringement", "Other"].map((reason) => (
                <Pressable
                  key={reason}
                  onPress={() => reportSheetFor && handleReport(reportSheetFor, reason)}
                  style={localStyles.reportOption}
                >
                  <Text style={{ color: "#fff", fontSize: 12 }}>{reason}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setReportSheetFor(null)} style={{ paddingVertical: 10, alignItems: "center" }}>
                <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 11, fontWeight: "700", fontFamily: fontFamilyForWeight(700) }}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}

    </Page>
  );
}

// See RemindersScreen.tsx for why withFont is required here: without it,
// fontWeight 700+ resolves to synthetic faux-bold instead of the real
// static Manrope Bold/ExtraBold file.
const localStyles = StyleSheet.create(withFont({
  // Plain black bar, not a pill/segment control — the active tab is marked
  // by a white underline, same contrast language as a Grok-style nav.
  tabContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    backgroundColor: "#000",
  },
  navTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  navTabActive: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  navTabText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    fontWeight: "800", fontFamily: fontFamilyForWeight(800),
    letterSpacing: 0.5,
  },
  navTabTextActive: {
    color: "#fff",
  },
  sideSearchBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  searchBox: {
    paddingHorizontal: 12,
    marginBottom: 8
  },
  searchInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    height: "100%",
    padding: 0
  },
  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  kindPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent"
  },
  kindPillActive: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.12)"
  },
  kindText: {
    color: "rgba(238,241,246,0.45)",
    fontSize: 11,
    fontWeight: "700", fontFamily: fontFamilyForWeight(700)
  },
  kindTextActive: {
    color: "#fff"
  },
  sortIconBtn: {
    marginLeft: "auto",
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  badgeContainer: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)"
  },
  emptyFileState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    marginTop: 60,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.01)",
    borderStyle: "dashed"
  },
  mockButtonSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  followButton: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  followButtonActive: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)"
  },
  followButtonText: {
    color: "#ffffff",
    fontSize: 9.5,
    fontWeight: "900", fontFamily: fontFamilyForWeight(900),
    textTransform: "uppercase"
  },
  followButtonTextActive: {
    color: "rgba(238,241,246,0.45)"
  },
  promptCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)"
  },
  paramsCard: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)"
  },
  paramRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.02)",
    paddingBottom: 5,
    marginBottom: 1
  },
  paramLabel: {
    color: "rgba(238,241,246,0.5)",
    fontSize: 10.5,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace"
  },
  paramValue: {
    color: "#fff",
    fontSize: 10.5,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace"
  },
  commentInput: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    height: 34,
    color: "#fff",
    fontSize: 11
  },
  commentSubmit: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center"
  },
  commentBubble: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)"
  },
  actionBtn: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row"
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 9.5,
    fontWeight: "800", fontFamily: fontFamilyForWeight(800),
    letterSpacing: 0.5
  },
  actionBtnPrimary: {
    flex: 1.1,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    shadowColor: "#ffffff",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
    alignItems: "center",
    justifyContent: "center"
  },
  actionBtnPrimaryText: {
    color: "#ffffff",
    fontSize: 9.5,
    fontWeight: "900", fontFamily: fontFamilyForWeight(900),
    letterSpacing: 0.5
  },
  publishContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end"
  },
  publishSheet: {
    backgroundColor: "#0b0c10",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: "85%",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.12)"
  },
  publishFormLabel: {
    color: "rgba(238,241,246,0.45)",
    fontSize: 8.5,
    fontWeight: "900", fontFamily: fontFamilyForWeight(900),
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  publishInput: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    height: 36,
    color: "#fff",
    fontSize: 11.5
  },
  publishTextarea: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    height: 56,
    color: "#fff",
    fontSize: 11.5,
    textAlignVertical: "top"
  },
  publishSelect: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    height: 36,
    color: "#fff",
    fontSize: 11.5,
    outlineWidth: 0
  },
  publishSubmit: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    shadowColor: "#ffffff",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
    borderRadius: 12,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14
  },
  reportSheet: {
    width: 300,
    padding: 18,
    borderRadius: 20,
    backgroundColor: "rgba(19,15,28,0.98)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignSelf: "center",
  },
  reportOption: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  mediaControlBar: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  cassetteShell: {
    width: 200,
    height: 125,
    borderRadius: 10,
    backgroundColor: "rgba(20, 15, 30, 0.8)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center"
  },
  cassetteSticker: {
    width: 170,
    height: 70,
    borderRadius: 6,
    padding: 6,
    alignItems: "center",
    justifyContent: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)"
  },
  cassetteTitle: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    fontFamily: "monospace",
    letterSpacing: 0.5
  },
  cassetteCutout: {
    position: "absolute",
    bottom: 12,
    width: 100,
    height: 30,
    backgroundColor: "rgba(0,0,0,0.9)",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center"
  },
  cassetteGear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  },
  gearSpoke: {
    position: "absolute",
    width: 2,
    height: 22,
    backgroundColor: "#000"
  },
  gearCenter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#000"
  },
  eqRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 40,
    marginTop: 14,
    marginBottom: 26,
    justifyContent: "center"
  },
  eqBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: "#ffffff"
  }
}));

/**
 * CollectionsPane — browse saved collections and their assets.
 * Uses the same AssetActionBar template as every other asset surface, so
 * behaviour cannot drift between here, the feed, and generation results.
 */
function CollectionsPane() {
  const { state, dispatch } = useCollider();
  const { toast } = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = state.collections.find((c) => c.id === openId) || null;
  const assetsFor = (ids: string[]) =>
    ids.map((id) => state.savedAssets.find((a) => a.id === id)).filter(Boolean) as typeof state.savedAssets;

  if (open) {
    const assets = assetsFor(open.assetIds);
    return (
      <View style={{ flex: 1, paddingHorizontal: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 }}>
          {/* Spec: never trap the user — every pane needs a way back. */}
          <Pressable onPress={() => setOpenId(null)} hitSlop={10} accessibilityLabel="Back to collections">
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <Text style={{ color: "#eef1f6", fontSize: 16, fontWeight: "800", fontFamily: fontFamilyForWeight(800), flex: 1 }}>
            {open.name}
          </Text>
          <Pressable
            onPress={() => { dispatch({ type: "deleteCollection", collectionId: open.id }); setOpenId(null); toast("Collection deleted"); }}
            hitSlop={10}
            accessibilityLabel="Delete collection"
          >
            <Ionicons name="trash-outline" size={18} color="rgba(255,106,92,0.85)" />
          </Pressable>
        </View>
        {assets.length === 0 ? (
          <Text style={{ color: "rgba(238,241,246,0.4)", fontSize: 12.5, textAlign: "center", marginTop: 40, fontFamily: fontFamilyForWeight(400) }}>
            Nothing saved here yet.
          </Text>
        ) : (
          <FlatList
            data={assets}
            keyExtractor={(a) => a.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 10 }}
            contentContainerStyle={{ gap: 10, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <View style={{ flex: 1, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
                <Image source={{ uri: item.url }} style={{ width: "100%", aspectRatio: 0.78 }} />
                <Text numberOfLines={2} style={{ color: "rgba(238,241,246,0.75)", fontSize: 10.5, padding: 7, fontFamily: fontFamilyForWeight(400) }}>
                  {item.prompt}
                </Text>
                <AssetActionBar
                  asset={item}
                  compact
                  hide={["context", "source", "view"]}
                  onDelete={() => { dispatch({ type: "removeFromCollection", collectionId: open.id, assetId: item.id }); toast("Removed"); }}
                />
              </View>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingHorizontal: 14 }}>
      {state.collections.length === 0 ? (
        <View style={{ alignItems: "center", marginTop: 60, paddingHorizontal: 30 }}>
          <Ionicons name="albums-outline" size={34} color="rgba(238,241,246,0.25)" />
          <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 13, textAlign: "center", marginTop: 12, fontFamily: fontFamilyForWeight(400) }}>
            No collections yet. Tap SAVE on any asset to start one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={state.collections}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 40, gap: 8 }}
          renderItem={({ item }) => {
            const cover = assetsFor(item.assetIds)[0];
            return (
              <Pressable
                onPress={() => setOpenId(item.id)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.04)" }}
              >
                <View style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)" }}>
                  {cover ? <Image source={{ uri: cover.url }} style={{ width: "100%", height: "100%" }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#eef1f6", fontSize: 14, fontWeight: "700", fontFamily: fontFamilyForWeight(700) }}>{item.name}</Text>
                  <Text style={{ color: "rgba(238,241,246,0.42)", fontSize: 10.5, marginTop: 2, fontFamily: FONT_MONO }}>
                    {item.assetIds.length} ITEM{item.assetIds.length === 1 ? "" : "S"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(238,241,246,0.35)" />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
