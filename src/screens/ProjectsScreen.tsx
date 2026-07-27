import { ReminderEditModal, ProjectEditModal } from "../../App";
import React, { useState, useMemo } from "react";
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
import * as Haptics from "expo-haptics";
import { useCollider, type Project, newId } from "../state";
import { Glass } from "../components/Glass";
import { Page } from "../components/Page";
import { styles, SCREEN_W, withFont, fontFamilyForWeight } from "../styles/theme";
import { MODELS } from "../models";
import { SearchBar, useSearch } from "../features";
import { SelectionBar, SelectModeToggle, SelectDot } from "../components/SelectionBar";

export function ProjectsScreen({ goBack }: { goBack: () => void }) {
  const { state, dispatch } = useCollider();
  const typed_projects = state.projects as Project[];
  const [tab, setTab] = useState<"projects" | "tasks">("projects");
  const [value, setValue] = useState("");
  const [task, setTask] = useState<Record<string, string>>({});
  const [editingTask, setEditingTask] = useState<{ projectId: string; task: any } | null>(null);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const handleBulkDelete = () => {
    dispatch({ type: "removeProjects", ids: Array.from(selectedIds) });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    exitSelectMode();
  };

  const { q, setQ, filtered } = useSearch(typed_projects, (p) => `${p.name} ${p.tasks.map((t) => t.title).join(" ")}`);

  // Shared by the "+" button and the keyboard's return key. Return did nothing
  // at all before this — the input had no onSubmitEditing, so the gesture a
  // phone keyboard puts under your thumb silently dropped what you typed.
  // An empty box no longer creates anything either: tapping "+" on nothing used
  // to produce a project literally called "New Project".
  const addProject = () => {
    const name = value.trim();
    if (!name) return;
    const id = newId("p");
    const modelId = state.selectedModelIds[state.activeCategory]?.[0] || "global";
    dispatch({ type: "project", id, name, modelId, fingerprint: id });
    setValue("");
    setEditingProject({ id, name, tasks: [], modelId });
  };

  const allTasks = useMemo(() => {
    const list: any[] = [];
    typed_projects.forEach((p) => {
      p.tasks.forEach((t) => {
        list.push({ ...t, projectId: p.id, projectName: p.name });
      });
    });
    return list;
  }, [typed_projects]);

  const todoTasks = allTasks.filter((t) => !t.done);
  const doneTasks = allTasks.filter((t) => t.done);

  const getPriorityColor = (p?: string) => {
    if (p === "high") return "#ef4444";
    if (p === "med") return "#f5e000"; // was orange/gold — banned accent per SPEC.md; true yellow instead
    if (p === "low") return "#5dbdff";
    return "rgba(238,241,246,0.45)";
  };

  const handleToggleTask = (projectId: string, taskId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    dispatch({ type: "toggleTask", projectId, taskId });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  return (
    <Page title="Smart Tasks" goBack={goBack}>
      <View style={{ flex: 1, backgroundColor: "#07080b" }}>
        
        {/* Navigation Segment Tabs */}
        <View style={localStyles.tabContainer}>
          <Pressable 
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setTab("projects");
            }}
            style={[localStyles.navTab, tab === "projects" && localStyles.navTabActive]}
          >
            <Text style={[localStyles.navTabText, tab === "projects" && localStyles.navTabTextActive]}>
              PROJECTS ({typed_projects.length})
            </Text>
          </Pressable>
          <Pressable 
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setTab("tasks");
            }}
            style={[localStyles.navTab, tab === "tasks" && localStyles.navTabActive]}
          >
            <Text style={[localStyles.navTabText, tab === "tasks" && localStyles.navTabTextActive]}>
              BOARD ({allTasks.length})
            </Text>
          </Pressable>
        </View>

        {tab === "projects" ? (
          <>
            {/* Select-mode toggle + bulk action bar */}
            <View style={{ paddingHorizontal: 12, marginBottom: 8, flexDirection: "row", justifyContent: "flex-end" }}>
              <SelectModeToggle active={selectMode} onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))} />
            </View>
            <SelectionBar
              count={selectedIds.size}
              total={filtered.length}
              onSelectAll={() => setSelectedIds(selectedIds.size >= filtered.length ? new Set() : new Set(filtered.map((p) => p.id)))}
              onClear={exitSelectMode}
              onDelete={handleBulkDelete}
            />

            {/* Search Bar */}
            <View style={{ paddingHorizontal: 12, marginBottom: 8 }}>
              <View style={localStyles.searchContainer}>
                <Ionicons name="search" size={14} color="rgba(255,255,255,0.4)" style={{ marginRight: 8 }} />
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder="Search projects or task names..."
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

            {/* Quick Add Project Box */}
            <View style={{ paddingHorizontal: 12, marginBottom: 12 }}>
              <View style={localStyles.addBox}>
                <TextInput
                  value={value}
                  onChangeText={setValue}
                  placeholder="Create new workspace project..."
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  style={localStyles.addInput}
                  returnKeyType="done"
                  onSubmitEditing={addProject}
                />
                <Pressable
                  onPress={addProject}
                  style={localStyles.addButton}
                >
                  <Ionicons name="add" size={18} color="#e2e8f0" />
                </Pressable>
              </View>
            </View>

            {/* Project List */}
            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40, gap: 12 }} showsVerticalScrollIndicator={false}>
              {filtered.length === 0 ? (
                <View style={localStyles.emptyContainer}>
                  <Ionicons name="grid-outline" size={32} color="rgba(255,255,255,0.15)" style={{ marginBottom: 10 }} />
                  {/* An active search emptying the list is not the same state as
                      having no projects, and telling someone with projects to
                      "add one above" reads as though theirs were lost. */}
                  <Text style={styles.muted}>
                    {q.trim()
                      ? `No projects match “${q.trim()}”.`
                      : "No projects yet. Create one above."}
                  </Text>
                </View>
              ) : (
                filtered.map((p) => {
                  const projectModel = p.modelId ? (MODELS.find(x => x.id === p.modelId)?.short || p.modelId) : "Global Context";
                  const isSelected = selectedIds.has(p.id);
                  return (
                    <Glass key={p.id} style={[localStyles.projectCard, isSelected && { borderColor: "rgba(255,255,255,0.5)" }]}>
                      {/* Project Header */}
                      <View style={localStyles.projectHeader}>
                        {selectMode && (
                          <Pressable onPress={() => toggleSelected(p.id)} style={{ paddingRight: 2 }}>
                            <SelectDot selected={isSelected} />
                          </Pressable>
                        )}
                        <Pressable onPress={() => (selectMode ? toggleSelected(p.id) : setEditingProject(p))} style={{ flex: 1, gap: 2 }}>
                          <Text style={{ color: "#fff", fontSize: 13.5, fontWeight: "800", fontFamily: fontFamilyForWeight(800) }}>{p.name}</Text>
                          <View style={localStyles.modelRow}>
                            <View style={localStyles.modelDot} />
                            <Text style={localStyles.modelText}>{projectModel}</Text>
                          </View>
                        </Pressable>

                        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                          <Pressable 
                            onPress={() => setEditingProject(p)}
                            style={localStyles.headerActionBtn}
                          >
                            <Ionicons name="settings-outline" size={12} color="#e2e8f0" />
                          </Pressable>
                          <Pressable 
                            onPress={() => {
                              dispatch({ type: "removeProject", id: p.id });
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            }}
                            style={[localStyles.headerActionBtn, { backgroundColor: "rgba(239,68,68,0.08)" }]}
                          >
                            <Ionicons name="trash-outline" size={12} color="#ef4444" />
                          </Pressable>
                        </View>
                      </View>

                      {/* Project Tasks */}
                      <View style={{ gap: 6, marginVertical: 4 }}>
                        {p.tasks.map((t) => (
                          <View key={t.id} style={localStyles.taskRow}>
                            <Pressable 
                              onPress={() => handleToggleTask(p.id, t.id)}
                              style={{ paddingRight: 8 }}
                            >
                              <Ionicons 
                                name={t.done ? "checkbox" : "square-outline"} 
                                size={15} 
                                color={t.done ? "#e2e8f0" : "rgba(255,255,255,0.4)"} 
                              />
                            </Pressable>
                            
                            <Pressable onPress={() => setEditingTask({ projectId: p.id, task: t })} style={{ flex: 1 }}>
                              <Text style={[
                                localStyles.taskTitleText, 
                                t.done && { textDecorationLine: "line-through", color: "rgba(255,255,255,0.3)" }
                              ]}>
                                {t.title}
                              </Text>
                            </Pressable>

                            {t.priority && t.priority !== "none" && (
                              <View style={[
                                localStyles.priorityBadge, 
                                { backgroundColor: `${getPriorityColor(t.priority)}15`, borderColor: `${getPriorityColor(t.priority)}30` }
                              ]}>
                                <Text style={[localStyles.priorityText, { color: getPriorityColor(t.priority) }]}>
                                  {t.priority.toUpperCase()}
                                </Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>

                      {/* Inline Task Add */}
                      <View style={localStyles.taskAddBox}>
                        <TextInput
                          value={task[p.id] || ""}
                          onChangeText={(v) => setTask((prev) => ({ ...prev, [p.id]: v }))}
                          placeholder="Add new task..."
                          placeholderTextColor="rgba(255,255,255,0.2)"
                          style={localStyles.taskAddInput}
                        />
                        <Pressable
                          onPress={() => {
                            const v = (task[p.id] || "").trim();
                            if (v) {
                              dispatch({ type: "task", projectId: p.id, title: v });
                              setTask((prev) => ({ ...prev, [p.id]: "" }));
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            }
                          }}
                          disabled={!(task[p.id] || "").trim()}
                          style={[localStyles.taskAddButton, !(task[p.id] || "").trim() && { opacity: 0.4 }]}
                        >
                          <Ionicons name="checkmark" size={13} color="#e2e8f0" />
                        </Pressable>
                      </View>
                    </Glass>
                  );
                })
              )}
            </ScrollView>
          </>
        ) : (
          /* Kanban Board layout */
          <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40, gap: 16 }} showsVerticalScrollIndicator={false}>
            {/* To Do Section */}
            <View style={{ gap: 6 }}>
              <Text style={localStyles.boardHeader}>TO DO ({todoTasks.length})</Text>
              {todoTasks.length === 0 ? (
                <Text style={styles.muted}>No pending tasks.</Text>
              ) : (
                todoTasks.map((t) => (
                  <Glass key={t.id} style={localStyles.boardCard}>
                    <Pressable onPress={() => handleToggleTask(t.projectId, t.id)} style={{ paddingRight: 8 }}>
                      <Ionicons name="square-outline" size={15} color="rgba(255,255,255,0.4)" />
                    </Pressable>
                    <Pressable onPress={() => setEditingTask({ projectId: t.projectId, task: t })} style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: "#fff", fontSize: 12.5, fontWeight: "600", fontFamily: fontFamilyForWeight(600) }}>{t.title}</Text>
                      <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 9.5 }}>Project: {t.projectName}</Text>
                    </Pressable>
                    {t.priority && t.priority !== "none" && (
                      <View style={[
                        localStyles.priorityBadge, 
                        { backgroundColor: `${getPriorityColor(t.priority)}15`, borderColor: `${getPriorityColor(t.priority)}30` }
                      ]}>
                        <Text style={[localStyles.priorityText, { color: getPriorityColor(t.priority) }]}>
                          {t.priority.toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </Glass>
                ))
              )}
            </View>

            {/* Completed Section */}
            <View style={{ gap: 6 }}>
              <Text style={localStyles.boardHeader}>COMPLETED ({doneTasks.length})</Text>
              {doneTasks.length === 0 ? (
                <Text style={styles.muted}>No completed tasks.</Text>
              ) : (
                doneTasks.map((t) => (
                  <Glass key={t.id} style={[localStyles.boardCard, { opacity: 0.6 }]}>
                    <Pressable onPress={() => handleToggleTask(t.projectId, t.id)} style={{ paddingRight: 8 }}>
                      <Ionicons name="checkbox" size={15} color="#e2e8f0" />
                    </Pressable>
                    <Pressable onPress={() => setEditingTask({ projectId: t.projectId, task: t })} style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12.5, fontWeight: "600", fontFamily: fontFamilyForWeight(600), textDecorationLine: "line-through" }}>{t.title}</Text>
                      <Text style={{ color: "rgba(238,241,246,0.45)", fontSize: 9.5 }}>Project: {t.projectName}</Text>
                    </Pressable>
                  </Glass>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {editingTask && (
        <ReminderEditModal
          visible={!!editingTask}
          item={{ ...editingTask.task, progress: editingTask.task.done ? "done" : "todo" }}
          onClose={() => setEditingTask(null)}
          onSave={(updated) => {
            dispatch({
              type: "updateTask",
              projectId: editingTask.projectId,
              task: {
                id: editingTask.task.id,
                title: updated.title,
                done: updated.progress === "done",
                priority: updated.priority === "medium" ? "med" : updated.priority,
              },
            });
            setEditingTask(null);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          }}
          onDelete={() => {
            dispatch({ type: "removeTask", projectId: editingTask.projectId, taskId: editingTask.task.id });
            setEditingTask(null);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          }}
        />
      )}

      {editingProject && (
        <ProjectEditModal
          visible={!!editingProject}
          item={editingProject}
          dispatch={dispatch}
          state={state}
          onClose={() => setEditingProject(null)}
          onSave={(updated) => {
            dispatch({ type: "updateProject", project: updated });
            setEditingProject(null);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          }}
          onDelete={(id) => {
            dispatch({ type: "removeProject", id });
            setEditingProject(null);
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
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 12,
    marginVertical: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 3,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)"
  },
  navTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  navTabActive: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)"
  },
  navTabText: {
    fontSize: 9.5,
    color: "rgba(238,241,246,0.45)",
    fontWeight: "800", fontFamily: fontFamilyForWeight(800),
    letterSpacing: 0.5
  },
  navTabTextActive: {
    color: "#fff",
  },
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 12,
    height: 40,
    alignItems: "center",
  },
  addInput: {
    flex: 1,
    color: "#fff",
    fontSize: 12.5,
    height: "100%",
    padding: 0,
  },
  addButton: {
    width: 26,
    height: 26,
    borderRadius: 10,
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
  projectCard: {
    borderRadius: 18,
    backgroundColor: "rgba(18,18,22,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    gap: 8,
  },
  projectHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    paddingBottom: 8,
    marginBottom: 2,
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  modelDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
  },
  modelText: {
    color: "rgba(238,241,246,0.45)",
    fontSize: 9,
    fontWeight: "700", fontFamily: fontFamilyForWeight(700)
  },
  headerActionBtn: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center"
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  taskTitleText: {
    color: "#fff",
    fontSize: 12.5,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  priorityText: {
    fontSize: 8,
    fontWeight: "800", fontFamily: fontFamilyForWeight(800),
  },
  taskAddBox: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    height: 32,
    alignItems: "center",
    marginTop: 4,
  },
  taskAddInput: {
    flex: 1,
    color: "#fff",
    fontSize: 11.5,
    height: "100%",
    padding: 0,
  },
  taskAddButton: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  boardHeader: {
    color: "#e2e8f0",
    fontSize: 9.5,
    fontWeight: "900", fontFamily: fontFamilyForWeight(900),
    letterSpacing: 1.5,
    marginBottom: 4,
    marginTop: 4,
  },
  boardCard: {
    borderRadius: 14,
    backgroundColor: "rgba(18,18,22,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    flexDirection: "row",
    padding: 10,
    alignItems: "center",
  },
}));
