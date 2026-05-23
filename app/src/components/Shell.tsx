"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Group, Panel, Separator, usePanelRef, type PanelImperativeHandle } from "react-resizable-panels";
import { Sidebar, SidebarCollapsedRail } from "@/components/shell/Sidebar";
import { FilesPanel, FilesPanelCollapsedStrip } from "@/components/shell/FilesPanel";
import { CommandPalette } from "@/components/shell/CommandPalette";
// Hot paths stay statically imported — these are the first views the user
// sees and they're already in the React render tree by the time anything
// else loads.
import { KnowledgeBaseView } from "@/components/views/KnowledgeBaseView";
import { NoteView } from "@/components/views/NoteView";
import { FilesView } from "@/components/views/FilesView";
// Rare views via next/dynamic so their dep chains (Three.js for the graph,
// xlsx/mammoth in the file viewer, react-colorful in ThemeStudio, etc.)
// don't ship in the initial bundle. Tauri loads from the local file-system
// so the "fetch" of a lazy chunk is effectively free; the win is JS parse
// time at cold start.
const KnowledgeGraphView = dynamic(
  () => import("@/components/views/KnowledgeGraphView").then((m) => m.KnowledgeGraphView),
  { ssr: false, loading: () => <LazyFallback label="Граф" /> },
);
const CanvasView = dynamic(
  () => import("@/components/views/CanvasView").then((m) => m.CanvasView),
  { ssr: false, loading: () => <LazyFallback label="Канвас" /> },
);
const DatabaseView = dynamic(
  () => import("@/components/views/DatabaseView").then((m) => m.DatabaseView),
  { ssr: false, loading: () => <LazyFallback label="База данных" /> },
);
const DailyNotesView = dynamic(
  () => import("@/components/views/DailyNotesView").then((m) => m.DailyNotesView),
  { ssr: false, loading: () => <LazyFallback label="Daily" /> },
);
const TemplatesView = dynamic(
  () => import("@/components/views/TemplatesView").then((m) => m.TemplatesView),
  { ssr: false, loading: () => <LazyFallback label="Шаблоны" /> },
);
const SettingsView = dynamic(
  () => import("@/components/views/SettingsView").then((m) => m.SettingsView),
  { ssr: false, loading: () => <LazyFallback label="Настройки" /> },
);
const ThemeStudio = dynamic(
  () => import("@/components/views/ThemeStudio").then((m) => m.ThemeStudio),
  { ssr: false, loading: () => <LazyFallback label="Theme Studio" /> },
);
const KanbanView = dynamic(
  () => import("@/components/views/KanbanView").then((m) => m.KanbanView),
  { ssr: false, loading: () => <LazyFallback label="Канбан" /> },
);
const LogsView = dynamic(
  () => import("@/components/views/LogsView").then((m) => m.LogsView),
  { ssr: false, loading: () => <LazyFallback label="Логи" /> },
);
import { useApp, applyTheme } from "@/lib/store";
import { seedIfEmpty } from "@/lib/db/seed";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { db } from "@/lib/db/schema";
import { applyTheme as applyThemeTokens } from "@/lib/theme/apply";
import type { ThemeTokens } from "@/lib/theme/tokens";
import { TitleBar } from "@/components/shell/TitleBar";
import { TabsBar } from "@/components/shell/TabsBar";
import { SyncStatusBadge } from "@/components/shell/SyncStatusBadge";
import { UpdateModal } from "@/components/shell/UpdateModal";

function LazyFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-fg-subtle text-[12px]">
      Загрузка «{label}»…
    </div>
  );
}

export function Shell() {
  const view = useApp((s) => s.view);
  const theme = useApp((s) => s.theme);
  const tokens = useApp((s) => s.theme_tokens);
  const setThemeTokens = useApp((s) => s.setThemeTokens);
  const sidebarCollapsed = useApp((s) => s.sidebarCollapsed);
  const filesPanelCollapsed = useApp((s) => s.filesPanelCollapsed);
  const sidebarRef = usePanelRef();
  const filesPanelRef = usePanelRef();

  // Visual "is narrow" — derived from the actual rendered panel width.
  // Decoupled from the logical store flag so onResize during the open/close
  // animation can NEVER toggle the store back — which used to cause an
  // infinite re-render loop and crashed the WKWebView renderer.
  const [filesPanelNarrow, setFilesPanelNarrow] = useState(false);
  const [sidebarNarrow, setSidebarNarrow] = useState(false);

  // Sync imperative panel state with store flags (so clicking the chevron
  // inside FilesPanel/Sidebar actually snaps the panel to collapsed size).
  useEffect(() => {
    const handle = sidebarRef.current;
    if (!handle) return;
    if (sidebarCollapsed) handle.collapse?.();
    else handle.expand?.();
  }, [sidebarCollapsed, sidebarRef]);

  useEffect(() => {
    const handle = filesPanelRef.current;
    if (!handle) return;
    if (filesPanelCollapsed) handle.collapse?.();
    else handle.expand?.();
  }, [filesPanelCollapsed, filesPanelRef]);

  useEffect(() => {
    seedIfEmpty();
    (async () => {
      const saved = await db.settings.get("theme.tokens");
      if (saved?.value) {
        setThemeTokens(saved.value as ThemeTokens);
      }
    })();
  }, [setThemeTokens]);

  useEffect(() => {
    applyTheme(theme);
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    applyThemeTokens(tokens, isDark);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (theme !== "system") return;
      applyTheme("system");
      applyThemeTokens(tokens, mq.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, tokens]);

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg">
        <TitleBar />
        <Group
          orientation="horizontal"
          id="cs-layout-v5"
          className="flex-1"
          style={{ flex: 1, minHeight: 0 }}
        >
          <Panel
            id="files-panel"
            panelRef={filesPanelRef}
            defaultSize="260px"
            minSize="48px"
            maxSize="440px"
            collapsible
            collapsedSize="48px"
            onResize={(size) => {
              const px = typeof size === "number" ? size : (size?.inPixels ?? 1000);
              // Mirror the actual width to local state ONLY — never flip the
              // store flag here, that caused an oscillation crash.
              setFilesPanelNarrow(px < 80);
            }}
          >
            {(filesPanelNarrow || filesPanelCollapsed) ? (
              <FilesPanelCollapsedStrip />
            ) : (
              <FilesPanel />
            )}
          </Panel>

          <Separator className="w-1 bg-border hover:bg-accent/40 transition-colors data-[separator-state=drag]:bg-accent cursor-col-resize" />

          <Panel id="main" minSize="320px">
            <div className="flex h-full flex-col overflow-hidden">
              <TabsBar />
              <div className="flex-1 flex flex-col overflow-hidden">
                {renderView(view)}
              </div>
            </div>
          </Panel>

          <Separator className="w-1 bg-border hover:bg-accent/40 transition-colors data-[separator-state=drag]:bg-accent cursor-col-resize" />

          <Panel
            id="sidebar"
            panelRef={sidebarRef}
            defaultSize="300px"
            minSize="48px"
            maxSize="500px"
            collapsible
            collapsedSize="48px"
            onResize={(size) => {
              const px = typeof size === "number" ? size : (size?.inPixels ?? 1000);
              setSidebarNarrow(px < 80);
            }}
          >
            {(sidebarNarrow || sidebarCollapsed) ? (
              <SidebarCollapsedRail />
            ) : (
              <Sidebar />
            )}
          </Panel>
        </Group>
        <CommandPalette />
        <SyncStatusBadge />
        <UpdateModal />
        <Toaster richColors position="bottom-right" theme="system" />
      </div>
    </TooltipProvider>
  );
}

function renderView(view: ReturnType<typeof useApp.getState>["view"]) {
  switch (view.kind) {
    case "note":
      return <NoteView noteId={view.id} />;
    case "knowledge-base":
      return <KnowledgeBaseView />;
    case "knowledge-graph":
      return <KnowledgeGraphView />;
    case "canvas":
      return <CanvasView canvasId={view.id} />;
    case "files":
      return <FilesView />;
    case "database":
      return <DatabaseView databaseId={view.id} viewId={view.viewId} />;
    case "daily":
      return <DailyNotesView />;
    case "templates":
      return <TemplatesView />;
    case "settings":
      return <SettingsView />;
    case "theme-studio":
      return <ThemeStudio />;
    case "kanban":
      return <KanbanView />;
    case "logs":
      return <LogsView />;
    default:
      return <KnowledgeBaseView />;
  }
}
