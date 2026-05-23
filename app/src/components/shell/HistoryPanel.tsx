"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { formatDistanceToNow } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { History, RotateCcw } from "lucide-react";
import { diffWords } from "diff";
import { plainText } from "@/lib/utils";
import { useState } from "react";

export function HistoryPanel({ noteId }: { noteId: string }) {
  const locale = useApp((s) => s.locale);
  const versions =
    useLiveQuery(
      () => db.versions.where("noteId").equals(noteId).reverse().sortBy("createdAt"),
      [noteId],
    ) ?? [];
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  if (!note) return null;
  if (versions.length === 0) {
    return (
      <div className="p-4 text-xs text-fg-subtle italic">
        История версий создаётся автоматически при правках. Пока пусто.
      </div>
    );
  }

  const restore = async (versionId: string) => {
    const v = versions.find((x) => x.id === versionId);
    if (!v) return;
    await db.notes.update(noteId, { content: v.content, title: v.title, updatedAt: Date.now() });
  };

  const selected = versions.find((v) => v.id === selectedVersion);

  return (
    <div className="p-3 space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-fg-subtle flex items-center gap-1.5">
        <History size={11} /> {versions.length} версий
      </div>
      {versions.map((v) => (
        <button
          key={v.id}
          onClick={() => setSelectedVersion(v.id)}
          className={`block w-full text-left rounded-md border p-2.5 transition-colors ${
            selectedVersion === v.id ? "border-accent bg-accent-soft/40" : "border-border bg-bg"
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{v.title}</span>
            <span className="text-fg-subtle">{v.reason ?? "auto"}</span>
          </div>
          <div className="mt-1 text-[11px] text-fg-subtle">
            {formatDistanceToNow(v.createdAt, { addSuffix: true, locale: locale === "ru" ? ru : enUS })}
          </div>
        </button>
      ))}

      {selected && (
        <div className="rounded-md border border-border bg-bg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Diff vs current</span>
            <Button size="sm" variant="secondary" onClick={() => restore(selected.id)}>
              <RotateCcw size={12} /> Восстановить
            </Button>
          </div>
          <div className="text-[12px] leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap">
            {diffWords(plainText(selected.content), plainText(note.content)).map((part, i) => (
              <span
                key={i}
                className={
                  part.added
                    ? "bg-success/20 text-success rounded px-0.5"
                    : part.removed
                    ? "bg-danger/20 text-danger line-through rounded px-0.5"
                    : "text-fg-muted"
                }
              >
                {part.value}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
