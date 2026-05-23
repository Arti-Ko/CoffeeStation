"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Note } from "@/lib/db/schema";
import { useApp } from "@/lib/store";
import { FileText, Link2 } from "lucide-react";
import { plainText } from "@/lib/utils";

type OutgoingTarget = { id: string; title: string; exists: boolean };

export function Backlinks({ noteId }: { noteId: string }) {
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId]);

  // Incoming: hit the `*links` multiEntry index instead of loading every
  // note and `.filter()`-ing the in-memory array. Schema defines `links` as
  // a multiEntry index (see app/src/lib/db/schema.ts), so Dexie does the
  // match in O(matches) instead of O(notes^2) per keystroke.
  const incoming: Note[] =
    useLiveQuery<Note[]>(
      () =>
        note?.title
          ? db.notes.where("links").equals(note.title).toArray()
          : Promise.resolve([] as Note[]),
      [note?.title],
    ) ?? [];

  // Outgoing: resolve each `[[link]]` title to a real note ref. We only
  // need title-by-title lookup, not the whole table.
  const outgoingResolved: OutgoingTarget[] =
    useLiveQuery<OutgoingTarget[]>(
      () =>
        note?.links?.length
          ? Promise.all(
              note.links.map(async (title): Promise<OutgoingTarget> => {
                const found = await db.notes
                  .where("title")
                  .equalsIgnoreCase(title)
                  .first();
                return found
                  ? { id: found.id, title: found.title, exists: true }
                  : { id: "_x_:" + title, title, exists: false };
              }),
            )
          : Promise.resolve([] as OutgoingTarget[]),
      [note?.links?.join("")],
    ) ?? [];

  const setView = useApp((s) => s.setView);

  if (!note) return <div className="p-4 text-sm text-fg-subtle">…</div>;

  const filteredIncoming = incoming.filter((n) => n.id !== note.id);

  return (
    <div className="p-3 space-y-4">
      <section>
        <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-subtle">
          <Link2 size={11} /> Backlinks ({filteredIncoming.length})
        </div>
        {filteredIncoming.length === 0 && (
          <p className="text-xs text-fg-subtle italic">
            Никаких заметок не ссылается сюда. Начните с{" "}
            <code className="text-fg-muted">[[{note.title}]]</code>
          </p>
        )}
        <div className="space-y-1.5">
          {filteredIncoming.map((n) => {
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
          Outgoing links ({outgoingResolved.length})
        </div>
        {outgoingResolved.length === 0 && (
          <p className="text-xs text-fg-subtle italic">Нет исходящих ссылок.</p>
        )}
        <div className="space-y-1">
          {outgoingResolved.map((target) => (
            <button
              key={target.id}
              onClick={() => target.exists && setView({ kind: "note", id: target.id })}
              disabled={!target.exists}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-fg-muted hover:bg-bg-elev-2 hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText size={11} />
              <span className="truncate">{target.title}</span>
              {!target.exists && (
                <span className="ml-auto text-[10px] text-danger">broken</span>
              )}
            </button>
          ))}
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
