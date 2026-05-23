"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Database, type DbField, type DbRow, type DbView } from "@/lib/db/schema";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/dropdown";
import {
  Plus,
  Table as TableIcon,
  Kanban,
  CalendarRange,
  LayoutGrid,
  Filter,
  ArrowUpDown,
  Database as DbIcon,
} from "lucide-react";
import { nanoid } from "nanoid";
import { format } from "date-fns";

export function DatabaseView({ databaseId, viewId }: { databaseId: string; viewId?: string }) {
  const databases = useLiveQuery(() => db.databases.toArray()) ?? [];
  const [currentDbId, setCurrentDbId] = useState<string | undefined>(databaseId);
  useEffect(() => {
    if (!currentDbId && databases.length > 0) setCurrentDbId(databases[0].id);
  }, [databases, currentDbId]);

  const database = databases.find((d) => d.id === currentDbId);
  const views = useLiveQuery<DbView[]>(
    () =>
      database
        ? db.dbViews.where("databaseId").equals(database.id).toArray()
        : Promise.resolve([] as DbView[]),
    [database?.id],
  ) ?? [];
  const rows = useLiveQuery<DbRow[]>(
    () =>
      database
        ? db.dbRows.where("databaseId").equals(database.id).toArray()
        : Promise.resolve([] as DbRow[]),
    [database?.id],
  ) ?? [];
  const [currentViewId, setCurrentViewId] = useState<string | undefined>(viewId);

  useEffect(() => {
    if (database && !currentViewId && views.length > 0) {
      setCurrentViewId(database.defaultViewId || views[0].id);
    }
  }, [database, views, currentViewId]);

  const currentView = views.find((v) => v.id === currentViewId) ?? views[0];

  if (!database) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b border-border px-6 py-3">
          <h2 className="text-xl font-semibold tracking-tight">Databases</h2>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center text-fg-subtle gap-3">
          <DbIcon size={36} className="opacity-40" />
          <p>Базы данных пока нет.</p>
          <Button variant="default" onClick={createSampleDb}>
            <Plus size={13} /> Создать «Tasks»
          </Button>
        </div>
      </div>
    );
  }

  const addRow = async () => {
    const titleField = database.fields.find((f) => f.type === "text");
    await db.dbRows.add({
      id: nanoid(10),
      databaseId: database.id,
      values: titleField ? { [titleField.id]: "Новая запись" } : {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <Menu>
            <MenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-md px-2 py-1 text-2xl font-semibold tracking-tight hover:bg-bg-elev-2" style={{ fontFamily: "var(--font-serif)" }}>
                {database.name} ▾
              </button>
            </MenuTrigger>
            <MenuContent>
              {databases.map((d) => (
                <MenuItem key={d.id} onClick={() => setCurrentDbId(d.id)}>{d.name}</MenuItem>
              ))}
              <MenuItem onClick={createSampleDb}><Plus size={11} /> Новая БД</MenuItem>
            </MenuContent>
          </Menu>
          <span className="text-xs text-fg-subtle">{rows.length} записей</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline"><Filter size={12} /> Filter</Button>
          <Button size="sm" variant="outline"><ArrowUpDown size={12} /> Sort</Button>
          <Button size="sm" variant="default" onClick={addRow}><Plus size={12} /> New</Button>
        </div>
      </header>

      <div className="flex items-center gap-1 border-b border-border bg-bg-elev-1 px-6 py-2">
        {views.map((v) => (
          <button
            key={v.id}
            onClick={() => setCurrentViewId(v.id)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              currentView?.id === v.id ? "bg-bg-elev-2 text-fg" : "text-fg-muted hover:bg-bg-elev-2 hover:text-fg"
            }`}
          >
            <ViewIcon type={v.type} />
            {v.name}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {currentView?.type === "table" && <TableView database={database} rows={rows} />}
        {currentView?.type === "board" && (
          <BoardView database={database} rows={rows} groupBy={currentView.groupBy ?? ""} />
        )}
        {currentView?.type === "calendar" && (
          <CalendarView database={database} rows={rows} groupBy={currentView.groupBy ?? ""} />
        )}
        {currentView?.type === "gallery" && <GalleryView database={database} rows={rows} />}
      </div>
    </div>
  );
}

function ViewIcon({ type }: { type: DbView["type"] }) {
  if (type === "table") return <TableIcon size={12} />;
  if (type === "board") return <Kanban size={12} />;
  if (type === "calendar") return <CalendarRange size={12} />;
  if (type === "gallery") return <LayoutGrid size={12} />;
  return <TableIcon size={12} />;
}

async function createSampleDb() {
  const id = nanoid(10);
  const titleId = nanoid(6);
  const statusId = nanoid(6);
  const tableViewId = nanoid(8);
  await db.databases.add({
    id,
    name: "New database",
    defaultViewId: tableViewId,
    fields: [
      { id: titleId, name: "Title", type: "text" },
      { id: statusId, name: "Status", type: "select", options: [
        { id: "todo", name: "Todo", color: "#64748b" },
        { id: "done", name: "Done", color: "#10b981" },
      ] },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await db.dbViews.add({ id: tableViewId, databaseId: id, name: "All", type: "table" });
}

function TableView({ database, rows }: { database: Database; rows: DbRow[] }) {
  return (
    <div className="min-w-max">
      <div className="sticky top-0 z-10 grid border-b border-border bg-bg-elev-2" style={gridStyle(database.fields)}>
        {database.fields.map((f) => (
          <div key={f.id} className="px-3 py-2 text-[11px] uppercase tracking-wider text-fg-subtle font-semibold border-r border-border last:border-0">
            {f.name}
          </div>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid border-b border-border hover:bg-bg-elev-1" style={gridStyle(database.fields)}>
          {database.fields.map((f) => (
            <div key={f.id} className="px-3 py-2 text-[13px] border-r border-border last:border-0 truncate">
              <CellRender field={f} value={row.values[f.id]} rowId={row.id} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function gridStyle(fields: DbField[]): React.CSSProperties {
  return {
    gridTemplateColumns: fields.map((f) => {
      if (f.type === "checkbox") return "60px";
      if (f.type === "select") return "140px";
      if (f.type === "date") return "150px";
      return "minmax(180px, 1fr)";
    }).join(" "),
  };
}

function CellRender({ field, value, rowId }: { field: DbField; value: unknown; rowId: string }) {
  if (field.type === "select" && typeof value === "string") {
    const opt = field.options?.find((o) => o.id === value);
    if (!opt) return <span className="text-fg-subtle">—</span>;
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ background: opt.color + "22", color: opt.color }}
      >
        {opt.name}
      </span>
    );
  }
  if (field.type === "multi-select" && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((id) => {
          const opt = field.options?.find((o) => o.id === id);
          if (!opt) return null;
          return (
            <span key={id} className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: opt.color + "22", color: opt.color }}>
              {opt.name}
            </span>
          );
        })}
      </div>
    );
  }
  if (field.type === "date" && typeof value === "number") {
    return <span className="text-fg-muted">{format(value, "dd MMM yyyy")}</span>;
  }
  if (field.type === "checkbox") {
    return (
      <input
        type="checkbox"
        defaultChecked={Boolean(value)}
        onChange={(e) =>
          db.dbRows.where("id").equals(rowId).modify((r) => {
            r.values[field.id] = e.target.checked;
            r.updatedAt = Date.now();
          })
        }
      />
    );
  }
  return (
    <input
      defaultValue={value == null ? "" : String(value)}
      onBlur={(e) =>
        db.dbRows.where("id").equals(rowId).modify((r) => {
          r.values[field.id] = e.target.value;
          r.updatedAt = Date.now();
        })
      }
      className="w-full bg-transparent outline-none"
    />
  );
}

function BoardView({ database, rows, groupBy }: { database: Database; rows: DbRow[]; groupBy: string }) {
  const field = database.fields.find((f) => f.id === groupBy);
  if (!field || !field.options) return <div className="p-6 text-fg-subtle">Поле группировки не настроено.</div>;
  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      {field.options.map((opt) => {
        const groupRows = rows.filter((r) => r.values[field.id] === opt.id);
        return (
          <div key={opt.id} className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-bg-elev-1">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: opt.color }} />
                <span className="text-[13px] font-semibold">{opt.name}</span>
                <span className="text-[11px] text-fg-subtle">{groupRows.length}</span>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {groupRows.map((r) => {
                const title = String(r.values[database.fields[0].id] ?? "—");
                return (
                  <div key={r.id} className="rounded-lg border border-border bg-bg p-2.5 hover:border-accent transition-colors cursor-pointer">
                    <div className="text-[13px] font-medium">{title}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {database.fields.slice(1).map((f) => {
                        const v = r.values[f.id];
                        if (v == null || v === "") return null;
                        if (f.id === field.id) return null;
                        return <span key={f.id} className="text-[10px] text-fg-subtle"><CellRender field={f} value={v} rowId={r.id} /></span>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarView({ database, rows, groupBy }: { database: Database; rows: DbRow[]; groupBy: string }) {
  const field = database.fields.find((f) => f.id === groupBy && f.type === "date");
  if (!field) return <div className="p-6 text-fg-subtle">Календарь требует date-поля.</div>;
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const titleField = database.fields[0];

  const byDay = new Map<string, DbRow[]>();
  rows.forEach((r) => {
    const ts = r.values[field.id];
    if (typeof ts === "number") {
      const d = new Date(ts);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const key = String(d.getDate());
        byDay.set(key, [...(byDay.get(key) ?? []), r]);
      }
    }
  });

  return (
    <div className="p-4">
      <div className="mb-3 text-lg font-semibold">{format(firstDay, "LLLL yyyy")}</div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-border">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-bg-elev-2 px-2 py-1.5 text-[10px] uppercase tracking-wider text-fg-subtle font-semibold text-center">
            {d}
          </div>
        ))}
        {Array.from({ length: (startWeekday + 6) % 7 }, (_, i) => (
          <div key={"e" + i} className="bg-bg-elev-1 min-h-24" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dayRows = byDay.get(String(day)) ?? [];
          return (
            <div key={day} className="bg-bg min-h-24 p-1.5 hover:bg-bg-elev-1">
              <div className="text-[11px] text-fg-subtle font-medium">{day}</div>
              <div className="mt-1 space-y-1">
                {dayRows.map((r) => (
                  <div key={r.id} className="truncate rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] text-accent">
                    {String(r.values[titleField.id] ?? "—")}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GalleryView({ database, rows }: { database: Database; rows: DbRow[] }) {
  const titleField = database.fields[0];
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-4">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-border bg-bg-elev-1 overflow-hidden hover:border-accent transition-colors">
          <div className="h-24 bg-gradient-to-br from-accent-soft to-bg-elev-2" />
          <div className="p-3">
            <div className="text-[13px] font-semibold">{String(r.values[titleField.id] ?? "—")}</div>
            <div className="mt-2 space-y-0.5">
              {database.fields.slice(1, 4).map((f) => (
                <div key={f.id} className="flex items-center gap-1 text-[11px] text-fg-muted">
                  <span className="text-fg-subtle">{f.name}:</span>
                  <CellRender field={f} value={r.values[f.id]} rowId={r.id} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
