"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { useApp } from "@/lib/store";
import { FileText, Link2 } from "lucide-react";
import { plainText } from "@/lib/utils";

export function Backlinks({ noteId }: { noteId: string }) {
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId]);
  const all = useLiveQuery(() => db.notes.toArray()) ?? [];
  const { setView } = useApp();

  if (!note) return <div className="p-4 text-sm text-fg-subtle">…</div>;

  const incoming = all.filter((n) => n.id !== note.id && n.links.includes(note.title));
  const outgoing = note.links.map((title) => all.find((n) => n.title === title) ?? { id: "_x_", title, content: "", contentText: "" }).filter(Boolean);

  return (
    <div className="p-3 space-y-4">
      <section>
        <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-subtle">
          <Link2 size={11} /> Backlinks ({incoming.length})
        </div>
        {incoming.length === 0 && (
          <p className="text-xs text-fg-subtle italic">Никаких заметок не ссылается сюда. Начните с <code className="text-fg-muted">[[{note.title}]]</code></p>
        )}
        <div className="space-y-1.5">
          {incoming.map((n) => {
            const snippet = excerpt(plainText(n.content), note.title);
            return (
              <button
                key={n.id}
                onClick={() => setView({ kind: "note", id: n.id })}
                className="block w-full text-left rounded-md border border-border bg-bg p-2.5 hover:border-accent transition-colors fade-up"
              >
                <div className="flex items-center gap-1.5 text-xs font-medium text-fg">
                  <FileText size={11} className="text-fg-subtle" />
                  {n.title}
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-muted line-clamp-3">
                  {snippet}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-subtle">
          Outgoing links ({outgoing.length})
        </div>
        {outgoing.length === 0 && <p className="text-xs text-fg-subtle italic">Нет исходящих ссылок.</p>}
        <div className="space-y-1">
          {outgoing.map((target) => {
            const exists = target.id !== "_x_";
            return (
              <button
                key={target.id + target.title}
                onClick={() => exists && setView({ kind: "note", id: target.id })}
                disabled={!exists}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-fg-muted hover:bg-bg-elev-2 hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileText size={11} />
                <span className="truncate">{target.title}</span>
                {!exists && <span className="ml-auto text-[10px] text-danger">broken</span>}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function excerpt(text: string, term: string): string {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return text.slice(0, 160) + (text.length > 160 ? "…" : "");
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + term.length + 100);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}
