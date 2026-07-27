import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  ImageBackground, DeviceEventEmitter,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  PanResponder,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, LinearGradient as SvgGradient, RadialGradient as SvgRadial, Stop, Path, Ellipse, Rect } from "react-native-svg";
import * as Haptics from "expo-haptics";
import React, { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Video, ResizeMode, Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "@expo-google-fonts/inter";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from "@expo-google-fonts/jetbrains-mono";
import {
  AppProvider,
  useCollider,
  useDraft,
  isMessageLimitReached,
  FREE_DAILY_LIMIT,
  FREE_MONTHLY_LIMIT,
  newId,
  type ChatMessage,
  type WallpaperId,
  type Priority,
  type Progress,
  type ConsensusRun,
  type Attachment,
  type MarketItem,
  type Artifact,
  type Conversation,
} from "./src/state";

import {
  CATEGORIES,
  MODELS,
  TIER_INFO,
  canUse,
  modelById,
  modelsForCategory,
  isCategoryUnlocked,
  type Category,
  type ModelDef,
  type Tier,
} from "./src/models";
import { CONSOLE_SKILLS } from "./src/skills";

import { sendChat, sendChatWithRetry, friendlyErrorMessage } from "./src/services/chat";

function resolveSkillInstructions(activeSkills: string[]): string[] {
  return CONSOLE_SKILLS.filter((s) => activeSkills.includes(s.id)).map((s) => s.instruction);
}
import { smartGenLLM } from "./src/services/llmExtract";
import { autoName, fingerprint } from "./src/services/smartgen";

// Research/Deep modes are supposed to produce a real deliverable — like
// Claude's research reports — not just a chat reply that scrolls away.
// Saves the answer as a Document artifact unconditionally (not gated on
// Smart Gen's own "is this artifact-worthy" heuristic, which was built for
// ambient capture, not a mode the user deliberately opted into).
function saveResearchArtifact(prompt: string, answer: string, mode: string | undefined, dispatch: any, modelId?: string) {
  if (mode !== "research" && mode !== "deep") return;
  if (!answer || answer.length < 80) return;
  const title = autoName(prompt, 10);
  dispatch({
    type: "artifact",
    title: `${mode === "deep" ? "Deep Research" : "Research"}: ${title}`,
    content: answer,
    kind: "document",
    modelId,
    fingerprint: fingerprint("artifact", title + answer.slice(0, 40)),
  });
}
import { IAP_PRODUCTS, purchaseProduct } from "./src/services/iap";
import { pickImage, takePhoto, startRecording, stopRecording, scheduleReminder } from "./src/services/media";
import { transcribeAudio } from "./src/services/chat";
import { SearchBar, useSearch, MessageActions, SettingsScreen, AuthScreen, ConsensusRunCard } from "./src/features";

// New modular styles & components imports
import { styles, SCREEN_W, SCREEN_H, FREE_THEMES, PREMIUM_THEMES, WALLPAPERS, FONT_FAMILY, FONT_MONO, fontFamilyForWeight, T, GLASS_CARD, GLASS_PANEL, type DynamicTheme } from "./src/styles/theme";
import {
  AuroraField, ScreenTransition, SinkPresence, CategoryDeck, CategoryRail,
} from "./src/motion";
import { Glass } from "./src/components/Glass";
import { ExpandableTrayText } from "./src/components/ExpandableTray";
import { Markdown } from "./src/components/Markdown";
import { Page } from "./src/components/Page";
import { Wordmark } from "./src/components/Wordmark";
import { ModelCard } from "./src/components/ModelCard";
import { CardGrid } from "./src/components/CardGrid";
import { ModelTray } from "./src/components/ModelTray";
import { PromptComposer } from "./src/components/PromptComposer";
import { CollideBanner } from "./src/components/CollideBanner";
import { GlossSurface } from "./src/components/GlossSurface";
import { GlossButton } from "./src/components/GlossButton";
import { ConsensusModal } from "./src/components/ConsensusDrawer";
import { ToastProvider, useToast } from "./src/components/Toast";
import { InlineSearch } from "./src/components/InlineSearch";
import { CornerVolumeControl } from "./src/components/CornerVolumeControl";
import { Picker } from "./src/components/Picker";

// Screens
import { AgentSkillsDrawer } from "./src/screens/AgentSkillsDrawer";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { MemoryScreen } from "./src/screens/MemoryScreen";
import { RemindersScreen } from "./src/screens/RemindersScreen";
import { ProjectsScreen } from "./src/screens/ProjectsScreen";
import { ArtifactsScreen } from "./src/screens/ArtifactsScreen";
import { SmartGenBoardScreen } from "./src/screens/SmartGenBoardScreen";
import { FilesScreen } from "./src/screens/FilesScreen";
import { MarketScreen } from "./src/screens/MarketScreen";
import { WallpapersScreen } from "./src/screens/WallpapersScreen";
import { UpgradeScreen } from "./src/screens/UpgradeScreen";

// Global default font — Inter everywhere, the app's single typeface (headers
// included, via FONT_DISPLAY); see styles/theme.ts.
// down every inline <Text style={{...}}> across the app that forgot
// fontFamily and silently fell back to the platform default (the "childish"
// mismatched font). Any Text/TextInput that explicitly sets its own
// fontFamily still wins — React Native merges array styles left-to-right,
// so this only fills in the gap where nothing more specific was set.
(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.style = [{ fontFamily: FONT_FAMILY }, (Text as any).defaultProps.style];
(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.style = [{ fontFamily: FONT_FAMILY }, (TextInput as any).defaultProps.style];

function smartCaptureText(text: string, dispatch: any, opts: { autoGen: boolean; incognito: boolean; modelId?: string; convId?: string }) {
  if (!opts.autoGen || opts.incognito || !text) return;
  dispatch({ type: "smartCapture", text, modelId: opts.modelId, convId: opts.convId });
}

// Runs the deeper LLM-based extraction on the ASSISTANT's finished reply —
// this is where the actual "the model just told the user their deadline is
// July 17" moment lives, which the fast regex pass (user text only) never
// sees. Fire-and-forget: never blocks the UI, silently no-ops on failure.
// convId scopes it to "what project is this specific conversation already
// about" so a long-running thread keeps attaching to its own project instead
// of guessing based on superficial similarity to an older one.
function smartCaptureReply(
  answer: string,
  dispatch: any,
  getState: () => any,
  opts: { autoGen: boolean; incognito: boolean; modelId?: string; convId?: string },
) {
  if (!opts.autoGen || opts.incognito || !answer) return;
  const state = getState();
  smartGenLLM(answer, {
    projects: state.projects,
    memories: state.memories,
    reminders: state.reminders,
    artifacts: state.artifacts,
    activeProjectId: opts.convId ? state.conversationProjectId[opts.convId] : undefined,
    source: "assistant",
  })
    .then((batch) => {
      if (batch.memories.length || batch.reminders.length || batch.projects.length || batch.artifacts.length) {
        dispatch({ type: "applySmartBatch", batch, modelId: opts.modelId, convId: opts.convId });
      }
    })
    .catch(() => {});
}

// Caps how often streaming token updates hit dispatch/AsyncStorage — without
// this, a fast stream would write to disk on every token.
function makeThrottledToken(fn: (partial: string) => void, ms = 90) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Tracks the most recent partial regardless of throttling — a pending
  // timer used to capture whatever partial was current when IT was
  // scheduled, so calls that arrived while it was pending got silently
  // dropped. If the stream finished and dispatched the final complete
  // answer before that stale timer fired, the timer would then overwrite
  // the correct full text with an old, truncated snippet (this is why
  // some responses rendered cut short instead of complete). Reading from
  // `latest` at fire time instead means a late timer always replays the
  // newest text, which by then already matches the final answer.
  let latest = "";
  return (partial: string) => {
    latest = partial;
    const now = Date.now();
    if (now - last >= ms) {
      if (timer) { clearTimeout(timer); timer = null; }
      last = now;
      fn(latest);
    } else if (!timer) {
      timer = setTimeout(() => { last = Date.now(); timer = null; fn(latest); }, ms - (now - last));
    }
  };
}


type Screen =
  | "home"
  | "card"
  | "history"
  | "memory"
  | "reminders"
  | "projects"
  | "artifacts"
  | "smartboard"
  | "files"
  | "market"
  | "wallpapers"
  | "upgrade"
  | "settings"
  | "auth";



export default function App() {
  useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });
  return (
    <SafeAreaProvider>
      <AppProvider>
        <ToastProvider>
          <StatusBar style="light" translucent />
          <Shell />
        </ToastProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}

function ThemeBackground({ wallpaperId }: { wallpaperId: string }) {
  const customFree = FREE_THEMES.find((t) => t.id === wallpaperId);
  const customPremium = PREMIUM_THEMES.find((t) => t.id === wallpaperId);
  const preset = WALLPAPERS.find((w) => w.id === wallpaperId) || WALLPAPERS[0];

  if (customFree) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <ImageBackground
          source={customFree.source}
          style={StyleSheet.absoluteFill}
          resizeMode="stretch"
          imageStyle={{ width: "100%", height: "100%" }}
        />
      </View>
    );
  }
  if (customPremium) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient colors={["#0a0a0a", "#000000"]} style={StyleSheet.absoluteFill} />
        <Video
          source={customPremium.source}
          rate={1.0}
          volume={0.0}
          isMuted
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          style={StyleSheet.absoluteFill}
          videoStyle={{ width: "100%", height: "100%" } as any}
        />
      </View>
    );
  }

  // Default ("Graphite") is a pure aurora field over a graphite radial base —
  // no photo. Other presets keep their gradient, with the aurora accent drawn
  // from the wallpaper's mid color. A bottom vignette grounds the scene.
  const isDefault = wallpaperId === "default";
  const accent = isDefault ? "#3d6bd8" : preset.colors[1];
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={isDefault ? ["#14161d", "#0b0c10", "#07080b"] : (preset.colors as any)}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <AuroraField tint={preset.colors[0]} accent={accent} />
      {/* No vignette. The wallpaper is the wallpaper — a scrim laid over it
          to "ground the scene" was quietly darkening the bottom half of every
          screen, which is exactly the tint the background is meant to show
          through. Contrast belongs to the surfaces that need it (cards,
          composer, headers), each of which carries its own. */}
    </View>
  );
}

function Shell() {
  const { state, dispatch } = useCollider();
  const { toast } = useToast();
  const [screen, setScreen] = useState<Screen>("home");
  const [modelId, setModelId] = useState<string | undefined>();
  // Set only when History is opened from a model's Card view — scopes the
  // list to that model's own conversations and returns to Card (not Home)
  // on back. Cleared by the generic drawer nav so the global History entry
  // still shows everything.
  const [historyModelId, setHistoryModelId] = useState<string | undefined>();
  // Same idea as historyModelId — Reminders opened from a Card view should
  // return to that card on back, not dump you out to the Home grid.
  const [remindersFromCard, setRemindersFromCard] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [rightDrawer, setRightDrawer] = useState(false);
  const [rightDrawerScopeModelId, setRightDrawerScopeModelId] = useState<string | undefined>(undefined);
  const [consensus, setConsensus] = useState(false);
  const [composerAttachments, setComposerAttachments] = useState<Record<Category, Attachment[]>>({
    general: [], image: [], video: [], audio: [], coding: []
  });
  const [toastText, setToastText] = useState<string | null>(null);

  const prevMemoriesCount = useRef(state.memories.length);
  const prevRemindersCount = useRef(state.reminders.length);
  // These two toast effects fire whenever the array length grows. Before
  // hydration, state.memories/reminders is always [] (length 0), so the very
  // first time AsyncStorage finishes loading and dispatches "hydrate" —
  // replacing [] with everything the user has ever saved — this looked
  // indistinguishable from "N new items just got captured," and the toast
  // fired for restored data on every single page refresh. Gate on
  // state.hydrated (same flag the persistence effects below already use) and
  // treat the first post-hydration run as a silent baseline sync, not a
  // capture event — only genuine growth *after* that counts as new.
  const memoriesSyncedAfterHydration = useRef(false);
  const remindersSyncedAfterHydration = useRef(false);
  const scheduledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!state.hydrated) return;
    if (!memoriesSyncedAfterHydration.current) {
      prevMemoriesCount.current = state.memories.length;
      memoriesSyncedAfterHydration.current = true;
      return;
    }
    if (state.memories.length > prevMemoriesCount.current) {
      setToastText(" Smart Gen: Extracted persistent memory!");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const t = setTimeout(() => setToastText(null), 3000);
      prevMemoriesCount.current = state.memories.length;
      return () => clearTimeout(t);
    }
    prevMemoriesCount.current = state.memories.length;
  }, [state.hydrated, state.memories]);

  useEffect(() => {
    if (!state.hydrated) return;
    if (!remindersSyncedAfterHydration.current) {
      prevRemindersCount.current = state.reminders.length;
      remindersSyncedAfterHydration.current = true;
      return;
    }
    if (state.reminders.length > prevRemindersCount.current) {
      setToastText(" Smart Gen: Captured new reminder task!");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const t = setTimeout(() => setToastText(null), 3000);
      prevRemindersCount.current = state.reminders.length;
      return () => clearTimeout(t);
    }
    prevRemindersCount.current = state.reminders.length;
  }, [state.hydrated, state.reminders]);

  useEffect(() => {
    for (const r of state.reminders) {
      if (r.done || !r.due || r.due <= Date.now()) continue;
      if (scheduledRef.current.has(r.id)) continue;
      scheduledRef.current.add(r.id);
      scheduleReminder(r.title, r.due, r.id).catch(() => {});
    }
  }, [state.reminders]);

  const openCard = (id: string) => { setModelId(id); setScreen("card"); };
  const nav = (next: Screen) => { setDrawer(false); setHistoryModelId(undefined); setRemindersFromCard(false); setScreen(next); };

  // Collide (consensus) was opening for free, no message-limit check and no
  // usage recorded — meaning it never actually cost anything, for any tier.
  // It runs inside general chat, so it follows the same one-message cost as
  // any other general-chat send for free-tier users (pro/elite have
  // unlimited general chat already, so this is a no-op for them).
  const openConsensus = () => {
    if (isMessageLimitReached(state)) {
      toast(`You've reached the Free plan limit (${FREE_DAILY_LIMIT} messages/day or ${FREE_MONTHLY_LIMIT}/month). Upgrade to Pro or Elite for unlimited general chat.`);
      setScreen("upgrade");
      return;
    }
    dispatch({ type: "recordMessageSent" });
    setConsensus(true);
  };

  return (
    <View style={styles.bg} onTouchStart={() => DeviceEventEmitter.emit("global_tap")}>
      <ThemeBackground wallpaperId={state.wallpaper} />
      <CornerVolumeControl />
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 48}
        >
          {screen === "home" && (
            <ScreenTransition screenKey="home">
              <Home
                openDrawer={() => setDrawer(true)}
                openRightDrawer={() => { setRightDrawerScopeModelId(undefined); setRightDrawer(true); }}
                openCard={openCard}
                openConsensus={openConsensus}
                openUpgrade={() => setScreen("upgrade")}
                openScreen={(s) => setScreen(s)}
                consensus={consensus}
                setConsensus={setConsensus}
                attachments={composerAttachments[state.activeCategory]}
                setAttachments={(newAtts: any) => setComposerAttachments(prev => ({
                  ...prev,
                  [state.activeCategory]: typeof newAtts === "function" ? newAtts(prev[state.activeCategory]) : newAtts
                }))}
              />
            </ScreenTransition>
          )}
          {screen === "card" && (
            <ScreenTransition screenKey="card">
              <CardScreen
                modelId={modelId}
                openRightDrawer={(mid) => { setRightDrawerScopeModelId(mid); setRightDrawer(true); }}
                goBack={() => setScreen("home")}
                openHistory={() => { setHistoryModelId(modelId); setScreen("history"); }}
                openReminders={() => { setRemindersFromCard(true); setScreen("reminders"); }}
                attachments={composerAttachments[state.activeCategory]}
                setAttachments={(newAtts: any) => setComposerAttachments(prev => ({
                  ...prev,
                  [state.activeCategory]: typeof newAtts === "function" ? newAtts(prev[state.activeCategory]) : newAtts
                }))}
              />
            </ScreenTransition>
          )}
          {screen === "history" && (
            <ScreenTransition screenKey="history">
              <HistoryScreen
                goBack={() => setScreen(historyModelId ? "card" : "home")}
                openCard={openCard}
                modelId={historyModelId}
              />
            </ScreenTransition>
          )}
          {screen === "memory" && (
            <ScreenTransition screenKey="memory">
              <MemoryScreen goBack={() => setScreen("home")} />
            </ScreenTransition>
          )}
          {screen === "reminders" && (
            <ScreenTransition screenKey="reminders">
              <RemindersScreen goBack={() => setScreen(remindersFromCard ? "card" : "home")} />
            </ScreenTransition>
          )}
          {screen === "projects" && (
            <ScreenTransition screenKey="projects">
              <ProjectsScreen goBack={() => setScreen("home")} />
            </ScreenTransition>
          )}
          {screen === "artifacts" && (
            <ScreenTransition screenKey="artifacts">
              <ArtifactsScreen goBack={() => setScreen("home")} />
            </ScreenTransition>
          )}
          {screen === "smartboard" && (
            <ScreenTransition screenKey="smartboard">
              <SmartGenBoardScreen goBack={() => setScreen("home")} />
            </ScreenTransition>
          )}
          {screen === "files" && (
            <ScreenTransition screenKey="files">
              <FilesScreen
                goBack={() => setScreen("home")}
                openOutputs={() => { setRightDrawerScopeModelId(undefined); setRightDrawer(true); }}
              />
            </ScreenTransition>
          )}
          {screen === "market" && (
            <ScreenTransition screenKey="market">
              <MarketScreen goBack={() => setScreen("home")} />
            </ScreenTransition>
          )}
          {screen === "wallpapers" && (
            <ScreenTransition screenKey="wallpapers">
              <WallpapersScreen goBack={() => setScreen("home")} />
            </ScreenTransition>
          )}
          {screen === "upgrade" && (
            <ScreenTransition screenKey="upgrade">
              <UpgradeScreen goBack={() => setScreen("home")} />
            </ScreenTransition>
          )}
          {screen === "settings" && (
            <ScreenTransition screenKey="settings">
              <SettingsScreen
                goBack={() => setScreen("home")}
                openAuth={() => setScreen("auth")}
                openWallpapers={() => setScreen("wallpapers")}
              />
            </ScreenTransition>
          )}
          {screen === "auth" && (
            <ScreenTransition screenKey="auth">
              <AuthScreen goBack={() => setScreen("settings")} />
            </ScreenTransition>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
      {drawer && <Drawer close={() => setDrawer(false)} nav={nav} />}
      {rightDrawer && (
        <RightDrawer
          close={() => setRightDrawer(false)}
          nav={nav}
          scopeModelId={rightDrawerScopeModelId}
          onRemix={(url) => {
            // Find prompt from URL/name, or just let them write
            toast("Prompt remixed! Clipboard updated.");
          }}
          onInsertSource={(url) => {
            dispatch({
              type: "file",
              file: { name: `Source-${Date.now().toString(36)}.png`, kind: "uploaded", url },
            });
            const newAtt: Attachment = { kind: "image", dataUri: url, mime: "image/png" };
            setComposerAttachments((prev) => ({ ...prev, [state.activeCategory]: [newAtt] }));
            toast("Attached as source (replaces previous source).");
          }}
          onInsertContext={(url) => {
            dispatch({
              type: "file",
              file: { name: `Context-${Date.now().toString(36)}.png`, kind: "uploaded", url },
            });
            const newAtt: Attachment = { kind: "image", dataUri: url, mime: "image/png" };
            setComposerAttachments((prev) => ({
              ...prev,
              [state.activeCategory]: [...prev[state.activeCategory], newAtt]
            }));
            // Does NOT close the drawer  multiple context items allowed
            toast("Added as context. You can add more.");
          }}
        />
      )}

      {toastText && (
        <View style={styles.toastContainer} pointerEvents="none">
          <BlurView intensity={90} tint="dark" style={styles.toastBlur}>
            <Text style={styles.toastText}>{toastText}</Text>
          </BlurView>
        </View>
      )}
    </View>
  );
}

//  Collide Button (surging gold/orange console track button) 
// COLLIDE button (redesign) — a dark obsidian pill with a specular orb and a
// spaced "COLLIDE" label, wrapped in a breathing inner glow and an expanding
// pulse ring, so the primary action reads as alive rather than a flat bar.
function CollideButton({ onPress }: { onPress: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;   // subtle press-scale breathing
  const glow = useRef(new Animated.Value(0)).current;    // inner radial glow breathe
  const ring = useRef(new Animated.Value(0)).current;    // expanding halo ring
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.03, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 3200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ).start();
  }, [pulse, glow, ring]);

  return (
    <View style={{ alignItems: "center", marginBottom: 8, marginTop: 2 }}>
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        {/* Expanding pulse ring behind the pill */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
            borderRadius: 23, borderWidth: 1, borderColor: "rgba(230,236,244,0.35)",
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.35] }) }],
          }}
        />
        <Pressable
          onPress={onPress}
          style={{
            height: 46, width: 210, borderRadius: 23,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
            borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", overflow: "hidden",
            shadowColor: "rgba(230,236,244,0.4)", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 8,
          }}
        >
          <LinearGradient
            colors={["#16181f", "#0a0b10"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Breathing inner glow */}
          <Animated.View
            pointerEvents="none"
            style={{ ...StyleSheet.absoluteFillObject, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] }) }}
          >
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
          {/* Specular orb */}
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
          <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 4, color: "#f4f7fb" }}>COLLIDE</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// Toolbar pills — flat surfaces read cheap without depth cues; shadows here
// are plain black (not tinted) per design direction: depth, not color.
const localToolbarStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
    shadowColor: "#000", shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  pillText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5, fontFamily: fontFamilyForWeight(900), textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 14 },
  // When a custom agent is active for this tab, the pill swaps to showing
  // its name instead of the generic "AGENTS" label — same treatment
  // ChatGPT/Claude use to surface which persona is currently steering.
  pillActive: {
    backgroundColor: "rgba(226,232,240,0.16)",
    borderColor: "rgba(226,232,240,0.4)",
    maxWidth: 140,
  },
  pillTextActive: { color: "#e2e8f0" },
  iconBtn: {
    width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
    shadowColor: "#000", shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  // Small paired chip for Category/Models, right above the grid — glowing
  // text (soft textShadow), not a flat color fill. "No flat colors — every
  // color should be light, diffused, emitting" per design direction.
  glowChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, height: 24, borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000", shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  glowChipText: {
    color: "rgba(255,255,255,0.85)", fontSize: 9.5, lineHeight: 12, fontWeight: "900", letterSpacing: 0.5, textAlignVertical: "center", fontFamily: fontFamilyForWeight(900),
  },
  // Same 34px translucent icon button used for the hamburger/Smart Gen
  // triggers in the global view's utility row — reused here so CardScreen's
  // toolbar follows the same conventions instead of inventing its own.
  toolbarIconBtn: {
    width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
    shadowColor: "#000", shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
});

const localDrawerStyles = StyleSheet.create({
  utilIcon: {
    width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  upgradeBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)",
  },
  colHeader: { color: "rgba(238,241,246,0.45)", fontSize: 9, fontWeight: "900", letterSpacing: 0.5, fontFamily: fontFamilyForWeight(900) },
});

//  Home / Grid
function Home({
  openDrawer, openRightDrawer, openCard, openConsensus, openUpgrade, openScreen, consensus, setConsensus, attachments, setAttachments,
}: {
  openDrawer: () => void;
  openRightDrawer: () => void;
  openCard: (id: string) => void;
  openConsensus: () => void;
  openUpgrade: () => void;
  openScreen: (s: Screen) => void;
  consensus: boolean;
  setConsensus: (b: boolean) => void;
  attachments: Attachment[];
  setAttachments: any;
}) {
  const { state, dispatch, getState } = useCollider();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  // Persisted, not local useState — Home fully unmounts on any full-screen
  // nav (Settings, History, etc.), and typed-but-unsent text is the one
  // thing this app must never lose to a navigation. "__home__" is a sentinel
  // slot in the same per-category prompt bag CardScreen already uses.
  const cat0 = state.activeCategory;
  const prompt = state.cardPrompts[cat0]?.["__home__"] ?? "";
  const setPrompt = (v: string) => dispatch({ type: "cardPrompt", category: cat0, modelId: "__home__", value: v });
  const [pending, setPending] = useState(0);
  const rows = state.gridRows || 2;
  const setRows = (val: 1 | 2 | 3) => dispatch({ type: "setGridRows", value: val });
  const [activeMessage, setActiveMessage] = useState<ChatMessage | null>(null);
  const [activeMessageModelId, setActiveMessageModelId] = useState<string>("");

  // Dynamic layout measurement to prevent overlaps
  const [gridHeight, setGridHeight] = useState(350);
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const [rowSelectorVisible, setRowSelectorVisible] = useState(false);
  const [categorySelectorVisible, setCategorySelectorVisible] = useState(false);
  const [agentSkillsVisible, setAgentSkillsVisible] = useState(false);

  const runPromptForModel = async (text: string, mId: string) => {
    const model = modelById(mId);
    if (!model) return;
    if (state.activeCategory !== "general" && state.credits < model.weight) {
      toast(`Insufficient credits. You need ${model.weight} credits to run this model, but only have ${state.credits}. Please upgrade or purchase credits.`);
      openUpgrade();
      return;
    }
    setPending((n) => n + 1);
    dispatch({ type: "spend", credits: model.weight });
    
    const conv = state.conversations.find(
      (c) => c.id === state.activeConversationId[state.activeCategory],
    );
    const history = conv?.threads[mId] || [];
    
    dispatch({
      type: "append",
      category: state.activeCategory,
      modelId: mId,
      message: { id: `u_${Date.now()}`, role: "user", content: text, ts: Date.now() },
    });
    dispatch({
      type: "append",
      category: state.activeCategory,
      modelId: mId,
      message: { id: `a_${Date.now()}_${mId}`, role: "assistant", content: "", modelId: mId, ts: Date.now() },
    });
    
    try {
      const onToken = makeThrottledToken((partial) => {
        dispatch({ type: "replaceLastAssistant", category: state.activeCategory, modelId: mId, content: partial, streaming: true });
      });
      const answer = await sendChatWithRetry(mId, history, text, state.memories, {
        mode: state.chatMode[state.activeCategory],
        webSearch: state.webSearch[state.activeCategory],
        customInstructions: state.customInstructions,
        agentInstructions: state.customAgents.find((a) => a.id === state.activeAgentId[state.activeCategory])?.instructions,
        skillInstructions: resolveSkillInstructions(state.activeSkills),
        onToken,
      });
      dispatch({
        type: "replaceLastAssistant",
        category: state.activeCategory,
        modelId: mId,
        content: answer || "No response returned.",
      });
      if (answer) {
        smartCaptureReply(answer, dispatch, getState, {
          autoGen: state.autoGen, incognito: !!state.incognito[state.activeCategory], modelId: mId,
          convId: state.activeConversationId[state.activeCategory],
        });
        saveResearchArtifact(text, answer, state.chatMode[state.activeCategory], dispatch, mId);
      }
    } catch (e: any) {
      // Credits are spent up-front (before the request) so the balance can't
      // be raced by concurrent sends. That makes refunding on failure
      // mandatory: without this, any network drop / provider 5xx / timeout
      // permanently destroys the user's credits — up to 30 for a single failed
      // Sora 2 or Veo 3.1 call. General chat is never charged, so only refund
      // when we actually spent.
      if (state.activeCategory !== "general") {
        dispatch({ type: "refund", credits: model.weight });
      }
      dispatch({
        type: "replaceLastAssistant",
        category: state.activeCategory,
        modelId: mId,
        content: friendlyErrorMessage(e),
      });
    } finally {
      setPending((n) => n - 1);
    }
  };

  const selected = state.selectedModelIds[state.activeCategory]
    .map(modelById)
    .filter(Boolean) as ModelDef[];

  const submit = async (attachments: Attachment[] = [], compiledText?: string) => {
    const text = compiledText !== undefined ? compiledText.trim() : prompt.trim();
    if ((!text && attachments.length === 0) || pending > 0 || selected.length === 0) return;
    // Free tier: 20 msgs/day on general chat (the only category free users can reach).
    if (isMessageLimitReached(state)) {
      toast(`You've reached the Free plan limit (${FREE_DAILY_LIMIT} messages/day or ${FREE_MONTHLY_LIMIT}/month). Upgrade to Pro or Elite for unlimited general chat.`);
      openUpgrade();
      return;
    }
    const cost = selected.reduce((s, m) => s + m.weight, 0);
    if (state.activeCategory !== "general" && state.credits < cost) {
      toast(`Insufficient daily credits. You need ${cost} credits to run these models, but only have ${state.credits}. Please upgrade or wait for tomorrow's refill.`);
      openUpgrade();
      return;
    }
    dispatch({ type: "recordMessageSent" });
    setPrompt("");
    dispatch({ type: "spend", credits: cost });
    smartCaptureText(text, dispatch, { autoGen: state.autoGen, incognito: !!state.incognito[state.activeCategory], modelId: selected[0]?.id, convId: state.activeConversationId[state.activeCategory] });

    const conv = state.conversations.find(
      (c) => c.id === state.activeConversationId[state.activeCategory],
    );

    const userContent = attachments.length
      ? `${text}${text ? "\n\n" : ""} ${attachments.length} attachment${attachments.length > 1 ? "s" : ""}`
      : text;

    for (const model of selected) {
      const history = conv?.threads[model.id] || [];
      dispatch({
        type: "append",
        category: state.activeCategory,
        modelId: model.id,
        message: { id: `u_${Date.now()}`, role: "user", content: userContent, ts: Date.now() },
      });
      dispatch({
        type: "append",
        category: state.activeCategory,
        modelId: model.id,
        message: {
          id: `a_${Date.now()}_${model.id}`,
          role: "assistant",
          content: "",
          modelId: model.id,
          ts: Date.now(),
        },
      });
      if (model.locked) {
        dispatch({
          type: "replaceLastAssistant",
          category: state.activeCategory,
          modelId: model.id,
          content: "Locked  upgrade to unlock this provider.",
        });
        continue;
      }
      setPending((n) => n + 1);
      const onToken = makeThrottledToken((partial) => {
        dispatch({ type: "replaceLastAssistant", category: state.activeCategory, modelId: model.id, content: partial, streaming: true });
      });
      sendChatWithRetry(model.id, history, text, state.memories, {
        mode: state.chatMode[state.activeCategory],
        webSearch: state.webSearch[state.activeCategory],
        customInstructions: state.customInstructions,
        agentInstructions: state.customAgents.find((a) => a.id === state.activeAgentId[state.activeCategory])?.instructions,
        skillInstructions: resolveSkillInstructions(state.activeSkills),
        attachments,
        onToken,
      })
        .then((answer) => {
          dispatch({
            type: "replaceLastAssistant",
            category: state.activeCategory,
            modelId: model.id,
            content: answer || "No response returned.",
          });
          if (answer) {
            smartCaptureReply(answer, dispatch, getState, {
              autoGen: state.autoGen, incognito: !!state.incognito[state.activeCategory], modelId: model.id,
              convId: state.activeConversationId[state.activeCategory],
            });
            saveResearchArtifact(text, answer, state.chatMode[state.activeCategory], dispatch, model.id);
          }
          // Save generated image to Files
          const imgMatch = answer && answer.match(/(https:\/\/image\.pollinations\.ai\/[^\s)]+)/);
          if (imgMatch) {
            dispatch({ type: "file", file: { name: `${model.id}-${Date.now().toString(36)}.png`, kind: "generated", url: imgMatch[1] } });
            dispatch({ type: "addGeneration", generation: { prompt: text, url: imgMatch[1], modelId: model.id, category: state.activeCategory } });
          }
        })
        .catch((error) =>
          dispatch({
            type: "replaceLastAssistant",
            category: state.activeCategory,
            modelId: model.id,
            content: friendlyErrorMessage(error),
          }),
        )
        .finally(() => setPending((n) => n - 1));
    }
  };

  return (
    <View style={styles.flex}>
      {/* Header — covers only the title row, with menu and Smart Gen
          sharing it at the edges instead of a whole separate 30px-tall
          row stacked on top just for two buttons. Category/model pills
          get their own row below (unchanged) — putting the icons there
          too overcrowded a mobile-width row and forced Smart Gen to wrap
          onto its own orphaned line. */}
      {/* Title bar shares space with nothing but the title — every prior
          attempt to save vertical space by putting menu/Smart Gen here was
          wrong for the same reason each time: a title bar's one job is the
          title. Utility icons belong with the other interactive controls,
          not stacked into the one row that isn't supposed to have any. */}
      {/* Transparent brand line — the gradient wordmark floats over the
          aurora field (redesign) rather than sitting on an opaque bar. */}
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 4, alignItems: "center", justifyContent: "center" }}>
        <Wordmark />
      </View>

      {/* Utility + grid-scoped row: menu and Smart Gen are fixed bookends;
          category/model/rows/agents pills scroll horizontally between them
          instead of wrapping — a wrapped pill landed on its own orphaned
          line last time, which is worse than just letting the row scroll. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, marginTop: 4, marginBottom: 6 }}>
        <Pressable onPress={openDrawer} style={{ width: 26, height: 26, borderRadius: 13, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
          <GlossButton borderRadius={13} />
          <Ionicons name="menu-outline" size={15} color="#fff" />
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 6 }} style={{ flex: 1 }}>
          <CategoryDropdownTrigger onPress={() => setCategorySelectorVisible(true)} />
          <Pressable onPress={() => setModelSelectorVisible(true)} style={localToolbarStyles.glowChip}>
            <Ionicons name="albums-outline" size={10.5} color="rgba(255,255,255,0.75)" />
            <Text style={localToolbarStyles.glowChipText}>MODELS</Text>
            <Ionicons name="chevron-down" size={10} color="rgba(255,255,255,0.4)" />
          </Pressable>
          <Pressable onPress={() => setRowSelectorVisible(true)} style={[localToolbarStyles.pill, { flexDirection: "row", gap: 2 }]}>
            <Ionicons name="grid-outline" size={9} color="#fff" />
            <Text style={localToolbarStyles.pillText}>{rows}</Text>
          </Pressable>
          {state.activeCategory === "coding" && (() => {
            const activeAgent = state.customAgents.find((a) => a.id === state.activeAgentId[state.activeCategory]);
            return (
              <Pressable
                onPress={() => setAgentSkillsVisible(true)}
                style={[localToolbarStyles.pill, activeAgent && localToolbarStyles.pillActive]}
              >
                <Text style={[localToolbarStyles.pillText, activeAgent && localToolbarStyles.pillTextActive]} numberOfLines={1}>
                  {activeAgent ? activeAgent.name.toUpperCase() : "AGENTS"}
                </Text>
              </Pressable>
            );
          })()}
        </ScrollView>
        {/* Rounded square, not a circle: the sparkle mark is a 4-pointed
            star (an angular glyph), and a perfect circle leaves dead,
            unbalanced space at its points. A squircle backing matches the
            glyph's own shape instead of fighting it. */}
        <Pressable onPress={openRightDrawer} style={{ width: 32, height: 32, borderRadius: 10, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
          <GlossButton borderRadius={10} />
          <SmartGenMark size={24} />
        </Pressable>
      </View>

      {/* Measured Grid view container */}
      {/* marginBottom gives explicit breathing room above the composer — cards
          were sized to fill this container's measured height exactly, which
          left them touching the composer with no visible gap. */}
      <CategoryRail
        onPick={(c) => {
          if (!isCategoryUnlocked(state.tier, c)) { openUpgrade(); return; }
          Haptics.selectionAsync().catch(() => {});
          dispatch({ type: "category", category: c });
        }}
      />

      <View style={{ flex: 1, minHeight: 0, paddingVertical: 4, marginBottom: 10 }} onLayout={(e) => setGridHeight(e.nativeEvent.layout.height)}>
        <CategoryDeck onLocked={openUpgrade}>
          <ScreenTransition
            screenKey={state.activeCategory}
            ordinal={CATEGORIES.findIndex((c) => c.id === state.activeCategory)}
          >
            <CardGrid
              selected={selected}
              openCard={openCard}
              openUpgrade={openUpgrade}
              onLongPressCard={(msg, mId) => {
                setActiveMessage(msg);
                setActiveMessageModelId(mId);
              }}
              rows={rows}
              gridHeight={gridHeight}
            />
          </ScreenTransition>
        </CategoryDeck>
      </View>

      {/* Collide — was a small icon in the composer toolbar; that put it in
          the same row as attach/mic/globe with no visual weight, and the
          user wants it separated out as its own docked banner instead.
          Global view only (no card-view Collide), sits in the gap between
          the grid and the composer so it neither overlaps the model cards
          above nor the composer below.
          General + Coding only — Consensus synthesizes and scores TEXT
          replies to the same prompt. Image/Video/Music models return
          media, not comparable prose, so there's no text verdict to
          produce there; showing it on those tabs would just be a button
          that can never do the one thing it exists to do. */}
      <SinkPresence show={state.activeCategory === "general" || state.activeCategory === "coding"}>
        <CollideBanner onPress={openConsensus} disabled={selected.length <= 1} />
      </SinkPresence>

      <PromptComposer
        value={prompt}
        setValue={setPrompt}
        onSend={submit}
        sending={pending > 0}
        attachments={attachments}
        setAttachments={setAttachments}
        onNewConversation={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); dispatch({ type: "newConversation", category: state.activeCategory }); }}
      />

      <MessageActions
        visible={!!activeMessage}
        message={activeMessage}
        category={state.activeCategory}
        modelId={activeMessageModelId}
        onClose={() => setActiveMessage(null)}
        onRetry={async (m) => {
          setActiveMessage(null);
          await runPromptForModel(m.content, activeMessageModelId);
        }}
      />

      <ModelSelectorDrawer
        visible={modelSelectorVisible}
        onClose={() => setModelSelectorVisible(false)}
        openUpgrade={openUpgrade}
      />

      <CategorySelectorModal
        visible={categorySelectorVisible}
        onClose={() => setCategorySelectorVisible(false)}
      />

      <RowSelectorModal
        visible={rowSelectorVisible}
        onClose={() => setRowSelectorVisible(false)}
        rows={rows}
        setRows={setRows}
      />

      <ConsensusModal
        isOpen={consensus}
        onClose={() => setConsensus(false)}
      />

      <AgentSkillsDrawer
        visible={agentSkillsVisible}
        onClose={() => setAgentSkillsVisible(false)}
        openUpgrade={openUpgrade}
      />
    </View>
  );
}

//  Category meta (icon + accent color per category id)
// Was a per-category rainbow — icon already distinguishes category, so color
// was decorative only. Flattened to one neutral (black & white direction).
const CATEGORY_META: Record<string, { icon: any; color: string }> = {
  general: { icon: "chatbubble-outline", color: "#ffffff" },
  image: { icon: "image-outline", color: "#ffffff" },
  video: { icon: "videocam-outline", color: "#ffffff" },
  music: { icon: "musical-notes-outline", color: "#ffffff" },
  coding: { icon: "code-slash-outline", color: "#ffffff" },
};

//  Category dropdown trigger — small, paired with Models above the grid.
// Text is white with a soft colored glow (textShadow), not a flat color
// fill — "no flat colors, every color should be light, diffused, emitting."
function CategoryDropdownTrigger({ onPress }: { onPress: () => void }) {
  const { state } = useCollider();
  const cat = CATEGORIES.find((c) => c.id === state.activeCategory) || CATEGORIES[0];
  const meta = CATEGORY_META[cat.id] || CATEGORY_META.general;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        height: 24,
        borderRadius: 11,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        shadowColor: "#000",
        shadowOpacity: 0.8,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      }}
    >
      <Ionicons name={meta.icon} size={11} color={meta.color} style={{ opacity: 0.85 }} />
      <Text
        style={{
          color: "rgba(255,255,255,0.9)",
          fontSize: 9.5,
          lineHeight: 12,
          fontWeight: "900", fontFamily: fontFamilyForWeight(900),
          letterSpacing: 0.6,
          textAlignVertical: "center",
          textShadowColor: meta.color,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 14,
        }}
      >
        {cat.label.toUpperCase()}
      </Text>
      <Ionicons name="chevron-down" size={11} color="rgba(255,255,255,0.4)" />
    </Pressable>
  );
}

//  Category selector modal  fold-out list replacing the old pill ribbon
function CategorySelectorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { state, dispatch } = useCollider();
  const { toast } = useToast();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View
          style={[styles.editSheet, { width: Math.min(SCREEN_W - 64, 340), alignSelf: "center", marginTop: 0, maxHeight: "70%", padding: 0, overflow: "hidden" }]}
          onStartShouldSetResponder={() => true}
        >
          <GlossSurface borderRadius={22} />
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900", fontFamily: fontFamilyForWeight(900), textAlign: "center" }}>Select Category</Text>
            <Pressable onPress={onClose} style={{ position: "absolute", right: 16, padding: 4, width: 32, height: 32, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16 }}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {CATEGORIES.map((cat) => {
              const active = state.activeCategory === cat.id;
              const meta = CATEGORY_META[cat.id] || CATEGORY_META.general;
              const unlocked = isCategoryUnlocked(state.tier, cat.id);

              return (
                <Pressable
                  key={cat.id}
                  onPress={() => {
                    if (!unlocked) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                      toast(`Unlock the ${cat.label} suite by upgrading to a higher tier!`);
                      return;
                    }
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    dispatch({ type: "category", category: cat.id });
                    onClose();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    backgroundColor: active ? "rgba(255,255,255,0.04)" : "transparent",
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.05)",
                    justifyContent: "space-between",
                    opacity: unlocked ? 1 : 0.35,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Ionicons name={meta.icon} size={17} color={meta.color} />
                    <Text style={{ color: active ? meta.color : "#fff", fontSize: 14, fontWeight: active ? "800" : "500" }}>
                      {cat.label}
                    </Text>
                  </View>
                  {active && <Ionicons name="checkmark" size={17} color={meta.color} />}
                  {!unlocked && <Ionicons name="lock-closed-outline" size={14} color="rgba(255,255,255,0.5)" />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

//  Row / density selector modal  wires up the previously-dead rowSelectorVisible state
function RowSelectorModal({
  visible, onClose, rows, setRows,
}: {
  visible: boolean;
  onClose: () => void;
  rows: 1 | 2 | 3;
  setRows: (v: 1 | 2 | 3) => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View
          style={[styles.editSheet, { width: Math.min(SCREEN_W - 96, 320), alignSelf: "center", marginTop: 0, padding: 0, overflow: "hidden" }]}
          onStartShouldSetResponder={() => true}
        >
          <GlossSurface borderRadius={22} />
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900", fontFamily: fontFamilyForWeight(900), textAlign: "center" }}>Grid Rows</Text>
            <Pressable onPress={onClose} style={{ position: "absolute", right: 16, padding: 4, width: 32, height: 32, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16 }}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>
          {([1, 2, 3] as const).map((val) => {
            const active = rows === val;
            return (
              <Pressable
                key={val}
                onPress={() => { setRows(val); onClose(); }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  backgroundColor: active ? "rgba(255,255,255,0.04)" : "transparent",
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(255,255,255,0.05)",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="grid-outline" size={16} color={active ? "#ffffff" : "#9a949f"} />
                  <Text style={{ color: active ? "#ffffff" : "#fff", fontSize: 14, fontWeight: active ? "800" : "500", fontFamily: fontFamilyForWeight(active ? 800 : 500) }}>
                    {val} row{val > 1 ? "s" : ""}
                  </Text>
                </View>
                {active && <Ionicons name="checkmark" size={17} color="#ffffff" />}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

function ModelSelectorDrawer({
  visible,
  onClose,
  openUpgrade,
}: {
  visible: boolean;
  onClose: () => void;
  openUpgrade: () => void;
}) {
  const { state, dispatch } = useCollider();
  const cat = state.activeCategory;
  const models = modelsForCategory(cat);
  const selectedIds = state.selectedModelIds[cat];

  // Group by tier
  const freeModels = models.filter((m) => m.tier === "free");
  const proModels = models.filter((m) => m.tier === "pro");
  const eliteModels = models.filter((m) => m.tier === "elite");

  const renderModelRow = (model: ModelDef) => {
    const isSelected = selectedIds.includes(model.id);
    const usable = canUse(state.tier, model);

    return (
      <Pressable
        key={model.id}
        onPress={() => {
          if (!usable) {
            onClose();
            openUpgrade();
            return;
          }
          dispatch({ type: "toggleModel", category: cat, modelId: model.id });
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 16,
          backgroundColor: isSelected ? "rgba(255,255,255,0.04)" : "transparent",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.05)",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{
                color: isSelected ? model.color : "#fff",
                fontWeight: isSelected ? "800" : "700",
                fontSize: 14,
                textShadowColor: isSelected ? model.color : "transparent",
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: isSelected ? 6 : 0,
              }}
            >
              {model.label}
            </Text>
            <View style={{ backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 10, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>{model.short}</Text>
            </View>
          </View>
          <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 11 }}>{model.desc || "High-quality model for general tasks."}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {!usable ? (
            <View style={{ backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ color: "#ffffff", fontSize: 9, fontWeight: "900", fontFamily: fontFamilyForWeight(900), letterSpacing: 1 }}>LOCK</Text>
            </View>
          ) : (
            isSelected && (
              <Ionicons
                name="checkmark"
                size={18}
                color={model.color}
                style={{ textShadowColor: model.color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 14 } as any}
              />
            )
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View style={[styles.editSheet, { width: Math.min(SCREEN_W - 64, 340), alignSelf: "center", marginTop: 0, maxHeight: "70%", padding: 0, overflow: "hidden" }]} onStartShouldSetResponder={() => true}>
          <GlossSurface borderRadius={22} />
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900", fontFamily: fontFamilyForWeight(900), textAlign: "center" }}>Select Models {cat.toUpperCase()}</Text>
            <Pressable onPress={onClose} style={{ position: "absolute", right: 16, padding: 4, width: 32, height: 32, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16 }}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {freeModels.length > 0 && (
              <View>
                <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 10, letterSpacing: 1.5, fontWeight: "900", fontFamily: fontFamilyForWeight(900), paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.04)" }}>FREE MODELS</Text>
                {freeModels.map(renderModelRow)}
              </View>
            )}
            {proModels.length > 0 && (
              <View>
                <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 10, letterSpacing: 1.5, fontWeight: "900", fontFamily: fontFamilyForWeight(900), paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.04)" }}>PRO MODELS</Text>
                {proModels.map(renderModelRow)}
              </View>
            )}
            {eliteModels.length > 0 && (
              <View>
                <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 10, letterSpacing: 1.5, fontWeight: "900", fontFamily: fontFamilyForWeight(900), paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.04)" }}>ELITE MODELS</Text>
                {eliteModels.map(renderModelRow)}
              </View>
            )}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

function CategoryTabs() {
  return null;
}

//  Model tray (active selected models only, drawer launches + layout popover) 


//  Card grid 


//  Media Components for Chat Renders 
// Plays the actual generated audio (a data:audio/... URI from
// callOpenRouterMusic) via expo-av's Audio.Sound. This replaced a
// component that just spun a vinyl-disc animation on tap — no sound ever
// played, regardless of what was "generated". Play state now comes from
// the real sound object's status, not a local boolean toggled on a timer.
function AudioPlayerControls({ uri }: { uri: string }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync().catch(() => {}); };
  }, []);

  useEffect(() => {
    let anim: any;
    if (playing) {
      anim = Animated.loop(
        Animated.timing(rotation, { toValue: 1, duration: 6000, useEasing: false, useNativeDriver: true } as any)
      );
      anim.start();
    } else {
      rotation.setValue(0);
    }
    return () => { if (anim) anim.stop(); };
  }, [playing]);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const toggle = async () => {
    if (!soundRef.current) {
      setLoading(true);
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (status) => { if (status.isLoaded) setPlaying(status.isPlaying); },
        );
        soundRef.current = sound;
      } catch {
        setLoading(false);
        return;
      }
      setLoading(false);
      return;
    }
    const status = await soundRef.current.getStatusAsync();
    if (status.isLoaded && status.isPlaying) await soundRef.current.pauseAsync();
    else await soundRef.current.playAsync();
  };

  return (
    <View style={styles.playerRow}>
      <Animated.View style={[styles.vinylDisc, { transform: [{ rotate: spin }] }]}>
        <View style={styles.vinylCenter} />
      </Animated.View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>Generated track</Text>
        <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 10 }}>Lyria 3 (via OpenRouter)</Text>
      </View>
      <Pressable onPress={toggle} disabled={loading} style={styles.playPauseBtn}>
        {loading ? <ActivityIndicator size="small" color="#000" /> : <Ionicons name={playing ? "pause" : "play"} size={13} color="#000" />}
      </Pressable>
    </View>
  );
}

// Plays the actual generated clip (a data:video/mp4 URI from
// callOpenRouterVideo). This replaced a component that always played the
// same hardcoded stock nebula clip from mixkit.co regardless of the prompt
// or model — literally showing fake footage no matter what was asked for.
function VideoPlayer({ uri }: { uri: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <View style={styles.videoSimContainer}>
      <Video
        source={{ uri }}
        rate={1.0}
        volume={1.0}
        resizeMode={ResizeMode.COVER}
        shouldPlay={playing}
        isLooping
        useNativeControls={false}
        style={StyleSheet.absoluteFill}
      />
      <Pressable onPress={() => setPlaying((p) => !p)} style={styles.videoSimPlayBtn}>
        <Ionicons name={playing ? "pause" : "play"} size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

function ModelSelectorRow({ selected, onSelect }: { selected?: string; onSelect: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
      <View style={{ flexDirection: "row", gap: 6, paddingVertical: 2 }}>
        <Pressable
          onPress={() => onSelect("global")}
          style={[{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }, selected === "global" && { backgroundColor: "rgba(255,255,255,0.15)", borderColor: "#fff" }]}
        >
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>GLOBAL</Text>
        </Pressable>
        {MODELS.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => onSelect(m.id)}
            style={[{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }, selected === m.id && { backgroundColor: `${m.color}25`, borderColor: m.color }]}
          >
            <Text style={{ color: selected === m.id ? m.color : "rgba(238,241,246,0.45)", fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>{m.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

// Read-only source-model label — this is organizational metadata ("which
// model did this come from"), not a setting. Letting a user "reassign" the
// source model would corrupt that history for no real benefit, so this is a
// badge, not a picker (see ModelSelectorRow above, which IS an editable
// picker, used where the model genuinely is a user choice — e.g. files).
function SourceModelBadge({ modelId }: { modelId?: string }) {
  const model = modelId && modelId !== "global" ? modelById(modelId) : undefined;
  const color = model?.color || "rgba(255,255,255,0.5)";
  const label = model?.label || "Global Context";
  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
        marginVertical: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
        backgroundColor: `${color}18`, borderWidth: 1, borderColor: `${color}40`,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color, fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>{label}</Text>
    </View>
  );
}

// Shared "linked items" section for the Reminder/Memory/Project/Artifact edit
// modals — shows what's attached, and a picker to attach more, using the
// links bag + linkItems() action already in state.tsx. Optional dispatch/state
// props on the parent modals mean existing call sites (the standalone
// Memory/Reminders/Projects screens) are unaffected unless they opt in.
function LinkedItemsBlock({
  item, kind, dispatch, state,
}: {
  item: { id: string; links?: any };
  kind: "memory" | "reminder" | "project" | "artifact";
  dispatch: any;
  state: any;
}) {
  const [attaching, setAttaching] = useState(false);
  const links = item.links || { memories: [], reminders: [], projects: [], artifacts: [] };

  const titleFor = (k: string, id: string): string => {
    if (k === "memory") return state.memories.find((m: any) => m.id === id)?.content?.slice(0, 44) || "(deleted)";
    if (k === "reminder") return state.reminders.find((r: any) => r.id === id)?.title || "(deleted)";
    if (k === "project") return state.projects.find((p: any) => p.id === id)?.name || "(deleted)";
    return state.artifacts.find((a: any) => a.id === id)?.title || "(deleted)";
  };

  const allLinked: { kind: string; id: string }[] = [
    ...links.memories.map((id: string) => ({ kind: "memory", id })),
    ...links.reminders.map((id: string) => ({ kind: "reminder", id })),
    ...links.projects.map((id: string) => ({ kind: "project", id })),
    ...links.artifacts.map((id: string) => ({ kind: "artifact", id })),
  ];

  const candidates: { kind: string; id: string; title: string }[] = [
    ...state.memories.filter((m: any) => !(kind === "memory" && m.id === item.id)).map((m: any) => ({ kind: "memory", id: m.id, title: m.content.slice(0, 44) })),
    ...state.reminders.filter((r: any) => !(kind === "reminder" && r.id === item.id)).map((r: any) => ({ kind: "reminder", id: r.id, title: r.title })),
    ...state.projects.filter((p: any) => !(kind === "project" && p.id === item.id)).map((p: any) => ({ kind: "project", id: p.id, title: p.name })),
    ...state.artifacts.filter((a: any) => !(kind === "artifact" && a.id === item.id)).map((a: any) => ({ kind: "artifact", id: a.id, title: a.title })),
  ].filter((c) => !allLinked.some((l) => l.kind === c.kind && l.id === c.id));

  return (
    <View style={{ marginTop: 14 }}>
      <Text style={[styles.kicker, { fontSize: 10 }]}>LINKED ITEMS ({allLinked.length})</Text>
      {allLinked.length === 0 ? (
        <Text style={[styles.muted, { fontSize: 11, marginTop: 4 }]}>Nothing attached yet.</Text>
      ) : (
        <View style={{ marginTop: 6, gap: 6 }}>
          {allLinked.map((l) => (
            <View key={`${l.kind}_${l.id}`} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 8, gap: 8 }}>
              <Text style={{ color: "#fff", fontSize: 11, flex: 1 }}>
                <Text style={{ color: "rgba(238,241,246,0.45)", fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>{l.kind.toUpperCase()}  </Text>
                {titleFor(l.kind, l.id)}
              </Text>
              <Pressable
                onPress={() => dispatch({ type: "unlinkItems", a: { kind, id: item.id }, b: { kind: l.kind as any, id: l.id } })}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={15} color="rgba(255,255,255,0.3)" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <Pressable onPress={() => setAttaching(true)} style={{ marginTop: 8, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
        <Text style={{ color: "#5dbdff", fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>+ Attach existing item</Text>
      </Pressable>

      <Modal transparent visible={attaching} animationType="fade" onRequestClose={() => setAttaching(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAttaching(false)}>
          <View style={[styles.editSheet, { width: SCREEN_W - 40, maxHeight: "70%" }]} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetKicker}>Attach to this item</Text>
            <ScrollView style={{ marginTop: 8 }}>
              {candidates.length === 0 ? (
                <Text style={styles.muted}>Nothing else to attach.</Text>
              ) : candidates.map((c) => (
                <Pressable
                  key={`${c.kind}_${c.id}`}
                  onPress={() => {
                    dispatch({ type: "linkItems", a: { kind, id: item.id }, b: { kind: c.kind as any, id: c.id } });
                    setAttaching(false);
                  }}
                  style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}
                >
                  <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 9, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>{c.kind.toUpperCase()}</Text>
                  <ExpandableTrayText style={{ color: "#fff", fontSize: 12 }} text={c.title} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function ReminderEditModal({
  visible,
  item,
  onClose,
  onSave,
  onDelete,
  dispatch: linkDispatch,
  state: linkState,
}: {
  visible: boolean;
  item: any;
  onClose: () => void;
  onSave: (updated: any) => void;
  onDelete: (id: string) => void;
  dispatch?: any;
  state?: any;
}) {
  const [title, setTitle] = useDraft(`reminder:${item?.id}:title`, item?.title || "");
  const [dueText, setDueText] = useState(item?.due ? new Date(item.due).toLocaleDateString() : "");
  const [timeText, setTimeText] = useState(item?.time || "");
  const [calendarTitle, setCalendarTitle] = useState(item?.calendarTitle || "Personal Calendar");
  const [priority, setPriority] = useState<Priority>(item?.priority || "none");
  const [progress, setProgress] = useState<Progress>(item?.progress || "todo");
  const [tags, setTags] = useDraft(`reminder:${item?.id}:tags`, item?.tags?.join(", ") || "");
  const [modelId, setModelId] = useState(item?.modelId || "global");

  useEffect(() => {
    if (item) {
      setTitle(item.title || "");
      setDueText(item.due ? new Date(item.due).toLocaleDateString() : "");
      setTimeText(item.time || "");
      setCalendarTitle(item.calendarTitle || "Personal Calendar");
      setPriority(item.priority || "none");
      setProgress(item.progress || "todo");
      setTags(item.tags?.join(", ") || "");
      setModelId(item.modelId || "global");
    }
  }, [item]);

  const handleSave = () => {
    const parsedDate = dueText ? Date.parse(dueText) : undefined;
    linkDispatch?.({ type: "clearDrafts", prefix: `reminder:${item?.id}:` });
    onSave({
      ...item,
      title: title.trim(),
      due: isNaN(parsedDate as any) ? item.due : parsedDate,
      time: timeText.trim(),
      calendarTitle: calendarTitle.trim(),
      priority,
      progress,
      tags: tags.split(",").map((t: string) => t.trim()).filter(Boolean),
      modelId,
    });
  };

  const accent = "#5dbdff"; // Reminders' own color — matches its Google Calendar/sync UI.

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Glass isCard style={[styles.editSheet, { width: SCREEN_W - 32, marginTop: 40, maxHeight: "90%", borderColor: `${accent}40` }]}>
          <ScrollView showsVerticalScrollIndicator={false} onStartShouldSetResponder={() => true}>
            <Text style={[styles.sheetKicker, { color: accent }]}>Smart Reminder & Calendar</Text>
            <TextInput style={styles.editInput} value={title} onChangeText={setTitle} placeholder="Reminder Title" placeholderTextColor="rgba(238,241,246,0.5)" />

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>CALENDAR & SCHEDULE</Text>
            <TextInput style={styles.editInput} value={calendarTitle} onChangeText={setCalendarTitle} placeholder="Calendar e.g. Work, Family" placeholderTextColor="rgba(238,241,246,0.5)" />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kicker, { fontSize: 9 }]}>Date (MM/DD/YYYY)</Text>
                <TextInput style={[styles.editInput, { marginTop: 3 }]} value={dueText} onChangeText={setDueText} placeholder="e.g. 07/15/2026" placeholderTextColor="rgba(238,241,246,0.5)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kicker, { fontSize: 9 }]}>Time (HH:MM AM/PM)</Text>
                <TextInput style={[styles.editInput, { marginTop: 3 }]} value={timeText} onChangeText={setTimeText} placeholder="e.g. 10:30 AM" placeholderTextColor="rgba(238,241,246,0.5)" />
              </View>
            </View>

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>PRIORITY</Text>
            <View style={{ flexDirection: "row", gap: 6, marginVertical: 4 }}>
              {(["none", "high"] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPriority(p)}
                  style={[
                    styles.prioBtn,
                    priority === p && {
                      backgroundColor: p === "high" ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.14)",
                      borderColor: p === "high" ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.3)"
                    }
                  ]}
                >
                  <Text style={{ fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900), color: priority === p ? (p === "high" ? "#ef4444" : "#fff") : "#fff" }}>
                    {p.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>PROGRESS</Text>
            <View style={{ flexDirection: "row", gap: 6, marginVertical: 4 }}>
              {(["todo", "inprogress", "done"] as const).map((pr) => (
                <Pressable key={pr} onPress={() => setProgress(pr)} style={[styles.prioBtn, progress === pr && { backgroundColor: "rgba(255,255,255,0.18)", borderColor: "rgba(255,255,255,0.5)" }]}>
                  <Text style={{ fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900), color: progress === pr ? "#ffffff" : "#fff" }}>{pr.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>SOURCE MODEL</Text>
            <SourceModelBadge modelId={modelId} />

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>TAGS (comma separated)</Text>
            <TextInput style={styles.editInput} value={tags} onChangeText={setTags} placeholder="e.g. work, urgent" placeholderTextColor="rgba(238,241,246,0.5)" />

            {linkDispatch && linkState && item && (
              <LinkedItemsBlock item={item} kind="reminder" dispatch={linkDispatch} state={linkState} />
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Pressable onPress={handleSave} style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: `${accent}22`, borderColor: `${accent}80`, shadowColor: accent }]}><Text style={[styles.primaryText, { color: accent }]}>Save</Text></Pressable>
              <Pressable onPress={() => onDelete(item.id)} style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.5)", shadowColor: "#ef4444" }]}><Text style={[styles.primaryText, { color: "#ef4444" }]}>Delete</Text></Pressable>
            </View>
          </ScrollView>
        </Glass>
      </Pressable>
    </Modal>
  );
}

export function MemoryEditModal({
  visible,
  item,
  projects,
  onClose,
  onSave,
  onDelete,
  dispatch: linkDispatch,
  state: linkState,
}: {
  visible: boolean;
  item: any;
  projects: any[];
  onClose: () => void;
  onSave: (updated: any) => void;
  onDelete: (id: string) => void;
  dispatch?: any;
  state?: any;
}) {
  const [content, setContent] = useDraft(`memory:${item?.id}:content`, item?.content || "");
  const [priority, setPriority] = useState<Priority>(item?.priority || "none");
  const [tags, setTags] = useDraft(`memory:${item?.id}:tags`, item?.tags?.join(", ") || "");
  const [modelId, setModelId] = useState(item?.modelId || "global");
  const [projectId, setProjectId] = useState(item?.projectId || "");

  useEffect(() => {
    if (item) {
      setContent(item.content || "");
      setPriority(item.priority || "none");
      setTags(item.tags?.join(", ") || "");
      setModelId(item.modelId || "global");
      setProjectId(item.projectId || "");
    }
  }, [item]);

  const handleSave = () => {
    linkDispatch?.({ type: "clearDrafts", prefix: `memory:${item?.id}:` });
    onSave({
      ...item,
      content: content.trim(),
      priority,
      tags: tags.split(",").map((t: string) => t.trim()).filter(Boolean),
      modelId,
      projectId: projectId || undefined,
    });
  };

  const accent = "#ffffff";

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Glass isCard style={[styles.editSheet, { width: SCREEN_W - 32, marginTop: 40, maxHeight: "90%", borderColor: `${accent}40` }]}>
          <ScrollView showsVerticalScrollIndicator={false} onStartShouldSetResponder={() => true}>
            <Text style={[styles.sheetKicker, { color: accent }]}>Smart Memory detail</Text>
            
            <Text style={[styles.kicker, { fontSize: 10, marginTop: 6 }]}>MEMORY CONTENT</Text>
            <TextInput
              style={[styles.editInput, { minHeight: 100, textAlignVertical: "top" }]}
              value={content}
              onChangeText={setContent}
              multiline
              placeholder="What should Collider remember?"
              placeholderTextColor="rgba(238,241,246,0.5)"
            />

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>PRIORITY</Text>
            <View style={{ flexDirection: "row", gap: 6, marginVertical: 4 }}>
              {(["none", "high"] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPriority(p)}
                  style={[
                    styles.prioBtn,
                    priority === p && {
                      backgroundColor: p === "high" ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.14)",
                      borderColor: p === "high" ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.3)"
                    }
                  ]}
                >
                  <Text style={{ fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900), color: priority === p ? (p === "high" ? "#ef4444" : "#fff") : "#fff" }}>
                    {p.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>SOURCE MODEL</Text>
            <SourceModelBadge modelId={modelId} />

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>TAGS (comma separated)</Text>
            <TextInput style={styles.editInput} value={tags} onChangeText={setTags} placeholder="e.g. preference, context" placeholderTextColor="rgba(238,241,246,0.5)" />

            {linkDispatch && linkState && item && (
              <LinkedItemsBlock item={item} kind="memory" dispatch={linkDispatch} state={linkState} />
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Pressable onPress={handleSave} style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: `${accent}22`, borderColor: `${accent}80`, shadowColor: accent }]}><Text style={[styles.primaryText, { color: accent }]}>Save</Text></Pressable>
              <Pressable onPress={() => onDelete(item.id)} style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.5)", shadowColor: "#ef4444" }]}><Text style={[styles.primaryText, { color: "#ef4444" }]}>Delete</Text></Pressable>
            </View>
          </ScrollView>
        </Glass>
      </Pressable>
    </Modal>
  );
}

export function ProjectEditModal({
  visible,
  item,
  onClose,
  onSave,
  onDelete,
  dispatch,
  state: linkState,
}: {
  visible: boolean;
  item: any;
  onClose: () => void;
  onSave: (updated: any) => void;
  onDelete: (id: string) => void;
  dispatch: any;
  state?: any;
}) {
  const [name, setName] = useDraft(`project:${item?.id}:name`, item?.name || "");
  const [modelId, setModelId] = useState(item?.modelId || "global");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("none");

  useEffect(() => {
    if (item) {
      setName(item.name || "");
      setModelId(item.modelId || "global");
    }
  }, [item]);

  const handleSave = () => {
    dispatch({ type: "clearDrafts", prefix: `project:${item?.id}:` });
    onSave({
      ...item,
      name: name.trim(),
      modelId,
    });
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    dispatch({
      type: "task",
      projectId: item.id,
      title: newTaskTitle.trim(),
      priority: newTaskPriority,
    });
    setNewTaskTitle("");
    setNewTaskPriority("none");
  };

  const accent = "#ffffff";

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Glass isCard style={[styles.editSheet, { width: SCREEN_W - 32, marginTop: 40, maxHeight: "90%", borderColor: `${accent}40` }]}>
          <ScrollView showsVerticalScrollIndicator={false} onStartShouldSetResponder={() => true}>
            <Text style={[styles.sheetKicker, { color: accent }]}>Smart Project detail</Text>
            <TextInput style={styles.editInput} value={name} onChangeText={setName} placeholder="Project Name" placeholderTextColor="rgba(238,241,246,0.5)" />

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>SOURCE MODEL</Text>
            <SourceModelBadge modelId={modelId} />

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>TASKS BOARD ({item?.tasks?.length || 0})</Text>
            <View style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 8, marginVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
              {item?.tasks?.length === 0 ? (
                <Text style={[styles.muted, { padding: 8 }]}>No tasks added yet.</Text>
              ) : (
                item?.tasks?.map((t: any) => (
                  <View key={t.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
                    <Pressable onPress={() => dispatch({ type: "toggleTask", projectId: item.id, taskId: t.id })} style={{ paddingHorizontal: 6 }}>
                      <Text style={{ color: "#fff", fontSize: 14 }}>{t.done ? "✓" : "○"}</Text>
                    </Pressable>
                    <Text style={[{ flex: 1, color: "#fff", fontSize: 13 }, t.done && styles.done]}>{t.title}</Text>
                    {/* med was amber/gold (#ffb74d) — SPEC.md bans gold as an
                        accent outright. True yellow is the spec-approved
                        substitute for a third priority tier (high=crimson,
                        low=blue, med=true yellow — not orange/gold). */}
                    {t.priority && t.priority !== "none" && (
                      <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: t.priority === "high" ? "rgba(239,68,68,0.2)" : t.priority === "med" ? "rgba(245,224,0,0.2)" : "rgba(93,189,255,0.2)", marginRight: 6 }}>
                        <Text style={{ fontSize: 7, color: t.priority === "high" ? "#ef4444" : t.priority === "med" ? "#f5e000" : "#5dbdff", fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>{t.priority.toUpperCase()}</Text>
                      </View>
                    )}
                    <Pressable onPress={() => dispatch({ type: "removeTask", projectId: item.id, taskId: t.id })} style={{ paddingHorizontal: 6 }}>
                      <Text style={{ color: "#ef4444", fontSize: 11 }}></Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>

            {/* Add task inline */}
            <Text style={[styles.kicker, { fontSize: 9, marginTop: 8 }]}>Add New Task</Text>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginTop: 4 }}>
              <TextInput
                style={[styles.editInput, { flex: 1, marginTop: 0 }]}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                placeholder="Task title..."
                placeholderTextColor="rgba(238,241,246,0.5)"
              />
              <Pressable onPress={handleAddTask} style={[styles.primaryBtn, { marginTop: 0, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: `${accent}22`, borderColor: `${accent}80`, shadowColor: accent }]}>
                <Text style={[styles.primaryText, { color: accent }]}></Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
              {(["none", "high"] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setNewTaskPriority(p)}
                  style={[
                    styles.prioBtn,
                    { paddingVertical: 4 },
                    newTaskPriority === p && {
                      backgroundColor: p === "high" ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.14)",
                      borderColor: p === "high" ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.3)"
                    }
                  ]}
                >
                  <Text style={{ fontSize: 9, fontWeight: "900", fontFamily: fontFamilyForWeight(900), color: newTaskPriority === p ? (p === "high" ? "#ef4444" : "#fff") : "#fff" }}>
                    {p.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            {dispatch && linkState && item && (
              <LinkedItemsBlock item={item} kind="project" dispatch={dispatch} state={linkState} />
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
              <Pressable onPress={handleSave} style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: `${accent}22`, borderColor: `${accent}80`, shadowColor: accent }]}><Text style={[styles.primaryText, { color: accent }]}>Save Project</Text></Pressable>
              <Pressable onPress={() => onDelete(item.id)} style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.5)", shadowColor: "#ef4444" }]}><Text style={[styles.primaryText, { color: "#ef4444" }]}>Delete</Text></Pressable>
            </View>
          </ScrollView>
        </Glass>
      </Pressable>
    </Modal>
  );
}

const ARTIFACT_KINDS: Artifact["kind"][] = ["timeline", "statement", "document", "custom"];

function kindColor(kind: Artifact["kind"]): string {
  switch (kind) {
    case "timeline": return "#5dbdff";
    case "statement": return "#ffffff"; // was gold — banned accent per SPEC.md
    case "document": return "#ffffff";
    default: return "rgba(238,241,246,0.45)";
  }
}

export function ArtifactEditModal({
  visible,
  item,
  onClose,
  onSave,
  onDelete,
  dispatch,
  state: linkState,
}: {
  visible: boolean;
  item: Artifact | null;
  onClose: () => void;
  onSave: (updated: Artifact) => void;
  onDelete: (id: string) => void;
  dispatch: any;
  state: any;
}) {
  const [title, setTitle] = useDraft(`artifact:${item?.id}:title`, item?.title || "");
  const [content, setContent] = useDraft(`artifact:${item?.id}:content`, item?.content || "");
  const [kind, setKind] = useState<Artifact["kind"]>(item?.kind || "custom");
  // Research-mode chat content is saved with real markdown structure (the
  // Markdown component already renders it in chat), but this editor only
  // ever showed it as a raw TextInput — headers, bullets, bold all stayed
  // literal asterisks and hashes instead of rendering, which is most of
  // what a competitor's "artifact" view actually offers.
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    if (item) {
      setTitle(item.title || "");
      setContent(item.content || "");
      setKind(item.kind || "custom");
      setPreviewMode(false);
    }
  }, [item]);

  if (!item) return null;
  const handleSave = () => { dispatch({ type: "clearDrafts", prefix: `artifact:${item?.id}:` }); return onSave({ ...item, title: title.trim(), content: content.trim(), kind }); };
  const handleExport = () => {
    Share.share({ message: content, title: title || "Artifact" }).catch(() => {});
  };
  const accent = kindColor(kind);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Glass isCard style={[styles.editSheet, { width: SCREEN_W - 32, marginTop: 40, maxHeight: "90%", borderColor: `${accent}40` }]}>
          <ScrollView showsVerticalScrollIndicator={false} onStartShouldSetResponder={() => true}>
            <Text style={[styles.sheetKicker, { color: accent }]}>Smart Artifact detail</Text>

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 6 }]}>TITLE</Text>
            <TextInput style={styles.editInput} value={title} onChangeText={setTitle} placeholder="Artifact title" placeholderTextColor="rgba(238,241,246,0.5)" />

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>KIND (tap to swap type)</Text>
            <View style={{ flexDirection: "row", gap: 6, marginVertical: 4, flexWrap: "wrap" }}>
              {ARTIFACT_KINDS.map((k) => {
                const kColor = kindColor(k);
                return (
                  <Pressable
                    key={k}
                    onPress={() => setKind(k)}
                    style={[styles.prioBtn, kind === k && { backgroundColor: `${kColor}22`, borderColor: `${kColor}80` }]}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900), color: kind === k ? kColor : "#fff" }}>{k.toUpperCase()}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
              <Text style={styles.kicker}>CONTENT</Text>
              <View style={{ flexDirection: "row", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
                {(["edit", "preview"] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setPreviewMode(m === "preview")}
                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: (m === "preview") === previewMode ? "rgba(255,255,255,0.12)" : "transparent" }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "800", fontFamily: fontFamilyForWeight(800), color: (m === "preview") === previewMode ? "#fff" : "rgba(238,241,246,0.45)" }}>{m.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {previewMode ? (
              <View style={{ minHeight: 140, padding: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginTop: 4 }}>
                {content.trim() ? (
                  <Markdown content={content} color="#fff" fontSize={13} />
                ) : (
                  <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 12, fontStyle: "italic" }}>Nothing to preview yet.</Text>
                )}
              </View>
            ) : (
              <TextInput
                style={[styles.editInput, { minHeight: 140, textAlignVertical: "top" }]}
                value={content}
                onChangeText={setContent}
                multiline
                placeholder="Artifact content..."
                placeholderTextColor="rgba(238,241,246,0.5)"
              />
            )}

            {(item as any).modelId && (
              <>
                <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>SOURCE MODEL</Text>
                <SourceModelBadge modelId={(item as any).modelId} />
              </>
            )}

            {dispatch && linkState && (
              <LinkedItemsBlock item={item} kind="artifact" dispatch={dispatch} state={linkState} />
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Pressable onPress={handleSave} style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: `${accent}22`, borderColor: `${accent}80`, shadowColor: accent }]}><Text style={[styles.primaryText, { color: accent }]}>Save</Text></Pressable>
              <Pressable onPress={handleExport} style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.25)", shadowColor: "#fff" }]}><Text style={[styles.primaryText, { color: "#e2e8f0" }]}>Export</Text></Pressable>
              <Pressable onPress={() => onDelete(item.id)} style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.5)", shadowColor: "#ef4444" }]}><Text style={[styles.primaryText, { color: "#ef4444" }]}>Delete</Text></Pressable>
            </View>
          </ScrollView>
        </Glass>
      </Pressable>
    </Modal>
  );
}

export function FileEditModal({
  visible,
  item,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  item: any;
  onClose: () => void;
  onSave: (updated: any) => void;
  onDelete: (id: string) => void;
}) {
  const { dispatch: fileDraftDispatch } = useCollider();
  const [name, setName] = useDraft(`file:${item?.id}:name`, item?.name || "");
  const [modelId, setModelId] = useState(item?.modelId || "global");
  const [textContent, setTextContent] = useState("");
  const isImage = item?.url?.startsWith("data:image") || item?.url?.startsWith("https://image") || item?.url?.includes(".png") || item?.url?.includes(".jpg") || item?.url?.includes(".jpeg") || item?.name?.endsWith(".jpg") || item?.name?.endsWith(".png");
  const isEditableText = item?.url?.startsWith("text://") || item?.name?.endsWith(".txt") || item?.name?.endsWith(".json") || item?.url?.startsWith("local://");

  useEffect(() => {
    if (item) {
      setName(item.name || "");
      setModelId(item.modelId || "global");
      if (isEditableText) {
        if (item.url?.startsWith("text://")) {
          setTextContent(decodeURIComponent(item.url.slice(7)));
        } else {
          setTextContent(item.url || "Local text file context");
        }
      }
    }
  }, [item, isEditableText]);

  const handleSave = () => {
    let finalUrl = item.url;
    if (isEditableText) {
      finalUrl = `text://${encodeURIComponent(textContent)}`;
    }
    fileDraftDispatch({ type: "clearDrafts", prefix: `file:${item?.id}:` });
    onSave({
      ...item,
      name: name.trim(),
      modelId,
      url: finalUrl,
    });
  };

  const handleShare = () => {
    let shareText = `File: ${name}\nType: ${item.kind}\n`;
    if (isEditableText) {
      shareText += `Content:\n${textContent}`;
    } else {
      shareText += `URL: ${item.url}`;
    }
    Share.share({ message: shareText, title: name }).catch(() => {});
  };

  const fileModel = modelId && modelId !== "global" ? modelById(modelId) : undefined;
  const accent = fileModel?.color || "#5dbdff";

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Glass isCard style={[styles.editSheet, { width: SCREEN_W - 32, marginTop: 40, maxHeight: "90%", borderColor: `${accent}40` }]}>
          <ScrollView showsVerticalScrollIndicator={false} onStartShouldSetResponder={() => true}>
            <Text style={[styles.sheetKicker, { color: accent }]}>Smart File detail</Text>
            
            <Text style={[styles.kicker, { fontSize: 10, marginTop: 6 }]}>FILE NAME</Text>
            <TextInput style={styles.editInput} value={name} onChangeText={setName} placeholder="File Name" placeholderTextColor="rgba(238,241,246,0.5)" />

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>AI MODEL CONTEXT</Text>
            <ModelSelectorRow selected={modelId} onSelect={setModelId} />

            <Text style={[styles.kicker, { fontSize: 10, marginTop: 12 }]}>FILE DATA PREVIEW</Text>
            {isImage && item.url ? (
              <View style={{ height: 180, borderRadius: 12, overflow: "hidden", marginVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
                <ImageBackground source={{ uri: item.url }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              </View>
            ) : isEditableText ? (
              <TextInput
                style={[styles.editInput, { minHeight: 120, textAlignVertical: "top", fontFamily: "monospace", fontSize: 12 }]}
                value={textContent}
                onChangeText={setTextContent}
                multiline
                placeholder="File contents..."
                placeholderTextColor="rgba(238,241,246,0.5)"
              />
            ) : (
              <View style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 12, marginVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
                <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 11, fontFamily: "monospace" }}>{item?.url || "No content url available."}</Text>
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Pressable onPress={handleShare} style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.25)" }]}>
                <Text style={[styles.primaryText, { color: "#fff" }]}>Share</Text>
              </Pressable>
              <Pressable onPress={handleSave} style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: `${accent}22`, borderColor: `${accent}80`, shadowColor: accent }]}><Text style={[styles.primaryText, { color: accent }]}>Save</Text></Pressable>
              <Pressable onPress={() => onDelete(item.id)} style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.5)", shadowColor: "#ef4444" }]}><Text style={[styles.primaryText, { color: "#ef4444" }]}>Delete</Text></Pressable>
            </View>
          </ScrollView>
        </Glass>
      </Pressable>
    </Modal>
  );
}

//  Card detail
//  Card detail 
function CardScreen({
  modelId, openRightDrawer, goBack, openHistory, openReminders, attachments, setAttachments,
}: {
  modelId?: string;
  openRightDrawer: (modelId?: string) => void;
  goBack: () => void;
  openHistory: () => void;
  openReminders: () => void;
  attachments: Attachment[];
  setAttachments: any;
}) {
  const { state, dispatch, getState } = useCollider();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const [sending, setSending] = useState(false);
  const [activeMessage, setActiveMessage] = useState<ChatMessage | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "memory" | "projects" | "files" | "reminders">("chat");
  const [consensus, setConsensus] = useState(false);

  // Scoped input states
  const [newMemory, setNewMemory] = useState("");
  const [newReminder, setNewReminder] = useState("");
  const [selectedProjId, setSelectedProjId] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingCardReminder, setEditingCardReminder] = useState<any | null>(null);
  // Always land on the TOP of the latest message — after sending, as a
  // streamed reply grows, and after switching back to the chat tab.
  //
  // Tracks message id, not the last y value: gating on "has y changed" let
  // a stale early-streaming measurement (taken before the previous bubble
  // had finished laying out) lock in permanently, since the target
  // bubble's own y offset barely moves once set — landing a few lines into
  // the tail of the PREVIOUS message instead of the top of the new one,
  // with no further correction as the reply kept streaming in. Re-issuing
  // scrollTo on every layout pass lets it self-correct as measurements
  // settle; only the jump to a genuinely new message animates.
  const chatScrollRef = useRef<ScrollView>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  const model = modelId ? modelById(modelId) : undefined;
  const cat = state.activeCategory;
  const prompt = model ? (state.cardPrompts[cat]?.[model.id] ?? "") : "";
  const setPrompt = (v: string) => {
    if (model) dispatch({ type: "cardPrompt", category: cat, modelId: model.id, value: v });
  };
  // Card view tracks its own conversation pointer per model (falling back to
  // the shared one until the user explicitly starts a new local thread), so
  // switching or resetting conversation here never yanks other models' cards.
  const convId = state.activeConversationId[cat] || "";
  const conv = state.conversations.find(
    (c) => c.id === convId,
  );
  const thread = model ? conv?.threads[model.id] || [] : [];
  const [confirmingNewConvo, setConfirmingNewConvo] = useState(false);
  if (!model)
    return (
      <Page title="Model" goBack={goBack}>
        <Text style={styles.bodyText}>Model not found.</Text>
      </Page>
    );

  const runPrompt = async (text: string, attachments: Attachment[] = []) => {
    setSending(true);
    // Free tier: 20 msgs/day on general chat (the only category free users can reach).
    if (isMessageLimitReached(state)) {
      toast(`You've reached the Free plan limit (${FREE_DAILY_LIMIT} messages/day or ${FREE_MONTHLY_LIMIT}/month). Upgrade to Pro or Elite for unlimited general chat.`);
      setSending(false);
      goBack();
      return;
    }
    if (cat !== "general" && state.credits < model.weight) {
      toast(`Insufficient daily credits. You need ${model.weight} credits to run this model, but only have ${state.credits}. Please upgrade or wait for tomorrow's refill.`);
      setSending(false);
      return;
    }
    dispatch({ type: "recordMessageSent" });
    dispatch({ type: "spend", credits: model.weight });
    smartCaptureText(text, dispatch, { autoGen: state.autoGen, incognito: !!state.incognito[cat], modelId: model.id, convId });
    const userContent = attachments.length
      ? `${text}${text ? "\n\n" : ""} ${attachments.length} attachment${attachments.length > 1 ? "s" : ""}`
      : text;
    dispatch({
      type: "append", category: cat, modelId: model.id, convId,
      message: { id: `u_${Date.now()}_${model.id}`, role: "user", content: userContent, ts: Date.now() },
    });
    dispatch({
      type: "append", category: cat, modelId: model.id, convId,
      message: { id: `a_${Date.now()}_${model.id}`, role: "assistant", content: "", modelId: model.id, ts: Date.now() },
    });
    if (model.locked) {
      // Credits were already spent above; this path never issues a request, so
      // charging for it is pure loss to the user.
      if (cat !== "general") dispatch({ type: "refund", credits: model.weight });
      dispatch({ type: "replaceLastAssistant", category: cat, modelId: model.id, content: "Locked  upgrade to unlock this provider.", convId });
      setSending(false); return;
    }
    try {
      const onToken = makeThrottledToken((partial) => {
        dispatch({ type: "replaceLastAssistant", category: cat, modelId: model.id, content: partial, streaming: true, convId });
      });
      const answer = await sendChatWithRetry(model.id, thread, text, state.memories, {
        mode: state.chatMode[cat], webSearch: state.webSearch[cat], customInstructions: state.customInstructions,
        agentInstructions: state.customAgents.find((a) => a.id === state.activeAgentId[cat])?.instructions,
        skillInstructions: resolveSkillInstructions(state.activeSkills),
        attachments, onToken,
      });
      dispatch({ type: "replaceLastAssistant", category: cat, modelId: model.id, content: answer || "No response returned.", convId });
      if (answer) {
        smartCaptureReply(answer, dispatch, getState, { autoGen: state.autoGen, incognito: !!state.incognito[cat], modelId: model.id, convId });
        saveResearchArtifact(text, answer, state.chatMode[cat], dispatch, model.id);
      }
      const imgMatch = answer && answer.match(/(https:\/\/image\.pollinations\.ai\/[^\s)]+)/);
      if (imgMatch) {
        dispatch({ type: "file", file: { name: `${model.id}-${Date.now().toString(36)}.png`, kind: "generated", url: imgMatch[1] } });
        dispatch({ type: "addGeneration", generation: { prompt: text, url: imgMatch[1], modelId: model.id, category: cat } });
      }
    } catch (e: any) {
      // See the grid-view send path: credits are spent up-front, so a failed
      // request must return them or the user pays for nothing.
      if (cat !== "general") dispatch({ type: "refund", credits: model.weight });
      dispatch({ type: "replaceLastAssistant", category: cat, modelId: model.id, content: friendlyErrorMessage(e), convId });
    } finally { setSending(false); }
  };

  const submit = async (attachments: Attachment[] = [], compiledText?: string) => {
    const text = compiledText !== undefined ? compiledText.trim() : prompt.trim();
    if ((!text && attachments.length === 0) || sending) return;
    setPrompt("");
    await runPrompt(text, attachments);
  };

  // Retries the last assistant turn in place (same message slot) using the
  // user message right before it — only ever offered on the thread's final
  // bubble, since replaceLastAssistant always targets the last message.
  const retryLast = async () => {
    if (sending || thread.length < 2) return;
    const lastUser = thread[thread.length - 2];
    if (lastUser.role !== "user") return;
    // Retry re-issues a full provider request, so it costs exactly what the
    // original send cost. Previously this path charged nothing, which made
    // retrying a weight-30 video model an unlimited free re-roll — a real
    // margin hole, not just an inconsistency. Gate on balance the same way
    // the send paths do.
    if (cat !== "general") {
      if (state.credits < model.weight) {
        toast(`Insufficient daily credits. Retrying this model costs ${model.weight} credits, but you have ${state.credits}.`);
        return;
      }
      dispatch({ type: "spend", credits: model.weight });
    }
    setSending(true);
    try {
      const onToken = makeThrottledToken((partial) => {
        dispatch({ type: "replaceLastAssistant", category: cat, modelId: model.id, content: partial, streaming: true, convId });
      });
      const answer = await sendChatWithRetry(model.id, thread.slice(0, -2), lastUser.content, state.memories, {
        mode: state.chatMode[cat], webSearch: state.webSearch[cat], customInstructions: state.customInstructions,
        agentInstructions: state.customAgents.find((a) => a.id === state.activeAgentId[cat])?.instructions,
        skillInstructions: resolveSkillInstructions(state.activeSkills),
        onToken,
      });
      dispatch({ type: "replaceLastAssistant", category: cat, modelId: model.id, content: answer || "No response returned.", convId });
      if (answer) {
        smartCaptureReply(answer, dispatch, getState, { autoGen: state.autoGen, incognito: !!state.incognito[cat], modelId: model.id, convId });
        saveResearchArtifact(lastUser.content, answer, state.chatMode[cat], dispatch, model.id);
      }
    } catch (e: any) {
      if (cat !== "general") dispatch({ type: "refund", credits: model.weight });
      dispatch({ type: "replaceLastAssistant", category: cat, modelId: model.id, content: friendlyErrorMessage(e), convId });
    } finally { setSending(false); }
  };

  return (
    <View style={[styles.flex, { backgroundColor: "rgba(4, 4, 4, 0.45)" }]}>
      {/* Header — orientation only: back + title. No buttons here; headers
          are for "where am I", not controls. */}
      <View style={[styles.header, { paddingTop: insets.top, height: 52 + insets.top, overflow: "hidden" }]}>
        <GlossSurface />
        <IconButton iconName="chevron-back" onPress={goBack} />
        <Text style={[styles.pageTitle, { color: model.color }]}>{model.label}</Text>
        <View style={{ width: 40 }} />
      </View>
      <LinearGradient
        colors={["#040404", "rgba(4,4,4,0)"]}
        style={{ height: 10, marginTop: -1 }}
        pointerEvents="none"
      />

      {/* Sub Tabs Tray — same conventions as the global view's utility row:
          same translucent chip style as the CATEGORY/MODELS pills (not an
          inverted solid-white toggle found nowhere else in the app), same
          34px translucent icon-button style as the hamburger/Smart Gen
          icons up top (not the larger, differently-toned iconBtn). The
          icon pair sits in its own opaque-backed box so scrolled tab text
          can never visually bleed through underneath it. */}
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#040404", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, paddingVertical: 8 }} style={{ flex: 1 }}>
          {(["chat", "memory", "projects", "files", "reminders"] as const).map((t) => {
            const active = activeTab === t;
            const label = t === "chat" ? "Conversation History" : t.charAt(0).toUpperCase() + t.slice(1);
            return (
              <Pressable
                key={t}
                onPress={() => setActiveTab(t)}
                style={[
                  styles.subTab,
                  active && { backgroundColor: "rgba(255,255,255,0.14)", borderColor: "rgba(255,255,255,0.25)" },
                ]}
              >
                <Text
                  style={[
                    styles.subTabText,
                    active && { color: "#ffffff", fontWeight: "900", fontFamily: fontFamilyForWeight(900) },
                  ]}
                >
                  {label.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 10, backgroundColor: "#040404" }}>
          <Pressable onPress={openHistory} style={localToolbarStyles.toolbarIconBtn}>
            <Ionicons name="time-outline" size={16} color="#fff" />
          </Pressable>
          <Pressable onPress={() => openRightDrawer(model.id)} style={localToolbarStyles.toolbarIconBtn}>
            <SmartGenMark size={18} />
          </Pressable>
        </View>
      </View>

      {/* Tab Contents */}
      {activeTab === "chat" && (
        <View style={styles.flex}>
          <View style={{ flex: 1, position: "relative" }}>
            <ScrollView
              ref={chatScrollRef}
              contentContainerStyle={styles.messageList}
            >
              {thread.length === 0 ? (
                <Text style={styles.muted}>No messages yet. Long-press any message for options.</Text>
              ) : (
                thread.map((message, idx) => (
                  <Pressable
                    key={message.id}
                    onLayout={(e) => {
                      if (idx === thread.length - 1) {
                        const y = e.nativeEvent.layout.y;
                        const isNewMessage = lastMessageIdRef.current !== message.id;
                        if (isNewMessage) lastMessageIdRef.current = message.id;
                        chatScrollRef.current?.scrollTo({ y, animated: isNewMessage });
                      }
                    }}
                    onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveMessage(message); }}
                    delayLongPress={380}
                  >
                    <View
                      style={[
                        styles.bubble,
                        message.role === "user"
                          ? styles.userBubble
                          : { borderColor: `${model.color}22`, backgroundColor: "rgba(23,16,38,0.15)" },
                        (message.role === "assistant" && (model.category.includes("image") || model.category.includes("audio") || model.category.includes("video"))) && { width: "100%", maxWidth: "90%" }
                      ]}
                    >
                      {message.role === "assistant" && model.category.includes("image") && message.content ? (
                        <View style={{ width: "100%" }}>
                          <View style={styles.chatMediaContainer}>
                            <ImageBackground source={{ uri: message.content }} style={styles.chatMediaImage} resizeMode="contain" />
                            <View style={[styles.chatMediaControls, { gap: 12 }]}>
                              <Pressable 
                                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); Share.share({ message: message.content }).catch(() => {}); }}
                                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                              >
                                <Ionicons name="share-social-outline" size={12} color="#ffffff" />
                                <Text style={{ color: "#ffffff", fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>Share</Text>
                              </Pressable>
                              <Pressable 
                                onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); toast("Saved to gallery!"); }}
                                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                              >
                                <Ionicons name="download-outline" size={12} color="#ffffff" />
                                <Text style={{ color: "#ffffff", fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>Save</Text>
                              </Pressable>
                            </View>
                          </View>
                          <Text style={[styles.bodyText, { marginTop: 6, fontSize: 12, opacity: 0.8 }]}>{message.content}</Text>
                        </View>
                      ) : message.role === "assistant" && model.category.includes("audio") && message.content?.startsWith("data:audio") ? (
                        <View style={[styles.audioPlayerCard, { backgroundColor: "rgba(255,255,255,0.05)" }]}>
                          <Text style={{ color: "#ffffff", fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900), marginBottom: 4 }}> {model.label.toUpperCase()}</Text>
                          <AudioPlayerControls uri={message.content} />
                        </View>
                      ) : message.role === "assistant" && model.category.includes("video") && message.content?.startsWith("data:video") ? (
                        <View style={[styles.videoPlayerCard, { backgroundColor: "rgba(255,255,255,0.05)" }]}>
                          <Text style={{ color: "#ffffff", fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900), marginBottom: 4 }}> {model.label.toUpperCase()}</Text>
                          <VideoPlayer uri={message.content} />
                        </View>
                      ) : (
                        <Markdown content={message.content || ""} color="#fff" fontSize={14} />
                      )}
                      {idx === thread.length - 1 && message.role === "assistant" && !sending &&
                        (message.content === "No response returned." || message.content.startsWith("Error:")) && (
                        <Pressable
                          onPress={retryLast}
                          style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: `${model.color}18`, borderWidth: 1, borderColor: `${model.color}40` }}
                        >
                          <Ionicons name="refresh" size={11} color={model.color} />
                          <Text style={{ color: model.color, fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>Retry</Text>
                        </Pressable>
                      )}
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
            {/* Scroll FABs */}
            {thread.length > 2 && (
              <View style={{ position: "absolute", right: 16, bottom: 24, gap: 12, pointerEvents: "box-none", alignItems: "center" }}>
                <Pressable onPress={() => chatScrollRef.current?.scrollTo({ y: 0, animated: true })} style={[styles.iconBtnLg, { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.2)", borderWidth: StyleSheet.hairlineWidth }]}>
                  <Ionicons name="chevron-up" size={16} color="#fff" />
                </Pressable>
                <Pressable onPress={() => chatScrollRef.current?.scrollToEnd({ animated: true })} style={[styles.iconBtnLg, { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.2)", borderWidth: StyleSheet.hairlineWidth }]}>
                  <Ionicons name="chevron-down" size={16} color="#fff" />
                </Pressable>
              </View>
            )}
            {/* Top Depth Fade */}
            <LinearGradient
              colors={["rgba(255,255,255,0.04)", "rgba(10, 10, 12, 0)"]}
              style={{ position: "absolute", top: 0, left: 0, right: 0, height: 16, zIndex: 10 }}
              pointerEvents="none"
            />
            {/* Bottom Depth Fade */}
            <LinearGradient
              colors={["rgba(10, 10, 12, 0)", "rgba(255,255,255,0.04)"]}
              style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 28, zIndex: 10 }}
              pointerEvents="none"
            />
          </View>
          <PromptComposer
            value={prompt}
            setValue={setPrompt}
            onSend={submit}
            sending={sending}
            attachments={attachments}
            setAttachments={setAttachments}
            onNewConversation={() => setConfirmingNewConvo(true)}
          />
        </View>
      )}

      {/* Confirm before wiping this model's local thread — Card view's "new
          conversation" only ever affects this one model, but it's still a
          one-way reset of what's on screen, so it gets a confirm step. */}
      {confirmingNewConvo && (
        <Modal transparent visible animationType="fade" onRequestClose={() => setConfirmingNewConvo(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setConfirmingNewConvo(false)}>
            <Glass isCard style={{ width: SCREEN_W - 64, alignSelf: "center", marginTop: "auto", marginBottom: "auto", padding: 18, borderRadius: 20, borderColor: `${model.color}40` }}>
              <Text style={[styles.sheetKicker, { color: model.color }]}>Start a new conversation?</Text>
              <Text style={[styles.bodyText, { fontSize: 12.5, lineHeight: 18, marginTop: 6, color: "rgba(255,255,255,0.7)" }]}>
                Start a fresh conversation thread for {model.label}? This will sync globally across all active cards in this category.
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <Pressable onPress={() => setConfirmingNewConvo(false)} style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.2)" }]}>
                  <Text style={[styles.primaryText, { color: "#fff" }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    dispatch({ type: "newConversation", category: cat });
                    setConfirmingNewConvo(false);
                  }}
                  style={[styles.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: `${model.color}22`, borderColor: `${model.color}80`, shadowColor: model.color }]}
                >
                  <Text style={[styles.primaryText, { color: model.color }]}>Start New</Text>
                </Pressable>
              </View>
            </Glass>
          </Pressable>
        </Modal>
      )}

      {activeTab === "memory" && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
          <Text style={styles.kicker}>Model Memories</Text>
          {state.memories.filter((m) => m.modelId === model.id).length === 0 ? (
            <Text style={styles.muted}>No memories captured for this model yet.</Text>
          ) : (
            state.memories.filter((m) => m.modelId === model.id).map((m) => (
              <View key={m.id} style={[styles.dissentCard, { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.06)", borderWidth: 1 }]}>
                <Text style={styles.bodyText}>{m.content}</Text>
                <Pressable style={{ marginTop: 8 }} onPress={() => dispatch({ type: "removeMemory", id: m.id })}>
                  <Text style={{ color: "#ef4444", fontSize: 11 }}>Delete memory</Text>
                </Pressable>
              </View>
            ))
          )}
          <View style={[styles.inlineAdd, { backgroundColor: "rgba(255,255,255,0.05)", marginTop: 14 }]}>
            <TextInput
              style={styles.inlineInput}
              value={newMemory}
              onChangeText={setNewMemory}
              placeholder="Add new memory..."
              placeholderTextColor="rgba(238,241,246,0.5)"
            />
            <Pressable
              onPress={() => {
                if (newMemory.trim()) {
                  dispatch({ type: "memory", content: newMemory.trim(), modelId: model.id });
                  setNewMemory("");
                }
              }}
              style={styles.addBtn}
            >
              <Text style={{ fontSize: 18, color: "#000" }}>+</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      {activeTab === "projects" && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
          <Text style={styles.kicker}>Projects & Model Tasks</Text>
          {/* Scoped to this model, same as Memory/Files/Reminders below —
              Project already carries an optional modelId (auto-generated
              projects are tagged with it), this tab just never filtered by
              it, so every model's card showed the full global project list
              regardless of which model you were looking at. */}
          {state.projects.filter((p) => p.modelId === model.id).map((proj) => (
            <View key={proj.id} style={[styles.dissentCard, { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.06)", borderWidth: 1 }]}>
              <Text style={[styles.textStrong, { color: model.color }]}>{proj.name}</Text>
              {proj.tasks.map((task) => (
                <Pressable
                  key={task.id}
                  onPress={() => dispatch({ type: "toggleTask", projectId: proj.id, taskId: task.id })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}
                >
                  <Text style={{ color: model.color }}>{task.done ? "✓" : "○"}</Text>
                  <Text style={[styles.bodyText, task.done && styles.done]}>{task.title}</Text>
                </Pressable>
              ))}
              <View style={[styles.inlineAdd, { backgroundColor: "rgba(255,255,255,0.05)", marginTop: 10, minHeight: 38, borderRadius: 10 }]}>
                <TextInput
                  style={[styles.inlineInput, { fontSize: 12 }]}
                  placeholder="New task title..."
                  placeholderTextColor="rgba(238,241,246,0.5)"
                  value={selectedProjId === proj.id ? newTaskTitle : ""}
                  onChangeText={(val) => {
                    setSelectedProjId(proj.id);
                    setNewTaskTitle(val);
                  }}
                />
                <Pressable
                  onPress={() => {
                    if (selectedProjId === proj.id && newTaskTitle.trim()) {
                      dispatch({ type: "task", projectId: proj.id, title: newTaskTitle.trim() });
                      setNewTaskTitle("");
                    }
                  }}
                  style={[styles.addBtn, { width: 28, height: 28 }]}
                >
                  <Text style={{ fontSize: 14, color: "#000" }}>+</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {activeTab === "files" && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
          <Text style={styles.kicker}>Model Files</Text>
          {state.files.filter((f) => f.name.includes(model.id) || f.name.includes(model.label.replace(/\s+/g, ""))).length === 0 ? (
            <Text style={styles.muted}>No files generated or uploaded for this model yet.</Text>
          ) : (
            <View style={styles.grid}>
              {state.files.filter((f) => f.name.includes(model.id) || f.name.includes(model.label.replace(/\s+/g, ""))).map((f) => (
                <View key={f.id} style={[styles.fileTile, { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.06)", borderWidth: 1 }]}>
                  <Text style={styles.fileIcon}></Text>
                  <ExpandableTrayText style={[styles.bodyText, { fontSize: 10 }]} text={f.name} />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {activeTab === "reminders" && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
          <Pressable
            onPress={openReminders}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, borderRadius: 12, backgroundColor: "rgba(93,189,255,0.08)", borderWidth: 1, borderColor: "rgba(93,189,255,0.25)" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="calendar-outline" size={14} color="#5dbdff" />
              <Text style={{ color: "#5dbdff", fontSize: 11.5, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>Open full Reminders (Google Calendar & Tasks)</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="#5dbdff" />
          </Pressable>

          <Text style={styles.kicker}>Model Reminders</Text>
          {state.reminders.filter((r) => r.modelId === model.id).length === 0 ? (
            <Text style={styles.muted}>No reminders set for this model.</Text>
          ) : (
            state.reminders.filter((r) => r.modelId === model.id).map((r) => (
              <Pressable
                key={r.id}
                onPress={() => setEditingCardReminder(r)}
                onLongPress={() => dispatch({ type: "toggleReminder", id: r.id })}
                style={[styles.rowItem, { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.06)", borderWidth: 1 }]}
              >
                <Text style={{ fontSize: 16, color: model.color }}>{r.done ? "✓" : "○"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bodyText, r.done && styles.done]}>{r.title}</Text>
                  {r.due && <Text style={{ fontSize: 10, color: "rgba(238,241,246,0.45)" }}>Due: {new Date(r.due).toLocaleString()}</Text>}
                </View>
              </Pressable>
            ))
          )}
          {/* "+" opens the full form (date/time, priority, model, links) —
              same reason as the standalone Reminders screen: a reminder with
              a real due date belongs in a real date field, not guessed out
              of "at 5pm" via regex. Was also using `fingerprint` (the dedup
              key) to tag the owning model, which meant every reminder
              created from this tab shared one fingerprint and all but the
              first got silently dropped as a "duplicate". */}
          <View style={[styles.inlineAdd, { backgroundColor: "rgba(255,255,255,0.05)", marginTop: 14 }]}>
            <TextInput
              style={styles.inlineInput}
              value={newReminder}
              onChangeText={setNewReminder}
              placeholder="Add reminder..."
              placeholderTextColor="rgba(238,241,246,0.5)"
            />
            <Pressable
              onPress={() => {
                const id = newId("r");
                const title = newReminder.trim() || "New Reminder";
                const draft = { id, title, done: false, ts: Date.now(), priority: "none", progress: "todo", modelId: model.id };
                dispatch({ type: "reminder", id, title, modelId: model.id, fingerprint: id });
                setNewReminder("");
                setEditingCardReminder(draft);
              }}
              style={styles.addBtn}
            >
              <Text style={{ fontSize: 18, color: "#000" }}>+</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      <MessageActions
        visible={!!activeMessage}
        message={activeMessage}
        category={state.activeCategory}
        modelId={model.id}
        onClose={() => setActiveMessage(null)}
        onRetry={(m) => runPrompt(m.content)}
        onEdit={(m) => {
          setPrompt(m.content);
          setActiveMessage(null);
        }}
      />

      <ConsensusModal
        isOpen={consensus}
        onClose={() => setConsensus(false)}
      />

      {editingCardReminder && (
        <ReminderEditModal
          visible={!!editingCardReminder}
          item={editingCardReminder}
          onClose={() => setEditingCardReminder(null)}
          onSave={(updated) => {
            dispatch({ type: "updateReminder", reminder: updated });
            setEditingCardReminder(null);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          }}
          onDelete={(id) => {
            dispatch({ type: "removeReminder", id });
            setEditingCardReminder(null);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          }}
          dispatch={dispatch}
          state={state}
        />
      )}
    </View>
  );
}

//  Composer
function Drawer({ close, nav }: { close: () => void; nav: (s: Screen) => void }) {
  const { state, dispatch } = useCollider();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 240, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -300, duration: 180, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      close();
    });
  };

  const handleNav = (screen: Screen) => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -300, duration: 180, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      nav(screen);
      close();
    });
  };

  // Smart Gen tools moved to the right drawer entirely — this pane is now
  // Settings/Account/Usage up top (all demure except Upgrade) plus History
  // as a real sortable table, matching the Reminders table's own pattern
  // (tap a header to sort by it, tap again to flip direction) instead of
  // inventing a second system for the same kind of data.
  const [historyTab, setHistoryTab] = useState<"convos" | "consensus">("convos");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"title" | "created" | "last">("last");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const handleSort = (col: typeof sortBy) => {
    Haptics.selectionAsync().catch(() => {});
    if (col === sortBy) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortBy(col); setSortDir(1); }
  };
  const lastActivity = (conv: Conversation) => {
    let max = conv.createdAt;
    for (const thread of Object.values(conv.threads)) {
      for (const m of thread) if (m.ts > max) max = m.ts;
    }
    return max;
  };
  const modelOptions = [{ label: "Models", value: "all" }, ...MODELS.map((m) => ({ label: m.label, value: m.id }))];
  const filteredConvos = state.conversations
    .filter((c) => modelFilter === "all" || Object.keys(c.threads).includes(modelFilter))
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "title") cmp = (a.title || "").localeCompare(b.title || "");
      else if (sortBy === "created") cmp = a.createdAt - b.createdAt;
      else cmp = lastActivity(a) - lastActivity(b);
      return cmp * sortDir;
    });

  return (
    <View style={styles.overlay}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)", opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.drawer,
          {
            paddingTop: insets.top + 10,
            borderRightWidth: 1.5,
            borderRightColor: "rgba(255,255,255,0.08)",
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        {/* Flat solid black — no fake diagonal highlight. A real gloss
            treatment needs a proper radial specular highlight (see the
            Figma reference), not a hand-built linear-gradient wash. */}
        <GlossSurface flat />

        {/* Pane 1: Account. Everything about who's logged in and their tier
            lives in ONE row — identity, usage, upgrade, settings, close —
            no separate title (the app already has a header; this drawer
            doesn't need to repeat "COLLIDER") and no unrelated actions
            (New Conversation belongs with History below, not here). The
            pane has its own bordered/tinted box so it reads as a distinct
            panel, not just floating rows. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginBottom: 16, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.035)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <Pressable onPress={() => handleNav("settings")} style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 12.5, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }} numberOfLines={1}>
              {state.auth.kind === "guest" ? "Guest Mode" : `${(state.auth as any).email || state.auth.kind}`}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 9.5, fontFamily: FONT_FAMILY, marginTop: 1 }} numberOfLines={1}>
              {TIER_INFO[state.tier].label} ·{" "}
              {state.tier === "free"
                ? `${state.dailyMessagesSent}/${FREE_DAILY_LIMIT} msgs today`
                : `${state.credits.toLocaleString()} credits`}
            </Text>
          </Pressable>
          <Pressable onPress={() => handleNav("upgrade")} style={localDrawerStyles.upgradeBtn}>
            <Ionicons name="rocket-outline" size={12} color="#ffffff" />
            <Text style={{ color: "#ffffff", fontSize: 10.5, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>Upgrade</Text>
          </Pressable>
          <Pressable onPress={() => handleNav("settings")} style={localDrawerStyles.utilIcon}>
            <Ionicons name="settings-outline" size={16} color="rgba(255,255,255,0.5)" />
          </Pressable>
          <Pressable onPress={handleClose} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="close" size={16} color="#fff" />
          </Pressable>
        </View>

        {/* Search — moved here from the header, which had to carry it at
            full width on every screen whether or not anyone was searching.
            It belongs in the drawer with everything else it searches
            across (conversations, memories, reminders, projects,
            artifacts), not pinned above the card grid. */}
        <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 9.5, fontWeight: "800", fontFamily: fontFamilyForWeight(800), letterSpacing: 1.5, marginBottom: 8 }}>
          SEARCH
        </Text>
        <View style={{ marginBottom: 16 }}>
          <InlineSearch onNavigate={(s) => handleNav(s)} />
        </View>

        {/* Pane 2: History. Visually separate pane — its own label, its own
            bordered box below — instead of the account row and the
            conversation list just running together with no boundary. */}
        <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 9.5, fontWeight: "800", fontFamily: fontFamilyForWeight(800), letterSpacing: 1.5, marginBottom: 8 }}>
          HISTORY
        </Text>

        {/* Regular size, matching the rest of this drawer — this used to be
            a full oversized hero row (bold text, 18px icon, its own filled
            card, extra bottom padding) despite the composer already having
            its own "+" new-conversation button on the message bar. Kept
            (both are useful — this one doesn't require opening the composer
            first) but sized like everything else here, not like a headline. */}
        <Pressable
          onPress={() => {
            dispatch({ type: "newConversation", category: state.activeCategory });
            handleClose();
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}
        >
          <Ionicons name="add-circle-outline" size={14} color="rgba(255,255,255,0.5)" />
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11.5, fontWeight: "700", fontFamily: fontFamilyForWeight(700) }}>New conversation</Text>
        </Pressable>

        {/* History — same sortable-table pattern as Reminders: tap a header
            to sort by it, tap again to flip direction. Consensus is a tab
            lip alongside Conversations, not a separate screen. */}
        <View style={{ flexDirection: "row", marginBottom: 8, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
          {(["convos", "consensus"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setHistoryTab(t)}
              style={{ flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: "center", backgroundColor: historyTab === t ? "rgba(255,255,255,0.08)" : "transparent" }}
            >
              <Text style={{ color: historyTab === t ? "#fff" : "rgba(238,241,246,0.45)", fontSize: 10, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>
                {t === "convos" ? `CONVERSATIONS (${state.conversations.length})` : `CONSENSUS (${state.consensusRuns.length})`}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Column headers + model filter in one row, but with real breathing
            room this time — the filter picker was stripped down to zero
            padding and packed at gap:4 right against LAST, which is exactly
            what made it look like it was touching. */}
        {historyTab === "convos" && (
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 10 }}>
            <Pressable onPress={() => handleSort("title")} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Text style={localDrawerStyles.colHeader}>TITLE</Text>
              {sortBy === "title" && <Ionicons name={sortDir === 1 ? "chevron-up" : "chevron-down"} size={9} color="#e2e8f0" />}
            </Pressable>
            <Pressable onPress={() => handleSort("created")} style={{ width: 46, flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Text style={localDrawerStyles.colHeader}>MADE</Text>
              {sortBy === "created" && <Ionicons name={sortDir === 1 ? "chevron-up" : "chevron-down"} size={9} color="#e2e8f0" />}
            </Pressable>
            <Pressable onPress={() => handleSort("last")} style={{ width: 46, flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Text style={localDrawerStyles.colHeader}>LAST</Text>
              {sortBy === "last" && <Ionicons name={sortDir === 1 ? "chevron-up" : "chevron-down"} size={9} color="#e2e8f0" />}
            </Pressable>
            <View style={{ width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.1)" }} />
            <Picker value={modelFilter} onChange={setModelFilter} options={modelOptions} textStyle={{ fontSize: 9, color: "rgba(238,241,246,0.45)" }} />
          </View>
        )}

        <View style={{ flex: 1, position: "relative" }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {historyTab === "convos" ? (
              filteredConvos.length === 0 ? (
                <Text style={[styles.muted, { marginTop: 20, textAlign: "center" }]}>No conversations yet.</Text>
              ) : (
                filteredConvos.map((conv) => (
                  <Pressable
                    key={conv.id}
                    onPress={() => {
                      dispatch({ type: "loadConversation", category: conv.tab, id: conv.id });
                      handleClose();
                    }}
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", gap: 4 }}
                  >
                    <ExpandableTrayText style={[styles.bodyText, { flex: 1, fontSize: 12 }]} text={conv.title || "Untitled"} />
                    <Text style={{ width: 54, color: "rgba(238,241,246,0.45)", fontSize: 9.5, fontFamily: FONT_FAMILY }}>{new Date(conv.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
                    <Text style={{ width: 54, color: "rgba(238,241,246,0.45)", fontSize: 9.5, fontFamily: FONT_FAMILY }}>{new Date(lastActivity(conv)).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
                  </Pressable>
                ))
              )
            ) : (
              state.consensusRuns.length === 0 ? (
                <Text style={[styles.muted, { marginTop: 20, textAlign: "center" }]}>No consensus runs archived yet.</Text>
              ) : (
                state.consensusRuns.map((run) => (
                  <ConsensusRunCard
                    key={run.id}
                    run={run}
                    onOpen={() => { dispatch({ type: "category", category: run.category }); handleClose(); }}
                    onDelete={() => dispatch({ type: "removeConsensus", id: run.id })}
                  />
                ))
              )
            )}
          </ScrollView>
          {/* Bottom Depth Fade */}
          <LinearGradient
            colors={["rgba(8, 8, 9, 0)", "#080809"]}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, zIndex: 10 }}
            pointerEvents="none"
          />
        </View>
      </Animated.View>
    </View>
  );
}

//  Right Drawer (Generation History / Files) 
function RightDrawer({ close, nav, onRemix, onInsertSource, onInsertContext, scopeModelId }: { close: () => void; nav: (s: Screen) => void; onRemix?: (url: string) => void; onInsertSource?: (url: string) => void; onInsertContext?: (url: string) => void; scopeModelId?: string }) {
  const { state, dispatch } = useCollider();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  // "Tools" = the actual Smart Gen suite (Projects & Tasks, Reminders,
  // Memories, Artifacts) as a simple branded nav list straight to each
  // full screen — no more inline dropdown-driven sub-rendering. "Outputs"
  // (media generations, with remix/insert-as-source/context) is a distinct
  // feature that happened to live in this same drawer; kept as its own tab
  // rather than folded into the Smart Gen list it doesn't belong to.
  const [panel, setPanel] = useState<"tools" | "outputs">("tools");
  const [tab, setTab] = useState<"all" | "image" | "video" | "audio" | "coding">("all");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  // Model filter: defaults to the card's own model when scoped, but stays
  // adjustable — "locks into the relevant model" as a default, not a cage.
  const [modelFilter, setModelFilter] = useState<string>(scopeModelId || "all");

  const slideAnim = useRef(new Animated.Value(300)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 240, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 300, duration: 180, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      close();
    });
  };

  const handleRemix = (url: string) => {
    if (onRemix) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 300, duration: 180, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => {
        onRemix(url);
        close();
      });
    }
  };

  const handleInsertSource = (url: string) => {
    if (onInsertSource) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 300, duration: 180, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => {
        onInsertSource(url);
        close();
      });
    }
  };

  const matchesModel = (id?: string) => modelFilter === "all" || id === modelFilter;
  const list = state.generations.filter((g) => (tab === "all" || g.category === tab) && matchesModel(g.modelId));
  const modelFilterOptions = [{ label: "Models", value: "all" }, { label: "Global (unassigned)", value: "global" }, ...MODELS.map((m) => ({ label: m.label, value: m.id }))];

  const toggleStar = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStarred((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <View style={styles.overlay}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)", opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.drawer,
          {
            right: 0,
            left: undefined,
            paddingTop: insets.top + 10,
            borderLeftWidth: 1.5,
            borderRightWidth: 0,
            borderLeftColor: "rgba(255,255,255,0.08)",
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        {/* Flat solid black — no fake diagonal highlight. A real gloss
            treatment needs a proper radial specular highlight (see the
            Figma reference), not a hand-built linear-gradient wash. */}
        <GlossSurface flat />
        <View style={styles.header}>
          <Text style={styles.kicker}>{scopeModelId ? "MODEL TOOLS" : "SMART GEN"}</Text>
          <Pressable onPress={handleClose} style={{ padding: 6 }}>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: "300" }}></Text>
          </Pressable>
        </View>

        {/* Tools vs Outputs — two genuinely different features that happened
            to share this drawer. A simple two-way toggle instead of burying
            "Outputs" as a 5th option inside what should read as the Smart
            Gen suite. */}
        <View style={{ flexDirection: "row", marginHorizontal: 12, marginBottom: 10, borderRadius: 12, padding: 3, overflow: "hidden" }}>
          <GlossButton borderRadius={12} />
          {(["tools", "outputs"] as const).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPanel(p)}
              style={{ flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: "center", overflow: "hidden" }}
            >
              {panel === p && <GlossButton borderRadius={9} active />}
              <Text style={{ color: panel === p ? "#fff" : "rgba(238,241,246,0.45)", fontSize: 10.5, fontWeight: "900", letterSpacing: 0.5, fontFamily: fontFamilyForWeight(900) }}>
                {p === "tools" ? "SMART GEN TOOLS" : "GENERATIONS"}
              </Text>
            </Pressable>
          ))}
        </View>

        {panel === "tools" ? (
          <>
            <View style={{ paddingHorizontal: 12, gap: 8, flex: 1 }}>
              {/* The icon here is the Smart Gen mark itself (the lightbulb),
                  repeated on every row — a per-tool icon (briefcase/alarm/
                  puzzle/layers) added no information the label text didn't
                  already say; the thing actually worth tagging is "this
                  belongs to Smart Gen," consistently. */}
              {([
                // The Board leads: it's the one surface where every Smart Gen
                // item lives as a card — the four type screens below are the
                // per-type views of the same content.
                { screen: "smartboard" as Screen, label: "Board", count: state.projects.length + state.reminders.length + state.memories.length + state.artifacts.length },
                { screen: "projects" as Screen, label: "Projects & Tasks", count: state.projects.length },
                { screen: "reminders" as Screen, label: "Reminders", count: state.reminders.length },
                { screen: "memory" as Screen, label: "Memories", count: state.memories.length },
                { screen: "artifacts" as Screen, label: "Artifacts", count: state.artifacts.length },
              ]).map((row) => (
                <Pressable
                  key={row.screen}
                  onPress={() => { handleClose(); setTimeout(() => nav(row.screen), 200); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 16, overflow: "hidden" }}
                >
                  <GlossButton borderRadius={16} />
                  {/* Rounded square, not a circle — see the header trigger's
                      comment: the sparkle's 4 points don't fill a circle. */}
                  <View style={{ width: 32, height: 32, borderRadius: 10, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                    <GlossButton borderRadius={10} />
                    <SmartGenMark size={18} />
                  </View>
                  <Text style={[styles.bodyText, { flex: 1, fontSize: 13.5, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }]}>{row.label}</Text>
                  <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>{row.count}</Text>
                  <Ionicons name="chevron-forward" size={14} color="rgba(238,241,246,0.45)" />
                </Pressable>
              ))}

              {/* Files + Discover Market — moved here from the left drawer
                  (they're not "conversation history," and don't belong in
                  Account/Usage either). Not auto-generated Smart Gen content
                  like the four above, so a distinct icon each rather than
                  the Smart Gen mark repeated. */}
              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.04)", marginVertical: 2 }} />
              {([
                { screen: "files" as Screen, label: "Files", count: state.files.length, icon: "document-text-outline" as const },
                { screen: "market" as Screen, label: "Discover Market", count: undefined, icon: "storefront-outline" as const },
              ]).map((row) => (
                <Pressable
                  key={row.screen}
                  onPress={() => { handleClose(); setTimeout(() => nav(row.screen), 200); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 16, overflow: "hidden" }}
                >
                  <GlossButton borderRadius={16} />
                  <View style={{ width: 32, height: 32, borderRadius: 16, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                    <GlossButton borderRadius={16} />
                    <Ionicons name={row.icon} size={16} color="rgba(255,255,255,0.75)" />
                  </View>
                  <Text style={[styles.bodyText, { flex: 1, fontSize: 13.5, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }]}>{row.label}</Text>
                  {row.count !== undefined && (
                    <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 11, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>{row.count}</Text>
                  )}
                  <Ionicons name="chevron-forward" size={14} color="rgba(238,241,246,0.45)" />
                </Pressable>
              ))}
            </View>

            {/* One footer for the whole panel, not one caption per tool —
                the same brain mark used on the drawer's own trigger button,
                so it reads as one consistent brand mark for this feature. */}
            <Pressable
              onPress={() => { handleClose(); setTimeout(() => nav("settings"), 200); }}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, margin: 12, padding: 12, borderRadius: 14, overflow: "hidden" }}
            >
              <GlossButton borderRadius={14} />
              <View style={{ marginTop: 1 }}>
                <SmartGenMark size={16} />
              </View>
              <Text style={{ flex: 1, color: "rgba(238,241,246,0.5)", fontSize: 10.5, lineHeight: 15, fontFamily: FONT_FAMILY }}>
                Smart Gen auto-creates projects, reminders and artifacts from your conversations — no permission prompts, just delivered. Tap to turn it off in Settings.
              </Text>
            </Pressable>
          </>
        ) : (
        <>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 8, flexWrap: "wrap" }}>
          <View style={{ flexDirection: "row", paddingHorizontal: 0, gap: 4, flexWrap: "wrap" }}>
            {(["all", "image", "video", "audio", "coding"] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[
                  { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.04)" },
                  tab === t && { backgroundColor: "rgba(255,255,255,0.6)" },
                ]}
              >
                <Text style={[{ fontSize: 10, color: "#fff", fontWeight: "900", fontFamily: fontFamilyForWeight(900) }, tab === t && { color: "#000" }]}>
                  {t.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Ionicons name="filter-outline" size={11} color="rgba(238,241,246,0.45)" />
            <Picker
              value={modelFilter}
              onChange={setModelFilter}
              options={modelFilterOptions}
              textStyle={{ fontSize: 11, color: "rgba(238,241,246,0.45)" }}
            />
          </View>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {list.length === 0 ? (
            <Text style={[styles.muted, { marginTop: 20 }]}>No generations found in this category.</Text>
          ) : (
            list.map((g) => (
              <Glass key={g.id} style={{ padding: 10, marginBottom: 8, borderColor: "rgba(255,255,255,0.08)" }}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  {g.url ? (
                    <Pressable onPress={() => setPreviewUrl(g.url)}>
                      <ImageBackground source={{ uri: g.url }} style={{ width: 44, height: 44, borderRadius: 6, overflow: "hidden" }} resizeMode="cover">
                        {starred[g.id] && (
                          <View style={{ position: "absolute", top: 2, right: 2, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 8, padding: 2 }}>
                            <Ionicons name="star" size={10} color="#ffffff" />
                          </View>
                        )}
                      </ImageBackground>
                    </Pressable>
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900", fontFamily: fontFamilyForWeight(900) }}>DOC</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <ExpandableTrayText style={[styles.bodyText, { fontSize: 11 }]} text={g.prompt} />
                    <Text style={[styles.muted, { fontSize: 9 }]}>{new Date(g.ts).toLocaleDateString()}</Text>
                  </View>
                  <Pressable onPress={() => toggleStar(g.id)} style={{ padding: 4 }}>
                    <Ionicons name={starred[g.id] ? "star" : "star-outline"} size={16} color={starred[g.id] ? "#ffffff" : "rgba(255,255,255,0.3)"} />
                  </Pressable>
                </View>

                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 6, flexWrap: "wrap", gap: 8 }}>
                  <Pressable onPress={() => setPreviewUrl(g.url)}><Text style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>View</Text></Pressable>
                  {onRemix && <Pressable onPress={() => handleRemix(g.url)}><Text style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>Remix</Text></Pressable>}
                  {onInsertSource && <Pressable onPress={() => handleInsertSource(g.url)}><Text style={{ fontSize: 10, color: "#5dbdff" }}>+ Source</Text></Pressable>}
                  {onInsertContext && <Pressable onPress={() => onInsertContext(g.url)}><Text style={{ fontSize: 10, color: "#ffffff" }}>+ Context</Text></Pressable>}
                  <Pressable onPress={() => {
                    dispatch({
                      type: "publishToMarket",
                      item: {
                        kind: g.category === "coding" ? "coding" : g.category === "audio" ? "audio" : g.category === "video" ? "video" : "image",
                        prompt: g.prompt,
                        model: g.modelId,
                        author: state.auth.kind === "guest" ? "@guest" : `@${state.auth.email.split('@')[0]}`,
                        url: g.url,
                      }
                    });
                    toast("Published successfully to Discover Market!");
                  }}><Text style={{ fontSize: 10, color: "#e2e8f0" }}>Publish</Text></Pressable>
                  <Pressable onPress={() => dispatch({ type: "removeGeneration", id: g.id })}><Text style={{ fontSize: 10, color: "#ef4444" }}>Delete</Text></Pressable>
                </View>
              </Glass>
            ))
          )}
        </ScrollView>
        </>
        )}
      </Animated.View>

      {/* Embedded Full Screen Preview modal */}
      {previewUrl && (
        <View style={styles.overlay}>
          <View style={[styles.fullModal, { backgroundColor: "#0c0817" }]}>
            <View style={styles.header}>
              <Text style={styles.kicker}>PREVIEW GENERATION</Text>
              <IconButton iconName="close" onPress={() => setPreviewUrl(null)} />
            </View>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
              <ImageBackground source={{ uri: previewUrl }} style={{ width: SCREEN_W - 32, height: SCREEN_W - 32 }} resizeMode="contain" />
            </View>
          </View>
        </View>
      )}

    </View>
  );
}

function IconButton({ iconName, onPress }: { iconName: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.iconBtn}>
      <Ionicons name={iconName as any} size={20} color="#ffffff" />
    </Pressable>
  );
}

// Smart Gen's identifying mark. A brain reads as "you need to think to use
// this" — a deterrent, not an invitation. A thought bubble reads as a quick,
// lighthearted pop of an idea — curiosity, not cognitive effort. No
// circle-in-a-circle framing — the bubble's own shape is already the mark.
// A cloud shape is inherently soft/nebulous, so it needs a bold outline to
// read as a deliberate icon rather than a blur — glyph fonts don't expose a
// stroke, so this fakes one by stacking a slightly larger black copy of the
// same glyph directly behind the white one (a bold silhouette peeking out
// around every edge, same trick as a text-stroke).
// Third attempt at this icon this session — "thought-bubble" read as smoke,
// a mushroom cloud, or an unreadable blob depending on who you asked. Not
// guessing a fourth hand-drawn shape: sparkles is the actual industry
// convention for "AI / smart generation" (ChatGPT, Gemini, and Claude's own
// UI all use it), so there's no ambiguity left to introduce.
// Yellow gradient sparkle. Ionicons glyphs are single-color, so the
// gradient is baked into custom SVG paths instead. Confirmed rendering
// correctly at every size tested (an 8x and a 10x CSS-scaled screenshot
// both showed the gradient clearly) — the recurring "can't see it" problem
// was never the gradient failing, it was genuine low legibility at small
// size against a busy dark header. A soft glow behind the glyph (not just
// a bigger size) is the actual fix for at-a-glance visibility.
function SmartGenMark({ size = 18 }: { size?: number }) {
  const gradId = "smartGenSparkleGrad";
  return (
    <View style={{ shadowColor: "rgba(230,236,244,0.7)", shadowOpacity: 0.9, shadowRadius: size * 0.4, shadowOffset: { width: 0, height: 0 } }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Defs>
          <SvgGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#ffffff" />
            <Stop offset="1" stopColor="#8b95a8" />
          </SvgGradient>
        </Defs>
        <Path
          d="M12 2C12.4 7.2 13 12 22 12C13 12 12.4 16.8 12 22C11.6 16.8 11 12 2 12C11 12 11.6 7.2 12 2Z"
          fill={`url(#${gradId})`}
        />
        <Path
          d="M19 3C19.2 5 19.5 6 22 6C19.5 6 19.2 7 19 9C18.8 7 18.5 6 16 6C18.5 6 18.8 5 19 3Z"
          fill={`url(#${gradId})`}
        />
      </Svg>
    </View>
  );
}


