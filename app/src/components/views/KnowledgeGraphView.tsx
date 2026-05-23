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
  type ForceLink,
  type ForceManyBody,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { zoom as d3Zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { select } from "d3-selection";
import { db } from "@/lib/db/schema";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Maximize2, ZoomIn, ZoomOut, Search, X } from "lucide-react";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  group: string;            // colour-group key (folder name / tag / etc.)
  color: string;            // resolved CSS colour string
  links: number;            // degree — drives node radius
  type: "note" | "tag" | "ghost";  // ghost = wiki-link to a not-yet-created note
  tags: string[];           // for filtering
  spawnAt: number;          // monotonic ms when this node first appeared (drives fade-in)
}
interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  kind: "link" | "tag";
}

// Tunables
const NODE_BASE_RADIUS = 4;
const NODE_LINK_BOOST = 0.9;
const NODE_MAX_RADIUS = 16;
const LABEL_FADE_ZOOM_IN = 1.2;
const LABEL_FULL_ZOOM = 1.8;
const HOVER_DIM = 0.18;
const SEARCH_DIM = 0.12;

type ColorBy = "folder" | "tag" | "uniform";

export function KnowledgeGraphView() {
  const notes = useLiveQuery(() => db.notes.filter((n) => n.archivedAt == null).toArray()) ?? [];
  const folders = useLiveQuery(() => db.folders.toArray()) ?? [];
  const tagsTable = useLiveQuery(() => db.tags.toArray()) ?? [];
  const setView = useApp((s) => s.setView);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Refs that survive re-renders ───────────────────────────────────
  // The simulation is created ONCE per topology change, never on parameter
  // changes — that's what stops the "jumping" effect: forces are updated
  // in place, the simulation just gets a small kick.
  const simRef = useRef<Simulation<GraphNode, GraphEdge> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map());
  const positionsRef = useRef<Map<string, { x: number; y: number; vx: number; vy: number }>>(new Map());
  // Persist spawnAt per node id across renders so we don't reset the fade-in
  // every time the live query refires.
  const spawnCacheRef = useRef<Map<string, number>>(new Map());
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const hoveredRef = useRef<GraphNode | null>(null);
  const draggingRef = useRef<GraphNode | null>(null);
  const searchRef = useRef<string>("");
  const dprRef = useRef<number>(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);

  // ── UI state (drives re-renders only when user changes a control) ──
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [showOrphans, setShowOrphans] = useState(true);
  const [showTags, setShowTags] = useState(false);
  const [showGhosts, setShowGhosts] = useState(true);
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [colorBy, setColorBy] = useState<ColorBy>("folder");
  const [linkDistance, setLinkDistance] = useState(90);
  const [linkStrength, setLinkStrength] = useState(0.5);
  const [charge, setCharge] = useState(-180);
  const [centerStrength, setCenterStrength] = useState(0.05);
  const [search, setSearch] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });

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

  // Keep ref in sync — used by the canvas redraw to dim non-matches.
  useEffect(() => {
    searchRef.current = search.toLowerCase();
  }, [search]);

  // ── Build graph (memoised; result is structurally cheap to compare) ──
  const graph = useMemo(() => {
    const noteByTitle = new Map(notes.map((n) => [n.title.toLowerCase(), n]));
    const folderById = new Map(folders.map((f) => [f.id, f]));
    const tagColorByName = new Map(tagsTable.map((t) => [t.name, t.color]));

    // Degree map (used for radius)
    const degree = new Map<string, number>();
    notes.forEach((n) => {
      n.links.forEach((target) => {
        const t = noteByTitle.get(target.toLowerCase());
        if (!t) return;
        degree.set(n.id, (degree.get(n.id) ?? 0) + 1);
        degree.set(t.id, (degree.get(t.id) ?? 0) + 1);
      });
    });

    // Universe of tags in use (for filter chips)
    const tagUniverse: Map<string, number> = new Map();
    notes.forEach((n) => n.tags.forEach((t) => tagUniverse.set(t, (tagUniverse.get(t) ?? 0) + 1)));

    const pickColor = (n: typeof notes[number]): string => {
      if (colorBy === "uniform") return "var(--fg-muted)";
      if (colorBy === "tag") {
        const t = n.tags[0];
        return t ? (tagColorByName.get(t) ?? "var(--accent)") : "var(--fg-subtle)";
      }
      return folderById.get(n.folderId ?? "")?.color ?? "var(--fg-subtle)";
    };

    const groupOf = (n: typeof notes[number]): string => {
      if (colorBy === "tag") return n.tags[0] ?? "(без тега)";
      return folderById.get(n.folderId ?? "")?.name ?? "Vault";
    };

    const now = performance.now();
    // Spawn timestamps are kept across renders in a ref so a node that
    // existed last frame keeps its original spawnAt. New nodes get `now`
    // and fade in via the canvas draw loop.
    const cache = spawnCacheRef.current;

    let noteNodes: GraphNode[] = notes.map((n) => {
      const id = n.id;
      const spawnAt = cache.get(id) ?? now;
      cache.set(id, spawnAt);
      return {
        id,
        title: n.title || "Untitled",
        group: groupOf(n),
        color: pickColor(n),
        links: degree.get(id) ?? 0,
        type: "note" as const,
        tags: n.tags,
        spawnAt,
      };
    });

    // Tag filter: keep only notes that have AT LEAST ONE selected tag
    // (when filter is non-empty). Empty filter = no constraint.
    if (tagFilter.size > 0) {
      noteNodes = noteNodes.filter((n) => n.tags.some((t) => tagFilter.has(t)));
    }

    let tagNodes: GraphNode[] = [];
    if (showTags) {
      const usedTags = new Set<string>();
      noteNodes.forEach((n) => n.tags.forEach((t) => usedTags.add(t)));
      tagNodes = Array.from(usedTags).map((t) => {
        const id = "tag:" + t;
        const spawnAt = cache.get(id) ?? now;
        cache.set(id, spawnAt);
        return {
          id,
          title: "#" + t,
          group: "tag",
          color: tagColorByName.get(t) ?? "var(--accent)",
          links: 0,
          type: "tag" as const,
          tags: [t],
          spawnAt,
        };
      });
    }

    // Ghost nodes: every wiki-link target that doesn't resolve to an
    // existing note. Same visual model as Obsidian — semi-transparent
    // dashed-outline circles. They keep the user honest about broken
    // references.
    const ghostNodes: GraphNode[] = [];
    if (showGhosts) {
      const unresolved = new Set<string>();
      notes.forEach((n) => {
        n.links.forEach((target) => {
          if (!noteByTitle.has(target.toLowerCase())) unresolved.add(target);
        });
      });
      unresolved.forEach((title) => {
        const id = "ghost:" + title.toLowerCase();
        const spawnAt = cache.get(id) ?? now;
        cache.set(id, spawnAt);
        ghostNodes.push({
          id,
          title,
          group: "(не создано)",
          color: "var(--fg-subtle)",
          links: 0,
          type: "ghost" as const,
          tags: [],
          spawnAt,
        });
      });
    }

    const allNodeIds = new Set(
      [...noteNodes, ...tagNodes, ...ghostNodes].map((n) => n.id),
    );
    const edgeList: GraphEdge[] = [];
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string, kind: GraphEdge["kind"]) => {
      if (!allNodeIds.has(a) || !allNodeIds.has(b)) return;
      edgeList.push({ source: a, target: b, kind });
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    };

    notes.forEach((n) => {
      if (!allNodeIds.has(n.id)) return;
      n.links.forEach((targetTitle) => {
        const target = noteByTitle.get(targetTitle.toLowerCase());
        if (target) {
          link(n.id, target.id, "link");
        } else if (showGhosts) {
          link(n.id, "ghost:" + targetTitle.toLowerCase(), "link");
        }
      });
      if (showTags) n.tags.forEach((t) => link(n.id, "tag:" + t, "tag"));
    });

    let allNodes = [...noteNodes, ...tagNodes, ...ghostNodes];
    if (!showOrphans) {
      const connected = new Set<string>();
      edgeList.forEach((e) => {
        const s = typeof e.source === "string" ? e.source : e.source.id;
        const t = typeof e.target === "string" ? e.target : e.target.id;
        connected.add(s);
        connected.add(t);
      });
      allNodes = allNodes.filter((n) => connected.has(n.id));
    }

    // Topology signature: changes only when set-of-ids or set-of-edges
    // actually changes. Sliders and search DO NOT bump this.
    const nodeSig = allNodes.map((n) => n.id).sort().join("|");
    const edgeSig = edgeList
      .map((e) => {
        const s = typeof e.source === "string" ? e.source : e.source.id;
        const t = typeof e.target === "string" ? e.target : e.target.id;
        return s + "→" + t;
      })
      .sort()
      .join(",");

    return {
      nodes: allNodes,
      edges: edgeList,
      adjacency: adj,
      tagUniverse,
      topologyKey: `${nodeSig}::${edgeSig}::${colorBy}::${showGhosts ? "g" : "n"}`,
    };
  }, [notes, folders, tagsTable, showOrphans, showTags, showGhosts, tagFilter, colorBy]);

  // ── Mirror live colours/visuals onto already-simulated nodes ───────
  // When colorBy or tag-table changes we just want recolour, not relayout.
  useEffect(() => {
    if (!nodesRef.current.length) return;
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const liveNode of nodesRef.current) {
      const fresh = byId.get(liveNode.id);
      if (fresh) {
        liveNode.color = fresh.color;
        liveNode.group = fresh.group;
        liveNode.tags = fresh.tags;
      }
    }
  }, [graph]);

  // ── Topology lifecycle: rebuild simulation only when shape changes ─
  useEffect(() => {
    setStats({ nodes: graph.nodes.length, edges: graph.edges.length });
    adjacencyRef.current = graph.adjacency;

    // Seed positions from cache (previous tick of same node id) OR center.
    const cx = size.w / 2;
    const cy = size.h / 2;
    const cache = positionsRef.current;
    for (const n of graph.nodes) {
      const cached = cache.get(n.id);
      if (cached) {
        n.x = cached.x;
        n.y = cached.y;
        n.vx = cached.vx;
        n.vy = cached.vy;
      } else {
        // Distribute new nodes around the existing cloud rather than at center.
        const a = Math.random() * Math.PI * 2;
        const r = 60 + Math.random() * 60;
        n.x = cx + Math.cos(a) * r;
        n.y = cy + Math.sin(a) * r;
        n.vx = 0;
        n.vy = 0;
      }
    }

    nodesRef.current = graph.nodes;
    edgesRef.current = graph.edges;

    // Tear down previous simulation if any.
    simRef.current?.stop();

    const sim = forceSimulation<GraphNode>(graph.nodes)
      .force(
        "link",
        forceLink<GraphNode, GraphEdge>(graph.edges)
          .id((d) => d.id)
          .distance(linkDistance)
          .strength((e) => (e.kind === "tag" ? 0.2 : linkStrength)),
      )
      .force(
        "charge",
        forceManyBody<GraphNode>().strength((n) => charge * (1 + Math.log2(n.links + 1) * 0.25)),
      )
      .force("center", forceCenter<GraphNode>(cx, cy).strength(centerStrength))
      .force("x", forceX<GraphNode>(cx).strength(0.03))
      .force("y", forceY<GraphNode>(cy).strength(0.03))
      .force(
        "collide",
        forceCollide<GraphNode>().radius((n) => nodeRadius(n) + 3).strength(0.9),
      )
      .alphaDecay(0.03)
      .velocityDecay(0.45);

    sim.on("tick", () => {
      // Cache positions so filter toggles preserve layout.
      for (const n of graph.nodes) {
        cache.set(n.id, { x: n.x ?? cx, y: n.y ?? cy, vx: n.vx ?? 0, vy: n.vy ?? 0 });
      }
    });

    simRef.current = sim;

    return () => {
      sim.stop();
    };
    // IMPORTANT: only on topology change. Param changes are handled in the
    // separate effect below so the simulation isn't recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.topologyKey, size.w, size.h]);

  // ── Update forces in place when sliders change ──────────────────────
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const linkForce = sim.force("link") as ForceLink<GraphNode, GraphEdge> | undefined;
    if (linkForce) {
      linkForce
        .distance(linkDistance)
        .strength((e) => (e.kind === "tag" ? 0.2 : linkStrength));
    }
    const chargeForce = sim.force("charge") as ForceManyBody<GraphNode> | undefined;
    if (chargeForce) {
      chargeForce.strength((n) => charge * (1 + Math.log2(n.links + 1) * 0.25));
    }
    const center = sim.force("center") as { strength: (s: number) => unknown } | undefined;
    if (center && typeof center.strength === "function") center.strength(centerStrength);
    // Small reheat — enough to settle to new equilibrium, not enough to jump.
    sim.alpha(0.4).restart();
  }, [linkDistance, linkStrength, charge, centerStrength]);

  // ── Canvas redraw loop ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const root = getComputedStyle(document.documentElement);
    let raf = 0;

    const draw = () => {
      const dpr = dprRef.current;
      const w = size.w;
      const h = size.h;
      if (canvas.width !== w * dpr) canvas.width = w * dpr;
      if (canvas.height !== h * dpr) canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const t = transformRef.current;
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      const hovered = hoveredRef.current;
      const neighborSet = hovered ? adjacencyRef.current.get(hovered.id) ?? new Set<string>() : null;
      const q = searchRef.current;
      const hasSearch = q.length > 0;

      const fgMuted = root.getPropertyValue("--fg-muted").trim() || "#9ca3af";
      const fg = root.getPropertyValue("--fg").trim() || "#e5e7eb";
      const bg = root.getPropertyValue("--bg").trim() || "#0f1115";
      const border = root.getPropertyValue("--border-strong").trim() || "#374151";
      const accent = root.getPropertyValue("--accent").trim() || "#3b82f6";

      const liveNodes = nodesRef.current;
      const liveEdges = edgesRef.current;

      const matchesSearch = (n: GraphNode) =>
        !hasSearch
          ? true
          : n.title.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q));

      const isDim = (n: GraphNode) => {
        // Hover dims everyone not connected to the hovered node
        if (hovered) {
          if (n.id === hovered.id) return false;
          if (neighborSet && neighborSet.has(n.id)) return false;
          return true;
        }
        // Search dims everyone not matching the query
        if (hasSearch && !matchesSearch(n)) return true;
        return false;
      };

      // Edges first
      ctx.lineCap = "round";
      const nowEdgeMs = performance.now();
      for (const e of liveEdges) {
        const s = e.source as GraphNode;
        const tgt = e.target as GraphNode;
        if (s.x == null || tgt.x == null) continue;
        const sDim = isDim(s);
        const tDim = isDim(tgt);
        const dim = sDim && tDim;
        const onPath = hovered && (s.id === hovered.id || tgt.id === hovered.id);
        ctx.strokeStyle = onPath ? accent : e.kind === "tag" ? accent : border;
        // Edge fade-in matches the youngest of its two endpoints — links
        // appear with the node that brought them in.
        const youngest = Math.min(s.spawnAt, tgt.spawnAt);
        const t01 = Math.min(1, Math.max(0, (nowEdgeMs - youngest) / 500));
        const spawn = 1 - Math.pow(1 - t01, 3);
        const base = dim
          ? hovered
            ? HOVER_DIM
            : SEARCH_DIM
          : onPath
            ? 0.9
            : e.kind === "tag"
              ? 0.35
              : tgt.type === "ghost" || s.type === "ghost"
                ? 0.3
                : 0.55;
        ctx.globalAlpha = base * spawn;
        ctx.lineWidth = onPath ? 1.8 / t.k : e.kind === "tag" ? 0.7 / t.k : 1 / t.k;
        if (tgt.type === "ghost" || s.type === "ghost") {
          ctx.setLineDash([3 / t.k, 2 / t.k]);
        }
        ctx.beginPath();
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(tgt.x!, tgt.y!);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Nodes
      const nowMs = performance.now();
      for (const n of liveNodes) {
        if (n.x == null) continue;
        const dim = isDim(n);
        const baseR = nodeRadius(n);

        // Spawn animation: opacity 0→1 + scale 0.4→1 over 500ms. Cubic
        // ease-out so it feels punchy at the start then settles.
        const t01 = Math.min(1, Math.max(0, (nowMs - n.spawnAt) / 500));
        const eased = 1 - Math.pow(1 - t01, 3);
        const spawnAlpha = eased;
        const spawnScale = 0.4 + eased * 0.6;
        const r = baseR * spawnScale;

        ctx.globalAlpha = (dim ? (hovered ? HOVER_DIM : SEARCH_DIM) : 1) * spawnAlpha;

        if (
          hovered &&
          (n.id === hovered.id || (neighborSet && neighborSet.has(n.id)))
        ) {
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r + 3 / t.k, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(accent, 0.18);
          ctx.fill();
        }
        if (hasSearch && matchesSearch(n) && !hovered) {
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r + 3 / t.k, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(accent, 0.15);
          ctx.fill();
        }

        if (n.type === "ghost") {
          // Dashed-outline empty circle: signals "link target doesn't exist"
          // without taking visual weight from real notes.
          ctx.setLineDash([3 / t.k, 2 / t.k]);
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
          ctx.lineWidth = 1.2 / t.k;
          ctx.strokeStyle = resolveColor(n.color, root) || fgMuted;
          ctx.globalAlpha = (ctx.globalAlpha) * 0.7;
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
          ctx.fillStyle = resolveColor(n.color, root) || fgMuted;
          ctx.fill();
          ctx.lineWidth = 1.5 / t.k;
          ctx.strokeStyle = bg;
          ctx.stroke();
        }
      }

      // Labels
      const labelOpacity = Math.max(
        0,
        Math.min(1, (t.k - LABEL_FADE_ZOOM_IN) / (LABEL_FULL_ZOOM - LABEL_FADE_ZOOM_IN)),
      );
      const showAnyLabels = labelOpacity > 0 || hovered || hasSearch;
      if (showAnyLabels) {
        ctx.font = `${Math.max(9 / t.k, 9)}px var(--font-sans), system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        for (const n of liveNodes) {
          if (n.x == null) continue;
          const isHl =
            (hovered && (n.id === hovered.id || (neighborSet && neighborSet.has(n.id)))) ||
            (hasSearch && matchesSearch(n));
          const baseA = isHl ? 1 : labelOpacity;
          if (baseA <= 0) continue;
          if ((hovered || hasSearch) && !isHl && labelOpacity <= 0) continue;
          ctx.globalAlpha = isHl ? 1 : baseA * (hovered || hasSearch ? HOVER_DIM : 1);
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
  }, [size.w, size.h]);

  // ── Pan / zoom (d3-zoom, cursor-anchored) ───────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sel = select(canvas);
    const zoomBehavior = d3Zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.15, 4])
      .filter((event) => {
        if (event.type === "wheel") return true;
        if (event.type === "mousedown" || event.type === "touchstart") {
          return !pickNode(
            event as MouseEvent | TouchEvent,
            canvas,
            nodesRef.current,
            transformRef.current,
          );
        }
        return true;
      })
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        setZoomLevel(event.transform.k);
      });
    sel.call(zoomBehavior);
    (canvas as unknown as { __zoom?: typeof zoomBehavior }).__zoom = zoomBehavior;
    return () => {
      sel.on(".zoom", null);
    };
  }, []);

  // ── Pointer interactions ────────────────────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const t = transformRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - t.x) / t.k;
    const my = (e.clientY - rect.top - t.y) / t.k;

    if (draggingRef.current) {
      draggingRef.current.fx = mx;
      draggingRef.current.fy = my;
      simRef.current?.alphaTarget(0.25).restart();
      return;
    }
    const hit = hitTest(nodesRef.current, mx, my);
    if (hit?.id !== hoveredRef.current?.id) {
      hoveredRef.current = hit;
      canvas.style.cursor = hit ? "pointer" : "grab";
    }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const t = transformRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - t.x) / t.k;
    const my = (e.clientY - rect.top - t.y) / t.k;
    const hit = hitTest(nodesRef.current, mx, my);
    if (hit) {
      draggingRef.current = hit;
      hit.fx = mx;
      hit.fy = my;
      simRef.current?.alphaTarget(0.25).restart();
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    }
  }, []);

  const onPointerUp = useCallback(() => {
    const canvas = canvasRef.current;
    const dragged = draggingRef.current;
    if (dragged) {
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
      const hit = hitTest(nodesRef.current, mx, my);
      if (hit?.type === "note") setView({ kind: "note", id: hit.id });
    },
    [setView],
  );

  // Programmatic zoom
  const zoomBy = (factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const z = (
      canvas as unknown as { __zoom?: ReturnType<typeof d3Zoom<HTMLCanvasElement, unknown>> }
    ).__zoom;
    if (z) z.scaleBy(select(canvas), factor);
  };
  const resetView = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const z = (
      canvas as unknown as { __zoom?: ReturnType<typeof d3Zoom<HTMLCanvasElement, unknown>> }
    ).__zoom;
    if (z) z.transform(select(canvas), zoomIdentity);
  };

  // ── Sidebar helpers ─────────────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, string>();
    graph.nodes.forEach((n) => map.set(n.group, n.color));
    return Array.from(map.entries());
  }, [graph]);

  const allTags = useMemo(
    () =>
      Array.from(graph.tagUniverse.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 60),
    [graph.tagUniverse],
  );

  const toggleTagFilter = (tag: string) => {
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

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
            {stats.nodes} узлов · {stats.edges} связей · масштаб{" "}
            {Math.round(zoomLevel * 100)}%
          </p>
        </div>
        <div className="relative w-64">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по узлам и тегам…"
            className="pl-7 pr-7 h-8 text-[12px]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
              title="Очистить"
            >
              <X size={12} />
            </button>
          )}
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

        <aside className="w-72 shrink-0 border-l border-border bg-bg-elev-1 p-4 space-y-5 overflow-y-auto">
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
              Фильтры
            </h3>
            <div className="mt-2 space-y-2">
              <label className="flex items-center justify-between text-[12px] text-fg-muted">
                Показывать изолированные
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
              <label className="flex items-center justify-between text-[12px] text-fg-muted">
                <span className="flex items-center gap-1.5">
                  «Ghost»-узлы
                  <span className="text-[10px] text-fg-subtle">несуществующие [[ссылки]]</span>
                </span>
                <input
                  type="checkbox"
                  checked={showGhosts}
                  onChange={(e) => setShowGhosts(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
              </label>
            </div>
          </section>

          {allTags.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                  Теги
                </h3>
                {tagFilter.size > 0 && (
                  <button
                    className="text-[10.5px] text-fg-subtle hover:text-fg"
                    onClick={() => setTagFilter(new Set())}
                  >
                    очистить
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {allTags.map(([t, count]) => {
                  const active = tagFilter.has(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggleTagFilter(t)}
                      className={
                        "rounded-full border px-2 py-0.5 text-[11px] transition-colors " +
                        (active
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border text-fg-muted hover:bg-bg-elev-2 hover:text-fg")
                      }
                    >
                      #{t}
                      <span className="ml-1 text-[10px] opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
              Цветовая группа
            </h3>
            <div className="mt-2 flex gap-1">
              {(["folder", "tag", "uniform"] as ColorBy[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setColorBy(c)}
                  className={
                    "flex-1 rounded-md border px-2 py-1 text-[11px] transition-colors " +
                    (colorBy === c
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border text-fg-muted hover:bg-bg-elev-2 hover:text-fg")
                  }
                >
                  {c === "folder" ? "Папка" : c === "tag" ? "Тег" : "Без"}
                </button>
              ))}
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
              <Slider
                label="Сила связи"
                min={5}
                max={100}
                value={Math.round(linkStrength * 100)}
                onChange={(v) => setLinkStrength(v / 100)}
                suffix="%"
              />
              <Slider
                label="Отталкивание"
                min={-500}
                max={-40}
                value={charge}
                onChange={setCharge}
              />
              <Slider
                label="Притяжение к центру"
                min={0}
                max={50}
                value={Math.round(centerStrength * 100)}
                onChange={(v) => setCenterStrength(v / 100)}
                suffix="%"
              />
            </div>
          </section>

          {groups.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                Группы
              </h3>
              <div className="mt-2 space-y-1 max-h-44 overflow-y-auto">
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
              Управление
            </h3>
            <ul className="mt-2 space-y-1 text-[11.5px] text-fg-subtle leading-relaxed">
              <li>Двойной клик — открыть заметку</li>
              <li>Тащи узел — переместить и закрепить</li>
              <li>Колесо — масштаб, ЛКМ по фону — пан</li>
              <li>Поиск сверху — подсветить совпадения</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function nodeRadius(n: GraphNode): number {
  return Math.min(NODE_MAX_RADIUS, NODE_BASE_RADIUS + Math.sqrt(n.links) * NODE_LINK_BOOST);
}

function hitTest(nodes: GraphNode[], x: number, y: number): GraphNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.x == null || n.y == null) continue;
    const r = nodeRadius(n) + 2;
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
