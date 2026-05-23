"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { zoom as d3Zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { select } from "d3-selection";
import { db } from "@/lib/db/schema";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  group: string;
  color: string;
  links: number;        // degree — drives node radius
  type: "note" | "tag";
}
interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  kind: "link" | "tag";
}

// Obsidian-ish render constants. Tuned for ~50–500 nodes; tweak as needed.
const NODE_BASE_RADIUS = 4;
const NODE_LINK_BOOST = 0.9;      // r = base + sqrt(links) * boost
const NODE_MAX_RADIUS = 16;
const LABEL_FADE_ZOOM_IN = 1.2;   // labels start to appear here
const LABEL_FULL_ZOOM = 1.8;      // fully visible here
const HOVER_DIM = 0.18;           // opacity multiplier for non-neighbors

export function KnowledgeGraphView() {
  const notes = useLiveQuery(() => db.notes.filter((n) => n.archivedAt == null).toArray()) ?? [];
  const folders = useLiveQuery(() => db.folders.toArray()) ?? [];
  const tagsTable = useLiveQuery(() => db.tags.toArray()) ?? [];
  const setView = useApp((s) => s.setView);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<GraphNode, GraphEdge> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const hoveredRef = useRef<GraphNode | null>(null);
  const draggingRef = useRef<GraphNode | null>(null);
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map());
  const dprRef = useRef<number>(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);

  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [showOrphans, setShowOrphans] = useState(true);
  const [showTags, setShowTags] = useState(false);
  const [linkDistance, setLinkDistance] = useState(90);
  const [charge, setCharge] = useState(-180);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);

  // ── Resize listener ────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
      dprRef.current = window.devicePixelRatio || 1;
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ── Build graph ────────────────────────────────────────────────────
  const { nodes, edges, adjacency } = useMemo(() => {
    const noteByTitle = new Map(notes.map((n) => [n.title.toLowerCase(), n]));

    // Stable colour-from-folder, fallback to neutral
    const colorFor = (folderId: string | null): string => {
      const f = folders.find((x) => x.id === folderId);
      return f?.color ?? "var(--fg-subtle)";
    };

    // Build degree map first so radii are consistent across renders
    const degree = new Map<string, number>();
    notes.forEach((n) => {
      n.links.forEach((target) => {
        const t = noteByTitle.get(target.toLowerCase());
        if (!t) return;
        degree.set(n.id, (degree.get(n.id) ?? 0) + 1);
        degree.set(t.id, (degree.get(t.id) ?? 0) + 1);
      });
    });

    const noteNodes: GraphNode[] = notes.map((n) => ({
      id: n.id,
      title: n.title || "Untitled",
      group: folders.find((f) => f.id === n.folderId)?.name ?? "Vault",
      color: colorFor(n.folderId),
      links: degree.get(n.id) ?? 0,
      type: "note",
    }));

    let tagNodes: GraphNode[] = [];
    if (showTags) {
      const used = new Set<string>();
      notes.forEach((n) => n.tags.forEach((t) => used.add(t)));
      tagNodes = Array.from(used).map((t) => ({
        id: "tag:" + t,
        title: "#" + t,
        group: "tag",
        color: tagsTable.find((x) => x.name === t)?.color ?? "var(--accent)",
        links: 0,
        type: "tag",
      }));
    }

    const edgeList: GraphEdge[] = [];
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string, kind: GraphEdge["kind"]) => {
      edgeList.push({ source: a, target: b, kind });
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    };

    notes.forEach((n) => {
      n.links.forEach((targetTitle) => {
        const target = noteByTitle.get(targetTitle.toLowerCase());
        if (target) link(n.id, target.id, "link");
      });
      if (showTags) n.tags.forEach((t) => link(n.id, "tag:" + t, "tag"));
    });

    let all = [...noteNodes, ...tagNodes];
    if (!showOrphans) {
      const connected = new Set<string>();
      edgeList.forEach((e) => {
        const s = typeof e.source === "string" ? e.source : e.source.id;
        const t = typeof e.target === "string" ? e.target : e.target.id;
        connected.add(s);
        connected.add(t);
      });
      all = all.filter((n) => connected.has(n.id));
    }

    return { nodes: all, edges: edgeList, adjacency: adj };
  }, [notes, folders, tagsTable, showOrphans, showTags]);

  // Stats are derived but only updated when the graph changes (cheap React update).
  useEffect(() => {
    adjacencyRef.current = adjacency;
    setNodeCount(nodes.length);
    setEdgeCount(edges.length);
  }, [adjacency, nodes.length, edges.length]);

  // ── Force simulation lives in a ref, drives DOM via canvas redraw ──
  useEffect(() => {
    if (!canvasRef.current) return;

    // Seed positions near the center so the simulation doesn't visibly snap
    // from random coordinates on first paint. Existing simulation nodes keep
    // their positions for smoother transitions when filters change.
    const cx = size.w / 2;
    const cy = size.h / 2;
    nodes.forEach((n) => {
      if (n.x == null || n.y == null) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * Math.min(size.w, size.h) * 0.2;
        n.x = cx + Math.cos(a) * r;
        n.y = cy + Math.sin(a) * r;
      }
    });

    const sim = forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        forceLink<GraphNode, GraphEdge>(edges)
          .id((d) => d.id)
          .distance(linkDistance)
          .strength((e) => (e.kind === "tag" ? 0.2 : 0.5)),
      )
      .force(
        "charge",
        forceManyBody<GraphNode>().strength((n) => charge * (1 + Math.log2(n.links + 1) * 0.25)),
      )
      .force("center", forceCenter<GraphNode>(cx, cy).strength(0.05))
      .force("x", forceX<GraphNode>(cx).strength(0.04))
      .force("y", forceY<GraphNode>(cy).strength(0.04))
      .force(
        "collide",
        forceCollide<GraphNode>().radius((n) => nodeRadius(n) + 3).strength(0.9),
      )
      .alphaDecay(0.025)
      .velocityDecay(0.35);

    simRef.current = sim;

    // We don't subscribe to "tick" with React state — drawing runs from rAF.
    return () => {
      sim.stop();
    };
  }, [nodes, edges, linkDistance, charge, size.w, size.h]);

  // ── Canvas redraw loop ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // CSS variables on <html> aren't directly readable for canvas drawing;
    // pull them once per frame so theme switches reflect immediately.
    const root = getComputedStyle(document.documentElement);
    let raf = 0;

    const draw = () => {
      const dpr = dprRef.current;
      const w = size.w;
      const h = size.h;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const t = transformRef.current;
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      const hovered = hoveredRef.current;
      const neighborSet = hovered ? adjacencyRef.current.get(hovered.id) ?? new Set<string>() : null;

      const fgMuted = root.getPropertyValue("--fg-muted").trim() || "#9ca3af";
      const fg = root.getPropertyValue("--fg").trim() || "#e5e7eb";
      const bg = root.getPropertyValue("--bg").trim() || "#0f1115";
      const border = root.getPropertyValue("--border-strong").trim() || "#374151";
      const accent = root.getPropertyValue("--accent").trim() || "#3b82f6";

      // Edges first (under nodes). Hovered-neighbour edges drawn last & glowy.
      ctx.lineCap = "round";
      const isDim = (id: string) =>
        hovered && hovered.id !== id && !(neighborSet && neighborSet.has(id));

      for (const e of edges) {
        const s = e.source as GraphNode;
        const tgt = e.target as GraphNode;
        if (s.x == null || tgt.x == null) continue;
        const dim = hovered ? (isDim(s.id) && isDim(tgt.id)) : false;
        const onPath = hovered && (s.id === hovered.id || tgt.id === hovered.id);
        ctx.strokeStyle = onPath ? accent : (e.kind === "tag" ? accent : border);
        ctx.globalAlpha = dim ? HOVER_DIM : onPath ? 0.9 : e.kind === "tag" ? 0.35 : 0.55;
        ctx.lineWidth = onPath ? 1.6 / t.k : (e.kind === "tag" ? 0.6 / t.k : 1 / t.k);
        ctx.beginPath();
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(tgt.x!, tgt.y!);
        ctx.stroke();
      }

      // Nodes
      for (const n of nodes) {
        if (n.x == null) continue;
        const dim = hovered ? isDim(n.id) : false;
        const r = nodeRadius(n);
        ctx.globalAlpha = dim ? HOVER_DIM : 1;

        // Subtle glow ring on hovered + neighbours
        if (hovered && (n.id === hovered.id || (neighborSet && neighborSet.has(n.id)))) {
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r + 3 / t.k, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(accent, 0.18);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
        ctx.fillStyle = resolveColor(n.color, root) || fgMuted;
        ctx.fill();
        ctx.lineWidth = 1.5 / t.k;
        ctx.strokeStyle = bg;
        ctx.stroke();
      }

      // Labels — only at high zoom OR on hovered + neighbours
      const labelOpacity = Math.max(
        0,
        Math.min(1, (t.k - LABEL_FADE_ZOOM_IN) / (LABEL_FULL_ZOOM - LABEL_FADE_ZOOM_IN)),
      );
      if (labelOpacity > 0 || hovered) {
        const fontPx = Math.max(9 / t.k, 9);
        ctx.font = `${fontPx}px var(--font-sans), system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        for (const n of nodes) {
          if (n.x == null) continue;
          const isHl = hovered && (n.id === hovered.id || (neighborSet && neighborSet.has(n.id)));
          const a = isHl ? 1 : labelOpacity;
          if (a <= 0) continue;
          if (hovered && !isHl && labelOpacity <= 0) continue;
          ctx.globalAlpha = isHl ? 1 : a * (hovered ? HOVER_DIM : 1);
          ctx.fillStyle = isHl ? fg : fgMuted;
          const label = n.title.length > 28 ? n.title.slice(0, 28) + "…" : n.title;
          ctx.fillText(label, n.x!, n.y! + nodeRadius(n) + 3 / t.k);
        }
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [nodes, edges, size.w, size.h]);

  // ── Pan/zoom via d3-zoom (cursor-anchored zoom, free pan) ──────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sel = select(canvas);
    const zoomBehavior = d3Zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.15, 4])
      .filter((event) => {
        // Allow wheel + drag-on-empty-space to pan/zoom. Drag on a node is
        // handled by our own pointer handlers so the simulation gets the
        // right fx/fy updates.
        if (event.type === "wheel") return true;
        if (event.type === "mousedown" || event.type === "touchstart") {
          return !pickNode(event as MouseEvent | TouchEvent, canvas, nodes, transformRef.current);
        }
        return true;
      })
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        setZoomLevel(event.transform.k);
      });
    sel.call(zoomBehavior);
    // Programmatic zoom from buttons goes through this same instance.
    (canvas as unknown as { __zoom?: typeof zoomBehavior }).__zoom = zoomBehavior;
    return () => {
      sel.on(".zoom", null);
    };
  }, [nodes]);

  // ── Node interactions: hover, click, drag ──────────────────────────
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const t = transformRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left - t.x) / t.k;
      const my = (e.clientY - rect.top - t.y) / t.k;

      if (draggingRef.current) {
        draggingRef.current.fx = mx;
        draggingRef.current.fy = my;
        simRef.current?.alphaTarget(0.3).restart();
        return;
      }
      // Hit-test for hover
      const hit = hitTest(nodes, mx, my);
      if (hit?.id !== hoveredRef.current?.id) {
        hoveredRef.current = hit;
        canvas.style.cursor = hit ? "pointer" : "grab";
      }
    },
    [nodes],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const t = transformRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left - t.x) / t.k;
      const my = (e.clientY - rect.top - t.y) / t.k;
      const hit = hitTest(nodes, mx, my);
      if (hit) {
        draggingRef.current = hit;
        hit.fx = mx;
        hit.fy = my;
        simRef.current?.alphaTarget(0.3).restart();
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = "grabbing";
      }
    },
    [nodes],
  );

  const onPointerUp = useCallback(() => {
    const canvas = canvasRef.current;
    const dragged = draggingRef.current;
    if (dragged) {
      // Release the pin but keep the node where the user dropped it for a
      // few ticks so it doesn't snap back jarringly.
      dragged.fx = null;
      dragged.fy = null;
      simRef.current?.alphaTarget(0);
      draggingRef.current = null;
      if (canvas) canvas.style.cursor = "grab";
    }
  }, []);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const t = transformRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left - t.x) / t.k;
      const my = (e.clientY - rect.top - t.y) / t.k;
      const hit = hitTest(nodes, mx, my);
      if (hit?.type === "note") setView({ kind: "note", id: hit.id });
    },
    [nodes, setView],
  );

  // ── Programmatic zoom controls ─────────────────────────────────────
  const zoomBy = (factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const z = (canvas as unknown as { __zoom?: ReturnType<typeof d3Zoom<HTMLCanvasElement, unknown>> }).__zoom;
    if (z) z.scaleBy(select(canvas), factor);
  };
  const resetView = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const z = (canvas as unknown as { __zoom?: ReturnType<typeof d3Zoom<HTMLCanvasElement, unknown>> }).__zoom;
    if (z) z.transform(select(canvas), zoomIdentity);
  };

  const groups = useMemo(() => {
    const map = new Map<string, string>();
    nodes.forEach((n) => map.set(n.group, n.color));
    return Array.from(map.entries());
  }, [nodes]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h2
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Граф знаний
          </h2>
          <p className="text-xs text-fg-subtle mt-0.5">
            {nodeCount} узлов · {edgeCount} связей · масштаб {Math.round(zoomLevel * 100)}%
          </p>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden bg-bg"
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 50%, oklch(50% 0.01 250 / 0.05) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            style={{ cursor: "grab", touchAction: "none" }}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
          />

          <div className="absolute bottom-3 right-3 flex flex-col gap-0.5 rounded-md border border-border bg-bg-elev-1 p-1 shadow-lg">
            <Button size="icon-sm" variant="ghost" onClick={() => zoomBy(1.3)} title="Приблизить">
              <ZoomIn size={13} />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => zoomBy(1 / 1.3)} title="Отдалить">
              <ZoomOut size={13} />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={resetView} title="Сбросить вид">
              <Maximize2 size={13} />
            </Button>
          </div>
        </div>

        <aside className="w-64 shrink-0 border-l border-border bg-bg-elev-1 p-4 space-y-5 overflow-y-auto">
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
              Отображение
            </h3>
            <div className="mt-2 space-y-2">
              <label className="flex items-center justify-between text-[12px] text-fg-muted">
                Изолированные
                <input
                  type="checkbox"
                  checked={showOrphans}
                  onChange={(e) => setShowOrphans(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
              </label>
              <label className="flex items-center justify-between text-[12px] text-fg-muted">
                Теги как узлы
                <input
                  type="checkbox"
                  checked={showTags}
                  onChange={(e) => setShowTags(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
              </label>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
              Физика
            </h3>
            <div className="mt-3 space-y-3">
              <Slider
                label="Длина связи"
                min={30}
                max={260}
                value={linkDistance}
                onChange={setLinkDistance}
              />
              <Slider label="Отталкивание" min={-500} max={-40} value={charge} onChange={setCharge} />
            </div>
          </section>

          {groups.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                Группы
              </h3>
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {groups.map(([name, color]) => (
                  <div key={name} className="flex items-center gap-2 text-[12px] text-fg-muted">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <span className="truncate">{name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
              Подсказки
            </h3>
            <ul className="mt-2 space-y-1 text-[11.5px] text-fg-subtle leading-relaxed">
              <li>Двойной клик — открыть заметку</li>
              <li>Тащи узел чтобы переместить</li>
              <li>Колесом — масштаб, ЛКМ по фону — пан</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function nodeRadius(n: GraphNode): number {
  return Math.min(
    NODE_MAX_RADIUS,
    NODE_BASE_RADIUS + Math.sqrt(n.links) * NODE_LINK_BOOST,
  );
}

function hitTest(nodes: GraphNode[], x: number, y: number): GraphNode | null {
  // Iterate in reverse so the visually-top node wins.
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.x == null || n.y == null) continue;
    const r = nodeRadius(n) + 2; // small forgiving padding
    const dx = x - n.x;
    const dy = y - n.y;
    if (dx * dx + dy * dy <= r * r) return n;
  }
  return null;
}

function pickNode(
  event: MouseEvent | TouchEvent,
  canvas: HTMLCanvasElement,
  nodes: GraphNode[],
  t: ZoomTransform,
): GraphNode | null {
  const point = "touches" in event ? event.touches[0] : event;
  if (!point) return null;
  const rect = canvas.getBoundingClientRect();
  const mx = (point.clientX - rect.left - t.x) / t.k;
  const my = (point.clientY - rect.top - t.y) / t.k;
  return hitTest(nodes, mx, my);
}

function resolveColor(c: string, root: CSSStyleDeclaration): string {
  if (!c.startsWith("var(")) return c;
  const m = c.match(/var\(([^)]+)\)/);
  if (!m) return c;
  return root.getPropertyValue(m[1].trim()).trim() || "#94a3b8";
}

function withAlpha(c: string, alpha: number): string {
  // Best-effort: works for hex, rgb(), oklch(), named colours. Falls back to
  // wrapping in rgba for hex; otherwise relies on canvas accepting the
  // CSS-with-alpha forms we know Tailwind tokens emit.
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

function Slider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-fg-muted">
        <span>{label}</span>
        <span className="font-mono text-fg-subtle">{value}</span>
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
