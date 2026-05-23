"use client";

import { db, type CanvasDoc, type CanvasEdge, type CanvasNode, type FlowEdge, type FlowGraph, type FlowNode } from "@/lib/db/schema";
import { nanoid } from "nanoid";

interface NoteRef {
  id: string;
  title: string;
  links: string[];
  tags: string[];
  contentText: string;
}

export interface AutoGraphOptions {
  /** Maximum number of nodes (top notes by connections + length). */
  max?: number;
  /** Layout strategy. */
  layout?: "grid" | "radial";
}

async function collectNotes(): Promise<NoteRef[]> {
  const notes = await db.notes.filter((n) => n.archivedAt == null).toArray();
  return notes.map((n) => ({
    id: n.id,
    title: n.title,
    links: n.links,
    tags: n.tags,
    contentText: n.contentText,
  }));
}

function rank(notes: NoteRef[]): NoteRef[] {
  const titleToId = new Map<string, string>();
  notes.forEach((n) => titleToId.set(n.title.toLowerCase(), n.id));
  const score = new Map<string, number>();
  notes.forEach((n) => {
    score.set(n.id, (score.get(n.id) ?? 0) + n.links.length + Math.sqrt(n.contentText.length) * 0.05);
    n.links.forEach((targetTitle) => {
      const id = titleToId.get(targetTitle.toLowerCase());
      if (id) score.set(id, (score.get(id) ?? 0) + 2); // incoming link bonus
    });
  });
  return [...notes].sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0));
}

function gridLayout(count: number, cellW: number, cellH: number): { x: number; y: number }[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.6)));
  return Array.from({ length: count }, (_, i) => ({
    x: (i % cols) * cellW + 60,
    y: Math.floor(i / cols) * cellH + 60,
  }));
}

function radialLayout(count: number, radius: number): { x: number; y: number }[] {
  if (count === 0) return [];
  const out: { x: number; y: number }[] = [];
  // First node at center, the rest on concentric rings of 8/16/24...
  out.push({ x: 0, y: 0 });
  let ring = 1;
  let placed = 1;
  while (placed < count) {
    const onThisRing = Math.min(count - placed, 6 + (ring - 1) * 4);
    for (let i = 0; i < onThisRing; i++) {
      const angle = (i / onThisRing) * Math.PI * 2;
      out.push({
        x: Math.cos(angle) * radius * ring,
        y: Math.sin(angle) * radius * ring,
      });
    }
    placed += onThisRing;
    ring += 1;
  }
  return out;
}

export interface AutoCanvasResult {
  canvas: CanvasDoc;
  nodes: number;
  edges: number;
}

export async function autoGenerateCanvas(
  name = "Knowledge Vault",
  opts: AutoGraphOptions = {},
): Promise<AutoCanvasResult> {
  const max = opts.max ?? 50;
  const all = await collectNotes();
  const ranked = rank(all).slice(0, max);
  const layout = opts.layout === "radial" ? radialLayout(ranked.length, 240) : gridLayout(ranked.length, 260, 160);

  const titleToId = new Map<string, string>();
  ranked.forEach((n) => titleToId.set(n.title.toLowerCase(), n.id));

  const nodes: CanvasNode[] = ranked.map((n, i) => ({
    id: n.id,
    type: "card",
    x: layout[i].x,
    y: layout[i].y,
    width: 220,
    height: 130,
    data: {
      title: n.title,
      body: n.contentText.slice(0, 120),
      noteId: n.id,
      tags: n.tags,
    },
  }));

  const edges: CanvasEdge[] = [];
  ranked.forEach((n) => {
    n.links.forEach((targetTitle) => {
      const targetId = titleToId.get(targetTitle.toLowerCase());
      if (targetId && targetId !== n.id) {
        edges.push({ id: `${n.id}-${targetId}`, source: n.id, target: targetId, label: "links" });
      }
    });
  });

  const canvas: CanvasDoc = {
    id: nanoid(10),
    name,
    nodes,
    edges,
    updatedAt: Date.now(),
  };
  await db.canvases.put(canvas);
  return { canvas, nodes: nodes.length, edges: edges.length };
}

export interface AutoFlowResult {
  flow: FlowGraph;
  nodes: number;
  edges: number;
}

export async function autoGenerateFlowGraph(
  name = "Vault flow",
  opts: AutoGraphOptions = {},
): Promise<AutoFlowResult> {
  const max = opts.max ?? 40;
  const all = await collectNotes();
  const ranked = rank(all).slice(0, max);
  const layout = opts.layout === "radial" ? radialLayout(ranked.length, 220) : gridLayout(ranked.length, 220, 130);

  const titleToId = new Map<string, string>();
  ranked.forEach((n) => titleToId.set(n.title.toLowerCase(), n.id));

  // Heuristic typing based on tags
  const inferType = (n: NoteRef): FlowNode["type"] => {
    const tags = new Set(n.tags.map((t) => t.toLowerCase()));
    if (tags.has("agent") || tags.has("ai")) return "agent";
    if (tags.has("llm") || tags.has("model")) return "llm";
    if (tags.has("tool") || tags.has("integration")) return "tool";
    if (tags.has("trigger") || tags.has("hook")) return "trigger";
    if (tags.has("action")) return "action";
    if (tags.has("memory")) return "memory";
    return "doc";
  };

  const nodes: FlowNode[] = ranked.map((n, i) => ({
    id: n.id,
    type: inferType(n),
    label: n.title,
    x: layout[i].x,
    y: layout[i].y,
  }));

  const edges: FlowEdge[] = [];
  ranked.forEach((n) => {
    n.links.forEach((targetTitle) => {
      const targetId = titleToId.get(targetTitle.toLowerCase());
      if (targetId && targetId !== n.id) {
        edges.push({ id: `${n.id}-${targetId}`, source: n.id, target: targetId });
      }
    });
  });

  const flow: FlowGraph = {
    id: nanoid(10),
    name,
    nodes,
    edges,
    updatedAt: Date.now(),
  };
  await db.flows.put(flow);
  return { flow, nodes: nodes.length, edges: edges.length };
}
