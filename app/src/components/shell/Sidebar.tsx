"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import {
  Search,
  Coffee,
  Network,
  Layers,
  CalendarDays,
  Settings,
  Database as DatabaseIcon,
  PanelRightClose,
  PanelRightOpen,
  Palette,
  Link2,
  ListTree,
  History,
  FilesIcon,
  Kanban,
  FileText,
  ScrollText,
} from "lucide-react";
import { db } from "@/lib/db/schema";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { Backlinks } from "./Backlinks";
import { Outline } from "./Outline";
import { HistoryPanel } from "./HistoryPanel";

type SidebarTab = "backlinks" | "outline" | "history";

export const NAV_ITEMS: {
  key: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  labelKey: string;
  fallbackLabel: string;
  match: (kind: string) => boolean;
  go: () => void;
}[] = [
  { key: "knowledge-base", Icon: Coffee, labelKey: "nav.knowledge_base", fallbackLabel: "Knowledge Base", match: (k) => k === "knowledge-base", go: () => useApp.getState().setView({ kind: "knowledge-base" }) },
  { key: "daily", Icon: CalendarDays, labelKey: "nav.daily", fallbackLabel: "Daily Notes", match: (k) => k === "daily", go: () => useApp.getState().setView({ kind: "daily" }) },
  { key: "kanban", Icon: Kanban, labelKey: "nav.kanban", fallbackLabel: "Kanban", match: (k) => k === "kanban", go: () => useApp.getState().setView({ kind: "kanban" }) },
  { key: "knowledge-graph", Icon: Network, labelKey: "nav.graph", fallbackLabel: "Knowledge Graph", match: (k) => k === "knowledge-graph", go: () => useApp.getState().setView({ kind: "knowledge-graph" }) },
  { key: "canvas", Icon: Layers, labelKey: "nav.canvas", fallbackLabel: "Канвас", match: (k) => k === "canvas", go: () => useApp.getState().setView({ kind: "canvas" }) },
  { key: "files", Icon: FilesIcon, labelKey: "nav.files", fallbackLabel: "Все файлы", match: (k) => k === "files", go: () => useApp.getState().setView({ kind: "files" }) },
  { key: "database", Icon: DatabaseIcon, labelKey: "nav.databases", fallbackLabel: "Базы данных", match: (k) => k === "database", go: () => useApp.getState().setView({ kind: "database", id: "" }) },
  { key: "templates", Icon: FileText, labelKey: "nav.templates", fallbackLabel: "Шаблоны", match: (k) => k === "templates", go: () => useApp.getState().setView({ kind: "templates" }) },
  { key: "theme-studio", Icon: Palette, labelKey: "nav.theme", fallbackLabel: "Theme Studio", match: (k) => k === "theme-studio", go: () => useApp.getState().setView({ kind: "theme-studio" }) },
  { key: "logs", Icon: ScrollText, labelKey: "nav.logs", fallbackLabel: "Логи", match: (k) => k === "logs", go: () => useApp.getState().setView({ kind: "logs" }) },
];

/**
 * Tiny vertical rail with section-switch icons, shown when the right panel
 * is collapsed. Lives as its own export so the parent `<Panel>` swaps a
 * full subtree (rail vs expanded) on collapse — react-resizable-panels
 * then animates the width cleanly, exactly like the left FilesPanel does.
 *
 * (Earlier we passed `collapsed` as a prop into `Sidebar` itself and did an
 * internal early-return. Same `<Sidebar>` element kept rendering across the
 * collapse transition, so the Panel's expand-to-most-recent-size logic
 * didn't always restore the previous width.)
 */
export function SidebarCollapsedRail() {
  const toggleSidebar = useApp((s) => s.toggleSidebar);
  return <CollapsedRail tab="outline" setTab={() => {}} onExpand={toggleSidebar} />;
}

export function Sidebar() {
  // Atomic selectors so this sidebar only re-renders when these specific
  // fields change — not on every keystroke-induced store update.
  const toggleSidebar = useApp((s) => s.toggleSidebar);
  const view = useApp((s) => s.view);
  const setCommandPaletteOpen = useApp((s) => s.setCommandPaletteOpen);
  const t = useT();
  const [tab, setTab] = useState<SidebarTab>("outline");
  const isNote = view.kind === "note";

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-border bg-bg-elev-1">
      <Header onCollapse={toggleSidebar} />

      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs text-fg-subtle hover:bg-bg-elev-2 hover:text-fg-muted transition-colors"
      >
        <Search size={12} />
        <span className="truncate">{t("common.search_placeholder")}</span>
        <kbd className="ml-auto rounded bg-bg-elev-2 px-1.5 py-0.5 text-[10px] font-mono text-fg-subtle">⌘K</kbd>
      </button>

      <NavList view={view} />


      {/* Tab bar — outline / backlinks / history. Visible only when a note is open. */}
      {isNote && (
        <div className="mt-3 flex items-center gap-0.5 border-b border-border px-2 pb-1.5">
          <TabBtn current={tab} value="outline" set={setTab} Icon={ListTree} label="Outline" />
          <TabBtn current={tab} value="backlinks" set={setTab} Icon={Link2} label="Links" />
          <TabBtn current={tab} value="history" set={setTab} Icon={History} label="History" />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isNote && tab === "outline" && <Outline noteId={view.id} />}
        {isNote && tab === "backlinks" && <Backlinks noteId={view.id} />}
        {isNote && tab === "history" && <HistoryPanel noteId={view.id} />}
        {!isNote && <div className="p-4 text-xs text-fg-subtle italic">Откройте заметку, чтобы увидеть Outline / Links / History.</div>}
      </div>

      <Footer />
    </aside>
  );
}

function NavList({ view }: { view: ReturnType<typeof useApp.getState>["view"] }) {
  const items = useVisibleNavItems();
  return (
    <nav className="mt-3 px-2 space-y-0.5">
      {items.map((n) => (
        <NavItem
          key={n.key}
          Icon={n.Icon}
          label={n.fallbackLabel}
          active={n.match(view.kind)}
          onClick={n.go}
        />
      ))}
    </nav>
  );
}

function Header({ onCollapse }: { onCollapse: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg">
          <Coffee size={15} />
        </div>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold leading-none tracking-tight truncate">CoffeeStation</div>
          <div className="text-[10px] text-fg-subtle mt-0.5 truncate">My Vault</div>
        </div>
      </div>
      <button
        onClick={onCollapse}
        className="text-fg-subtle hover:text-fg p-1 rounded hover:bg-bg-elev-2 shrink-0"
        title="Свернуть"
      >
        <PanelRightClose size={14} />
      </button>
    </div>
  );
}

function Footer() {
  const setView = useApp((s) => s.setView);
  return (
    <div className="border-t border-border px-3 py-2 flex items-center justify-between text-[11px] text-fg-subtle">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
        <span>Local · E2EE</span>
      </div>
      <button onClick={() => setView({ kind: "settings" })} className="hover:text-fg" title="Настройки">
        <Settings size={12} />
      </button>
    </div>
  );
}

function TabBtn({
  current,
  value,
  set,
  Icon,
  label,
}: {
  current: SidebarTab;
  value: SidebarTab;
  set: (v: SidebarTab) => void;
  Icon: React.ComponentType<{ size?: number }>;
  label: string;
}) {
  return (
    <SimpleTooltip label={label} side="bottom">
      <button
        onClick={() => set(value)}
        className={cn(
          "flex h-7 flex-1 items-center justify-center rounded-md text-[12px] font-medium transition-colors",
          current === value
            ? "bg-bg-elev-2 text-fg"
            : "text-fg-subtle hover:bg-bg-elev-2 hover:text-fg",
        )}
      >
        <Icon size={13} />
      </button>
    </SimpleTooltip>
  );
}

/**
 * Apply hidden + order preferences (stored under `ui.hiddenNav` /
 * `ui.navOrder`) to the canonical NAV_ITEMS list. Both `NavList` and
 * `CollapsedRail` go through this so the rail respects Settings the same
 * way the expanded panel does.
 */
function useVisibleNavItems(): typeof NAV_ITEMS {
  const hiddenIds = useLiveQuery(() => db.settings.get("ui.hiddenNav")) as
    | { value: string[] }
    | undefined;
  const customOrder = useLiveQuery(() => db.settings.get("ui.navOrder")) as
    | { value: string[] }
    | undefined;
  const hidden = new Set(hiddenIds?.value ?? []);
  const items = customOrder?.value
    ? [
        ...(customOrder.value
          .map((k) => NAV_ITEMS.find((n) => n.key === k))
          .filter(Boolean) as typeof NAV_ITEMS),
        ...NAV_ITEMS.filter((n) => !(customOrder.value ?? []).includes(n.key)),
      ]
    : NAV_ITEMS;
  return items.filter((n) => !hidden.has(n.key));
}

function CollapsedRail({
  onExpand,
}: {
  tab: SidebarTab;
  setTab: (v: SidebarTab) => void;
  onExpand: () => void;
}) {
  const view = useApp((s) => s.view);
  const setCommandPaletteOpen = useApp((s) => s.setCommandPaletteOpen);
  const setView = useApp((s) => s.setView);
  const t = useT();
  const items = useVisibleNavItems();

  return (
    <aside className="flex h-full w-full min-w-12 shrink-0 flex-col items-center border-l border-border bg-bg-elev-1 py-3 gap-1">
      <button
        onClick={onExpand}
        className="text-fg-muted hover:text-fg p-2 rounded-md hover:bg-bg-elev-2"
        title="Развернуть"
      >
        <PanelRightOpen size={16} />
      </button>
      <div className="my-2 h-px w-6 bg-border" />
      {items.map((n) => (
        <RailIcon
          key={n.key}
          Icon={n.Icon}
          active={n.match(view.kind)}
          label={n.fallbackLabel}
          onClick={n.go}
        />
      ))}
      <div className="my-2 h-px w-6 bg-border" />
      <RailIcon
        Icon={Search}
        label={t("nav.search")}
        onClick={() => setCommandPaletteOpen(true)}
      />
      <div className="flex-1" />
      <RailIcon
        Icon={Settings}
        active={view.kind === "settings"}
        label={t("nav.settings")}
        onClick={() => setView({ kind: "settings" })}
      />
    </aside>
  );
}

function RailIcon({
  Icon,
  active,
  label,
  onClick,
}: {
  Icon: React.ComponentType<{ size?: number }>;
  active?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <SimpleTooltip label={label} side="left">
      <button
        onClick={onClick}
        className={cn(
          "p-2 rounded-md transition-colors",
          active ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-elev-2 hover:text-fg",
        )}
      >
        <Icon size={15} />
      </button>
    </SimpleTooltip>
  );
}

function NavItem({
  Icon,
  label,
  active,
  onClick,
}: {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
        active ? "bg-accent-soft text-accent font-medium" : "text-fg-muted hover:bg-bg-elev-2 hover:text-fg",
      )}
    >
      <Icon size={13} className="opacity-80" />
      <span className="truncate">{label}</span>
    </button>
  );
}

