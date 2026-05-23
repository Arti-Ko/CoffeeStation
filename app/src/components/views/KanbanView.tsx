"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type KanbanCard, type KanbanColumn } from "@/lib/db/schema";
import { memo, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger, MenuSeparator } from "@/components/ui/dropdown";
import { Plus, MoreHorizontal, Trash2, Calendar, Tag, Pencil, Check } from "lucide-react";
import { nanoid } from "nanoid";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  useDroppable,
  useDraggable,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

/**
 * Kanban board view powered by @dnd-kit (more reliable than HTML5 native DnD
 * inside WKWebView). Cards are draggable, columns are droppable.
 *
 * Daily roll-over logic:
 *   - cards in `done` columns created before today → auto-archive
 *   - cards from previous days that aren't done → show "carry-over" badge
 *   - tasks (`<li data-checked>`) from daily notes auto-sync to/from board
 */

const PRIORITY_COLOR: Record<NonNullable<KanbanCard["priority"]>, string> = {
  low: "#94a3b8",
  medium: "#f59e0b",
  high: "#ef4444",
};

export function KanbanView() {
  const columns = useLiveQuery(() =>
    db.kanbanColumns.toArray().then((arr) => arr.sort((a, b) => a.order - b.order)),
  ) ?? [];
  const cards =
    useLiveQuery(() =>
      db.kanbanCards.filter((c) => c.archivedAt == null).toArray().then((arr) => arr.sort((a, b) => a.order - b.order)),
    ) ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  // pointer activation distance avoids accidental drags on click
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Daily roll-over + silent auto-sync on mount
  useEffect(() => {
    rollOver().then(() => syncDailyTasks({ silent: true }).catch(() => {}));
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const activeCard = activeId ? cards.find((c) => c.id === activeId) : null;

  const addCard = async (columnId: string) => {
    const order = (cards.filter((c) => c.columnId === columnId).length ?? 0);
    await db.kanbanCards.add({
      id: nanoid(10),
      title: "Новая задача",
      columnId,
      order,
      createdAt: Date.now(),
      movedAt: Date.now(),
      dayCreated: todayStr,
    });
  };

  const deleteCard = async (cardId: string) => {
    if (!confirm("Удалить задачу?")) return;
    await db.kanbanCards.delete(cardId);
  };

  const addColumn = async () => {
    const name = newColumnName.trim() || "Новая колонка";
    const order = columns.length;
    const palette = ["#64748b", "#3b82f6", "#a855f7", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4"];
    await db.kanbanColumns.add({
      id: nanoid(10),
      name,
      order,
      color: palette[columns.length % palette.length],
    });
    setNewColumnName("");
    setAddingColumn(false);
  };

  const deleteColumn = async (col: KanbanColumn) => {
    const colCards = cards.filter((c) => c.columnId === col.id);
    if (colCards.length > 0 && !confirm(`В колонке "${col.name}" есть ${colCards.length} задач(и). Удалить колонку и все её карточки?`)) return;
    await db.transaction("rw", db.kanbanColumns, db.kanbanCards, async () => {
      await db.kanbanCards.where("columnId").equals(col.id).delete();
      await db.kanbanColumns.delete(col.id);
    });
  };

  const renameColumn = async (id: string, name: string) => {
    await db.kanbanColumns.update(id, { name });
  };

  const toggleDoneFlag = async (col: KanbanColumn) => {
    await db.kanbanColumns.update(col.id, { done: !col.done });
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;

    // ── Column reorder branch ────────────────────────────────────────
    // Sortable column IDs are prefixed "colsort:" so we can tell them
    // apart from card drags + card drop zones.
    if (activeId.startsWith("colsort:")) {
      if (!overId.startsWith("colsort:")) return;
      const fromId = activeId.slice("colsort:".length);
      const toId = overId.slice("colsort:".length);
      if (fromId === toId) return;
      const fromIdx = columns.findIndex((c) => c.id === fromId);
      const toIdx = columns.findIndex((c) => c.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = arrayMove(columns, fromIdx, toIdx);
      await db.kanbanColumns.bulkUpdate(
        next.map((col, i) => ({ key: col.id, changes: { order: i } })),
      );
      return;
    }

    // ── Card move branch ─────────────────────────────────────────────
    const cardId = activeId;
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const targetColumnId = overId.startsWith("col:") ? overId.slice(4) : null;
    if (!targetColumnId || targetColumnId === card.columnId) return;

    const targetCol = columns.find((c) => c.id === targetColumnId);
    if (!targetCol) return;

    const order = cards.filter((c) => c.columnId === targetColumnId).length;
    await db.kanbanCards.update(cardId, {
      columnId: targetColumnId,
      order,
      movedAt: Date.now(),
    });

    if (targetCol.done && card.dayCreated < todayStr) {
      await db.kanbanCards.update(cardId, { archivedAt: Date.now() });
    }
  };

  const onDragOver = (_e: DragOverEvent) => {
    // Visual feedback handled by SortableContext itself; card-move drop
    // targets get their `isOver` flag from useDroppable.
  };

  const carryOverCount = cards.filter(
    (c) => c.dayCreated < todayStr && !columns.find((col) => col.id === c.columnId)?.done,
  ).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
            Kanban
          </h2>
          <span className="text-xs text-fg-subtle">{cards.length} задач · {columns.length} колонок</span>
          {carryOverCount > 0 && (
            <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[11px] text-warning font-medium">
              ⏎ {carryOverCount} перенесены со вчера
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setAddingColumn(true)}>
            <Plus size={12} /> Колонка
          </Button>
          <Button size="sm" variant="ghost" onClick={() => syncDailyTasks()} title="Синхронизировать задачи из daily notes">
            <Calendar size={12} /> Синк daily
          </Button>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext
          items={columns.map((c) => "colsort:" + c.id)}
          strategy={horizontalListSortingStrategy}
        >
          {/* Columns stretch to fill the board horizontally — like a real
              kanban surface, not a fixed-width scroll-strip. min-w keeps
              individual columns readable even when there are many. */}
          <div className="flex flex-1 gap-3 p-4 min-h-0">
            {columns.map((col) => {
              const colCards = cards.filter((c) => c.columnId === col.id);
              return (
                <ColumnView
                  key={col.id}
                  column={col}
                  cards={colCards}
                  addCard={() => addCard(col.id)}
                  deleteCard={deleteCard}
                  renameColumn={renameColumn}
                  deleteColumn={() => deleteColumn(col)}
                  toggleDoneFlag={() => toggleDoneFlag(col)}
                  todayStr={todayStr}
                />
              );
            })}
            {addingColumn && (
              <div className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border-2 border-accent bg-bg-elev-1 p-3">
                <Input
                  autoFocus
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addColumn();
                    if (e.key === "Escape") { setAddingColumn(false); setNewColumnName(""); }
                  }}
                  placeholder="Имя колонки…"
                />
                <div className="flex gap-1">
                  <Button size="sm" variant="default" onClick={addColumn} className="flex-1">
                    <Plus size={12} /> Добавить
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddingColumn(false); setNewColumnName(""); }}>
                    Отмена
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeCard && (
            <CardSurface card={activeCard} todayStr={todayStr} dragging />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function ColumnView({
  column,
  cards,
  addCard,
  deleteCard,
  renameColumn,
  deleteColumn,
  toggleDoneFlag,
  todayStr,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  addCard: () => void;
  deleteCard: (id: string) => void;
  renameColumn: (id: string, name: string) => Promise<void>;
  deleteColumn: () => void;
  toggleDoneFlag: () => void;
  todayStr: string;
}) {
  // Column is both:
  //   - sortable (its own id used by the column-reorder branch)
  //   - droppable for cards (the inner area accepts card drops)
  const {
    attributes,
    listeners,
    setNodeRef: setSortRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: "colsort:" + column.id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: "col:" + column.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);

  const commitRename = async () => {
    setEditing(false);
    if (name.trim() && name !== column.name) await renameColumn(column.id, name.trim());
    else setName(column.name);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setSortRef}
      style={style}
      className={cn(
        // flex-1 spreads columns evenly across the board, min-w keeps them
        // readable on dense boards. basis-0 + flex-1 = equal-share columns.
        "flex flex-1 basis-0 min-w-[180px] flex-col rounded-xl border bg-bg-elev-1 transition-colors",
        isOver ? "border-accent ring-2 ring-accent/30" : "border-border",
        isDragging && "opacity-50 ring-2 ring-accent/50",
      )}
    >
      {/* Header doubles as the column drag handle. Click-to-rename works
          because dnd-kit's PointerSensor needs 6px movement before drag. */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-between border-b border-border px-3 py-2 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GripVertical
            size={12}
            className="text-fg-subtle opacity-0 group-hover/col:opacity-100 transition-opacity shrink-0"
          />
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: column.color }} />
          {editing ? (
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setName(column.name); setEditing(false); }
              }}
              className="h-6 text-[13px]"
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <button
              onDoubleClick={() => setEditing(true)}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-[13px] font-semibold truncate flex-1 text-left"
            >
              {column.name}
            </button>
          )}
          <span className="text-[11px] text-fg-subtle shrink-0">{cards.length}</span>
          {column.done && <Check size={11} className="text-success shrink-0" />}
        </div>
        <div onPointerDown={(e) => e.stopPropagation()}>
          <Menu>
            <MenuTrigger asChild>
              <Button size="icon-sm" variant="ghost">
                <MoreHorizontal size={13} />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onClick={() => setEditing(true)}><Pencil size={11} /> Переименовать</MenuItem>
              <MenuItem onClick={toggleDoneFlag}>
                <Check size={11} /> {column.done ? "Снять флаг Done" : "Пометить как Done"}
              </MenuItem>
              <MenuSeparator />
              <MenuItem className="text-danger" onClick={deleteColumn}><Trash2 size={11} /> Удалить колонку</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      <div
        ref={setDropRef}
        className="flex-1 space-y-2 overflow-y-auto p-2 min-h-[120px]"
      >
        {cards.map((card) => (
          <DraggableCard
            key={card.id}
            card={card}
            onDelete={() => deleteCard(card.id)}
            todayStr={todayStr}
          />
        ))}
      </div>

      <button
        onClick={addCard}
        className="m-2 flex items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 text-[12px] text-fg-subtle hover:border-accent hover:text-fg transition-colors"
      >
        <Plus size={11} /> Карточка
      </button>
    </div>
  );
}

// React.memo with a custom comparator: cards only re-render when their
// own data changed, not when *any* note/card in the DB updated. Auto-save
// fires useLiveQuery on every keystroke; without this, the whole board
// re-renders on every single character typed in any open note.
const DraggableCard = memo(
  function DraggableCard({
    card,
    onDelete,
    todayStr,
  }: {
    card: KanbanCard;
    onDelete: () => void;
    todayStr: string;
  }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
    return (
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={cn(isDragging && "opacity-30")}
      >
        <CardSurface card={card} onDelete={onDelete} todayStr={todayStr} />
      </div>
    );
  },
  (a, b) =>
    a.card.id === b.card.id &&
    a.card.title === b.card.title &&
    a.card.columnId === b.card.columnId &&
    a.card.priority === b.card.priority &&
    a.card.dayCreated === b.card.dayCreated &&
    a.todayStr === b.todayStr,
);

function CardSurface({
  card,
  onDelete,
  todayStr,
  dragging,
}: {
  card: KanbanCard;
  onDelete?: () => void;
  todayStr: string;
  dragging?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const isCarryOver = card.dayCreated < todayStr;

  const save = async () => {
    if (title.trim() && title !== card.title) {
      await db.kanbanCards.update(card.id, { title: title.trim() });
    }
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "group rounded-lg border bg-bg p-2.5 shadow-sm transition-all",
        dragging ? "shadow-xl border-accent ring-2 ring-accent/30 rotate-1 cursor-grabbing" : "hover:border-accent cursor-grab",
        isCarryOver ? "border-warning/40" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") { setTitle(card.title); setEditing(false); }
            }}
            className="h-6 text-[13px]"
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="text-[13px] font-medium leading-snug flex-1 select-none"
          >
            {card.title}
          </div>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 text-fg-subtle hover:text-danger transition-opacity"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-fg-subtle">
        {card.priority && (
          <span
            className="rounded-full px-1.5 py-0.5 font-medium uppercase tracking-wider"
            style={{ background: PRIORITY_COLOR[card.priority] + "22", color: PRIORITY_COLOR[card.priority] }}
          >
            {card.priority}
          </span>
        )}
        {isCarryOver && (
          <span className="rounded-full bg-warning/20 px-1.5 py-0.5 text-warning font-medium" title={`Создана ${card.dayCreated}`}>
            ⏎ {card.dayCreated}
          </span>
        )}
        {card.dailyNoteId && (
          <span className="rounded-full bg-bg-elev-2 px-1.5 py-0.5">
            <Calendar size={9} className="inline -mt-0.5 mr-0.5" />
            daily
          </span>
        )}
        {card.tags && card.tags.length > 0 && (
          <span className="flex items-center gap-0.5">
            <Tag size={9} />
            {card.tags.slice(0, 2).join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

async function syncDailyTasks(opts: { silent?: boolean } = {}) {
  const dailyNotes = await db.notes.filter((n) => n.type === "daily" && n.archivedAt == null).toArray();
  if (dailyNotes.length === 0) {
    if (!opts.silent) toast.info("Daily-заметок нет");
    return;
  }
  const columns = await db.kanbanColumns.toArray().then((arr) => arr.sort((a, b) => a.order - b.order));
  if (columns.length === 0) {
    if (!opts.silent) toast.error("Сначала создайте колонки");
    return;
  }
  const firstCol = columns[0];
  const doneCols = new Set(columns.filter((c) => c.done).map((c) => c.id));

  const allCards = await db.kanbanCards.toArray();
  const cardByKey = new Map<string, KanbanCard>();
  allCards.forEach((c) => {
    if (c.dailyNoteId) cardByKey.set(`${c.dailyNoteId}::${c.title}`, c);
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  let added = 0;
  let completed = 0;

  for (const note of dailyNotes) {
    if (typeof DOMParser === "undefined") continue;
    const doc = new DOMParser().parseFromString(note.content, "text/html");
    const taskItems = doc.querySelectorAll('li[data-checked]');
    const dayCreated = new Date(note.createdAt).toISOString().slice(0, 10);

    for (const li of Array.from(taskItems)) {
      const checked = li.getAttribute("data-checked") === "true";
      const title = (li.textContent ?? "").trim();
      if (!title) continue;
      const key = `${note.id}::${title}`;
      const existing = cardByKey.get(key);

      if (checked) {
        if (existing && !doneCols.has(existing.columnId)) {
          const doneCol = columns.find((c) => c.done);
          if (doneCol) {
            await db.kanbanCards.update(existing.id, { columnId: doneCol.id, movedAt: Date.now() });
            if (existing.dayCreated < todayStr) {
              await db.kanbanCards.update(existing.id, { archivedAt: Date.now() });
            }
            completed += 1;
          }
        }
      } else {
        if (!existing) {
          const order = allCards.filter((c) => c.columnId === firstCol.id).length;
          await db.kanbanCards.add({
            id: nanoid(10),
            title,
            columnId: firstCol.id,
            order: order + added,
            createdAt: note.createdAt,
            movedAt: Date.now(),
            dayCreated,
            dailyNoteId: note.id,
          });
          added += 1;
        } else if (existing.archivedAt) {
          await db.kanbanCards.update(existing.id, { archivedAt: null, columnId: firstCol.id, movedAt: Date.now() });
          added += 1;
        }
      }
    }
  }

  if (!opts.silent) {
    toast.success(`Синхронизировано: +${added} новых · ${completed} закрыто`);
  } else if (added > 0 || completed > 0) {
    toast.success(`Daily-задачи: +${added} · ${completed} закрыто`, { duration: 2500 });
  }
}

async function rollOver() {
  const today = new Date().toISOString().slice(0, 10);
  const lastRun = await db.settings.get("kanban.lastRollover");
  if (lastRun?.value === today) return;

  const doneColumns = await db.kanbanColumns.toArray().then((arr) => arr.filter((c) => c.done));
  if (doneColumns.length === 0) {
    await db.settings.put({ key: "kanban.lastRollover", value: today });
    return;
  }
  const doneColIds = new Set(doneColumns.map((c) => c.id));
  const cards = await db.kanbanCards.filter((c) => doneColIds.has(c.columnId) && c.archivedAt == null).toArray();
  const toArchive = cards.filter((c) => c.dayCreated < today);
  for (const c of toArchive) {
    await db.kanbanCards.update(c.id, { archivedAt: Date.now() });
  }
  await db.settings.put({ key: "kanban.lastRollover", value: today });
  if (toArchive.length > 0) {
    toast.success(`Архивировано ${toArchive.length} выполненных задач`);
  }
}

export async function addTaskFromDailyNote(noteId: string, title: string, columnId?: string) {
  const cols = await db.kanbanColumns.toArray();
  if (cols.length === 0) return;
  const targetCol = columnId ? cols.find((c) => c.id === columnId) ?? cols[0] : cols[0];
  const todayStr = new Date().toISOString().slice(0, 10);
  const order = (await db.kanbanCards.where("columnId").equals(targetCol.id).count()) ?? 0;
  await db.kanbanCards.add({
    id: nanoid(10),
    title,
    columnId: targetCol.id,
    order,
    createdAt: Date.now(),
    movedAt: Date.now(),
    dayCreated: todayStr,
    dailyNoteId: noteId,
  });
}
