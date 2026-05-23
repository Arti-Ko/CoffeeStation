"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { useApp } from "@/lib/store";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  X,
  Box,
  Square,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  loadGraphSettings,
  saveGraphSettings,
  type GraphSettings,
  type ColorGroup,
} from "@/lib/graph/settings";
import { parseQuery, folderChainFor } from "@/lib/graph/query";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// react-force-graph pulls Three.js for 3D — defer to client only.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as any;
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), { ssr: false }) as any;

interface RFGNode {
  id: string;
  title: string;
  group: string;
  color: string;
  size: number;
  type: "note" | "tag" | "ghost";
  tags: string[];
  folderChain: string;
  x?: number;
  y?: number;
  z?: number;
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
}
interface RFGLink {
  source: string;
  target: string;
  kind: "link" | "tag";
}

export function KnowledgeGraphView() {
  const notes = useLiveQuery(() => db.notes.filter((n) => n.archivedAt == null).toArray()) ?? [];
  const folders = useLiveQuery(() => db.folders.toArray()) ?? [];
  const tagsTable = useLiveQuery(() => db.tags.toArray()) ?? [];
  const setView = useApp((s) => s.setView);

  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);

  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [settings, setSettings] = useState<GraphSettings | null>(null);
  const [stats, setStats] = useState({ nodes: 0, links: 0 });
  const [hovered, setHovered] = useState<RFGNode | null>(null);
  const [ghostPrompt, setGhostPrompt] = useState<{ title: string } | null>(null);

  const [openFilters, setOpenFilters] = useState(true);
  const [openGroups, setOpenGroups] = useState(false);
  const [openDisplay, setOpenDisplay] = useState(false);
  const [openForces, setOpenForces] = useState(false);

  useEffect(() => {
    loadGraphSettings().then(setSettings);
  }, []);

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const patch = useCallback((p: Partial<GraphSettings>) => {
    setSettings((s) => (s ? { ...s, ...p } : s));
    saveGraphSettings(p);
  }, []);

  // ── Build graph data ───────────────────────────────────────────────
  const { graphData, tagUniverse } = useMemo(() => {
    if (!settings) {
      return {
        graphData: { nodes: [] as RFGNode[], links: [] as RFGLink[] },
        tagUniverse: new Map<string, number>(),
      };
    }

    const noteByTitle = new Map(notes.map((n) => [n.title.toLowerCase(), n]));
    const tagColor = new Map(tagsTable.map((t) => [t.name, t.color]));
    const queryFn = parseQuery(settings.search);

    const groupPredicates = settings.groups.map((g) => ({
      group: g,
      pred: parseQuery(g.query),
    }));

    const colorFor = (
      note: typeof notes[number],
      folderChain: string,
      fallback: string,
    ): { color: string; group: string } => {
      for (const { group, pred } of groupPredicates) {
        if (pred(note, folderChain)) return { color: group.color, group: group.query };
      }
      const fc = folders.find((f) => f.id === note.folderId);
      return { color: fc?.color ?? fallback, group: fc?.name ?? "Vault" };
    };

    const degree = new Map<string, number>();
    notes.forEach((n) => {
      n.links.forEach((target) => {
        const t = noteByTitle.get(target.toLowerCase());
        if (!t) return;
        degree.set(n.id, (degree.get(n.id) ?? 0) + 1);
        degree.set(t.id, (degree.get(t.id) ?? 0) + 1);
      });
    });

    const tagUniverseMap = new Map<string, number>();
    notes.forEach((n) =>
      n.tags.forEach((t) => tagUniverseMap.set(t, (tagUniverseMap.get(t) ?? 0) + 1)),
    );

    const noteNodes: RFGNode[] = [];
    for (const n of notes) {
      const folderChain = folderChainFor(n.folderId, folders);
      if (!queryFn(n, folderChain)) continue;
      const { color, group } = colorFor(n, folderChain, "#94a3b8");
      const d = degree.get(n.id) ?? 0;
      noteNodes.push({
        id: n.id,
        title: n.title || "Untitled",
        group,
        color,
        size: Math.min(16, 4 + Math.sqrt(d) * 0.9),
        type: "note",
        tags: n.tags,
        folderChain,
      });
    }

    const tagNodes: RFGNode[] = [];
    if (settings.showTags) {
      const used = new Set<string>();
      noteNodes.forEach((n) => n.tags.forEach((t) => used.add(t)));
      for (const t of used) {
        tagNodes.push({
          id: "tag:" + t,
          title: "#" + t,
          group: "(tag)",
          color: tagColor.get(t) ?? "var(--accent)",
          size: 4,
          type: "tag",
          tags: [t],
          folderChain: "",
        });
      }
    }

    const ghostNodes: RFGNode[] = [];
    if (settings.showGhosts && !settings.showExistingOnly) {
      const unresolved = new Set<string>();
      for (const origin of noteNodes) {
        const note = notes.find((n) => n.id === origin.id);
        if (!note) continue;
        for (const target of note.links) {
          if (!noteByTitle.has(target.toLowerCase())) unresolved.add(target);
        }
      }
      for (const title of unresolved) {
        ghostNodes.push({
          id: "ghost:" + title.toLowerCase(),
          title,
          group: "(не создано)",
          color: "var(--fg-subtle)",
          size: 3.5,
          type: "ghost",
          tags: [],
          folderChain: "",
        });
      }
    }

    const allIds = new Set([...noteNodes, ...tagNodes, ...ghostNodes].map((n) => n.id));
    const links: RFGLink[] = [];
    for (const origin of noteNodes) {
      const note = notes.find((n) => n.id === origin.id);
      if (!note) continue;
      for (const target of note.links) {
        const t = noteByTitle.get(target.toLowerCase());
        if (t && allIds.has(t.id)) {
          links.push({ source: note.id, target: t.id, kind: "link" });
        } else if (settings.showGhosts && !settings.showExistingOnly) {
          links.push({ source: note.id, target: "ghost:" + target.toLowerCase(), kind: "link" });
        }
      }
      if (settings.showTags) {
        for (const tg of note.tags) {
          const id = "tag:" + tg;
          if (allIds.has(id)) links.push({ source: note.id, target: id, kind: "tag" });
        }
      }
    }

    let allNodes: RFGNode[] = [...noteNodes, ...tagNodes, ...ghostNodes];
    if (!settings.showOrphans) {
      const connected = new Set<string>();
      links.forEach((l) => {
        connected.add(l.source);
        connected.add(l.target);
      });
      allNodes = allNodes.filter((n) => connected.has(n.id));
    }

    return { graphData: { nodes: allNodes, links }, tagUniverse: tagUniverseMap };
  }, [notes, folders, tagsTable, settings]);

  useEffect(() => {
    setStats({ nodes: graphData.nodes.length, links: graphData.links.length });
  }, [graphData.nodes.length, graphData.links.length]);

  // Apply force tunables in place when sliders change
  useEffect(() => {
    if (!settings || !graphRef.current) return;
    const g = graphRef.current;
    try {
      g.d3Force?.("charge")?.strength?.(settings.repelForce);
      g.d3Force?.("link")?.distance?.(settings.linkDistance).strength?.(settings.linkForce);
      g.d3ReheatSimulation?.();
    } catch {
      /* not ready */
    }
  }, [settings?.repelForce, settings?.linkDistance, settings?.linkForce, settings?.mode]);

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of graphData.links) {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)!.add(l.target);
      m.get(l.target)!.add(l.source);
    }
    return m;
  }, [graphData.links]);

  const onNodeClick = useCallback(
    (n: any) => {
      const node = n as RFGNode;
      if (node.type === "note") setView({ kind: "note", id: node.id });
      else if (node.type === "ghost") setGhostPrompt({ title: node.title });
    },
    [setView],
  );

  // 2D custom node paint
  const paint2D = useCallback(
    (n: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = n as RFGNode;
      if (!settings) return;
      const baseR = node.size * settings.nodeSize;
      const hoveredId = hovered?.id;
      const neighbours = hoveredId ? adjacency.get(hoveredId) : null;
      const isHover = hoveredId === node.id;
      const isNeighbor = !!(neighbours && neighbours.has(node.id));
      const dim = hoveredId && !isHover && !isNeighbor;

      ctx.globalAlpha = dim ? 0.15 : 1;

      if (isHover || isNeighbor) {
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, baseR + 3 / globalScale, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(getCss("--accent", "#3b82f6"), 0.2);
        ctx.fill();
      }

      if (node.type === "ghost") {
        ctx.setLineDash([3 / globalScale, 2 / globalScale]);
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, baseR, 0, Math.PI * 2);
        ctx.lineWidth = 1.2 / globalScale;
        ctx.strokeStyle = resolveColor(node.color) || "#94a3b8";
        ctx.globalAlpha *= 0.65;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, baseR, 0, Math.PI * 2);
        ctx.fillStyle = resolveColor(node.color) || "#94a3b8";
        ctx.fill();
        ctx.lineWidth = 1.5 / globalScale;
        ctx.strokeStyle = getCss("--bg", "#0f1115");
        ctx.stroke();
      }

      const labelOpacity = Math.max(
        0,
        Math.min(1, (globalScale - settings.textFadeThreshold) / 0.6),
      );
      if (labelOpacity > 0 || isHover || isNeighbor) {
        const fontPx = Math.max(9 / globalScale, 9);
        ctx.font = `${fontPx}px var(--font-sans), system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.globalAlpha = isHover || isNeighbor ? 1 : labelOpacity;
        ctx.fillStyle =
          isHover || isNeighbor ? getCss("--fg", "#e5e7eb") : getCss("--fg-muted", "#9ca3af");
        const label = node.title.length > 28 ? node.title.slice(0, 28) + "…" : node.title;
        ctx.fillText(label, node.x!, node.y! + baseR + 3 / globalScale);
      }
      ctx.globalAlpha = 1;
    },
    [adjacency, hovered, settings],
  );

  const pointerArea2D = useCallback((n: any, color: string, ctx: CanvasRenderingContext2D) => {
    const node = n as RFGNode;
    if (node.x == null || node.y == null || !settings) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.size * settings.nodeSize + 2, 0, Math.PI * 2);
    ctx.fill();
  }, [settings]);

  const linkColor = useCallback(
    (l: any): string => {
      const link = l as RFGLink;
      if (!settings) return "var(--border-strong)";
      const hoveredId = hovered?.id;
      if (hoveredId) {
        const sId = typeof link.source === "string" ? link.source : (link.source as any).id;
        const tId = typeof link.target === "string" ? link.target : (link.target as any).id;
        if (sId === hoveredId || tId === hoveredId) {
          return getCss("--accent", "#3b82f6");
        }
      }
      if (settings.lineColorWithGroup) {
        const sId = typeof link.source === "string" ? link.source : (link.source as any).id;
        const src = graphData.nodes.find((n) => n.id === sId);
        if (src) return withAlpha(resolveColor(src.color), 0.55);
      }
      if (link.kind === "tag") return withAlpha(getCss("--accent", "#3b82f6"), 0.45);
      return withAlpha(getCss("--border-strong", "#374151"), 0.6);
    },
    [hovered, graphData.nodes, settings],
  );

  const createFromGhost = async (title: string) => {
    const id = nanoid(10);
    await db.notes.add({
      id,
      title,
      content: "<p></p>",
      contentText: "",
      type: "note",
      folderId: null,
      tags: [],
      links: [],
      attachments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archivedAt: null,
      pinned: false,
    });
    setGhostPrompt(null);
    setView({ kind: "note", id });
    toast.success(`Создана: «${title}»`);
  };

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center text-fg-subtle">Загрузка графа…</div>
    );
  }

  const topTags = Array.from(tagUniverse.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3 gap-3">
        <div className="shrink-0">
          <h2
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Граф знаний
          </h2>
          <p className="text-xs text-fg-subtle mt-0.5">
            {stats.nodes} узлов · {stats.links} связей · {settings.mode.toUpperCase()}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => patch({ mode: "2d" })}
              className={cn(
                "px-3 py-1 text-[11.5px] flex items-center gap-1 transition-colors",
                settings.mode === "2d"
                  ? "bg-accent-soft text-accent"
                  : "bg-bg-elev-1 text-fg-muted hover:bg-bg-elev-2",
              )}
            >
              <Square size={11} /> 2D
            </button>
            <button
              onClick={() => patch({ mode: "3d" })}
              className={cn(
                "px-3 py-1 text-[11.5px] flex items-center gap-1 transition-colors border-l border-border",
                settings.mode === "3d"
                  ? "bg-accent-soft text-accent"
                  : "bg-bg-elev-1 text-fg-muted hover:bg-bg-elev-2",
              )}
            >
              <Box size={11} /> 3D
            </button>
          </div>

          <div className="relative w-64">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none"
            />
            <Input
              value={settings.search}
              onChange={(e) => patch({ search: e.target.value })}
              placeholder="tag:foo path:Work line:hello"
              className="pl-7 pr-7 h-8 text-[12px]"
            />
            {settings.search && (
              <button
                onClick={() => patch({ search: "" })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                title="Очистить"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div ref={containerRef} className="relative flex-1 overflow-hidden bg-bg">
          {settings.mode === "2d" ? (
            <ForceGraph2D
              ref={graphRef}
              width={size.w}
              height={size.h}
              graphData={graphData}
              backgroundColor="rgba(0,0,0,0)"
              nodeCanvasObject={paint2D}
              nodePointerAreaPaint={pointerArea2D}
              linkColor={linkColor}
              linkWidth={(l: any) => {
                const link = l as RFGLink;
                const base = link.kind === "tag" ? 0.7 : 1;
                return base * settings.linkThickness;
              }}
              linkDirectionalArrowLength={settings.arrows ? 4 : 0}
              linkDirectionalArrowRelPos={1}
              cooldownTicks={300}
              d3AlphaDecay={0.025}
              d3VelocityDecay={0.4}
              enableNodeDrag={true}
              enableZoomInteraction={true}
              enablePanInteraction={true}
              onNodeClick={onNodeClick}
              onNodeHover={(n: any) => setHovered((n as RFGNode) ?? null)}
              onNodeDragEnd={(n: any) => {
                n.fx = n.x;
                n.fy = n.y;
              }}
            />
          ) : (
            <ForceGraph3D
              ref={graphRef}
              width={size.w}
              height={size.h}
              graphData={graphData}
              backgroundColor="rgba(0,0,0,0)"
              nodeLabel={(n: any) => (n as RFGNode).title}
              nodeColor={(n: any) => resolveColor((n as RFGNode).color)}
              nodeVal={(n: any) => {
                const node = n as RFGNode;
                return Math.pow(node.size * settings.nodeSize, 2) * 0.3;
              }}
              nodeOpacity={0.92}
              linkColor={linkColor}
              linkWidth={(l: any) => {
                const link = l as RFGLink;
                return link.kind === "tag"
                  ? 0.6 * settings.linkThickness
                  : 1 * settings.linkThickness;
              }}
              linkOpacity={0.55}
              linkDirectionalArrowLength={settings.arrows ? 3 : 0}
              linkDirectionalArrowRelPos={1}
              cooldownTicks={300}
              enableNodeDrag={true}
              enableNavigationControls={true}
              showNavInfo={false}
              onNodeClick={onNodeClick}
              onNodeHover={(n: any) => setHovered((n as RFGNode) ?? null)}
              onNodeDragEnd={(n: any) => {
                n.fx = n.x;
                n.fy = n.y;
                n.fz = n.z;
              }}
            />
          )}
        </div>

        <aside className="w-72 shrink-0 border-l border-border bg-bg-elev-1 overflow-y-auto">
          <Group
            open={openFilters}
            onToggle={() => setOpenFilters(!openFilters)}
            title="Фильтры"
          >
            <Toggle
              label="Показывать изолированные"
              checked={settings.showOrphans}
              onChange={(v) => patch({ showOrphans: v })}
            />
            <Toggle
              label="Только существующие"
              hint="Скрыть [[несуществующие]] ссылки"
              checked={settings.showExistingOnly}
              onChange={(v) => patch({ showExistingOnly: v })}
            />
            <Toggle
              label="Ghost-узлы"
              hint="Пунктирные [[несозданные]]"
              checked={settings.showGhosts && !settings.showExistingOnly}
              disabled={settings.showExistingOnly}
              onChange={(v) => patch({ showGhosts: v })}
            />
            <Toggle
              label="Теги как узлы"
              checked={settings.showTags}
              onChange={(v) => patch({ showTags: v })}
            />

            {topTags.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1">
                  Быстрые теги
                </div>
                <div className="flex flex-wrap gap-1">
                  {topTags.slice(0, 12).map(([t, count]) => (
                    <button
                      key={t}
                      onClick={() =>
                        patch({
                          search: settings.search ? `${settings.search} tag:${t}` : `tag:${t}`,
                        })
                      }
                      className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] text-fg-muted hover:bg-bg-elev-2 hover:text-fg"
                      title="Добавить в поиск"
                    >
                      #{t}
                      <span className="ml-1 text-[10px] opacity-60">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Group>

          <Group
            open={openGroups}
            onToggle={() => setOpenGroups(!openGroups)}
            title="Цветовые группы"
          >
            <ColorGroupsEditor
              groups={settings.groups}
              onChange={(groups) => patch({ groups })}
            />
          </Group>

          <Group
            open={openDisplay}
            onToggle={() => setOpenDisplay(!openDisplay)}
            title="Отображение"
          >
            <Toggle
              label="Стрелки на связях"
              checked={settings.arrows}
              onChange={(v) => patch({ arrows: v })}
            />
            <Toggle
              label="Цвет связи по узлу"
              hint="Связь окрашивается в цвет источника"
              checked={settings.lineColorWithGroup}
              onChange={(v) => patch({ lineColorWithGroup: v })}
            />
            <Slider
              label="Размер узла"
              min={50}
              max={300}
              value={Math.round(settings.nodeSize * 100)}
              onChange={(v) => patch({ nodeSize: v / 100 })}
              suffix="%"
            />
            <Slider
              label="Толщина связи"
              min={50}
              max={300}
              value={Math.round(settings.linkThickness * 100)}
              onChange={(v) => patch({ linkThickness: v / 100 })}
              suffix="%"
            />
            <Slider
              label="Подписи появляются с"
              min={50}
              max={300}
              value={Math.round(settings.textFadeThreshold * 100)}
              onChange={(v) => patch({ textFadeThreshold: v / 100 })}
              suffix="%"
            />
          </Group>

          <Group
            open={openForces}
            onToggle={() => setOpenForces(!openForces)}
            title="Силы"
          >
            <Slider
              label="Центр"
              min={0}
              max={50}
              value={Math.round(settings.centerForce * 100)}
              onChange={(v) => patch({ centerForce: v / 100 })}
              suffix="%"
            />
            <Slider
              label="Отталкивание"
              min={-1500}
              max={-20}
              value={settings.repelForce}
              onChange={(v) => patch({ repelForce: v })}
            />
            <Slider
              label="Сила связи"
              min={5}
              max={200}
              value={Math.round(settings.linkForce * 100)}
              onChange={(v) => patch({ linkForce: v / 100 })}
              suffix="%"
            />
            <Slider
              label="Длина связи"
              min={20}
              max={400}
              value={settings.linkDistance}
              onChange={(v) => patch({ linkDistance: v })}
            />
          </Group>

          <section className="border-t border-border p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
              Управление
            </h3>
            <ul className="mt-2 space-y-1 text-[11.5px] text-fg-subtle leading-relaxed">
              <li>Клик по узлу — открыть заметку</li>
              <li>Клик по ghost-узлу — диалог создания</li>
              <li>Тащи узел — переместить и закрепить</li>
              <li>Колесо — масштаб, ЛКМ по фону — пан</li>
              <li>3D: ПКМ — вращать камеру</li>
            </ul>
          </section>
        </aside>
      </div>

      {ghostPrompt && (
        <GhostCreateDialog
          title={ghostPrompt.title}
          onCancel={() => setGhostPrompt(null)}
          onCreate={() => createFromGhost(ghostPrompt.title)}
        />
      )}
    </div>
  );
}

// ── Sidebar UI helpers ───────────────────────────────────────────────

function Group({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-bg-elev-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg">{title}</span>
        {open ? (
          <ChevronDown size={12} className="text-fg-subtle" />
        ) : (
          <ChevronRight size={12} className="text-fg-subtle" />
        )}
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-2.5">{children}</div>}
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-2 text-[12px]",
        disabled ? "text-fg-subtle opacity-60" : "text-fg-muted",
      )}
    >
      <span className="flex flex-col">
        <span>{label}</span>
        {hint && <span className="text-[10.5px] text-fg-subtle">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--accent)]"
      />
    </label>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
  suffix,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-fg-muted">
        <span>{label}</span>
        <span className="font-mono text-fg-subtle">
          {value}
          {suffix ?? ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </div>
  );
}

function ColorGroupsEditor({
  groups,
  onChange,
}: {
  groups: ColorGroup[];
  onChange: (g: ColorGroup[]) => void;
}) {
  const update = (i: number, patchObj: Partial<ColorGroup>) => {
    const next = [...groups];
    next[i] = { ...next[i], ...patchObj };
    onChange(next);
  };
  const remove = (i: number) => onChange(groups.filter((_, j) => j !== i));
  const add = () => onChange([...groups, { query: "tag:new", color: "#3b82f6" }]);

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-fg-subtle leading-relaxed">
        Правила покраски узлов. Операторы: <code>tag:foo</code>, <code>path:bar</code>,{" "}
        <code>line:слово</code>. Первое совпавшее правило выигрывает.
      </p>
      {groups.map((g, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="color"
            value={g.color.startsWith("#") ? g.color : "#3b82f6"}
            onChange={(e) => update(i, { color: e.target.value })}
            className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border bg-transparent"
          />
          <Input
            value={g.query}
            onChange={(e) => update(i, { query: e.target.value })}
            placeholder="tag:foo, path:Work, #idea"
            className="h-7 flex-1 text-[11.5px] font-mono"
          />
          <button
            onClick={() => remove(i)}
            className="rounded p-1 text-fg-subtle hover:bg-bg-elev-2 hover:text-danger"
            title="Удалить"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <Button size="sm" variant="secondary" onClick={add} className="w-full">
        <Plus size={11} /> Добавить группу
      </Button>
    </div>
  );
}

function GhostCreateDialog({
  title,
  onCancel,
  onCreate,
}: {
  title: string;
  onCancel: () => void;
  onCreate: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-elev-1 p-5 shadow-2xl fade-up">
        <div className="text-[15px] font-semibold tracking-tight mb-1">Создать заметку?</div>
        <p className="text-[12px] text-fg-muted mb-4">
          На неё указывает <code>[[{title}]]</code>, но самой заметки ещё нет. Создать сейчас?
        </p>
        <div className="flex gap-2">
          <Button onClick={onCreate} className="flex-1">
            Создать «{title.length > 22 ? title.slice(0, 22) + "…" : title}»
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Отмена
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

function getCss(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function resolveColor(c: string): string {
  if (!c) return "#94a3b8";
  if (!c.startsWith("var(")) return c;
  const m = c.match(/var\(([^)]+)\)/);
  if (!m) return c;
  return getCss(m[1].trim(), "#94a3b8");
}

function withAlpha(c: string, alpha: number): string {
  if (c.startsWith("#") && (c.length === 7 || c.length === 4)) {
    const r = c.length === 4 ? parseInt(c[1] + c[1], 16) : parseInt(c.slice(1, 3), 16);
    const g = c.length === 4 ? parseInt(c[2] + c[2], 16) : parseInt(c.slice(3, 5), 16);
    const b = c.length === 4 ? parseInt(c[3] + c[3], 16) : parseInt(c.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (c.startsWith("oklch(") || c.startsWith("rgb(") || c.startsWith("hsl(")) {
    return c.replace(/\)$/, ` / ${alpha})`);
  }
  return c;
}
