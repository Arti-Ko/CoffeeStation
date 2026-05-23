"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { Editor, EditorToolbar } from "@/components/editor/Editor";
import type { Editor as TipTapEditor } from "@tiptap/core";
import { useApp } from "@/lib/store";
import { useEffect, useMemo, useRef, useState } from "react";
import { debounce, extractHashtags, extractWikiLinks } from "@/lib/utils";
import { nanoid } from "nanoid";
import { Pin, MoreHorizontal, Share2, Trash2, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger, MenuSeparator } from "@/components/ui/dropdown";
import { toast } from "sonner";
import { exportNoteToHtml, exportNoteToMarkdown, noteToMarkdown } from "@/lib/desktop/export";
import { getVaultPaths, mirrorNoteToDisk } from "@/lib/desktop/paths";

export function NoteView({ noteId }: { noteId: string }) {
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId]);
  const pushRecent = useApp((s) => s.pushRecent);
  const setView = useApp((s) => s.setView);
  const [mode, setMode] = useState<"wysiwyg" | "markdown">("wysiwyg");
  const [title, setTitle] = useState(note?.title ?? "");
  const [editorInstance, setEditorInstance] = useState<TipTapEditor | null>(null);
  const lastSnapshot = useRef<number>(Date.now());

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      pushRecent(note.id);
    }
  }, [note?.id, pushRecent]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveContent = useMemo(
    () =>
      debounce(async (html: string, text: string) => {
        const current = await db.notes.get(noteId);
        if (!current) return;
        const links = extractWikiLinks(html);
        const tags = extractHashtags(text);
        const updated = {
          content: html,
          contentText: text,
          links,
          tags: Array.from(new Set([...current.tags.filter((t) => !tags.includes(t)), ...tags])),
          updatedAt: Date.now(),
        };
        await db.notes.update(noteId, updated);

        // FS mirror — write .md to configured vault root, preserving the
        // folder hierarchy so notes land in the same subfolder the user
        // sees in the in-app tree.
        try {
          const paths = await getVaultPaths();
          if (paths.vaultRoot) {
            const folders = await db.folders.toArray();
            const folderMap = new Map(folders.map((f) => [f.id, f]));
            const parts: string[] = [];
            let cur = current.folderId ? folderMap.get(current.folderId) ?? null : null;
            while (cur) {
              parts.unshift(cur.name);
              cur = cur.parentId ? folderMap.get(cur.parentId) ?? null : null;
            }
            const relativeFolder = parts.join("/");
            const md = noteToMarkdown({ ...current, ...updated });
            await mirrorNoteToDisk(paths.vaultRoot, relativeFolder, current.title, md);
          }
        } catch {
          // fail silently — IndexedDB is the source of truth
        }

        if (Date.now() - lastSnapshot.current > 5 * 60_000) {
          lastSnapshot.current = Date.now();
          await db.versions.add({
            id: nanoid(10),
            noteId,
            title: current.title,
            content: current.content,
            createdAt: Date.now(),
            reason: "auto",
          });
        }
      }, 600),
    [noteId],
  );

  const saveTitle = useMemo(
    () =>
      debounce(async (val: string) => {
        await db.notes.update(noteId, { title: val, updatedAt: Date.now() });
      }, 400),
    [noteId],
  );

  const togglePin = async () => {
    if (!note) return;
    await db.notes.update(noteId, { pinned: !note.pinned });
  };

  const exportHtml = async () => {
    if (!note) return;
    try {
      const path = await exportNoteToHtml(note);
      if (path) toast.success("HTML экспортирован", { description: path });
    } catch (e) {
      toast.error("Не удалось экспортировать", { description: String(e) });
    }
  };

  const exportMd = async () => {
    if (!note) return;
    try {
      const path = await exportNoteToMarkdown(note);
      if (path) toast.success("Markdown экспортирован", { description: path });
    } catch (e) {
      toast.error("Не удалось экспортировать", { description: String(e) });
    }
  };

  const deleteNote = async (hard = false) => {
    const label = hard ? "Безвозвратно удалить" : "Переместить в корзину";
    if (!confirm(`${label} заметку «${note?.title ?? ""}»?`)) return;
    // Compute the on-disk path BEFORE mutating the DB. Even on a soft
    // trash we delete the .md mirror — if we left it, the next pull/import
    // would resurrect the note in the sidebar. The DB entry stays so the
    // user can still restore from the trash UI.
    if (note) {
      const folders = await db.folders.toArray();
      const { removeNotesOnDisk } = await import("@/lib/desktop/paths");
      await removeNotesOnDisk([{ title: note.title, folderId: note.folderId }], folders);
    }
    if (hard) {
      await db.notes.delete(noteId);
      await db.versions.where("noteId").equals(noteId).delete();
      toast.success("Удалено");
    } else {
      await db.notes.update(noteId, { archivedAt: Date.now() });
      toast.success("Перемещено в корзину");
    }
    setView({ kind: "knowledge-base" });
  };

  const duplicate = async () => {
    if (!note) return;
    const id = nanoid(10);
    await db.notes.add({ ...note, id, title: note.title + " (копия)", createdAt: Date.now(), updatedAt: Date.now(), pinned: false });
    setView({ kind: "note", id });
  };

  if (!note) {
    return <div className="flex flex-1 items-center justify-center text-fg-subtle">Заметка не найдена</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar mode={mode} onModeChange={setMode} editor={editorInstance} />

      <div className="flex items-center justify-between border-b border-border px-12 py-3 bg-bg">
        <div className="flex-1">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              saveTitle(e.target.value);
            }}
            placeholder="Без названия"
            className="w-full bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-fg-subtle"
            style={{ fontFamily: "var(--font-serif)" }}
          />
          <div className="mt-1 flex items-center gap-3 text-[11.5px] text-fg-subtle">
            <span>Авто-сохранено</span>
            <span>·</span>
            <span>{note.contentText.split(/\s+/).filter(Boolean).length} слов</span>
            {note.tags.length > 0 && (
              <>
                <span>·</span>
                <div className="flex gap-1">
                  {note.tags.map((t) => (
                    <span key={t} className="text-accent">#{t}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={togglePin}>
            <Pin size={13} className={note.pinned ? "fill-accent text-accent" : ""} />
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <Share2 size={13} /> Экспорт
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onClick={exportHtml}><Download size={12} /> HTML…</MenuItem>
              <MenuItem onClick={exportMd}><Download size={12} /> Markdown…</MenuItem>
            </MenuContent>
          </Menu>
          <Menu>
            <MenuTrigger asChild>
              <Button size="icon-sm" variant="ghost">
                <MoreHorizontal size={14} />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onClick={duplicate}><Copy size={12} /> Дублировать</MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => deleteNote(false)}><Trash2 size={12} /> В корзину</MenuItem>
              <MenuItem className="text-danger" onClick={() => deleteNote(true)}><Trash2 size={12} /> Удалить безвозвратно</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      {mode === "wysiwyg" ? (
        // No `key={noteId}` here: TipTap's Editor.tsx already syncs `content`
        // via setContent when the prop changes (and the editor isn't focused).
        // Re-keying forced a full editor teardown + re-init on every tab
        // switch — instantiating ~12 extensions + lowlight grammars added up
        // to 20–40s of jank on big vaults. Reusing the instance is fine; the
        // only cost is undo history can span notes, which mirrors how
        // Obsidian's per-tab editor works.
        <Editor
          content={note.content}
          onUpdate={saveContent}
          onEditorReady={setEditorInstance}
          onWikiClick={async (target) => {
            const existing = await db.notes.where("title").equalsIgnoreCase(target).first();
            if (existing) {
              setView({ kind: "note", id: existing.id });
            } else {
              const id = nanoid(10);
              await db.notes.add({
                id,
                title: target,
                content: `<p></p>`,
                contentText: "",
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
              toast.info(`Создана заметка «${target}»`);
            }
          }}
          onTagClick={(tag) => toast.message(`Tag: #${tag}`)}
        />
      ) : (
        <MarkdownView html={note.content} onChange={(html) => saveContent(html, html.replace(/<[^>]*>/g, " "))} />
      )}
    </div>
  );
}

function MarkdownView({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const [value, setValue] = useState(html);
  useEffect(() => {
    setValue(html);
  }, [html]);
  return (
    <textarea
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onChange(e.target.value);
      }}
      className="editor-surface flex-1 w-full font-mono text-sm p-12 outline-none resize-none"
      spellCheck={false}
    />
  );
}
