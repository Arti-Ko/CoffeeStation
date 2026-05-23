"use client";

import { create } from "zustand";
import type { ThemeTokens } from "./theme/tokens";
import { defaultTheme } from "./theme/tokens";
import { applyTheme as applyThemeTokens } from "./theme/apply";

export type RightPanelMode = "backlinks" | "outline" | "ai" | "history" | "none";
export type MainView =
  | { kind: "note"; id: string }
  | { kind: "knowledge-base"; folderId?: string | null }
  | { kind: "knowledge-graph" }
  | { kind: "canvas"; id?: string }
  | { kind: "files" }
  | { kind: "database"; id: string; viewId?: string }
  | { kind: "daily" }
  | { kind: "templates" }
  | { kind: "settings" }
  | { kind: "kanban" }
  | { kind: "theme-studio" }
  | { kind: "web-clipper" }
  | { kind: "search" }
  | { kind: "logs" };

interface AppState {
  view: MainView;
  setView: (v: MainView) => void;

  rightPanel: RightPanelMode;
  setRightPanel: (m: RightPanelMode) => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  filesPanelCollapsed: boolean;
  toggleFilesPanel: () => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (v: boolean) => void;

  theme: "light" | "dark" | "system";
  setTheme: (t: "light" | "dark" | "system") => void;

  locale: "ru" | "en";
  setLocale: (l: "ru" | "en") => void;

  selectedFolderId: string | null;
  setSelectedFolderId: (id: string | null) => void;

  recentNotes: string[];
  pushRecent: (id: string) => void;

  /** Note IDs currently open as tabs above the editor. */
  openTabs: string[];
  openTab: (id: string) => void;
  closeTab: (id: string) => void;

  theme_tokens: ThemeTokens;
  setThemeTokens: (t: ThemeTokens) => void;

  /** Bumping this counter from anywhere (e.g. Settings → Check for updates)
   *  re-runs the updater check inside UpdateModal, bypassing dismissed-this-
   *  session and skipped-version state for one round. */
  updateCheckNonce: number;
  requestUpdateCheck: () => void;

  /** Current in-flight git sync operation, or null when idle. Drives the
   *  progress bar in the Logs view and any other UI that wants to mirror
   *  sync state without each component owning its own subscription. */
  syncOp: SyncOpState | null;
  setSyncOp: (s: SyncOpState | null) => void;
}

export interface SyncOpState {
  kind: "push" | "pull" | "init";
  reason: string;
  message: string;       // current step (e.g. "Stashing local changes...")
  startedAt: number;
  /** When known (e.g. files processed / total files), drives the bar. */
  progress?: { current: number; total: number };
}

export const useApp = create<AppState>((set, get) => ({
  view: { kind: "knowledge-base", folderId: null },
  setView: (v) => {
    // When opening a note, add it to the tabs row if not already there.
    if (v.kind === "note") {
      set((s) => ({
        view: v,
        openTabs: s.openTabs.includes(v.id) ? s.openTabs : [...s.openTabs, v.id],
      }));
    } else {
      set({ view: v });
    }
  },

  rightPanel: "backlinks",
  setRightPanel: (m) => set({ rightPanel: m }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  filesPanelCollapsed: false,
  toggleFilesPanel: () => set((s) => ({ filesPanelCollapsed: !s.filesPanelCollapsed })),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),

  theme: "system",
  setTheme: (t) => {
    set({ theme: t });
    applyTheme(t);
    const isDark =
      t === "dark" ||
      (t === "system" &&
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    applyThemeTokens(get().theme_tokens, isDark);
  },

  locale: "ru",
  setLocale: (l) => set({ locale: l }),

  selectedFolderId: null,
  setSelectedFolderId: (id) => set({ selectedFolderId: id }),

  recentNotes: [],
  pushRecent: (id) =>
    set((s) => ({
      recentNotes: [id, ...s.recentNotes.filter((x) => x !== id)].slice(0, 10),
    })),

  openTabs: [],
  openTab: (id) =>
    set((s) => (s.openTabs.includes(id) ? s : { openTabs: [...s.openTabs, id] })),
  closeTab: (id) =>
    set((s) => {
      const remaining = s.openTabs.filter((x) => x !== id);
      // If we closed the currently-active note, switch to neighbour or KB
      if (s.view.kind === "note" && s.view.id === id) {
        const idx = s.openTabs.indexOf(id);
        const next = remaining[idx] ?? remaining[idx - 1];
        return {
          openTabs: remaining,
          view: next ? { kind: "note", id: next } : { kind: "knowledge-base" },
        };
      }
      return { openTabs: remaining };
    }),

  theme_tokens: defaultTheme(),
  setThemeTokens: (t) => {
    set({ theme_tokens: t });
    const isDark =
      get().theme === "dark" ||
      (get().theme === "system" &&
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    applyThemeTokens(t, isDark);
  },

  updateCheckNonce: 0,
  requestUpdateCheck: () => set((s) => ({ updateCheckNonce: s.updateCheckNonce + 1 })),

  syncOp: null,
  setSyncOp: (s) => set({ syncOp: s }),
}));

export function applyTheme(theme: "light" | "dark" | "system") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}
