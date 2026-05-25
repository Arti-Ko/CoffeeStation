"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import {
  Folder,
  FolderOpen,
  Plus,
  ChevronRight,
  ChevronDown,
  FileText,
  Pin,
  PinOff,
  Hash,
  PanelLeftClose,
  PanelLeftOpen,
  FilesIcon,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Palette,
  ArrowUpDown,
  Copy,
  FolderPlus,
  ChevronsDownUp,
  ChevronsUpDown,
  ImageIcon,
  FileVideo,
  FileAudio,
  FileType,
  FileSpreadsheet,
  FileCode,
  RefreshCw,
} from "lucide-react";
import { db, type Folder as FolderRow, type Note } from "@/lib/db/schema";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { colorForExtension, detectNoteExtension } from "@/lib/utils/file-ext";
import { scanVaultFiles, type VaultFileEntry } from "@/lib/desktop/vault-files";
import { deleteFileAt, getVaultPaths, mirrorNoteToDisk, noteDiskPath } from "@/lib/desktop/paths";
import { noteToMarkdown } from "@/lib/desktop/export";
import { isDesktop } from "@/lib/desktop/runtime";
import { createNewNote } from "@/lib/db/note-create";
import { useActiveNotes } from "@/lib/db/hooks";
import { FileViewer } from "@/components/files/FileViewer";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ColorSwatchPicker,
} from "@/components/ui/context-menu";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "@/components/ui/dropdown";
import { toast } from "sonner";

type SortMode = "name-asc" | "name-desc" | "updated-desc" | "updated-asc" | "created-desc";

interface MultiSelect {
  notes: Set<string>;
  folders: Set<string>;
  /**
   * Handle a click on a row.
   *  - shift+click → select all visible rows between the previous anchor and this one
   *  - cmd/ctrl+click → toggle just this row
   *  - plain click → returns false so caller handles navigation/open
   */
  handleClick: (
    type: "note" | "folder",
    id: string,
    e: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
  ) => boolean;
  clear: () => void;
  hasNote: (id: string) => boolean;
  hasFolder: (id: string) => boolean;
  total: number;
}

export function FilesPanel() {
  const folders = useLiveQuery(() => db.folders.toArray()) ?? [];
  const notes = useActiveNotes();
  const tagsRaw = useLiveQuery(() => db.tags.toArray()) ?? [];
  const allTags = useLiveQuery(async () => {
    const all = await db.notes.filter((n) => n.archivedAt == null).toArray();
    const map = new Map<string, number>();
    all.forEach((n) => n.tags.forEach((t) => map.set(t, (map.get(t) ?? 0) + 1)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }) ?? [];

  const [tab, setTab] = useState<"folders" | "tags" | "files">("folders");
  const [sortMode, setSortMode] = useState<SortMode>("name-asc");
  // User preference: на старте развернуть все папки или нет
  const startupExpandRow = useLiveQuery(() => db.settings.get("ui.startupExpand"));
  const startupExpand: "collapsed" | "expanded" =
    (startupExpandRow?.value as "collapsed" | "expanded") ?? "collapsed";
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  /** Anchor for shift-click range select: prefixed `note:<id>` or `folder:<id>`. */
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  /** Force expand/collapse all: counter triggers FolderNode useEffect. */
  const [expandAllToken, setExpandAllToken] = useState<{ value: boolean; n: number }>({ value: false, n: 0 });

  // Apply startup default on mount — broadcast through `expandAllToken` so all
  // FolderNodes (including children rendered later) snap to the correct state.
  useEffect(() => {
    setExpandAllToken({ value: startupExpand === "expanded", n: 1 });
  }, [startupExpand]);

  /** All files in the vault root (mp4, pdf, xlsx …) — shown in the tree alongside notes. */
  const [vaultFiles, setVaultFiles] = useState<VaultFileEntry[]>([]);
  /** File currently open in the in-app viewer/editor modal. */
  const [previewFile, setPreviewFile] = useState<VaultFileEntry | null>(null);

  // Refresh the lightweight vault-files list (PDFs, images, etc.) on mount
  // and when the user explicitly hits the refresh button. The heavy
  // .md re-import is OFF the focus path — for a 3000+ note vault each pass
  // takes long enough to freeze the UI for minutes, and macOS fires window
  // focus often enough (Cmd-Tab, notification center, etc.) that it
  // effectively pegged the app. Manual rescan via the toolbar button now.
  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    const refresh = async () => {
      const paths = await getVaultPaths();
      if (!paths.vaultRoot) return;
      try {
        const list = await scanVaultFiles(paths.vaultRoot);
        if (!cancelled) setVaultFiles(list.filter((f) => f.kind !== "note"));
      } catch {
        /* vault may not yet exist */
      }
    };
    void refresh();
    const onRescan = () => void refresh();
    window.addEventListener("cs:vault-rescan", onRescan as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("cs:vault-rescan", onRescan as EventListener);
    };
  }, []);

  const multiSelect: MultiSelect = useMemo(
    () => ({
      notes: selectedNotes,
      folders: selectedFolders,
      hasNote: (id) => selectedNotes.has(id),
      hasFolder: (id) => selectedFolders.has(id),
      total: selectedNotes.size + selectedFolders.size,
      clear: () => {
        setSelectedNotes(new Set());
        setSelectedFolders(new Set());
        setLastClickedId(null);
      },
      handleClick: (type, id, e) => {
        const key = `${type}:${id}`;
        if (e.shiftKey && lastClickedId) {
          // Range select using DOM order of currently visible rows
          const allEls = Array.from(
            document.querySelectorAll<HTMLElement>("[data-fs-row]"),
          ).map((el) => el.getAttribute("data-fs-row")!);
          const aIdx = allEls.indexOf(lastClickedId);
          const bIdx = allEls.indexOf(key);
          if (aIdx >= 0 && bIdx >= 0) {
            const [lo, hi] = [Math.min(aIdx, bIdx), Math.max(aIdx, bIdx)];
            const nextNotes = new Set(selectedNotes);
            const nextFolders = new Set(selectedFolders);
            for (let i = lo; i <= hi; i++) {
              const k = allEls[i];
              if (k.startsWith("note:")) nextNotes.add(k.slice(5));
              else if (k.startsWith("folder:")) nextFolders.add(k.slice(7));
            }
            setSelectedNotes(nextNotes);
            setSelectedFolders(nextFolders);
            setLastClickedId(key);
            return true;
          }
        }
        if (e.metaKey || e.ctrlKey) {
          if (type === "note") {
            setSelectedNotes((prev) => {
              const n = new Set(prev);
              n.has(id) ? n.delete(id) : n.add(id);
              return n;
            });
          } else {
            setSelectedFolders((prev) => {
              const n = new Set(prev);
              n.has(id) ? n.delete(id) : n.add(id);
              return n;
            });
          }
          setLastClickedId(key);
          return true;
        }
        // Plain click — if there's an active selection, clicking another row
        // narrows to just that one row and consumes the click. Otherwise the
        // row falls through to navigate / expand.
        if (selectedNotes.size + selectedFolders.size > 0) {
          if (type === "note") {
            setSelectedNotes(new Set([id]));
            setSelectedFolders(new Set());
          } else {
            setSelectedFolders(new Set([id]));
            setSelectedNotes(new Set());
          }
          setLastClickedId(key);
          return true;
        }
        setLastClickedId(key);
        return false;
      },
    }),
    [selectedNotes, selectedFolders, lastClickedId],
  );

  const bulkTrash = async () => {
    if (selectedNotes.size + selectedFolders.size === 0) return;
    const summary = [
      selectedNotes.size > 0 && `${selectedNotes.size} заметок`,
      selectedFolders.size > 0 && `${selectedFolders.size} папок`,
    ].filter(Boolean).join(" + ");
    if (!confirm(`Переместить ${summary} в корзину?`)) return;
    const { removeNotesOnDisk, removeFoldersOnDisk } = await import("@/lib/desktop/paths");
    const allFolders = await db.folders.toArray();

    if (selectedNotes.size > 0) {
      // Snapshot notes BEFORE flagging them so we can resolve paths.
      const noteIds = Array.from(selectedNotes);
      const notesToWipe = await db.notes.bulkGet(noteIds);
      const validNotes = notesToWipe.filter((n): n is NonNullable<typeof n> => !!n);
      void removeNotesOnDisk(validNotes, allFolders);
      await db.notes.bulkUpdate(
        noteIds.map((id) => ({ key: id, changes: { archivedAt: Date.now() } })),
      );
    }
    if (selectedFolders.size > 0) {
      const folderIds = Array.from(selectedFolders);
      const noteIds = await db.notes.where("folderId").anyOf(folderIds).primaryKeys();
      if (noteIds.length > 0) {
        const notesToWipe = await db.notes.bulkGet(noteIds as string[]);
        const validNotes = notesToWipe.filter((n): n is NonNullable<typeof n> => !!n);
        void removeNotesOnDisk(validNotes, allFolders);
        await db.notes.bulkUpdate(
          (noteIds as string[]).map((id) => ({ key: id, changes: { archivedAt: Date.now() } })),
        );
      }
      // Remove the on-disk folder mirrors too (recursive) before dropping
      // from DB — files inside may have been just-archived above.
      void removeFoldersOnDisk(folderIds.map((id) => ({ id })), allFolders);
      await db.folders.bulkDelete(folderIds);
    }
    toast.success(`В корзине: ${summary}`);
    multiSelect.clear();
  };

  const bulkDelete = async () => {
    if (selectedNotes.size + selectedFolders.size === 0) return;
    const summary = [
      selectedNotes.size > 0 && `${selectedNotes.size} заметок`,
      selectedFolders.size > 0 && `${selectedFolders.size} папок`,
    ].filter(Boolean).join(" + ");
    if (!confirm(`Безвозвратно удалить ${summary}?`)) return;
    const { removeNotesOnDisk, removeFoldersOnDisk } = await import("@/lib/desktop/paths");
    const allFolders = await db.folders.toArray();

    if (selectedNotes.size > 0) {
      const ids = Array.from(selectedNotes);
      const notesToWipe = await db.notes.bulkGet(ids);
      const validNotes = notesToWipe.filter((n): n is NonNullable<typeof n> => !!n);
      void removeNotesOnDisk(validNotes, allFolders);
      await db.notes.bulkDelete(ids);
      await db.versions.where("noteId").anyOf(ids).delete();
    }
    if (selectedFolders.size > 0) {
      const folderIds = Array.from(selectedFolders);
      const noteIds = (await db.notes.where("folderId").anyOf(folderIds).primaryKeys()) as string[];
      if (noteIds.length > 0) {
        const notesToWipe = await db.notes.bulkGet(noteIds);
        const validNotes = notesToWipe.filter((n): n is NonNullable<typeof n> => !!n);
        void removeNotesOnDisk(validNotes, allFolders);
        await db.notes.bulkDelete(noteIds);
        await db.versions.where("noteId").anyOf(noteIds).delete();
      }
      void removeFoldersOnDisk(folderIds.map((id) => ({ id })), allFolders);
      await db.folders.bulkDelete(folderIds);
    }
    toast.success(`Удалено: ${summary}`);
    multiSelect.clear();
  };

  const bulkHide = async () => {
    if (selectedFolders.size === 0) return;
    await db.folders.bulkUpdate(
      Array.from(selectedFolders).map((id) => ({ key: id, changes: { hidden: true } })),
    );
    toast.success(`Скрыто: ${selectedFolders.size} папок`);
    multiSelect.clear();
  };

  const createFolder = async (parentId: string | null = null) => {
    const id = nanoid(10);
    await db.folders.add({
      id,
      name: "Новая папка",
      parentId,
      createdAt: Date.now(),
      source: "local",
    });
    setEditingFolder(id);
  };

  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const toggleFiles = useApp((s) => s.toggleFilesPanel);

  const vaultBuckets = useMemo(
    () => buildVaultFileBuckets(vaultFiles, folders),
    [vaultFiles, folders],
  );

  // Memoise the derived lists so they keep stable identity across renders
  // when the underlying arrays didn't change. Otherwise every hover /
  // selection toggle re-allocates `rootFolders` etc., invalidating the
  // memoised maps in `<FolderNode>` and `<NoteRow>` downstream.
  const rootFolders = useMemo(
    () => folders.filter((f) => !f.parentId && !f.hidden),
    [folders],
  );
  const hiddenFolders = useMemo(() => folders.filter((f) => f.hidden), [folders]);
  const pinned = useMemo(() => notes.filter((n) => n.pinned), [notes]);
  // Notes living at vault root (no folder) — shown above folders so a freshly
  // created "vault-root" note isn't invisible until the user files it.
  const rootNotes = useMemo(
    () => sortNotes(notes.filter((n) => n.folderId == null && !n.pinned), sortMode),
    [notes, sortMode],
  );

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-border bg-bg-elev-1">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold tracking-tight">
          <FilesIcon size={13} className="text-fg-muted" />
          Files
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setExpandAllToken((t) => ({ value: true, n: t.n + 1 }))}
            className="text-fg-subtle hover:text-fg p-1 rounded hover:bg-bg-elev-2"
            title="Развернуть все папки"
          >
            <ChevronsUpDown size={13} />
          </button>
          <button
            onClick={() => setExpandAllToken((t) => ({ value: false, n: t.n + 1 }))}
            className="text-fg-subtle hover:text-fg p-1 rounded hover:bg-bg-elev-2"
            title="Свернуть все папки"
          >
            <ChevronsDownUp size={13} />
          </button>
          <Menu>
            <MenuTrigger asChild>
              <button className="text-fg-subtle hover:text-fg p-1 rounded hover:bg-bg-elev-2" title="Сортировка">
                <ArrowUpDown size={13} />
              </button>
            </MenuTrigger>
            <MenuContent align="end">
              <SortMenuItem value="name-asc" current={sortMode} setValue={setSortMode}>Имя ↑</SortMenuItem>
              <SortMenuItem value="name-desc" current={sortMode} setValue={setSortMode}>Имя ↓</SortMenuItem>
              <SortMenuItem value="updated-desc" current={sortMode} setValue={setSortMode}>Обновлены — новые сверху</SortMenuItem>
              <SortMenuItem value="updated-asc" current={sortMode} setValue={setSortMode}>Обновлены — старые сверху</SortMenuItem>
              <SortMenuItem value="created-desc" current={sortMode} setValue={setSortMode}>Созданы — новые сверху</SortMenuItem>
            </MenuContent>
          </Menu>
          <button
            onClick={() => rescanVault()}
            className="text-fg-subtle hover:text-fg p-1 rounded hover:bg-bg-elev-2"
            title="Пересканировать vault на диске"
          >
            <RefreshCw size={13} />
          </button>
          <button onClick={toggleFiles} className="text-fg-subtle hover:text-fg p-1 rounded hover:bg-bg-elev-2" title="Свернуть">
            <PanelLeftClose size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-0.5 border-b border-border bg-bg-elev-1 px-2 py-1.5">
        <TabBtn current={tab} value="folders" set={setTab}>Папки</TabBtn>
        <TabBtn current={tab} value="tags" set={setTab}>Теги · {allTags.length}</TabBtn>
        <TabBtn current={tab} value="files" set={setTab}>Файлы</TabBtn>
      </div>

      {multiSelect.total > 0 && (
        <div className="flex items-center gap-1 border-b border-border bg-accent-soft/40 px-3 py-1.5 text-[11px] text-fg fade-up">
          <span className="font-medium">
            {multiSelect.total} выбрано
            {selectedFolders.size > 0 && selectedNotes.size > 0 && (
              <span className="text-fg-subtle font-normal"> · {selectedFolders.size}п + {selectedNotes.size}з</span>
            )}
          </span>
          <button onClick={multiSelect.clear} className="ml-auto text-fg-subtle hover:text-fg p-0.5 rounded hover:bg-bg-elev-2" title="Снять выделение">
            ✕
          </button>
          {selectedFolders.size > 0 && (
            <button onClick={bulkHide} className="rounded px-2 py-0.5 text-[11px] text-fg-muted hover:bg-bg-elev-2 hover:text-fg">
              Скрыть
            </button>
          )}
          <button onClick={bulkTrash} className="rounded px-2 py-0.5 text-[11px] text-fg-muted hover:bg-bg-elev-2 hover:text-fg">
            В корзину
          </button>
          <button onClick={bulkDelete} className="rounded px-2 py-0.5 text-[11px] text-danger hover:bg-danger/10">
            Удалить
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {tab === "folders" && (
          <>
            {pinned.length > 0 && (
              <Section title="Закреплённые" icon={<Pin size={11} />} defaultOpen>
                {pinned.map((n) => (
                  <NoteRow
                    key={n.id}
                    note={n}
                    depth={0}
                    editing={editingNote === n.id}
                    onStartEdit={() => setEditingNote(n.id)}
                    onEndEdit={() => setEditingNote(null)}
                    multiSelect={multiSelect}
                  />
                ))}
              </Section>
            )}

            <Section
              title="Папки"
              icon={<Folder size={11} />}
              defaultOpen
              action={
                <button
                  onClick={(e) => { e.stopPropagation(); createFolder(null); }}
                  className="p-0.5 rounded hover:bg-bg-elev-2 text-fg-subtle hover:text-fg"
                  title="Новая папка"
                >
                  <Plus size={11} />
                </button>
              }
            >
              <RootDropZone folders={folders} />
              {rootNotes.map((n) => (
                <NoteRow
                  key={n.id}
                  note={n}
                  depth={0}
                  editing={editingNote === n.id}
                  onStartEdit={() => setEditingNote(n.id)}
                  onEndEdit={() => setEditingNote(null)}
                  multiSelect={multiSelect}
                />
              ))}
              {rootFolders.map((f) => (
                <FolderNode
                  key={f.id}
                  folder={f}
                  folders={folders}
                  notes={notes}
                  depth={0}
                  sortMode={sortMode}
                  editingFolder={editingFolder}
                  editingNote={editingNote}
                  onStartEditFolder={setEditingFolder}
                  onStartEditNote={setEditingNote}
                  onEndEdit={() => { setEditingFolder(null); setEditingNote(null); }}
                  multiSelect={multiSelect}
                  expandAllToken={expandAllToken}
                  vaultBuckets={vaultBuckets}
                  onOpenFile={setPreviewFile}
                />
              ))}
            </Section>

            {hiddenFolders.length > 0 && (
              <Section title={`Скрытые · ${hiddenFolders.length}`} icon={<EyeOff size={11} />} defaultOpen={false}>
                {hiddenFolders.map((f) => (
                  <HiddenFolderRow key={f.id} folder={f} folders={folders} notes={notes} />
                ))}
              </Section>
            )}
          </>
        )}

        {tab === "tags" && (
          <div className="space-y-0.5">
            {allTags.length === 0 ? (
              <div className="px-2 py-3 text-[12px] text-fg-subtle italic">Тегов нет.</div>
            ) : (
              allTags.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => setView({ kind: "knowledge-base" })}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-[12px] text-fg-muted hover:bg-bg-elev-2 hover:text-fg"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Hash size={10} style={{ color: tagsRaw.find((t) => t.name === tag)?.color }} className="shrink-0" />
                    {tag}
                  </span>
                  <span className="text-[10px] text-fg-subtle">{count}</span>
                </button>
              ))
            )}
          </div>
        )}

        {tab === "files" && (
          <div className="space-y-1">
            <button
              onClick={() => setView({ kind: "files" })}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[12px] text-fg-muted hover:bg-bg-elev-2 hover:text-fg"
            >
              <FilesIcon size={13} />
              Открыть пул всех файлов →
            </button>
            <p className="px-2 text-[11px] text-fg-subtle leading-relaxed">
              Все картинки, видео, PDF, аудио и аттачи из ваших заметок — собраны в одну сетку. Двойной клик откроет в системной программе.
            </p>
          </div>
        )}
      </div>

      {previewFile && (
        <FileViewer
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onOpenInSystem={async () => {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("open_in_finder", { path: previewFile.path }).catch(() => {});
          }}
        />
      )}
    </aside>
  );
}

function SortMenuItem({
  value,
  current,
  setValue,
  children,
}: {
  value: SortMode;
  current: SortMode;
  setValue: (v: SortMode) => void;
  children: React.ReactNode;
}) {
  return (
    <MenuItem onClick={() => setValue(value)} className={current === value ? "text-accent" : ""}>
      {current === value && "✓ "}
      {children}
    </MenuItem>
  );
}

function TabBtn<T extends string>({
  current,
  value,
  set,
  children,
}: {
  current: T;
  value: T;
  set: (v: T) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => set(value)}
      className={cn(
        "flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
        current === value ? "bg-bg-elev-2 text-fg shadow-sm" : "text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  icon,
  children,
  defaultOpen = true,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-2">
      <div className="flex items-center px-2 py-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-1 text-[10px] uppercase tracking-wider text-fg-subtle hover:text-fg-muted"
        >
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          {icon}
          <span>{title}</span>
        </button>
        {action}
      </div>
      {open && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

function FolderNode({
  folder,
  folders,
  notes,
  depth,
  sortMode,
  editingFolder,
  editingNote,
  onStartEditFolder,
  onStartEditNote,
  onEndEdit,
  multiSelect,
  expandAllToken,
  vaultBuckets,
  onOpenFile,
}: {
  folder: FolderRow;
  folders: FolderRow[];
  notes: Note[];
  depth: number;
  sortMode: SortMode;
  editingFolder: string | null;
  editingNote: string | null;
  onStartEditFolder: (id: string) => void;
  onStartEditNote: (id: string) => void;
  onEndEdit: () => void;
  multiSelect: MultiSelect;
  expandAllToken: { value: boolean; n: number };
  vaultBuckets: Map<string | null, VaultFileEntry[]>;
  onOpenFile: (file: VaultFileEntry) => void;
}) {
  // Start CLOSED by default. The parent's startup preference and the
  // ⇅ expand/collapse-all buttons are the source of truth — both flow
  // through `expandAllToken` below.
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Force-set on expand/collapse-all action AND on initial startup preference
  useEffect(() => {
    if (expandAllToken.n > 0) setOpen(expandAllToken.value);
  }, [expandAllToken.n, expandAllToken.value]);
  const children = folders.filter((f) => f.parentId === folder.id && !f.hidden);
  const folderNotes = useMemo(
    () => sortNotes(notes.filter((n) => n.folderId === folder.id), sortMode),
    [notes, folder.id, sortMode],
  );

  const isEditing = editingFolder === folder.id;
  const isSelected = multiSelect.hasFolder(folder.id);

  // ---- Drag & Drop ----
  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    // Drag all selected folders if this one is among them, else just this one
    const folderIds = isSelected
      ? Array.from(multiSelect.folders)
      : [folder.id];
    const noteIds = isSelected ? Array.from(multiSelect.notes) : [];
    e.dataTransfer.setData(
      "application/x-coffeestation",
      JSON.stringify({ folderIds, noteIds }),
    );
    e.dataTransfer.setData("text/plain", folder.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const raw = e.dataTransfer.getData("application/x-coffeestation");
    if (!raw) return;
    try {
      const { folderIds, noteIds } = JSON.parse(raw) as { folderIds: string[]; noteIds: string[] };
      await moveIntoFolder(folder.id, folderIds, noteIds, folders);
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      {/* Drag handlers live on the OUTER wrapper so Radix's ContextMenuTrigger
          (which uses Slot internally) can't swallow drag events. */}
      <div
        draggable={!isEditing}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-fs-row={`folder:${folder.id}`}
        className={cn(dragOver && "rounded ring-2 ring-accent ring-inset bg-accent-soft/40")}
      >
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              onClick={(e) => {
                const consumed = multiSelect.handleClick("folder", folder.id, e);
                if (!consumed) setOpen((v) => !v);
              }}
              className={cn(
                "tree-row group cursor-grab active:cursor-grabbing",
                isSelected && "bg-accent-soft text-accent",
              )}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
            >
              {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              {open ? <FolderOpen size={12} style={{ color: folder.color }} /> : <Folder size={12} style={{ color: folder.color }} />}
              {isEditing ? (
                <InlineRename
                  initial={folder.name}
                  onSubmit={async (name) => {
                    await db.folders.update(folder.id, { name });
                    onEndEdit();
                  }}
                  onCancel={onEndEdit}
                />
              ) : (
                <span className="truncate flex-1">{folder.name}</span>
              )}
              <span className="text-[10px] text-fg-subtle opacity-0 group-hover:opacity-100">{folderNotes.length}</span>
            </div>
          </ContextMenuTrigger>
          <FolderContextMenuContent folder={folder} onStartEdit={() => onStartEditFolder(folder.id)} />
        </ContextMenu>
      </div>
      {open && (
        <div>
          {children.map((c) => (
            <FolderNode
              key={c.id}
              folder={c}
              folders={folders}
              notes={notes}
              depth={depth + 1}
              sortMode={sortMode}
              editingFolder={editingFolder}
              editingNote={editingNote}
              onStartEditFolder={onStartEditFolder}
              onStartEditNote={onStartEditNote}
              onEndEdit={onEndEdit}
              multiSelect={multiSelect}
              expandAllToken={expandAllToken}
              vaultBuckets={vaultBuckets}
              onOpenFile={onOpenFile}
            />
          ))}
          {folderNotes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              depth={depth + 1}
              editing={editingNote === n.id}
              onStartEdit={() => onStartEditNote(n.id)}
              onEndEdit={onEndEdit}
              multiSelect={multiSelect}
            />
          ))}
          {(vaultBuckets.get(folder.id) ?? []).map((vf) => (
            <VaultFileRow key={vf.path} file={vf} depth={depth + 1} onOpen={() => onOpenFile(vf)} />
          ))}
        </div>
      )}
    </div>
  );
}

function VaultFileRow({
  file,
  depth,
  onOpen,
}: {
  file: VaultFileEntry;
  depth: number;
  onOpen: () => void;
}) {
  const ext = file.ext;
  return (
    <div
      onClick={onOpen}
      onDoubleClick={async () => {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("open_in_finder", { path: file.path }).catch(() => {});
      }}
      data-fs-row={`vfile:${file.path}`}
      className="tree-row cursor-pointer"
      style={{ paddingLeft: `${8 + depth * 12 + 16}px` }}
      title={`${file.relative} · ${formatBytesShort(file.size)} · двойной клик — открыть в системе`}
    >
      <FileIconByKind kind={file.kind} />
      <span className="truncate flex-1">{file.name}</span>
      {ext && <FileExtChip ext={ext.toUpperCase()} />}
    </div>
  );
}

function FileIconByKind({ kind }: { kind: VaultFileEntry["kind"] }) {
  switch (kind) {
    case "image":  return <ImageIcon size={11} className="opacity-60 text-blue-400" />;
    case "video":  return <FileVideo size={11} className="opacity-60 text-purple-400" />;
    case "audio":  return <FileAudio size={11} className="opacity-60 text-pink-400" />;
    case "pdf":    return <FileType size={11} className="opacity-60 text-red-400" />;
    case "doc":    return <FileText size={11} className="opacity-60 text-sky-400" />;
    case "sheet":  return <FileSpreadsheet size={11} className="opacity-60 text-emerald-400" />;
    case "code":   return <FileCode size={11} className="opacity-60 text-amber-400" />;
    default:       return <FileText size={11} className="opacity-60" />;
  }
}

function formatBytesShort(b: number): string {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return Math.round(b / 1024) + " KB";
  if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + " MB";
  return (b / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

function FolderContextMenuContent({
  folder,
  onStartEdit,
}: {
  folder: FolderRow;
  onStartEdit: () => void;
}) {
  const setView = useApp((s) => s.setView);

  const createNoteHere = async () => {
    const id = await createNewNote({ folderId: folder.id });
    setView({ kind: "note", id });
    toast.message("Создана новая заметка", { description: `В папке «${folder.name}»` });
  };

  const moveToTrash = async () => {
    const childNotes = await db.notes.where("folderId").equals(folder.id).toArray();
    const childFolders = await db.folders.where("parentId").equals(folder.id).toArray();
    if (
      (childNotes.length > 0 || childFolders.length > 0) &&
      !confirm(
        `В папке «${folder.name}» — ${childNotes.length} заметок и ${childFolders.length} подпапок. Удалить всё?`,
      )
    )
      return;
    if (childFolders.length > 0) {
      toast.error("Сначала удалите подпапки");
      return;
    }
    // Compute path before mutation, then wipe on disk + flag in DB.
    const allFolders = await db.folders.toArray();
    const { removeFoldersOnDisk } = await import("@/lib/desktop/paths");
    void removeFoldersOnDisk([{ id: folder.id }], allFolders);
    await db.transaction("rw", db.folders, db.notes, async () => {
      await db.notes.where("folderId").equals(folder.id).modify({ archivedAt: Date.now() });
      await db.folders.delete(folder.id);
    });
    toast.success(`«${folder.name}» удалена`);
  };

  const toggleHidden = async () => {
    await db.folders.update(folder.id, { hidden: !folder.hidden });
    toast.success(folder.hidden ? "Папка показана" : "Папка скрыта");
  };

  const setColor = async (color?: string) => {
    await db.folders.update(folder.id, { color });
  };

  const createSubfolder = async () => {
    await db.folders.add({
      id: nanoid(10),
      name: "Новая папка",
      parentId: folder.id,
      createdAt: Date.now(),
      source: "local",
    });
    toast.message("Подпапка создана", { description: "Правый клик → Переименовать" });
  };

  return (
    <ContextMenuContent>
      <ContextMenuItem onClick={createNoteHere}>
        <FileText size={12} /> Новая заметка здесь
      </ContextMenuItem>
      <ContextMenuItem onClick={createSubfolder}>
        <FolderPlus size={12} /> Новая подпапка
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onStartEdit}>
        <Pencil size={12} /> Переименовать
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Palette size={12} /> Цвет
          <span
            className="ml-1 h-2.5 w-2.5 rounded-full"
            style={{ background: folder.color ?? "transparent", border: folder.color ? "none" : "1px solid var(--border-strong)" }}
          />
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ColorSwatchPicker current={folder.color} onPick={setColor} onClear={() => setColor(undefined)} />
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={toggleHidden}>
        {folder.hidden ? <Eye size={12} /> : <EyeOff size={12} />}
        {folder.hidden ? "Показать" : "Скрыть"}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={moveToTrash} className="text-danger">
        <Trash2 size={12} /> Удалить
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

function NoteRow({
  note,
  depth,
  editing,
  onStartEdit,
  onEndEdit,
  multiSelect,
}: {
  note: Note;
  depth: number;
  editing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  multiSelect?: MultiSelect;
}) {
  const setView = useApp((s) => s.setView);
  const view = useApp((s) => s.view);
  const active = view.kind === "note" && view.id === note.id;
  const isSelected = multiSelect?.hasNote(note.id) ?? false;
  const hasSelection = (multiSelect?.total ?? 0) > 0;

  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    // Drag all selected notes if this one is among them, otherwise just this one
    const noteIds = isSelected && multiSelect ? Array.from(multiSelect.notes) : [note.id];
    const folderIds = isSelected && multiSelect ? Array.from(multiSelect.folders) : [];
    e.dataTransfer.setData(
      "application/x-coffeestation",
      JSON.stringify({ folderIds, noteIds }),
    );
    e.dataTransfer.setData("text/plain", note.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const duplicate = async () => {
    await db.notes.add({
      ...note,
      id: nanoid(10),
      title: note.title + " (копия)",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
    });
  };

  const togglePin = async () => {
    await db.notes.update(note.id, { pinned: !note.pinned });
  };

  const trash = async () => {
    if (!confirm(`Переместить «${note.title}» в корзину?`)) return;
    const folders = await db.folders.toArray();
    const { removeNotesOnDisk } = await import("@/lib/desktop/paths");
    void removeNotesOnDisk([{ title: note.title, folderId: note.folderId }], folders);
    await db.notes.update(note.id, { archivedAt: Date.now() });
    toast.success("В корзине");
  };

  const hardDelete = async () => {
    if (!confirm(`Удалить «${note.title}» безвозвратно?`)) return;
    const folders = await db.folders.toArray();
    const { removeNotesOnDisk } = await import("@/lib/desktop/paths");
    void removeNotesOnDisk([{ title: note.title, folderId: note.folderId }], folders);
    await db.notes.delete(note.id);
    await db.versions.where("noteId").equals(note.id).delete();
    toast.success("Удалено");
  };

  return (
    <div
      draggable={!editing}
      onDragStart={onDragStart}
      data-fs-row={`note:${note.id}`}
    >
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          onClick={(e) => {
            if (editing) return;
            const consumed = multiSelect?.handleClick("note", note.id, e);
            if (!consumed) setView({ kind: "note", id: note.id });
          }}
          className={cn("tree-row cursor-grab active:cursor-grabbing", active && "active", isSelected && "bg-accent-soft text-accent")}
          style={{ paddingLeft: `${8 + depth * 12 + 16}px` }}
        >
          <FileText size={11} className="opacity-60" />
          {editing ? (
            <InlineRename
              initial={note.title}
              onSubmit={async (title) => {
                await db.notes.update(note.id, { title, updatedAt: Date.now() });
                onEndEdit();
              }}
              onCancel={onEndEdit}
            />
          ) : (
            <>
              <span className="truncate flex-1">{note.title || "Untitled"}</span>
              <FileExtChip ext={detectNoteExtension(note.content)} />
            </>
          )}
          {note.pinned && <Pin size={10} className="text-accent shrink-0" />}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onStartEdit}>
          <Pencil size={12} /> Переименовать
        </ContextMenuItem>
        <ContextMenuItem onClick={togglePin}>
          {note.pinned ? <PinOff size={12} /> : <Pin size={12} />}
          {note.pinned ? "Открепить" : "Закрепить"}
        </ContextMenuItem>
        <ContextMenuItem onClick={duplicate}>
          <Copy size={12} /> Дублировать
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={trash}>
          <Trash2 size={12} /> В корзину
        </ContextMenuItem>
        <ContextMenuItem onClick={hardDelete} className="text-danger">
          <Trash2 size={12} /> Удалить безвозвратно
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    </div>
  );
}

function HiddenFolderRow({
  folder,
  folders,
  notes,
}: {
  folder: FolderRow;
  folders: FolderRow[];
  notes: Note[];
}) {
  const childCount =
    notes.filter((n) => n.folderId === folder.id).length +
    folders.filter((f) => f.parentId === folder.id).length;

  const unhide = async () => {
    await db.folders.update(folder.id, { hidden: false });
    toast.success(`«${folder.name}» показана`);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="tree-row opacity-60 hover:opacity-100" style={{ paddingLeft: "8px" }}>
          <EyeOff size={11} className="opacity-60" />
          <Folder size={12} style={{ color: folder.color }} />
          <span className="truncate flex-1">{folder.name}</span>
          <span className="text-[10px] text-fg-subtle">{childCount}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={unhide}>
          <Eye size={12} /> Показать
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function InlineRename({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmit(value.trim() || initial);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onSubmit(value.trim() || initial)}
      className="flex-1 min-w-0 h-5 rounded border border-accent bg-bg px-1 text-xs outline-none"
    />
  );
}

/**
 * Map each vault file to the in-app folder id (or null for root) that
 * matches its on-disk path. Matches by folder-name chain — works after the
 * user has imported the vault, since import preserves the folder hierarchy.
 */
function buildVaultFileBuckets(
  files: VaultFileEntry[],
  folders: FolderRow[],
): Map<string | null, VaultFileEntry[]> {
  const byParentName = new Map<string, FolderRow[]>();
  folders.forEach((f) => {
    const key = (f.parentId ?? "") + "/" + f.name;
    if (!byParentName.has(key)) byParentName.set(key, []);
    byParentName.get(key)!.push(f);
  });

  const buckets = new Map<string | null, VaultFileEntry[]>();
  for (const file of files) {
    const parts = file.relative.split(/[\\/]+/).slice(0, -1).filter(Boolean);
    let parentId: string | null = null;
    let matched = true;
    for (const part of parts) {
      const lookupKey: string = (parentId ?? "") + "/" + part;
      const candidates: FolderRow[] = byParentName.get(lookupKey) ?? [];
      const folder: FolderRow | undefined =
        candidates.find((f: FolderRow) => !f.hidden) ?? candidates[0];
      if (!folder) {
        matched = false;
        break;
      }
      parentId = folder.id;
    }
    if (!matched) continue; // skip orphans — they don't have a matching in-app folder
    if (!buckets.has(parentId)) buckets.set(parentId, []);
    buckets.get(parentId)!.push(file);
  }
  return buckets;
}

function FileExtChip({ ext }: { ext: string | null }) {
  if (!ext) return null;
  const color = colorForExtension(ext);
  return (
    <span
      className="shrink-0 rounded px-1 py-px text-[8.5px] font-bold uppercase tracking-wider"
      style={{ background: color + "22", color }}
    >
      {ext}
    </span>
  );
}

function RootDropZone({ folders }: { folders: FolderRow[] }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        const has = e.dataTransfer.types.includes("application/x-coffeestation");
        if (!has) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragOver(false);
        const raw = e.dataTransfer.getData("application/x-coffeestation");
        if (!raw) return;
        try {
          const { folderIds, noteIds } = JSON.parse(raw) as { folderIds: string[]; noteIds: string[] };
          await moveIntoFolder(null, folderIds, noteIds, folders);
        } catch {
          /* ignore */
        }
      }}
      className={cn(
        "h-5 mx-2 my-1 rounded border border-dashed transition-colors",
        dragOver ? "border-accent bg-accent-soft/40" : "border-transparent",
      )}
      title="Перетащите сюда, чтобы переместить в корень"
    >
      {dragOver && (
        <div className="text-[10px] text-accent text-center leading-5">↓ В корень</div>
      )}
    </div>
  );
}

/**
 * Move notes and/or folders into a target folder. Filters out moves that would
 * create cycles (folder moved into itself or its descendant).
 */
/**
 * Build the slash-separated folder chain (e.g. `"Work/Notes"`) for a folder
 * row by walking parents through the provided lookup. Used to compute on-disk
 * paths when mirroring notes whose folder changed.
 */
function folderChain(folderId: string | null, byId: Map<string, FolderRow>): string {
  if (!folderId) return "";
  const parts: string[] = [];
  let cur = byId.get(folderId) ?? null;
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
  }
  return parts.join("/");
}

interface MovedNote {
  id: string;
  /** folderId BEFORE the move was committed to the DB */
  prevFolderId: string | null;
  /** title at the time of the move (used to find/delete the stale file) */
  prevTitle: string;
}

/**
 * User-triggered "refresh from disk". Runs the same scan path as window focus
 * but with a visible toast so the user knows something happened — particularly
 * important for the "I just created a folder in Finder, where is it?" case
 * where nothing visibly changes if the disk already matches the DB.
 */
async function rescanVault(): Promise<void> {
  if (!isDesktop()) return;
  const paths = await getVaultPaths();
  if (!paths.vaultRoot) {
    toast.error("Vault root не настроен");
    return;
  }
  try {
    const { importVaultFromFolder } = await import("@/lib/desktop/import");
    const res = await importVaultFromFolder(paths.vaultRoot);
    // Nudge the panel's own listener so vault-files (PDFs, images, etc.)
    // also refresh in the same gesture.
    window.dispatchEvent(new CustomEvent("cs:vault-rescan"));
    const newStuff = res.notes + res.folders;
    if (newStuff > 0) {
      toast.success(`Подхвачено: ${res.notes} заметок · ${res.folders} папок`);
    } else {
      toast.info("Vault уже синхронизирован");
    }
  } catch (e) {
    toast.error("Сканирование vault не удалось", {
      description: e instanceof Error ? e.message : String(e),
    });
  }
}

interface MovedFolder {
  id: string;
  /** chain BEFORE the move was committed (e.g. "Archive/2026-01") */
  oldChain: string;
  /** chain AFTER the move (e.g. "2026-05/Archive/2026-01") */
  newChain: string;
}

/**
 * Sync notes' on-disk `.md` mirrors after their folder changed. Writes the
 * new file in the destination folder and deletes the stale file in the
 * previous one, keeping the on-disk vault in lockstep with the tree.
 */
async function syncMovedNotesOnDisk(
  moves: MovedNote[],
  foldersById: Map<string, FolderRow>,
) {
  if (moves.length === 0) return;
  const paths = await getVaultPaths();
  if (!paths.vaultRoot) return;
  for (const m of moves) {
    const note = await db.notes.get(m.id);
    if (!note) continue;
    const newChain = folderChain(note.folderId, foldersById);
    const oldChain = folderChain(m.prevFolderId, foldersById);
    const md = noteToMarkdown(note);
    await mirrorNoteToDisk(paths.vaultRoot, newChain, note.title, md).catch(() => null);
    if (oldChain !== newChain || m.prevTitle !== note.title) {
      await deleteFileAt(noteDiskPath(paths.vaultRoot, oldChain, m.prevTitle)).catch(() => undefined);
    }
  }
}

/**
 * Mirror folder moves on disk by renaming the actual directory.
 * Cheaper than re-mirroring every descendant note: one rename moves the
 * whole subtree atomically. Called after the DB parentId mutation.
 */
async function syncMovedFoldersOnDisk(moves: MovedFolder[]): Promise<void> {
  if (moves.length === 0) return;
  const paths = await getVaultPaths();
  if (!paths.vaultRoot) return;
  const { renameAt } = await import("@/lib/desktop/paths");
  const root = paths.vaultRoot.replace(/\/$/, "");
  for (const m of moves) {
    if (!m.oldChain) continue;
    const from = `${root}/${m.oldChain}`;
    const to = m.newChain ? `${root}/${m.newChain}` : root;
    if (from === to) continue;
    await renameAt(from, to).catch(() => undefined);
  }
}

async function moveIntoFolder(
  targetFolderId: string | null,
  folderIds: string[],
  noteIds: string[],
  allFolders: FolderRow[],
) {
  // Compute descendant set of each moved folder to avoid cycles
  const childrenMap = new Map<string, string[]>();
  allFolders.forEach((f) => {
    if (!f.parentId) return;
    const arr = childrenMap.get(f.parentId) ?? [];
    arr.push(f.id);
    childrenMap.set(f.parentId, arr);
  });
  const descendants = (id: string): Set<string> => {
    const out = new Set<string>([id]);
    const stack = [id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      (childrenMap.get(cur) ?? []).forEach((c) => {
        if (!out.has(c)) {
          out.add(c);
          stack.push(c);
        }
      });
    }
    return out;
  };

  const safeFolderIds = folderIds.filter((id) => {
    if (id === targetFolderId) return false;
    if (!targetFolderId) return true;
    return !descendants(id).has(targetFolderId);
  });

  if (safeFolderIds.length === 0 && noteIds.length === 0) {
    toast.error("Нельзя переместить папку в саму себя");
    return;
  }

  // Snapshot each moved note's prior folder so we can also relocate the
  // on-disk .md (otherwise the file lingers in the previous folder).
  const noteMoves: MovedNote[] = [];
  if (noteIds.length > 0) {
    const prev = await db.notes.bulkGet(noteIds);
    prev.forEach((n) => {
      if (n) noteMoves.push({ id: n.id, prevFolderId: n.folderId, prevTitle: n.title });
    });
  }

  // Same idea for folders — compute old disk-chains BEFORE we mutate
  // parentId, so we can rename the physical directories afterwards.
  const foldersById = new Map(allFolders.map((f) => [f.id, f]));
  const folderMoves: MovedFolder[] = safeFolderIds.map((id) => ({
    id,
    oldChain: folderChain(id, foldersById),
    newChain: "", // filled in after the DB update
  }));

  if (safeFolderIds.length > 0) {
    await db.folders.bulkUpdate(
      safeFolderIds.map((id) => ({ key: id, changes: { parentId: targetFolderId } })),
    );
  }
  if (noteIds.length > 0) {
    await db.notes.bulkUpdate(
      noteIds.map((id) => ({ key: id, changes: { folderId: targetFolderId, updatedAt: Date.now() } })),
    );
  }

  // Recompute chains from the post-mutation state so the renames point at
  // the right destination. We fetch the folders fresh because the parent
  // id we use lives in `targetFolderId` may itself have moved this turn.
  if (folderMoves.length > 0) {
    const freshFolders = await db.folders.toArray();
    const freshById = new Map(freshFolders.map((f) => [f.id, f]));
    folderMoves.forEach((m) => {
      m.newChain = folderChain(m.id, freshById);
    });
  }

  // Fire-and-forget on-disk sync — UI doesn't need to wait, and we don't
  // want a vault-mirror failure to block the in-app move.
  void syncMovedNotesOnDisk(noteMoves, foldersById);
  void syncMovedFoldersOnDisk(folderMoves);

  const total = safeFolderIds.length + noteIds.length;
  toast.success(`Перемещено: ${total}`);
}

function sortNotes(notes: Note[], mode: SortMode): Note[] {
  const arr = [...notes];
  switch (mode) {
    case "name-asc": return arr.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    case "name-desc": return arr.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
    case "updated-desc": return arr.sort((a, b) => b.updatedAt - a.updatedAt);
    case "updated-asc": return arr.sort((a, b) => a.updatedAt - b.updatedAt);
    case "created-desc": return arr.sort((a, b) => b.createdAt - a.createdAt);
    default: return arr;
  }
}

/**
 * Compact icon strip shown when the FilesPanel is collapsed (≤48 px). Lives in
 * its own component so the heavy expanded tree (useLiveQuery subscriptions,
 * file viewer modal, drag-drop wiring) is *fully unmounted* while collapsed —
 * eliminating the mid-animation render-tear that crashed WKWebView on macOS.
 */
export function FilesPanelCollapsedStrip() {
  const setView = useApp((s) => s.setView);
  const toggleFiles = useApp((s) => s.toggleFilesPanel);
  return (
    <aside className="flex h-full w-full min-w-12 shrink-0 flex-col items-center border-r border-border bg-bg-elev-1 py-3 gap-1">
      <button
        onClick={toggleFiles}
        className="text-fg-muted hover:text-fg p-2 rounded-md hover:bg-bg-elev-2"
        title="Развернуть"
      >
        <PanelLeftOpen size={16} />
      </button>
      <div className="my-2 h-px w-6 bg-border" />
      <button
        onClick={toggleFiles}
        className="p-2 rounded-md text-fg-muted hover:bg-bg-elev-2 hover:text-fg"
        title="Папки"
      >
        <Folder size={15} />
      </button>
      <button
        onClick={toggleFiles}
        className="p-2 rounded-md text-fg-muted hover:bg-bg-elev-2 hover:text-fg"
        title="Теги"
      >
        <Hash size={15} />
      </button>
      <button
        onClick={() => setView({ kind: "files" })}
        className="p-2 rounded-md text-fg-muted hover:bg-bg-elev-2 hover:text-fg"
        title="Все файлы"
      >
        <FilesIcon size={15} />
      </button>
    </aside>
  );
}
