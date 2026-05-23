"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { FileText, Plus, FilePlus2 } from "lucide-react";
import { nanoid } from "nanoid";

export function TemplatesView() {
  const templates = useLiveQuery(() => db.templates.toArray()) ?? [];
  const setView = useApp((s) => s.setView);

  const apply = async (templateId: string) => {
    const tpl = await db.templates.get(templateId);
    if (!tpl) return;
    const date = new Date().toLocaleString();
    const content = (tpl.content ?? "")
      .replace(/{{date}}/g, date)
      .replace(/{{title}}/g, "Untitled");
    const id = nanoid(10);
    await db.notes.add({
      id,
      title: tpl.name + " — " + new Date().toLocaleDateString(),
      content,
      contentText: content.replace(/<[^>]*>/g, " "),
      type: "note",
      folderId: null,
      tags: [],
      links: [],
      attachments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archivedAt: null,
      pinned: false,
    });
    setView({ kind: "note", id });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
            Шаблоны
          </h2>
          <p className="text-xs text-fg-subtle mt-0.5">
            Daily / Meeting / Book / Project — переменные: <code>{"{{date}}"}</code>, <code>{"{{title}}"}</code>
          </p>
        </div>
        <Button size="sm" variant="default"><Plus size={12} /> Новый шаблон</Button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-bg-elev-1 p-4 fade-up">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-accent">
                  <FileText size={14} />
                </div>
                <div>
                  <div className="text-[14px] font-semibold">{t.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-fg-subtle">{t.category}</div>
                </div>
              </div>
              {t.description && (
                <p className="mt-2.5 text-[12.5px] text-fg-muted line-clamp-2">{t.description}</p>
              )}
              <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => apply(t.id)}>
                <FilePlus2 size={12} /> Использовать
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
