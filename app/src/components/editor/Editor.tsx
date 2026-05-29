"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor as TipTapEditor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight";
// Only the languages we actually highlight. `common` ships ~20 grammars (~80
// kB gzipped) — most of them are languages our users never write code in.
// Adding more here is one-line: `import xml from 'highlight.js/lib/languages/xml'`.
import js from "highlight.js/lib/languages/javascript";
import ts from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import { useEffect, useRef } from "react";
import { WikiLink } from "@/lib/editor/wiki-link";
import { Hashtag } from "@/lib/editor/hashtag";
import { PkmInputRules } from "@/lib/editor/input-rules";
import { Media } from "@/lib/editor/media";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Highlighter,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";
import {
  Rows,
  Columns,
  Merge,
  Split,
  ArrowRight,
  ArrowLeft,
  ArrowUp as ArrowUpIcon,
  ArrowDown as ArrowDownIcon,
} from "lucide-react";

const lowlight = createLowlight({
  javascript: js,
  js,
  typescript: ts,
  ts,
  jsx: js,
  tsx: ts,
  python: python,
  py: python,
  rust: rust,
  rs: rust,
  go,
  json,
  yaml,
  yml: yaml,
  markdown,
  md: markdown,
  html: xml,
  xml,
  css,
  bash,
  sh: bash,
  shell: bash,
  sql,
});

export interface EditorProps {
  content: string;
  onUpdate?: (html: string, text: string) => void;
  onWikiClick?: (target: string) => void;
  onTagClick?: (tag: string) => void;
  onEditorReady?: (editor: TipTapEditor | null) => void;
  placeholder?: string;
  editable?: boolean;
}

export function Editor({
  content,
  onUpdate,
  onWikiClick,
  onTagClick,
  onEditorReady,
  placeholder = "Начните писать…",
  editable = true,
}: EditorProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
      }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: false }),
      Typography,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: true }),
      CodeBlockLowlight.configure({ lowlight }),
      WikiLink,
      Hashtag,
      Media,
      PkmInputRules,
    ],
    content,
    onUpdate: ({ editor }) => {
      onUpdate?.(editor.getHTML(), editor.getText());
    },
    editorProps: {
      attributes: {
        class: "max-w-3xl mx-auto focus:outline-none px-12 py-10",
      },
      // Constrain Cmd/Ctrl+A to the editor document. Without this, WKWebView
      // (Tauri on macOS) falls back to its native "select everything on the
      // page" behaviour and highlights the whole UI (sidebar, panels, …)
      // instead of just the note content.
      handleKeyDown(view, event) {
        const isSelectAll = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a";
        if (isSelectAll) {
          event.preventDefault();
          const { state } = view;
          const tr = state.tr.setSelection(
            TextSelection.create(state.doc, 0, state.doc.content.size),
          );
          view.dispatch(tr);
          return true;
        }
        return false;
      },
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
              const reader = new FileReader();
              reader.onload = () => {
                const src = reader.result;
                if (typeof src === "string") {
                  view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src })));
                }
              };
              reader.readAsDataURL(file);
              return true;
            }
          }
        }
        return false;
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const file = files[0];
        event.preventDefault();

        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        const insertAt = coords?.pos;

        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = () => {
            const src = reader.result;
            if (typeof src === "string") {
              const node = view.state.schema.nodes.image.create({ src });
              const tr = insertAt != null
                ? view.state.tr.insert(insertAt, node)
                : view.state.tr.replaceSelectionWith(node);
              view.dispatch(tr);
            }
          };
          reader.readAsDataURL(file);
          return true;
        }

        const mediaNode = view.state.schema.nodes.media;
        if (!mediaNode) return false;

        const kind: "video" | "audio" | "pdf" | null =
          file.type.startsWith("video/") ? "video" :
          file.type.startsWith("audio/") ? "audio" :
          file.type === "application/pdf" ? "pdf" :
          null;

        if (!kind) {
          // Unknown type — insert as attachment link
          const reader = new FileReader();
          reader.onload = () => {
            const src = reader.result;
            if (typeof src === "string") {
              const html = `<p><a href="${src}" download="${file.name.replace(/"/g, "&quot;")}">📎 ${file.name}</a></p>`;
              const editor = (view as unknown as { __editor?: TipTapEditor }).__editor;
              if (editor) editor.chain().focus().insertContent(html).run();
            }
          };
          reader.readAsDataURL(file);
          return true;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const src = reader.result;
          if (typeof src !== "string") return;
          const node = mediaNode.create({ kind, src, name: file.name });
          const tr = insertAt != null
            ? view.state.tr.insert(insertAt, node)
            : view.state.tr.replaceSelectionWith(node);
          view.dispatch(tr);
        };
        reader.readAsDataURL(file);
        return true;
      },
    },
  });

  // CRITICAL: Only sync external content into the editor when the editor is
  // NOT focused. Otherwise typing → onUpdate → debounced save → useLiveQuery
  // re-render → this effect would reset the document and jump the cursor to
  // the end mid-keystroke.
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  useEffect(() => {
    const el = editorContainerRef.current;
    if (!el || !editor) return;

    const dragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    };
    const drop = async (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      // ProseMirror's handleDrop already handled this (returned true) — no-op here.
      // We keep the listener so unknown types still work outside the editor body.
      e.preventDefault();
      await insertFileIntoEditor(editor, files[0]);
    };
    el.addEventListener("dragover", dragOver);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", dragOver);
      el.removeEventListener("drop", drop);
    };
  }, [editor]);

  useEffect(() => {
    const el = editorContainerRef.current;
    if (!el) return;
    const click = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const wiki = target.closest('[data-type="wiki-link"]') as HTMLElement | null;
      if (wiki) {
        e.preventDefault();
        const t = wiki.getAttribute("data-target") || wiki.textContent?.replace(/^\[\[|\]\]$/g, "");
        if (t && onWikiClick) onWikiClick(t.trim());
        return;
      }
      const tag = target.closest('[data-type="hashtag"]') as HTMLElement | null;
      if (tag) {
        e.preventDefault();
        const t = tag.getAttribute("data-tag") || tag.textContent?.replace(/^#/, "");
        if (t && onTagClick) onTagClick(t.trim());
      }
    };
    el.addEventListener("click", click);
    return () => el.removeEventListener("click", click);
  }, [onWikiClick, onTagClick]);

  if (!editor) return null;

  return (
    <div ref={editorContainerRef} className="editor-surface flex-1 overflow-y-auto">
      {editor && editable && (
        <BubbleMenu
          editor={editor}
          options={{ placement: "top", offset: 8 }}
          className="flex items-center gap-0.5 rounded-lg border border-border bg-bg-elev-1 p-1 shadow-xl"
        >
          <BMBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold size={14} />
          </BMBtn>
          <BMBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic size={14} />
          </BMBtn>
          <BMBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough size={14} />
          </BMBtn>
          <BMBtn active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>
            <Highlighter size={14} />
          </BMBtn>
          <BMBtn active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
            <Code size={14} />
          </BMBtn>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <BMBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 size={14} />
          </BMBtn>
          <BMBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 size={14} />
          </BMBtn>
          <BMBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 size={14} />
          </BMBtn>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <BMBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List size={14} />
          </BMBtn>
          <BMBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered size={14} />
          </BMBtn>
          <BMBtn active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
            <ListChecks size={14} />
          </BMBtn>
          <BMBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote size={14} />
          </BMBtn>
        </BubbleMenu>
      )}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* A plain wrapper div is the Slot target. `EditorContent` renders a
              React Fragment (host div + portals), which Radix's `asChild` Slot
              cannot merge a ref/props onto — doing so detaches the
              contenteditable from the keydown path and breaks Cmd+A. */}
          <div className="min-h-full">
            <EditorContent editor={editor} />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          // Stop the menu from opening when the right-clicked spot isn't
          // inside a table — we don't yet have actions for plain text, so
          // suppressing the menu lets the native browser context menu fire
          // (the user gets Copy / Paste / Inspect Element).
          onContextMenu={(e) => {
            if (!editor?.isActive("table")) {
              e.preventDefault();
            }
          }}
        >
          {editor?.isActive("table") ? (
            <TableContextMenuItems editor={editor} />
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

function TableContextMenuItems({ editor }: { editor: TipTapEditor }) {
  // Each chain call follows the same shape: focus → mutate → run. Wrapping
  // in `editor.chain().focus()` ensures the table command operates on the
  // current selection even if focus drifted to the context menu itself.
  const run = (fn: () => void) => () => fn();
  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Columns size={11} /> Столбцы
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem
            onClick={run(() => editor.chain().focus().addColumnBefore().run())}
          >
            <ArrowLeft size={11} /> Добавить слева
          </ContextMenuItem>
          <ContextMenuItem
            onClick={run(() => editor.chain().focus().addColumnAfter().run())}
          >
            <ArrowRight size={11} /> Добавить справа
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-danger"
            onClick={run(() => editor.chain().focus().deleteColumn().run())}
          >
            <Columns size={11} /> Удалить столбец
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Rows size={11} /> Строки
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem
            onClick={run(() => editor.chain().focus().addRowBefore().run())}
          >
            <ArrowUpIcon size={11} /> Добавить выше
          </ContextMenuItem>
          <ContextMenuItem
            onClick={run(() => editor.chain().focus().addRowAfter().run())}
          >
            <ArrowDownIcon size={11} /> Добавить ниже
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-danger"
            onClick={run(() => editor.chain().focus().deleteRow().run())}
          >
            <Rows size={11} /> Удалить строку
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      <ContextMenuItem
        onClick={run(() => editor.chain().focus().mergeCells().run())}
        disabled={!editor.can().mergeCells()}
      >
        <Merge size={11} /> Объединить ячейки
      </ContextMenuItem>
      <ContextMenuItem
        onClick={run(() => editor.chain().focus().splitCell().run())}
        disabled={!editor.can().splitCell()}
      >
        <Split size={11} /> Разделить ячейку
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem
        onClick={run(() => editor.chain().focus().toggleHeaderRow().run())}
      >
        Заголовок строки
      </ContextMenuItem>
      <ContextMenuItem
        onClick={run(() => editor.chain().focus().toggleHeaderColumn().run())}
      >
        Заголовок столбца
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem
        className="text-danger"
        onClick={run(() => editor.chain().focus().deleteTable().run())}
      >
        Удалить таблицу
      </ContextMenuItem>
    </>
  );
}

async function insertFileIntoEditor(editor: TipTapEditor, file: File): Promise<void> {
  const dataUrl = await readAsDataURL(file);
  if (file.type.startsWith("image/")) {
    editor.chain().focus().setImage({ src: dataUrl, alt: file.name }).run();
    return;
  }
  const kind: "video" | "audio" | "pdf" | null =
    file.type.startsWith("video/") ? "video" :
    file.type.startsWith("audio/") ? "audio" :
    file.type === "application/pdf" ? "pdf" :
    null;
  if (kind) {
    editor
      .chain()
      .focus()
      .insertContent({ type: "media", attrs: { kind, src: dataUrl, name: file.name } })
      .run();
    return;
  }
  // text-ish formats embed as code block
  if (
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    file.type.startsWith("text/") ||
    file.type.includes("csv")
  ) {
    const text = await file.text();
    editor.chain().focus().insertContent(`<pre><code>${escapeHtml(text)}</code></pre>`).run();
    return;
  }
  // Generic attachment — insert as download link
  editor
    .chain()
    .focus()
    .insertContent(`<p><a href="${dataUrl}" download="${escapeHtml(file.name)}">📎 ${escapeHtml(file.name)}</a></p>`)
    .run();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function embedFileAsHtml(file: File): Promise<string | null> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const safeName = file.name.replace(/</g, "&lt;").replace(/"/g, "&quot;");
  if (file.type.startsWith("video/")) {
    return `<div data-type="media" data-kind="video"><video controls style="max-width:100%;border-radius:10px" src="${dataUrl}"></video></div>`;
  }
  if (file.type.startsWith("audio/")) {
    return `<div data-type="media" data-kind="audio"><audio controls src="${dataUrl}"></audio></div>`;
  }
  if (file.type === "application/pdf") {
    return `<div data-type="media" data-kind="pdf"><iframe src="${dataUrl}" style="width:100%;height:600px;border:1px solid var(--border);border-radius:10px"></iframe><a href="${dataUrl}" download="${safeName}" class="block mt-1 text-sm">📎 ${safeName}</a></div>`;
  }
  if (file.type === "text/plain" || file.type === "text/markdown" || file.type.startsWith("text/") || file.type.includes("csv")) {
    const text = await file.text();
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<pre><code>${escaped}</code></pre>`;
  }
  // Generic attachment link
  return `<p><a href="${dataUrl}" download="${safeName}">📎 ${safeName}</a></p>`;
}

function BMBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={onClick}
      className={cn(active && "bg-accent-soft text-accent")}
    >
      {children}
    </Button>
  );
}

/** Format toolbar (rendered above the editor). Takes the live editor instance. */
export function EditorToolbar({
  mode,
  onModeChange,
  editor,
}: {
  mode: "wysiwyg" | "markdown";
  onModeChange: (m: "wysiwyg" | "markdown") => void;
  editor?: TipTapEditor | null;
}) {
  const insertLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL ссылки", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertImage = async () => {
    if (!editor) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result;
        if (typeof src === "string") {
          editor.chain().focus().setImage({ src, alt: file.name }).run();
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const insertTable = () => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const attach = () => {
    if (!editor) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*,audio/*,application/pdf,.txt,.md,.csv,.svg,.json,.xlsx,.docx";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      await insertFileIntoEditor(editor, file);
    };
    input.click();
  };

  return (
    <div className="flex items-center justify-between border-b border-border bg-bg-elev-1 px-4 py-1.5">
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={insertLink} disabled={!editor}>
          <LinkIcon size={13} />
          <span>Link</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={insertImage} disabled={!editor}>
          <ImageIcon size={13} />
          <span>Image</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={insertTable} disabled={!editor}>
          <TableIcon size={13} />
          <span>Table</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={attach} disabled={!editor}>
          <Paperclip size={13} />
          <span>Файл</span>
        </Button>
      </div>
      <div className="flex items-center gap-0 rounded-md bg-bg-elev-2 p-0.5">
        <button
          onClick={() => onModeChange("wysiwyg")}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            mode === "wysiwyg" ? "bg-bg text-fg shadow-sm" : "text-fg-muted",
          )}
        >
          WYSIWYG
        </button>
        <button
          onClick={() => onModeChange("markdown")}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            mode === "markdown" ? "bg-bg text-fg shadow-sm" : "text-fg-muted",
          )}
        >
          Markdown
        </button>
      </div>
    </div>
  );
}
