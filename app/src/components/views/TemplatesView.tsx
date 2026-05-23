"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, type Template } from "@/lib/db/schema";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus, FilePlus2, Pencil, Trash2, X, Check } from "lucide-react";
import { nanoid } from "nanoid";
import { Editor } from "@/components/editor/Editor";
import { toast } from "sonner";

export function TemplatesView() {
  const templates = useLiveQuery(() => db.templates.toArray()) ?? [];
  const setView = useApp((s) => s.setView);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = templates.find((t) => t.id === editingId) ?? null;

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

  const createNew = async () => {
    const id = nanoid(10);
    await db.templates.add({
      id,
      name: "Новый шаблон",
      category: "Custom",
      description: "",
      content: "<p>Начните печатать… Доступные переменные: {{date}} и {{title}}.</p>",
    });
    setEditingId(id);
  };

  const remove = async (t: Template) => {
    if (!confirm(`Удалить шаблон «${t.name}»?`)) return;
    await db.templates.delete(t.id);
    if (editingId === t.id) setEditingId(null);
    toast.success("Шаблон удалён");
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h2
            className="text-2xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Шаблоны
          </h2>
          <p className="text-xs text-fg-subtle mt-0.5">
            Daily / Meeting / Book / Project — переменные: <code>{"{{date}}"}</code>,{" "}
            <code>{"{{title}}"}</code>
          </p>
        </div>
        <Button size="sm" variant="default" onClick={createNew}>
          <Plus size={12} /> Новый шаблон
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {templates.length === 0 ? (
          <div className="mx-auto max-w-md rounded-xl border border-dashed border-border p-10 text-center">
            <FileText size={20} className="mx-auto mb-2 text-fg-subtle" />
            <p className="text-sm text-fg-muted">Шаблонов пока нет.</p>
            <Button size="sm" variant="default" onClick={createNew} className="mt-3">
              <Plus size={12} /> Создать первый
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-border bg-bg-elev-1 p-4 fade-up flex flex-col"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-accent">
                    <FileText size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold truncate">{t.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-fg-subtle truncate">
                      {t.category ?? "—"}
                    </div>
                  </div>
                </div>
                {t.description && (
                  <p className="mt-2.5 text-[12.5px] text-fg-muted line-clamp-2">
                    {t.description}
                  </p>
                )}
                <div className="mt-3 flex gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => apply(t.id)}
                  >
                    <FilePlus2 size={12} /> Использовать
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Редактировать"
                    onClick={() => setEditingId(t.id)}
                  >
                    <Pencil size={12} />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Удалить"
                    onClick={() => remove(t)}
                    className="text-fg-subtle hover:text-danger"
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <TemplateEditorModal
          template={editing}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function TemplateEditorModal({
  template,
  onClose,
}: {
  template: Template;
  onClose: () => void;
}) {
  // Buffer the form locally so an unsaved edit can be cancelled. We save
  // explicitly via the "Сохранить" button rather than wiring per-keystroke
  // — templates aren't ephemeral autosave-style state.
  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState(template.category ?? "");
  const [description, setDescription] = useState(template.description ?? "");
  const [content, setContent] = useState(template.content);

  // If the underlying template changes from outside (rare — but e.g. a sync
  // could refresh it), reflect that into the form on prop change.
  useEffect(() => {
    setName(template.name);
    setCategory(template.category ?? "");
    setDescription(template.description ?? "");
    setContent(template.content);
  }, [template.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    await db.templates.update(template.id, {
      name: name.trim() || "Без названия",
      category: category.trim() || undefined,
      description: description.trim() || undefined,
      content,
    });
    toast.success("Шаблон сохранён");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full max-h-[860px] w-full max-w-3xl flex-col rounded-2xl border border-border bg-bg-elev-1 shadow-2xl fade-up">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold tracking-tight">
              Редактирование шаблона
            </div>
            <div className="text-[11px] text-fg-subtle mt-0.5 truncate">
              Все изменения применятся к следующим заметкам, созданным из этого шаблона
            </div>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose} title="Закрыть">
            <X size={14} />
          </Button>
        </header>

        <div className="grid grid-cols-2 gap-2 px-5 pt-4">
          <Field label="Название">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Категория">
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Daily / Meeting / Project…"
            />
          </Field>
        </div>
        <div className="px-5 pt-2">
          <Field label="Краткое описание (необязательно)">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Что внутри и когда применять"
            />
          </Field>
        </div>

        <div className="px-5 pt-4 pb-2 text-[10.5px] uppercase tracking-wider text-fg-subtle">
          Содержимое
        </div>
        <div className="flex-1 min-h-0 px-5 pb-2 overflow-hidden">
          <div className="h-full rounded-md border border-border overflow-hidden flex flex-col">
            <Editor
              content={content}
              onUpdate={(html) => setContent(html)}
            />
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-border px-5 py-3">
          <div className="text-[11px] text-fg-subtle">
            Переменные: <code>{"{{date}}"}</code> · <code>{"{{title}}"}</code>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={save}>
              <Check size={12} /> Сохранить
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-wider text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}
