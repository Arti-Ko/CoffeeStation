"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useApp } from "@/lib/store";
import { db, type Note } from "@/lib/db/schema";
import { FileText, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Browser-style tabs row above the editor. Shows every note the user has
 * opened in this session. Click → switch, × → close, + → open command palette
 * (so you can fuzzy-search a note to open as a new tab).
 */
export function TabsBar() {
  const openTabs = useApp((s) => s.openTabs);
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const closeTab = useApp((s) => s.closeTab);
  const setCommandPaletteOpen = useApp((s) => s.setCommandPaletteOpen);

  const notes = useLiveQuery<(Note | undefined)[]>(
    () =>
      openTabs.length > 0
        ? db.notes.bulkGet(openTabs)
        : Promise.resolve([] as (Note | undefined)[]),
    [openTabs.join(",")],
  ) ?? [];

  if (openTabs.length === 0) return null;

  const activeId = view.kind === "note" ? view.id : null;

  return (
    <div className="flex shrink-0 items-end gap-0.5 border-b border-border bg-bg-elev-2/40 px-2 pt-1.5">
      <div className="flex flex-1 items-end gap-0.5 overflow-x-auto">
        {openTabs.map((id, i) => {
          const note = notes[i];
          if (!note) return null;
          const isActive = id === activeId;
          return (
            <button
              key={id}
              onClick={() => setView({ kind: "note", id })}
              className={cn(
                "group relative flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-[12px] transition-colors min-w-[120px] max-w-[200px]",
                isActive
                  ? "bg-bg text-fg border-t border-l border-r border-border -mb-px z-10"
                  : "bg-bg-elev-1 text-fg-muted hover:bg-bg-elev-2 hover:text-fg",
              )}
            >
              <FileText size={11} className="shrink-0 opacity-70" />
              <span className="truncate flex-1 text-left">{note.title || "Untitled"}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(id);
                }}
                className={cn(
                  "shrink-0 rounded p-0.5 transition-opacity",
                  isActive ? "opacity-70 hover:opacity-100 hover:bg-bg-elev-2" : "opacity-0 group-hover:opacity-70 hover:bg-bg-elev-3",
                )}
                title="Закрыть вкладку"
              >
                <X size={11} />
              </button>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="ml-1 shrink-0 flex items-center justify-center h-7 w-7 rounded-md text-fg-subtle hover:text-fg hover:bg-bg-elev-2 transition-colors"
        title="Открыть заметку…"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
