"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/dropdown";
import { Plus, Square, Type, StickyNote, Trash2, Sparkles, ChevronDown } from "lucide-react";
import { nanoid } from "nanoid";
import { autoGenerateCanvas } from "@/lib/layout/auto-graph";
import { toast } from "sonner";
import { useApp } from "@/lib/store";

export function CanvasView({ canvasId }: { canvasId?: string }) {
  const canvases = useLiveQuery(() => db.canvases.toArray()) ?? [];
  const [currentId, setCurrentId] = useState<string | undefined>(canvasId);
  useEffect(() => {
    if (!currentId && canvases.length > 0) setCurrentId(canvases[0].id);
  }, [canvases, currentId]);

  const canvas = canvases.find((c) => c.id === currentId);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ id: string | null; ox: number; oy: number; mode: "node" | "pan" } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const generate = async (layout: "grid" | "radial") => {
    const res = await autoGenerateCanvas("Auto: vault", { layout });
    setCurrentId(res.canvas.id);
    toast.success(`Canvas построен: ${res.nodes} узлов · ${res.edges} связей`);
  };

  const createEmpty = async () => {
    const id = nanoid(10);
    await db.canvases.add({ id, name: "New canvas", updatedAt: Date.now(), nodes: [], edges: [] });
    setCurrentId(id);
  };

  if (!canvas) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-fg-subtle">
        <p>Канвасов ещё нет.</p>
        <div className="flex gap-2">
          <Button variant="default" onClick={() => generate("grid")}>
            <Sparkles size={13} /> Авто-генерация из vault
          </Button>
          <Button variant="outline" onClick={createEmpty}>
            <Plus size={13} /> Пустой канвас
          </Button>
        </div>
      </div>
    );
  }

  const update = async (changes: Partial<typeof canvas>) => {
    await db.canvases.update(canvas.id, { ...changes, updatedAt: Date.now() });
  };

  const addNode = async (type: "card" | "text" | "shape" | "sticker") => {
    const newNode = {
      id: nanoid(8),
      type,
      x: -pan.x / zoom + 200,
      y: -pan.y / zoom + 200,
      width: type === "text" ? 220 : 200,
      height: type === "text" ? 60 : 120,
      data: type === "card"
        ? { title: "Новая карточка", body: "Кликните для редактирования" }
        : type === "sticker"
          ? { text: "💡 Идея" }
          : type === "text"
            ? { text: "Текст…" }
            : { shape: "rect" },
    };
    await update({ nodes: [...canvas.nodes, newNode] });
  };

  const updateNode = (id: string, patch: Record<string, unknown>) => {
    update({ nodes: canvas.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  };
  const deleteNode = (id: string) => {
    update({
      nodes: canvas.nodes.filter((n) => n.id !== id),
      edges: canvas.edges.filter((e) => e.source !== id && e.target !== id),
    });
  };

  const handleMouseDown = (e: React.MouseEvent, id?: string) => {
    if (id) {
      const node = canvas.nodes.find((n) => n.id === id);
      if (!node) return;
      setSelected(id);
      dragRef.current = {
        id,
        ox: e.clientX - node.x * zoom - pan.x,
        oy: e.clientY - node.y * zoom - pan.y,
        mode: "node",
      };
    } else {
      setSelected(null);
      dragRef.current = { id: null, ox: e.clientX - pan.x, oy: e.clientY - pan.y, mode: "pan" };
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    if (dragRef.current.mode === "pan") {
      setPan({ x: e.clientX - dragRef.current.ox, y: e.clientY - dragRef.current.oy });
    } else if (dragRef.current.id) {
      const id = dragRef.current.id;
      const x = (e.clientX - dragRef.current.ox - pan.x) / zoom;
      const y = (e.clientY - dragRef.current.oy - pan.y) / zoom;
      updateNode(id, { x, y });
    }
  };
  const handleMouseUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <Menu>
            <MenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-md px-2 py-1 text-xl font-semibold tracking-tight hover:bg-bg-elev-2" style={{ fontFamily: "var(--font-serif)" }}>
                {canvas.name} <ChevronDown size={14} className="text-fg-subtle" />
              </button>
            </MenuTrigger>
            <MenuContent>
              {canvases.map((c) => (
                <MenuItem key={c.id} onClick={() => setCurrentId(c.id)}>{c.name}</MenuItem>
              ))}
              <MenuItem onClick={createEmpty}><Plus size={11} /> Пустой канвас</MenuItem>
            </MenuContent>
          </Menu>
          <span className="text-xs text-fg-subtle">{canvas.nodes.length} узлов · {canvas.edges.length} связей</span>
        </div>
        <div className="flex items-center gap-1">
          <Menu>
            <MenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Sparkles size={12} /> Авто-генерация
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onClick={() => generate("grid")}>Grid layout</MenuItem>
              <MenuItem onClick={() => generate("radial")}>Radial layout</MenuItem>
            </MenuContent>
          </Menu>
          <div className="mx-1 flex items-center gap-1 rounded-md border border-border bg-bg-elev-1 p-1">
            <Button size="icon-sm" variant="ghost" onClick={() => addNode("card")} title="Карточка"><Square size={13} /></Button>
            <Button size="icon-sm" variant="ghost" onClick={() => addNode("text")} title="Текст"><Type size={13} /></Button>
            <Button size="icon-sm" variant="ghost" onClick={() => addNode("sticker")} title="Стикер"><StickyNote size={13} /></Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>+</Button>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}>−</Button>
          <Button size="sm" variant="outline" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>1:1</Button>
          <Button size="icon-sm" variant="ghost" onClick={async () => {
            if (!confirm(`Удалить канвас «${canvas.name}»?`)) return;
            await db.canvases.delete(canvas.id);
            setCurrentId(undefined);
          }} title="Удалить канвас"><Trash2 size={13} /></Button>
        </div>
      </header>

      <div
        className="relative flex-1 overflow-hidden bg-bg cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => handleMouseDown(e)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 50%, oklch(50% 0.01 250 / 0.06) 1.5px, transparent 1.5px)",
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {canvas.edges.map((e) => {
              const s = canvas.nodes.find((n) => n.id === e.source);
              const t = canvas.nodes.find((n) => n.id === e.target);
              if (!s || !t) return null;
              const sx = s.x + s.width / 2;
              const sy = s.y + s.height / 2;
              const tx = t.x + t.width / 2;
              const ty = t.y + t.height / 2;
              return (
                <g key={e.id}>
                  <line x1={sx} y1={sy} x2={tx} y2={ty} stroke="var(--border-strong)" strokeWidth={2 / zoom} />
                  {e.label && (
                    <text
                      x={(sx + tx) / 2}
                      y={(sy + ty) / 2 - 4}
                      textAnchor="middle"
                      fontSize={11 / zoom}
                      fill="var(--fg-muted)"
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <div
          className="absolute inset-0"
          style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          {canvas.nodes.map((n) => (
            <div
              key={n.id}
              onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, n.id); }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                const noteId = (n.data?.noteId as string | undefined);
                if (noteId) useApp.getState().setView({ kind: "note", id: noteId });
              }}
              className={`absolute rounded-lg border bg-bg-elev-1 shadow-md cursor-move transition-shadow ${
                selected === n.id ? "border-accent ring-2 ring-accent/30" : "border-border"
              }`}
              style={{ left: n.x, top: n.y, width: n.width, height: n.height }}
            >
              {n.type === "card" && (
                <div className="p-3">
                  <div className="text-[13px] font-semibold">{String(n.data.title ?? "")}</div>
                  <div className="mt-1 text-[11.5px] text-fg-muted">{String(n.data.body ?? "")}</div>
                </div>
              )}
              {n.type === "text" && (
                <div className="p-3 text-[14px] text-fg italic" style={{ fontFamily: "var(--font-serif)" }}>
                  {String(n.data.text ?? "")}
                </div>
              )}
              {n.type === "sticker" && (
                <div className="flex h-full items-center justify-center text-2xl">
                  {String(n.data.text ?? "💡")}
                </div>
              )}
              {selected === n.id && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteNode(n.id); }}
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white text-[10px] shadow"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
