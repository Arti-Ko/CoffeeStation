"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { useApp } from "@/lib/store";
import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nanoid } from "nanoid";
import { buildDailyTemplateHtml } from "@/lib/daily/template";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function DailyNotesView() {
  const [month, setMonth] = useState(new Date());
  const dailies = useLiveQuery(() => db.notes.where("type").equals("daily").toArray()) ?? [];
  const setView = useApp((s) => s.setView);

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }),
    [month],
  );

  const findNoteForDate = (d: Date) => dailies.find((n) => isSameDay(n.createdAt, d));

  const openOrCreate = async (d: Date) => {
    const existing = findNoteForDate(d);
    if (existing) {
      setView({ kind: "note", id: existing.id });
      return;
    }
    const title = format(d, "yyyy-MM-dd · EEEE", { locale: ru });
    // Pull yesterday's Сегодня block + current kanban state to populate
    // the new note's Вчера sections automatically. Static templates can't
    // do this — they don't know about the kanban board.
    const content = await buildDailyTemplateHtml(d);
    const id = nanoid(10);
    await db.notes.add({
      id,
      title,
      content,
      contentText: stripHtml(content),
      type: "daily",
      folderId: null,
      tags: ["daily"],
      links: [],
      attachments: [],
      createdAt: d.getTime(),
      updatedAt: Date.now(),
      archivedAt: null,
      pinned: false,
    });
    setView({ kind: "note", id });
  };

  const monthLabel = format(month, "LLLL yyyy", { locale: ru });

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h2 className="text-xl font-semibold tracking-tight capitalize" style={{ fontFamily: "var(--font-serif)" }}>
          {monthLabel}
        </h2>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="outline" onClick={() => setMonth((m) => subMonths(m, 1))}><ChevronLeft size={13} /></Button>
          <Button size="sm" variant="outline" onClick={() => setMonth(new Date())}>Today</Button>
          <Button size="icon-sm" variant="outline" onClick={() => setMonth((m) => addMonths(m, 1))}><ChevronRight size={13} /></Button>
          <Button size="sm" variant="default" onClick={() => openOrCreate(new Date())}>
            <Plus size={12} /> Today’s note
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="bg-bg-elev-2 px-2 py-2 text-[10px] uppercase tracking-wider text-fg-subtle font-semibold text-center">
              {d}
            </div>
          ))}
          {Array.from({ length: (days[0].getDay() + 6) % 7 }, (_, i) => (
            <div key={"e" + i} className="bg-bg-elev-1 min-h-28" />
          ))}
          {days.map((d) => {
            const note = findNoteForDate(d);
            return (
              <button
                key={d.toISOString()}
                onClick={() => openOrCreate(d)}
                className={`flex flex-col items-start gap-1 bg-bg p-2 min-h-28 text-left hover:bg-bg-elev-1 transition-colors group ${
                  isToday(d) ? "ring-2 ring-accent ring-inset" : ""
                }`}
              >
                <div className={`text-[12px] font-medium ${isToday(d) ? "text-accent" : "text-fg-muted"}`}>
                  {format(d, "d")}
                </div>
                {note && (
                  <div className="rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] text-accent w-full truncate">
                    {note.title.split(" · ")[1] ?? note.title}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
