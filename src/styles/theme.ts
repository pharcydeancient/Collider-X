import { StyleSheet, Dimensions } from "react-native";

export const SCREEN_W = Dimensions.get("window").width;
export const SCREEN_H = Dimensions.get("window").height;

// ── Type system (Collider redesign) ──────────────────────────────────────
// Two families, loaded as separate static-weight files (see App.tsx useFonts):
//   • Instrument Sans — the body/display face (400/500/600/700)
//   • IBM Plex Mono   — every technical label, tier badge, score and kicker
// Each weight is its own loaded file, so a style that sets fontWeight:"700"
// while fontFamily points at the Regular file gets a faux/synthetic bold that
// reads thin and blurry at small sizes. fontFamilyForWeight resolves to the
// correct real file so "bold" is an actual bold face, not a faux render.
export const FONT_REGULAR = "Inter_400Regular";
export const FONT_MEDIUM = "Inter_500Medium";
export const FONT_SEMIBOLD = "Inter_600SemiBold";
export const FONT_BOLD = "Inter_700Bold";
export const FONT_EXTRABOLD = "Inter_800ExtraBold";
export const FONT_FAMILY = FONT_REGULAR;

// IBM Plex Mono — the redesign's "instrument panel" voice: ALIGN, CONSENSUS,
// tier badges, scores, credits, timestamps. Applied explicitly per-style via
// fontFamily: FONT_MONO (or the `mono` helper) since withFont only fills the
// gap for the sans default.
// Headers are Inter too, heavier and tighter — one typeface across the app,
// as the original design had it. A display serif (Playfair) was introduced
// later and read as a different app's header pasted on top of this one.
export const FONT_DISPLAY = "Inter_700Bold";
export const FONT_DISPLAY_BLACK = "Inter_800ExtraBold";

export const FONT_MONO = "JetBrainsMono_500Medium";
export const FONT_MONO_REGULAR = "JetBrainsMono_400Regular";
export const FONT_MONO_SEMIBOLD = "JetBrainsMono_600SemiBold";

export function fontFamilyForWeight(weight?: string | number): string {
  const w = weight === "bold" ? 700 : typeof weight === "string" ? parseInt(weight, 10) || 400 : weight || 400;
  if (w >= 800) return FONT_EXTRABOLD;
  if (w >= 700) return FONT_BOLD;
  if (w >= 600) return FONT_SEMIBOLD;
  if (w >= 500) return FONT_MEDIUM;
  return FONT_REGULAR;
}

// Convenience: an IBM Plex Mono text style at a given weight.
export function monoFamily(weight?: string | number): string {
  const w = weight === "bold" ? 700 : typeof weight === "string" ? parseInt(weight, 10) || 400 : weight || 400;
  if (w >= 600) return FONT_MONO_SEMIBOLD;
  if (w >= 500) return FONT_MONO;
  return FONT_MONO_REGULAR;
}

// ── Design tokens (redesign) ──────────────────────────────────────────────
// Central palette for the aurora-glass system so screens/components stop
// hardcoding the same rgba strings. The app deliberately went neutral once;
// this reintroduces per-model color + a cool aurora field as the redesign
// direction (see the uploaded Collider_Redesign reference).
export const T = {
  bg: "#07080b",
  bgRaise: "#0b0c10",
  ink: "#eef1f6",
  inkSoft: "rgba(238,241,246,0.9)",
  inkDim: "rgba(238,241,246,0.6)",
  inkFaint: "rgba(238,241,246,0.45)",
  inkGhost: "rgba(238,241,246,0.32)",
  line: "rgba(255,255,255,0.1)",
  lineSoft: "rgba(255,255,255,0.07)",
  lineStrong: "rgba(255,255,255,0.22)",
  glassLo: "rgba(255,255,255,0.05)",
  glassMid: "rgba(255,255,255,0.07)",
  inset: "rgba(255,255,255,0.13)",
  aurora: "rgba(60,80,140,0.28)",
  good: "#7ee2a8",
  dissent: "#ff6a5c",
};

// The glass card gradient used across the redesign (LinearGradient colors).
// The final stop was rgba(10,12,18,0.35) — a 35% dark wash laid over the
// user's wallpaper by every card on screen, which is what broke the image up
// into panels instead of letting it read as one surface. Cut to 0.14: enough
// to hold text contrast, light enough that the wallpaper stays continuous
// behind the cards. 0.14 was too far the other way — settings rows over a
// bright wallpaper stopped being readable — so this sits between the two.
export const GLASS_CARD = ["rgba(255,255,255,0.06)", "rgba(255,255,255,0.022)", "rgba(10,12,18,0.22)"] as [string, string, string];
export const GLASS_PANEL = ["rgba(255,255,255,0.08)", "rgba(14,16,22,0.6)"] as [string, string];

// Exported so per-screen local StyleSheets (UpgradeScreen, etc.) can opt into
// the same base typeface instead of silently falling back to the platform
// default font — that mismatch is exactly what read as "unprofessional" on
// the Upgrade screen's numbers, which live in a local StyleSheet that never
// got this applied.
export const withFont = (raw: Record<string, any>) =>
  Object.fromEntries(Object.entries(raw).map(([k, v]) => [
    k,
    { ...v, fontFamily: v.fontFamily || fontFamilyForWeight(v.fontWeight) },
  ]));

export const styles = StyleSheet.create(withFont({
  bg: { flex: 1, backgroundColor: "#07080b" },
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },

  // ── Title Bar — dedicated brand line. Transparent now: the aurora field
  // shows straight through the chrome instead of a hard black bar sitting on
  // top of it (redesign has no opaque header). ──
  titleBar: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },

  // ── Toolbar — utility controls row ──
  toolbar: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "transparent",
  },

  // Neutral black/white chrome — no purple/blue tint. Palette rule: black +
  // white as the two base colors, one warm accent (gold/orange, used only
  // where something is genuinely interactive/branded — Collide, active
  // states), everywhere else stays neutral.
  // Rounded-square glass tiles (redesign) instead of solid black circles —
  // faint white fill + hairline over the aurora, not an opaque chip.
  iconBtn: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 7,
  },
  iconText: { color: "#dfe7f2", fontSize: 19, fontWeight: "600" },

  // Wordmark — premium brand identity
  wordmarkWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  wordmarkAccent: {
    width: 24,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 1,
  },
  wordmarkText: {
    color: "#f4f7fb",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 9,
    // Cool specular halo — the redesign's wordmark is a white→slate gradient
    // clip (approximated here with a soft luminous glow; a MaskedView gradient
    // is layered in the Wordmark component itself).
    textShadowColor: "rgba(230,236,244,0.28)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },

  pill: {
    height: 34, borderRadius: 17, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
  pillText: { fontSize: 12, fontWeight: "700", letterSpacing: 1 },

  muted: { color: "rgba(238,241,246,0.45)", fontSize: 12 },
  mutedCenter: { color: "rgba(238,241,246,0.45)", fontSize: 12, textAlign: "center" },

  tabRow: { paddingHorizontal: 16, gap: 6, paddingBottom: 10 },
  tab: {
    paddingHorizontal: 14, height: 30, borderRadius: 15,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.3)",
    shadowColor: "rgba(230,236,244,0.4)", shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  tabText: { color: "rgba(238,241,246,0.45)", fontSize: 11, fontWeight: "600", letterSpacing: 1.2 },
  tabTextActive: { color: "#f4f7fb" },
  textStrong: { color: "#fff", fontWeight: "700" },

  // Tray chips — small, pill, with dot + shadow when selected
  tray: { paddingHorizontal: 14, gap: 6, paddingBottom: 6, alignItems: "center" },
  trayDivider: {
    width: 1, height: 18, marginHorizontal: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  chip: {
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { color: "rgba(238,241,246,0.6)", fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  chipLock: { color: "rgba(238,241,246,0.45)", fontSize: 9, marginLeft: 2 },

  // Row selector
  rowSelector: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingBottom: 6, justifyContent: "flex-end",
  },
  rowLabel: { color: "rgba(238,241,246,0.4)", fontFamily: FONT_MONO, fontSize: 8, letterSpacing: 2, marginRight: 4 },
  rowBtn: {
    width: 26, height: 26, borderRadius: 6,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  rowBtnActive: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.3)",
    shadowColor: "rgba(255,255,255,0.25)", shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  rowBtnText: { color: "rgba(238,241,246,0.45)", fontSize: 11, fontWeight: "800" },
  rowBtnTextActive: { color: "#fff" },

  emptyWrap: { flex: 1, paddingHorizontal: 16, justifyContent: "center" },
  empty: { minHeight: 160, borderRadius: 24, alignItems: "center", justifyContent: "center", padding: 24 },

  glass: {
    overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  modelCard: { flex: 1, borderRadius: 20, padding: 7 },
  // Per-model color bloom — sits behind the card content, tinted with the
  // model's own hue at low opacity (redesign's colored corner glow).
  glow: { position: "absolute", width: 120, height: 120, borderRadius: 60, left: -42, bottom: -42, opacity: 0.2 },
  cardTop: { flexDirection: "row", gap: 8 },
  // wordBreak + overflowWrap — RN Web's default text wrapping breaks
  // mid-word ("COMMAND R" -> "COMMAN"/"D R") the moment a card gets narrow
  // (3-row density, smaller viewports). Both properties have to be
  // overridden together: wordBreak:"keep-all" alone doesn't stop it since
  // overflowWrap:"break-word" independently permits mid-word breaks as a
  // fallback. Model names are short enough that breaking only at spaces
  // is always preferable to a broken word.
  cardTitle: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase", textShadowColor: "#000000", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2, wordBreak: "keep-all", overflowWrap: "normal" },
  // Subheader, not a second headline — this used to be bold/white/shadowed,
  // competing with the title right above it instead of sitting quietly under it.
  cardDesc: { color: "rgba(255,255,255,0.5)", fontWeight: "600", fontSize: 9, letterSpacing: 0.1 },
  smallRound: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  cardBody: { marginTop: 4 },
  // Heavier shadow than a typical UI text style — this is what keeps a
  // response legible directly over a busy wallpaper/glass card with no
  // bubble fill behind it, instead of relying on a background box for
  // contrast.
  bodyText: { color: "#ffffff", fontSize: 13, lineHeight: 19, textShadowColor: "rgba(0,0,0,0.85)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 5 },
  placeholder: { color: "#ffffff", fontStyle: "italic", fontSize: 13, textShadowColor: "#000000", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },

  // Sized down from the original (padding 10, radius 22, 34-38px buttons) —
  // competitor composers (ChatGPT, Claude) run a single-line input around
  // 20-24px tall with small icon buttons, not a tall padded card. This was
  // eating a disproportionate share of a mobile viewport's vertical space.
  composer: {
    marginHorizontal: 16, marginBottom: 6, borderRadius: 20, padding: 11,
    backgroundColor: "rgba(16,18,24,0.6)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10,
  },
  input: { color: "#eef1f6", minHeight: 26, maxHeight: 80, fontSize: 14 },
  toolRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 6 },
  toolBtn: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  toolIcon: { color: "rgba(238,241,246,0.55)", fontSize: 14 },
  // Bright specular white puck (redesign): dark glyph on near-white, luminous
  // halo — reads as glossy premium against the dark composer.
  send: {
    marginLeft: "auto",
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#eef2f8",
    borderWidth: 0,
    shadowColor: "rgba(230,236,244,0.5)", shadowOpacity: 0.7, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
  disabled: { opacity: 0.38 },
  sendText: { color: "#0a0c11", fontWeight: "700", fontSize: 15 },

  // Collide track button styles — glossy white pill instead of the old
  // warm-orange gradient/glow, per the black & white / high-contrast
  // palette: a bright white glow reads as premium gloss against the dark
  // chrome without introducing a color.
  collideTrackBtn: {
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ffffff",
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  collideBtnText: {
    color: "#0c0c0e",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },

  // Lock and Fog container styles
  lockedContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  lockIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  lockText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  fogContainer: {
    borderRadius: 22,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },

  // Consensus screen styling
  verdictWrap: {
    marginTop: 10,
    marginBottom: 12,
    width: "100%",
  },
  verdictLabel: {
    color: "rgba(238,241,246,0.4)",
    fontFamily: FONT_MONO,
    textTransform: "uppercase",
    fontSize: 8,
    letterSpacing: 3,
    marginBottom: 4,
    textAlign: "center",
  },
  summaryContainer: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(20,20,22,0.65)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", // high-contrast edge instead of a color glow
    shadowColor: "#ffffff", // gloss, not a colored glow
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    alignItems: "center",
  },
  summaryCenterText: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    textShadowColor: "rgba(255,255,255,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  dissentList: {
    flex: 1,
    width: "100%",
    marginTop: 10,
  },
  dissentCard: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 6,
  },
  dissentText: {
    color: "rgba(238,241,246,0.6)",
    fontSize: 11,
    marginTop: 4,
  },

  // Imagine Market preview player styles
  previewImageContainer: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#000",
    marginBottom: 14,
  },
  previewImage: {
    flex: 1,
  },
  previewDetails: {
    width: "100%",
    marginBottom: 14,
  },
  previewPromptBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  previewActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 8,
  },
  previewActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
  },
  previewActionText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.56)", zIndex: 50 },
  drawer: { position: "absolute", left: 0, top: 0, bottom: 0, width: 306, paddingTop: 54, paddingHorizontal: 14 },
  planBox: { borderRadius: 20, padding: 14, marginVertical: 16 },
  bigText: { fontSize: 20, fontWeight: "800", marginBottom: 8 },
  drawerItem: {
    borderRadius: 16, paddingVertical: 13, paddingHorizontal: 12,
    marginBottom: 4, backgroundColor: "rgba(255,255,255,0.04)",
  },

  fullModal: { flex: 1, paddingTop: 54, paddingHorizontal: 18 },
  kicker: { color: "rgba(238,241,246,0.45)", fontFamily: FONT_MONO, textTransform: "uppercase", fontSize: 10, letterSpacing: 2.5, marginBottom: 8 },
  score: { color: "#7ee2a8", fontFamily: FONT_MONO_SEMIBOLD, fontSize: 84, fontWeight: "600", textAlign: "center", textShadowColor: "rgba(126,226,168,0.5)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 40 },
  svg: { alignSelf: "center", marginVertical: 14 },
  verdict: { borderRadius: 20, padding: 16 },
  pageTitle: { color: "#f4f7fb", fontSize: 14, fontWeight: "700", letterSpacing: 2 },
  page: { padding: 14, gap: 12, paddingBottom: 120 },
  messageList: { padding: 14, gap: 10 },
  bubble: {
    maxWidth: "88%", padding: 12, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
  },
  // "False bubble" — the response side keeps a real (if faint) glass panel
  // for legibility, but the user's own messages don't need a competing box:
  // they're already visually distinct by alignment/role, and a loud tinted
  // bubble on both sides was pulling attention away from the responses,
  // which are the part actually worth reading.
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(255,255,255,0.09)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
  },
  listItem: { borderRadius: 20, padding: 14, gap: 8 },
  rowItem: { borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  done: { color: "rgba(238,241,246,0.45)", textDecorationLine: "line-through" },
  inlineAdd: { minHeight: 52, borderRadius: 20, padding: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  compact: { marginTop: 8, minHeight: 42, borderRadius: 14 },
  inlineInput: { flex: 1, color: "#fff", fontSize: 14, paddingHorizontal: 8 },
  // White, not purple — solid opaque fill needs a foreground color with
  // real contrast, and every usage of addBtn already draws its "+" in
  // black, so white is the correct high-contrast counterpart, not a leftover
  // accident.
  // Rounded-square glass, matching iconBtn. This was the last solid white
  // circle in the app: ed077b7 moved every other control to this material
  // ("instead of solid black circles") and missed this one, so it read as an
  // ornament pasted on top of the redesign. Its glyphs were hardcoded #000 to
  // survive the white fill; they are light now, like every other control.
  addBtn: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.32)",
  },
  primaryBtn: {
    borderRadius: 16, padding: 12, alignItems: "center", marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.4)",
    shadowColor: "#ffffff", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
  primaryText: { color: "#ffffff", fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  segment: { flexDirection: "row", gap: 8, marginBottom: 10 },
  segmentBtn: { borderRadius: 15, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "rgba(255,255,255,0.04)" },
  segmentActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
  },
  miniBtn: { marginTop: 8, alignSelf: "flex-start", borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#ffffff" },
  fileTile: { width: "47%", aspectRatio: 1, borderRadius: 20, alignItems: "center", justifyContent: "center", padding: 12 },
  fileIcon: { color: "#fff", fontSize: 34, marginBottom: 8 },
  marketTile: { width: "100%", height: "100%", aspectRatio: 0.72, borderRadius: 20, justifyContent: "space-between" },
  sparkle: { fontSize: 42, textAlign: "center", marginTop: 46 },
  tileFooter: { marginTop: "auto", padding: 10, backgroundColor: "rgba(0,0,0,0.32)" },
  wallTile: { width: "100%", aspectRatio: 0.72, borderRadius: 20, padding: 12, justifyContent: "flex-end" },
  tileName: { color: "#fff", fontWeight: "800", fontSize: 14 },
  price: { color: "#fff7d7", fontSize: 11, marginTop: 6 },

  // Smart Gen Toast
  toastContainer: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: "center",
  },
  toastBlur: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
    shadowColor: "#ffffff",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },

  // Media bubble layout
  chatMediaContainer: {
    width: "100%",
    aspectRatio: 1.25,
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 6,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chatMediaImage: {
    flex: 1,
  },
  chatMediaControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 8,
    backgroundColor: "rgba(7,4,13,0.85)",
  },
  audioPlayerCard: {
    borderRadius: 18,
    padding: 12,
    marginTop: 6,
    width: "100%",
    borderColor: "rgba(255,255,255,0.1)",
  },
  videoPlayerCard: {
    borderRadius: 18,
    padding: 12,
    marginTop: 6,
    width: "100%",
    borderColor: "rgba(255,255,255,0.1)",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 8,
    borderRadius: 12,
  },
  vinylDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#333",
  },
  vinylCenter: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#e2e8f0",
  },
  playPauseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  videoSimContainer: {
    width: "100%",
    aspectRatio: 1.77,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    marginVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  videoSimPlayBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(7,4,13,0.65)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  // Passed as the style prop to <Glass isCard> for the crisp-border/corner-
  // sheen accent treatment — but Glass's isCard variant has NO blur backing
  // (by design, for small thumbnail-style cards), so this needs its own
  // near-opaque background or a modal sheet turns into a see-through pane
  // with the chat/wallpaper bleeding straight through behind it.
  editSheet: {
    width: 300,
    padding: 20,
    borderRadius: 22,
    backgroundColor: "rgba(4,4,4,0.97)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignSelf: "center",
    marginTop: 100,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  editInput: {
    backgroundColor: "rgba(255,255,255,0.04)",
    color: "#fff",
    padding: 10,
    borderRadius: 10,
    fontSize: 14,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  prioBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
  },
  traySpecialBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: 8,
  },


  // Circular chip selector (model tray)
  chipCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  chipCircleText: {
    color: "rgba(238,241,246,0.7)",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  chipCircleLock: {
    position: "absolute",
    bottom: -2,
    right: -2,
    fontSize: 9,
  },

  // Sub tab tray (inside card screen)
  subTabTray: {
    backgroundColor: "#060608",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  subTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  subTabText: {
    color: "rgba(238,241,246,0.5)",
    fontFamily: FONT_MONO,
    fontSize: 9,
    letterSpacing: 1.5,
  },

  // Modal backdrop and edit sheet header
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  // No default color — each modal supplies its own accent inline so a
  // Reminder's sheet doesn't look identical to a Memory's or an Artifact's.
  sheetKicker: {
    fontSize: 9,
    fontFamily: FONT_MONO,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 12,
  },

  // Horizontal single-row model tray
  modelTrayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 6,
  },
  tierSep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginHorizontal: 2,
  },
  tierSepLine: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  tierSepLabel: {
    color: "rgba(255,255,255,0.28)",
    fontFamily: FONT_MONO,
    fontSize: 7,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
}));




export type MusicTrack = { id: string; title: string; url: string };

export interface DynamicTheme {
  id: string;
  name: string;
  source: any;
  premium?: boolean;
  // Individual purchase price (spec: $2.99–$7.99 per live wallpaper, not
  // tier-bundled) and its ≥5 bundled tracks. Only meaningful when
  // premium — free/preset themes leave these undefined.
  price?: string;
  tracks?: MusicTrack[];
  // Still frame for the store grid. Decoding a video just to show a tile is
  // wasteful and janky on low-end Android; the poster renders instantly and
  // the video only mounts on preview/apply.
  poster?: any;
}

export let FREE_THEMES: DynamicTheme[] = [];
try {
  const context = (require as any).context("../../assets/themes/free", false, /\.(png|jpe?g)$/);
  FREE_THEMES = context.keys().map((key: string) => ({
    id: `free_${key.replace(/^\.\//, "")}`,
    name: key.replace(/^\.\//, "").replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
    source: context(key),
    premium: false,
  }));
} catch (e) {
  // Empty directory or context unsupported
}

// Default price/track-count for any real .mp4 dropped into assets/themes/premium
// — filenames aren't going to encode a price or a curated tracklist, so a real
// wallpaper needs its price/tracks set by hand once it exists. This just keeps
// the shape correct (a premium theme without explicit metadata still has a
// price and an empty tracklist, not undefined) so the UI doesn't need to
// special-case "real asset with no metadata yet."
const DEFAULT_PREMIUM_PRICE = "$4.99";

export let PREMIUM_THEMES: DynamicTheme[] = [];
try {
  const context = (require as any).context("../../assets/themes/premium", false, /\.(mp4|m4v|mov)$/);
  PREMIUM_THEMES = context.keys().map((key: string) => ({
    id: `premium_${key.replace(/^\.\//, "")}`,
    name: key.replace(/^\.\//, "").replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
    source: context(key),
    premium: true,
    price: DEFAULT_PREMIUM_PRICE,
    tracks: [],
  }));
} catch (e) {
  // Empty directory or context unsupported
}

// Real generated live-wallpaper assets now ship in assets/themes/premium/
// (seamless 6s 540x960 H.264 loops + poster frames + 5 ambient tracks). They
// are procedurally generated originals, not licensed stock, so they are safe
// to ship and to price. The previous mock entry (Google's BigBuckBunny sample
// + SoundHelix test tracks) is gone — it could never have shipped.
//
// Tracks are shared across all four wallpapers for now: the spec's "at least 5
// curated tracks per wallpaper" is satisfied per-wallpaper, and a per-theme
// tracklist is a content decision, not a code one.
export const PREMIUM_TRACKS = [
  { id: "t1", title: "Driftwood",   url: require("../../assets/themes/premium/tracks/track1_driftwood.mp3") },
  { id: "t2", title: "Glasswing",   url: require("../../assets/themes/premium/tracks/track2_glasswing.mp3") },
  { id: "t3", title: "Low Tide",    url: require("../../assets/themes/premium/tracks/track3_lowtide.mp3") },
  { id: "t4", title: "Ember Fall",  url: require("../../assets/themes/premium/tracks/track4_emberfall.mp3") },
  { id: "t5", title: "Northlight",  url: require("../../assets/themes/premium/tracks/track5_northlight.mp3") },
];

const PREMIUM_META: Record<string, { name: string; price: string; poster: any }> = {
  aurora_drift: { name: "Aurora Drift", price: "$4.99", poster: require("../../assets/themes/premium/aurora_drift.jpg") },
  nebula_bloom: { name: "Nebula Bloom", price: "$5.99", poster: require("../../assets/themes/premium/nebula_bloom.jpg") },
  low_tide:     { name: "Low Tide",     price: "$2.99", poster: require("../../assets/themes/premium/low_tide.jpg") },
  ember_fall:   { name: "Ember Fall",   price: "$7.99", poster: require("../../assets/themes/premium/ember_fall.jpg") },
};

PREMIUM_THEMES = PREMIUM_THEMES.map((t) => {
  const key = t.id.replace(/^premium_/, "").replace(/\.[^/.]+$/, "");
  const meta = PREMIUM_META[key];
  return meta
    ? { ...t, name: meta.name, price: meta.price, poster: meta.poster, tracks: PREMIUM_TRACKS }
    : { ...t, tracks: PREMIUM_TRACKS };
});

const bg = require("../../assets/bg-default.jpg");


import { WallpaperId } from "../state";

export const WALLPAPERS: {
  id: WallpaperId;
  name: string;
  colors: [string, string, ...string[]];
  premium?: boolean;
}[] = [
  { id: "default",  name: "Collider",       colors: ["rgba(7,4,13,0.35)", "rgba(7,4,13,0.82)", "rgba(7,4,13,0.94)"] },
  { id: "aurora",   name: "Aurora",         colors: ["#163b82", "#22b884", "#07080b"] },
  { id: "cove",     name: "Midnight Cove",  colors: ["#091a4a", "#60315f", "#07080b"] },
  { id: "inferno",  name: "Inferno",        colors: ["#f46b32", "#31135e", "#07080b"], premium: true },
  { id: "quartz",   name: "Quartz",         colors: ["#65d5cf", "#ab54d8", "#07080b"], premium: true },
  { id: "magnolia", name: "Magnolia",       colors: ["#e8ae98", "#c4488c", "#07080b"] },
  { id: "voyager",  name: "Voyager",        colors: ["#e2e8f0", "#16184f", "#07080b"], premium: true },
];
