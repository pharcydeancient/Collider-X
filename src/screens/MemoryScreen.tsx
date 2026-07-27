import { MemoryEditModal } from "../../App";
import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  LayoutAnimation
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCollider, type Memory, newId } from "../state";
import { Glass } from "../components/Glass";
import { Page } from "../components/Page";
import { InlineAdd } from "../components/InlineAdd";
import { styles, withFont, fontFamilyForWeight } from "../styles/theme";
import { MODELS, modelById } from "../models";
import { SearchBar, useSearch } from "../features";
import { convertItem } from "../services/smartgen";
import { useToast } from "../components/Toast";
import { SelectionBar, SelectModeToggle, SelectDot } from "../components/SelectionBar";

export function MemoryScreen({ goBack }: { goBack: () => void }) {
  const { state, dispatch } = useCollider();
  const typed_memories = state.memories as Memory[];
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [editingMemory, setEditingMemory] = useState<any | null>(null);
  const [convertFor, setConvertFor] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Search reaches the entries too — a notebook whose header doesn't mention
  // the thing you're looking for still holds the row that does.
  const { q, setQ, filtered } = useSearch(typed_memories, (m) => `${m.content} ${(m.rows || []).join(" ")} ${m.modelId}`);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const handleBulkDelete = () => {
    dispatch({ type: "removeMemories", ids: Array.from(selectedIds) });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    exitSelectMode();
  };

  const getModelColor = (modelId?: string) => {
    if (!modelId || modelId === "global") return "#e2e8f0"; // was purple — "global" isn't a real model brand, just a neutral default
    const found = modelById(modelId);
    return found ? found.color : "#e2e8f0";
  };

  const getModelShort = (modelId?: string) => {
    if (!modelId || modelId === "global") return "Global Context";
    const found = modelById(modelId);
    return found ? found.short : modelId;
  };

  // "+" always opens the full form immediately instead of silently creating
  // a bare-text memory — model context is a real field there.
  const handleAddMemory = () => {
    const id = newId("m");
    const modelId = state.selectedModelIds[state.activeCategory]?.[0] || "global";
    const draft = { id, content: value.trim() || "New memory", ts: Date.now(), tags: [], priority: "none", modelId, fingerprint: id };
    dispatch({ type: "memory", id, content: draft.content, fingerprint: id });
    setValue("");
    setEditingMemory(draft);
  };

  const handleDeleteMemory = (id: string) => {
    dispatch({ type: "removeMemory", id });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  return (
    <Page title="Context Memory" goBack={goBack}>
      <View style={{ flex: 1, backgroundColor: "#07080b" }}>

        {/* Select-mode toggle + bulk action bar */}
        <View style={{ paddingHorizontal: 12, marginTop: 8, flexDirection: "row", justifyContent: "flex-end" }}>
          <SelectModeToggle active={selectMode} onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))} />
        </View>
        <SelectionBar
          count={selectedIds.size}
          total={filtered.length}
          onSelectAll={() => setSelectedIds(selectedIds.size >= filtered.length ? new Set() : new Set(filtered.map((m) => m.id)))}
          onClear={exitSelectMode}
          onDelete={handleBulkDelete}
        />

        {/* Search Bar */}
        <View style={{ paddingHorizontal: 12, marginTop: 8 }}>
          <View style={localStyles.searchContainer}>
            <Ionicons name="search" size={14} color="rgba(255,255,255,0.4)" style={{ marginRight: 8 }} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search memories or model bounds..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={localStyles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {q.length > 0 && (
              <Pressable onPress={() => setQ("")} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={14} color="rgba(255,255,255,0.5)" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Quick Add Memory Box */}
        <View style={{ paddingHorizontal: 12, marginVertical: 8 }}>
          <View style={localStyles.addBox}>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder="Remember that the user prefers..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              style={localStyles.addInput}
              multiline
            />
            <Pressable
              onPress={handleAddMemory}
              style={localStyles.addButton}
            >
              <Ionicons name="add" size={18} color="#e2e8f0" />
            </Pressable>
          </View>
        </View>

        {/* Scrollable list */}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40, gap: 10 }} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <View style={localStyles.emptyContainer}>
              <Ionicons name="albums-outline" size={32} color="rgba(255,255,255,0.15)" style={{ marginBottom: 10 }} />
              <Text style={styles.muted}>
                {q ? "No memories match your search." : "No memories yet. They are automatically captured from your chat dialogues."}
              </Text>
            </View>
          ) : (
            filtered.map((m) => {
              const accentColor = getModelColor(m.modelId);
              const isSelected = selectedIds.has(m.id);
              return (
                <Pressable
                  key={m.id}
                  onPress={() => (selectMode ? toggleSelected(m.id) : setEditingMemory(m))}
                  onLongPress={() => { if (!selectMode) setSelectMode(true); toggleSelected(m.id); }}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  {selectMode && <SelectDot selected={isSelected} />}
                  <Glass style={[localStyles.memoryCard, { flex: 1 }, isSelected && { borderColor: "rgba(255,255,255,0.5)" }]}>
                    {/* Left Accent Bar */}
                    <View style={[localStyles.cardAccent, { backgroundColor: accentColor }]} />

                    <View style={localStyles.cardContent}>
                      <Text style={[styles.bodyText, { fontSize: 13, lineHeight: 18, color: "#fff" }]} numberOfLines={4}>
                        {m.content}
                      </Text>
                      {/* A memory is a notebook: its content line is the
                          header and the entries live in rows. Showing the
                          first entries here keeps this list honest about what
                          is actually stored — the board is where the whole
                          notebook is paged and searched. */}
                      {!!m.rows?.length && (
                        <View style={{ gap: 3, marginTop: 6 }}>
                          {m.rows.slice(0, 3).map((r, i) => (
                            <Text key={i} style={[styles.muted, { fontSize: 11.5, lineHeight: 16 }]} numberOfLines={2}>
                              · {r}
                            </Text>
                          ))}
                          {m.rows.length > 3 && (
                            <Text style={[styles.muted, { fontSize: 10.5 }]}>+{m.rows.length - 3} more entries</Text>
                          )}
                        </View>
                      )}

                      <View style={localStyles.cardFooter}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <View style={[localStyles.modelBadge, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}35` }]}>
                            <View style={[localStyles.badgeDot, { backgroundColor: accentColor }]} />
                            <Text style={[localStyles.badgeText, { color: accentColor }]}>{getModelShort(m.modelId)}</Text>
                          </View>
                          <Text style={localStyles.dateText}>{new Date(m.ts).toLocaleDateString()}</Text>
                        </View>

                        <Pressable
                          hitSlop={8}
                          onPress={() => setConvertFor(convertFor === m.id ? null : m.id)}
                          style={[localStyles.deleteButton, { backgroundColor: "rgba(93,189,255,0.08)" }]}
                        >
                          <Ionicons name="swap-horizontal-outline" size={13} color="#5dbdff" />
                        </Pressable>
                        {/* Explicit edit affordance — tapping the card body
                            already opened the edit modal, but nothing on the
                            card signaled that, so it went undiscovered.
                            Matches RemindersScreen's pencil icon. */}
                        <Pressable
                          hitSlop={8}
                          onPress={() => setEditingMemory(m)}
                          style={[localStyles.deleteButton, { backgroundColor: "rgba(226,232,240,0.08)" }]}
                        >
                          <Ionicons name="create-outline" size={13} color="#e2e8f0" />
                        </Pressable>
                        <Pressable
                          hitSlop={8}
                          onPress={() => handleDeleteMemory(m.id)}
                          style={localStyles.deleteButton}
                        >
                          <Ionicons name="trash-outline" size={13} color="#ef4444" />
                        </Pressable>
                      </View>
                    </View>

                    {convertFor === m.id && (
                      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingBottom: 10, marginTop: -4 }}>
                        <Pressable onPress={() => {
                          dispatch({ type: "reminder", ...convertItem(m, "memory", "reminder"), linkFrom: { kind: "memory", id: m.id } } as any);
                          handleDeleteMemory(m.id);
                          toast("Converted to Reminder.");
                          setConvertFor(null);
                        }}>
                          <Text style={{ fontSize: 10, color: "#e2e8f0", fontWeight: "700", fontFamily: fontFamilyForWeight(700) }}> Reminder</Text>
                        </Pressable>
                        <Pressable onPress={() => {
                          dispatch({ type: "artifact", ...convertItem(m, "memory", "artifact"), linkFrom: { kind: "memory", id: m.id } } as any);
                          handleDeleteMemory(m.id);
                          toast("Converted to Artifact.");
                          setConvertFor(null);
                        }}>
                          <Text style={{ fontSize: 10, color: "#e2e8f0", fontWeight: "700", fontFamily: fontFamilyForWeight(700) }}> Artifact</Text>
                        </Pressable>
                      </View>
                    )}
                  </Glass>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>

      {editingMemory && (
        <MemoryEditModal
          visible={!!editingMemory}
          item={editingMemory}
          projects={state.projects}
          dispatch={dispatch}
          state={state}
          onClose={() => setEditingMemory(null)}
          onSave={(updated) => {
            dispatch({ type: "updateMemory", memory: updated });
            setEditingMemory(null);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          }}
          onDelete={(id) => {
            dispatch({ type: "removeMemory", id });
            setEditingMemory(null);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          }}
        />
      )}
    </Page>
  );
}

// See RemindersScreen.tsx for why withFont is required here: without it,
// fontWeight 700+ resolves to synthetic faux-bold instead of the real
// static Manrope Bold/ExtraBold file.
const localStyles = StyleSheet.create(withFont({
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    height: 38,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    height: "100%",
    padding: 0
  },
  addBox: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 10,
    alignItems: "center",
    gap: 8,
  },
  addInput: {
    flex: 1,
    color: "#fff",
    fontSize: 12.5,
    minHeight: 28,
    maxHeight: 60,
    padding: 0,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    shadowColor: "#e2e8f0",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    paddingVertical: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  memoryCard: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(18,18,22,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    padding: 0,
  },
  cardAccent: {
    width: 4,
    height: "100%",
  },
  cardContent: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  modelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: "700", fontFamily: fontFamilyForWeight(700),
  },
  dateText: {
    color: "rgba(238,241,246,0.45)",
    fontSize: 9.5,
  },
  deleteButton: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
}));
