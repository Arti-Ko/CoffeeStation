"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface OutlineEntry {
  level: number;
  text: string;
}

export function Outline({ noteId }: { noteId: string }) {
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId]);

  const headings: OutlineEntry[] = useMemo(() => {
    if (!note) return [];
    if (typeof DOMParser === "undefined") return [];
    const doc = new DOMParser().parseFromString(note.content, "text/html");
    return Array.from(doc.querySelectorAll("h1, h2, h3, h4")).map((el) => ({
      level: parseInt(el.tagName.substring(1)),
      text: el.textContent ?? "",
    }));
  }, [note]);

  const minLevel = useMemo(
    () => (headings.length === 0 ? 1 : Math.min(...headings.map((h) => h.level))),
    [headings],
  );

  const jump = (index: number) => {
    // Find the editor inside the document, then the N-th heading element.
    const editor = document.querySelector(".ProseMirror") as HTMLElement | null;
    if (!editor) return;
    const all = editor.querySelectorAll("h1, h2, h3, h4");
    const target = all[index];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });

    // Brief highlight to confirm the jump
    target.classList.add("outline-jump");
    setTimeout(() => target.classList.remove("outline-jump"), 1200);
  };

  if (!note) return null;
  if (headings.length === 0) {
    return (
      <div className="p-4 text-xs text-fg-subtle italic">
        Заголовки появятся здесь, когда вы их добавите.
      </div>
    );
  }

  return (
    <nav className="p-3 space-y-0.5">
      {headings.map((h, i) => (
        <button
          key={i}
          onClick={() => jump(i)}
          className={cn(
            "block w-full text-left rounded px-2 py-1 text-[12.5px] truncate transition-colors",
            "text-fg-muted hover:bg-bg-elev-2 hover:text-fg cursor-pointer",
            h.level === minLevel && "font-medium",
          )}
          style={{ paddingLeft: `${8 + (h.level - minLevel) * 14}px` }}
        >
          {h.text || "—"}
        </button>
      ))}
    </nav>
  );
}
