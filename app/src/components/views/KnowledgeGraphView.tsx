"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { db } from "@/lib/db/schema";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Maximize2,
  Network,
  Box,
  Filter,
  Palette,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CircleDot,
} from "lucide-react";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  group: string;
  size: number;
  color?: string;
  type: "note" | "tag" | "folder";
}
interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  kind: "link" | "tag";
}

export function KnowledgeGraphView() {
  const notes = useLiveQuery(() => db.notes.toArray()) ?? [];
  const folders = useLiveQuery(() => db.folders.toArray()) ?? [];
  const tags = useLiveQuery(() => db.tags.toArray()) ?? [];
  const setView = useApp((s) => s.setView);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [showOrphans, setShowOrphans] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [linkDistance, setLinkDistance] = useState(120);
  const [charge, setCharge] = useState(-220);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const draggingRef = useRef<{ id: string | null; ox: number; oy: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const { nodes, edges } = useMemo(() => {
    const noteMap = new Map(notes.map((n) => [n.title, n]));
    const noteNodes: GraphNode[] = notes.map((n) => {
      const folder = folders.find((f) => f.id === n.folderId);
      return {
        id: n.id,
        title: n.title || "Untitled",
        group: folder?.name ?? "Root",
        size: 6 + Math.min(20, n.links.length * 2 + Math.sqrt(n.contentText.length) * 0.3),
        color: folder?.color ?? "#94a3b8",
        type: "note",
      };
    });

    let tagNodes: GraphNode[] = [];
    if (showTags) {
      const usedTags = new Set<string>();
      notes.forEach((n) => n.tags.forEach((t) => usedTags.add(t)));
      tagNodes = Array.from(usedTags).map((t) => {
        const tag = tags.find((x) => x.name === t);
        return {
          id: "tag:" + t,
          title: "#" + t,
          group: "tag",
          size: 5,
          color: tag?.color ?? "#f97316",
          type: "tag",
        };
      });
    }

    const linkEdges: GraphEdge[] = [];
    notes.forEach((n) => {
      n.links.forEach((targetTitle) => {
        const target = noteMap.get(targetTitle);
        if (target) {
          linkEdges.push({
            id: n.id + "-" + target.id,
            source: n.id,
            target: target.id,
            kind: "link",
          });
        }
      });
      if (showTags) {
        n.tags.forEach((t) => {
          linkEdges.push({ id: n.id + "-tag-" + t, source: n.id, target: "tag:" + t, kind: "tag" });
        });
      }
    });

    let allNodes = [...noteNodes, ...tagNodes];
    if (!showOrphans) {
      const connected = new Set<string>();
      linkEdges.forEach((e) => {
        const src = typeof e.source === "string" ? e.source : e.source.id;
        const tgt = typeof e.target === "string" ? e.target : e.target.id;
        connected.add(src);
        connected.add(tgt);
      });
      allNodes = allNodes.filter((n) => connected.has(n.id));
    }
    return { nodes: allNodes, edges: linkEdges };
  }, [notes, folders, tags, showOrphans, showTags]);

  useEffect(() => {
    if (nodes.length === 0) return;
    const sim = forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        forceLink<GraphNode, GraphEdge>(edges)
          .id((d: GraphNode) => d.id)
          .distance(linkDistance)
          .strength(0.4),
      )
      .force("charge", forceManyBody<GraphNode>().strength(charge))
      .force("center", forceCenter<GraphNode>(size.w / 2, size.h / 2))
      .force("collide", forceCollide<GraphNode>().radius((d: GraphNode) => d.size + 4));

    sim.on("tick", () => {
      const positions: Record<string, { x: number; y: number }> = {};
      nodes.forEach((n) => {
        positions[n.id] = { x: n.x ?? 0, y: n.y ?? 0 };
      });
      setPositions(positions);
    });

    sim.alpha(1).restart();

    return () => {
      sim.stop();
    };
  }, [nodes, edges, linkDistance, charge, size.w, size.h]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dz = -e.deltaY * 0.001;
    setZoom((z) => Math.max(0.2, Math.min(3, z + dz)));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    panRef.current = { x: e.clientX, y: e.clientY, sx: pan.x, sy: pan.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (draggingRef.current?.id) {
      const id = draggingRef.current.id;
      const node = nodes.find((n) => n.id === id);
      if (node) {
        node.fx = (e.clientX - draggingRef.current.ox - pan.x) / zoom;
        node.fy = (e.clientY - draggingRef.current.oy - pan.y) / zoom;
      }
      return;
    }
    if (panRef.current) {
      setPan({
        x: panRef.current.sx + (e.clientX - panRef.current.x),
        y: panRef.current.sy + (e.clientY - panRef.current.y),
      });
    }
  };
  const onMouseUp = () => {
    if (draggingRef.current?.id) {
      const node = nodes.find((n) => n.id === draggingRef.current!.id);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
    }
    draggingRef.current = null;
    panRef.current = null;
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
            Knowledge Graph
          </h2>
          <p className="text-xs text-fg-subtle mt-0.5">{nodes.length} узлов · {edges.length} связей</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline">
            <Filter size={12} /> Фильтры
          </Button>
        </div>
      </header>

      <div className="flex flex-1">
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden bg-bg"
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 50%, oklch(50% 0.01 250 / 0.04) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <svg ref={svgRef} width={size.w} height={size.h} className="absolute inset-0">
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {edges.map((e) => {
                const s = positions[typeof e.source === "string" ? e.source : e.source.id];
                const t = positions[typeof e.target === "string" ? e.target : e.target.id];
                if (!s || !t) return null;
                return (
                  <line
                    key={e.id}
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={e.kind === "tag" ? "var(--accent)" : "var(--border-strong)"}
                    strokeWidth={e.kind === "tag" ? 0.6 : 1}
                    strokeOpacity={e.kind === "tag" ? 0.3 : 0.6}
                  />
                );
              })}
              {nodes.map((n) => {
                const p = positions[n.id];
                if (!p) return null;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p.x},${p.y})`}
                    style={{ cursor: "grab" }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      draggingRef.current = {
                        id: n.id,
                        ox: e.clientX - p.x * zoom - pan.x,
                        oy: e.clientY - p.y * zoom - pan.y,
                      };
                    }}
                    onDoubleClick={() => {
                      if (n.type === "note") setView({ kind: "note", id: n.id });
                    }}
                  >
                    <circle
                      r={n.size}
                      fill={n.color}
                      stroke="var(--bg)"
                      strokeWidth={1.5}
                      opacity={n.type === "tag" ? 0.7 : 0.95}
                    />
                    <text
                      x={0}
                      y={n.size + 12}
                      textAnchor="middle"
                      fontSize={10}
                      fill="var(--fg-muted)"
                      style={{ pointerEvents: "none", fontFamily: "var(--font-sans)" }}
                    >
                      {n.title.length > 24 ? n.title.slice(0, 24) + "…" : n.title}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          <div className="absolute bottom-3 right-3 flex flex-col gap-1 rounded-md border border-border bg-bg-elev-1 p-1 shadow">
            <Button size="icon-sm" variant="ghost" onClick={() => setZoom((z) => Math.min(3, z + 0.1))}>
              <ZoomIn size={13} />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}>
              <ZoomOut size={13} />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
              <Maximize2 size={13} />
            </Button>
          </div>
        </div>

        <aside className="w-64 shrink-0 border-l border-border bg-bg-elev-1 p-4 space-y-5 overflow-y-auto">
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Display</h3>
            <div className="mt-2 space-y-2">
              <label className="flex items-center justify-between text-xs text-fg-muted">
                Orphans
                <input type="checkbox" checked={showOrphans} onChange={(e) => setShowOrphans(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between text-xs text-fg-muted">
                Tags
                <input type="checkbox" checked={showTags} onChange={(e) => setShowTags(e.target.checked)} />
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Forces</h3>
            <div className="mt-3 space-y-3">
              <Slider label="Link distance" min={20} max={300} value={linkDistance} onChange={setLinkDistance} />
              <Slider label="Charge" min={-600} max={-20} value={charge} onChange={setCharge} />
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Groups</h3>
            <div className="mt-2 space-y-1">
              {Array.from(new Set(nodes.map((n) => n.group))).map((g) => (
                <div key={g} className="flex items-center gap-2 text-xs text-fg-muted">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: nodes.find((n) => n.group === g)?.color }}
                  />
                  {g}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Presets</h3>
            <div className="mt-2 space-y-1">
              {["Research", "Personal", "Team"].map((p) => (
                <button key={p} className="block w-full text-left text-xs text-fg-muted hover:text-fg rounded px-2 py-1 hover:bg-bg-elev-2">
                  ⋯ {p}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
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
        <span>{value}</span>
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
