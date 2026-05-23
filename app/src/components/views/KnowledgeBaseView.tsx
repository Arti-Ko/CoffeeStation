"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import type { Folder, Note } from "@/lib/db/schema";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/i18n";
import {
  Folder as FolderIcon,
  Plus,
  Filter,
  LayoutGrid,
  List,
  Rows3,
  ChevronDown,
  FileText,
  Cloud,
  HardDrive,
  Globe,
  Trash2,
  X,
  CheckSquare,
  Square as SquareIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import { formatBytes, cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createNewNote } from "@/lib/db/note-create";

type ViewMode = "cards" | "list" | "compact";

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  local: <HardDrive size={11} className="text-fg-muted" />,
  "google-drive": <Cloud size={11} className="text-blue-500" />,
  notion: <Globe size={11} className="text-purple-500" />,
  dropbox: <Cloud size={11} className="text-blue-600" />,
  onedrive: <Cloud size={11} className="text-sky-500" />,
};

export function KnowledgeBaseView() {
  const t = useT();
  const setView = useApp((s) => s.setView);
  const folders = useLiveQuery(() => db.folders.toArray()) ?? [];
  const notes =
    useLiveQuery(() =>
      db.notes
        .filter((n) => n.archivedAt == null)
        .toArray()
        .then((arr) => arr.sort((a, b) => b.updatedAt - a.updatedAt)),
    ) ?? [];

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [currentSection, setCurrentSection] = useState<string>("All");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [filterTags, setFilterTags] = useState<string[]>([]);

  // Reset selection when section changes
  useEffect(() => setSelected(new Set()), [currentSection]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [notes]);

  const rootFolders = folders.filter((f) => !f.parentId);
  const sections = ["All", ...rootFolders.map((f) => f.name)];

  const sectionNotes = useMemo(() => {
    if (currentSection === "All") return notes;
    return notes.filter((n) => {
      if (!n.folderId) return false;
      const folder = folders.find((f) => f.id === n.folderId);
      if (!folder) return false;
      const root = findRoot(folder, folders);
      return root?.name === currentSection;
    });
  }, [notes, folders, currentSection]);

  const filteredNotes = useMemo(() => {
    let r = sectionNotes;
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      r = r.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.contentText.toLowerCase().includes(q),
      );
    }
    if (filterTags.length > 0) {
      r = r.filter((n) => filterTags.every((t) => n.tags.includes(t)));
    }
    return r;
  }, [sectionNotes, filterText, filterTags]);

  const visibleFolders = useMemo(() => {
    if (currentSection === "All") return folders.filter((f) => !f.parentId);
    return folders.filter((f) => {
      const root = findRoot(f, folders);
      return root?.name === currentSection;
    });
  }, [folders, currentSection]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filteredNotes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredNotes.map((n) => n.id)));
    }
  };

  const createNote = async () => {
    const id = await createNewNote();
    setView({ kind: "note", id });
  };

  const deleteSelected = async (hard: boolean) => {
    if (selected.size === 0) return;
    if (!confirm(`${hard ? "Безвозвратно удалить" : "Переместить в корзину"} ${selected.size} заметок?`)) return;
    if (hard) {
      await db.notes.bulkDelete(Array.from(selected));
    } else {
      await db.notes.bulkUpdate(
        Array.from(selected).map((id) => ({
          key: id,
          changes: { archivedAt: Date.now() },
        })),
      );
    }
    toast.success(`${hard ? "Удалено" : "В корзине"}: ${selected.size}`);
    setSelected(new Set());
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Menu>
            <MenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-md px-2 py-1 text-2xl font-semibold tracking-tight hover:bg-bg-elev-2 transition-colors" style={{ fontFamily: "var(--font-serif)" }}>
                {currentSection}
                <ChevronDown size={16} className="text-fg-subtle" />
              </button>
            </MenuTrigger>
            <MenuContent align="start">
              {sections.map((s) => (
                <MenuItem key={s} onClick={() => setCurrentSection(s)}>
                  {s}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <span className="text-xs text-fg-subtle">{filteredNotes.length} из {sectionNotes.length}</span>
        </div>

        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <>
              <span className="text-xs text-fg-muted">{selected.size} выбрано</span>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                <X size={12} />
              </Button>
              <Button size="sm" variant="outline" onClick={() => deleteSelected(false)}>
                <Trash2 size={12} /> В корзину
              </Button>
              <Button size="sm" variant="danger" onClick={() => deleteSelected(true)}>
                <Trash2 size={12} /> Удалить
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center rounded-md border border-border bg-bg-elev-1 p-0.5">
                <ViewModeBtn mode="cards" current={viewMode} setMode={setViewMode} label="Cards"><LayoutGrid size={12} /></ViewModeBtn>
                <ViewModeBtn mode="list" current={viewMode} setMode={setViewMode} label="List"><List size={12} /></ViewModeBtn>
                <ViewModeBtn mode="compact" current={viewMode} setMode={setViewMode} label="Compact"><Rows3 size={12} /></ViewModeBtn>
              </div>
              <Button
                size="sm"
                variant={filterOpen || filterText || filterTags.length > 0 ? "default" : "outline"}
                onClick={() => setFilterOpen((v) => !v)}
              >
                <Filter size={12} /> Фильтр {filterTags.length > 0 && `(${filterTags.length})`}
              </Button>
              <Button size="sm" variant="default" onClick={createNote}>
                <Plus size={13} /> {t("btn.new_note")}
              </Button>
            </>
          )}
        </div>
      </header>

      {filterOpen && (
        <div className="border-b border-border bg-bg-elev-1 px-6 py-3 fade-up space-y-2">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              placeholder="Поиск по заголовку и тексту…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="max-w-md"
            />
            {(filterText || filterTags.length > 0) && (
              <Button size="sm" variant="ghost" onClick={() => { setFilterText(""); setFilterTags([]); }}>
                <X size={12} /> Сброс
              </Button>
            )}
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() =>
                    setFilterTags((p) => (p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag]))
                  }
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                    filterTags.includes(tag)
                      ? "bg-accent text-accent-fg"
                      : "bg-bg-elev-2 text-fg-muted hover:bg-bg-elev-3",
                  )}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {visibleFolders.length > 0 && !filterText && filterTags.length === 0 && (
          <section className="mb-8 fade-up">
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">Folders</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {visibleFolders.map((f) => (
                <FolderCard key={f.id} folder={f} folders={folders} notes={notes} onOpen={(name) => setCurrentSection(name)} />
              ))}
            </div>
          </section>
        )}

        <section className="fade-up">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={selectAll}
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-fg-subtle hover:text-fg transition-colors"
            >
              {selected.size > 0 && selected.size === filteredNotes.length ? (
                <CheckSquare size={11} className="text-accent" />
              ) : (
                <SquareIcon size={11} />
              )}
              Files · {filteredNotes.length}
            </button>
          </div>

          {filteredNotes.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-bg-elev-1 py-12 text-center text-sm text-fg-subtle">
              {filterText || filterTags.length > 0 ? "Ничего не найдено" : "Заметок ещё нет."}
            </div>
          )}

          {viewMode === "cards" && filteredNotes.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {filteredNotes.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  folders={folders}
                  isSelected={selected.has(n.id)}
                  hasSelection={selected.size > 0}
                  onToggleSelect={() => toggleSelected(n.id)}
                />
              ))}
            </div>
          )}

          {(viewMode === "list" || viewMode === "compact") && filteredNotes.length > 0 && (
            <FileTable
              notes={filteredNotes}
              folders={folders}
              compact={viewMode === "compact"}
              selected={selected}
              onToggle={toggleSelected}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ViewModeBtn({
  mode,
  current,
  setMode,
  label,
  children,
}: {
  mode: ViewMode;
  current: ViewMode;
  setMode: (v: ViewMode) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => setMode(mode)}
      title={label}
      className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
        mode === current ? "bg-bg-elev-3 text-fg" : "text-fg-subtle hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function findRoot(folder: Folder, all: Folder[]): Folder | null {
  if (!folder.parentId) return folder;
  const parent = all.find((f) => f.id === folder.parentId);
  if (!parent) return folder;
  return findRoot(parent, all);
}

function FolderCard({
  folder,
  folders,
  notes,
  onOpen,
}: {
  folder: Folder;
  folders: Folder[];
  notes: Note[];
  onOpen: (name: string) => void;
}) {
  const folderNotes = notes.filter((n) => n.folderId === folder.id);
  const subFolders = folders.filter((f) => f.parentId === folder.id);
  const childCount = folderNotes.length + subFolders.length;

  // Up to 3 paper sheets visible behind the folder face. Always show 3 slots
  // when the folder has content so the "fan" effect reads correctly even with
  // only 1 note inside.
  const realPapers = folderNotes
    .filter((n) => n.title && n.title.trim().length > 0)
    .slice(0, 3)
    .map((n) => ({
      label: n.contentText.toLowerCase().includes("pdf") ? "PDF" : null,
    }));
  const paperSlots: { label: string | null }[] = childCount === 0
    ? []
    : realPapers.length >= 3
      ? realPapers
      : [...realPapers, ...Array(3 - realPapers.length).fill({ label: null })];

  const sourceKey = folder.source?.split(":")[0];

  return (
    <button
      onClick={() => onOpen(folder.name)}
      className="group relative flex flex-col items-center gap-3 rounded-2xl border border-transparent p-4 pb-3 text-center transition-all hover:bg-bg-elev-2/60 hover:border-border fade-up cursor-pointer"
    >
      <MacFolder papers={paperSlots} color={folder.color} sourceKey={sourceKey} />
      <div className="w-full">
        <div className="text-[15px] font-semibold text-fg truncate">{folder.name}</div>
        <div className="text-[12px] text-fg-subtle mt-0.5">
          {childCount} {childCount === 1 ? "File" : "Files"}
        </div>
      </div>
    </button>
  );
}

/**
 * Mac-style folder graphic with up to 3 paper sheets fanning out behind the
 * front face, an optional accent stripe (folder color), and small source-icon
 * badges in the bottom-left.
 *
 * The three papers fan around a centre position: index 1 is the centre paper
 * (highest z), 0 is the left-leaning paper (slightly behind), 2 is the
 * right-leaning paper (slightly behind, in front of left).
 */
function MacFolder({
  papers,
  color,
  sourceKey,
}: {
  papers: { label: string | null }[];
  color?: string;
  sourceKey?: string;
}) {
  // Tilt + translate config per slot (visual reads as a centered fan)
  const slots = [
    { tx: -22, ty: 6, rot: -10, z: 1 },
    { tx: 0, ty: 0, rot: 0, z: 3 },
    { tx: 22, ty: 6, rot: 10, z: 2 },
  ];

  return (
    <div className="relative aspect-[5/4] w-full max-w-[220px] mx-auto transition-transform group-hover:-translate-y-0.5">
      {/* Back face (with tab built-in via clip-path) */}
      <div
        className="absolute inset-x-2 top-[10%] bottom-1 rounded-xl bg-gradient-to-b from-[#3d3d3d] to-[#2a2a2a] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.10)]"
        style={{
          clipPath:
            "polygon(0 14%, 0 100%, 100% 100%, 100% 0, 48% 0, 44% 14%, 0 14%)",
        }}
      />
      {/* Optional accent line at the top of the tab */}
      {color && (
        <div
          className="absolute left-2 top-[10%] h-[3px] w-[40%] rounded-t-xl"
          style={{ background: color, opacity: 0.9, zIndex: 1 }}
        />
      )}

      {/* Papers — positioned in upper-mid, fan out from centre */}
      <div className="absolute inset-x-[18%] top-[6%] h-[50%]">
        {papers.slice(0, 3).map((p, i) => {
          const s = slots[i];
          return (
            <div
              key={i}
              className="absolute inset-0 rounded-lg bg-gradient-to-b from-white to-[#ededed] shadow-[0_4px_10px_-2px_rgba(0,0,0,0.4)] flex items-end justify-center pb-2 ring-1 ring-black/5"
              style={{
                transform: `translate(${s.tx}px, ${s.ty}px) rotate(${s.rot}deg)`,
                zIndex: s.z,
              }}
            >
              {p.label && (
                <span className="text-[10px] font-bold text-[#666] tracking-tight bg-white/70 px-1.5 py-0.5 rounded">
                  {p.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Front face — covers the bottom half, half-hiding papers */}
      <div className="absolute inset-x-2 bottom-1 top-[42%] rounded-xl bg-gradient-to-b from-[#454545] to-[#2a2a2a] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_6px_14px_-4px_rgba(0,0,0,0.5)] z-[5] overflow-hidden">
        {/* Color accent stripe — top edge */}
        {color && (
          <div
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: color, opacity: 0.9 }}
          />
        )}
        {/* Source badge — bottom-left of front face */}
        {sourceKey && SOURCE_BADGES[sourceKey] && (
          <div className="absolute left-3 bottom-3 flex -space-x-1.5">
            {SOURCE_BADGES[sourceKey].map((badge, i) => (
              <div
                key={i}
                className="h-5 w-5 rounded-full ring-2 ring-[#2a2a2a] flex items-center justify-center text-[9px] font-bold"
                style={{ background: badge.bg, color: badge.color, zIndex: 10 - i }}
                title={badge.title}
              >
                {badge.letter}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SOURCE_BADGES: Record<string, { letter: string; title: string; bg: string; color: string }[]> = {
  local: [{ letter: "L", title: "Local", bg: "#525252", color: "#fff" }],
  "google-drive": [{ letter: "G", title: "Google Drive", bg: "#4285f4", color: "#fff" }],
  notion: [{ letter: "N", title: "Notion", bg: "#0a0a0a", color: "#fff" }],
  dropbox: [{ letter: "D", title: "Dropbox", bg: "#0061ff", color: "#fff" }],
  onedrive: [{ letter: "O", title: "OneDrive", bg: "#0078d4", color: "#fff" }],
  vault: [{ letter: "V", title: "Vault", bg: "#7c3aed", color: "#fff" }],
};

function NoteCard({
  note,
  folders,
  isSelected,
  hasSelection,
  onToggleSelect,
}: {
  note: Note;
  folders: Folder[];
  isSelected: boolean;
  hasSelection: boolean;
  onToggleSelect: () => void;
}) {
  const setView = useApp((s) => s.setView);
  const locale = useApp((s) => s.locale);
  const folder = folders.find((f) => f.id === note.folderId);
  const snippet = (note.contentText || "").slice(0, 140);

  const onClick = (e: React.MouseEvent) => {
    if (hasSelection || e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault();
      onToggleSelect();
      return;
    }
    setView({ kind: "note", id: note.id });
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-2 rounded-xl border bg-bg-elev-1 p-3.5 text-left transition-all hover:shadow-md fade-up",
        isSelected ? "border-accent ring-2 ring-accent/30" : "border-border hover:border-accent",
      )}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        className={cn(
          "absolute right-2 top-2 grid h-5 w-5 place-items-center rounded border bg-bg transition-opacity",
          isSelected ? "border-accent opacity-100" : "border-border-strong opacity-0 group-hover:opacity-100",
        )}
      >
        {isSelected && <CheckSquare size={11} className="text-accent" />}
      </button>
      <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <FileText size={11} />
        <span>{folder?.name ?? "Root"}</span>
        <span>·</span>
        <span>{formatDistanceToNow(note.updatedAt, { addSuffix: true, locale: locale === "ru" ? ru : enUS })}</span>
      </div>
      <div className="text-[14px] font-semibold leading-snug text-fg line-clamp-2" style={{ fontFamily: "var(--font-serif)" }}>
        {note.title || "Без названия"}
      </div>
      {snippet && (
        <p className="text-[12.5px] leading-relaxed text-fg-muted line-clamp-3">{snippet}</p>
      )}
      <div className="mt-1 flex flex-wrap gap-1">
        {note.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
            #{tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function FileTable({
  notes,
  folders,
  compact,
  selected,
  onToggle,
}: {
  notes: Note[];
  folders: Folder[];
  compact: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const setView = useApp((s) => s.setView);
  const locale = useApp((s) => s.locale);
  const t = useT();
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-elev-1">
      <div className="grid grid-cols-[32px_1.5fr_1fr_120px_80px_80px] border-b border-border bg-bg-elev-2 px-4 py-2 text-[10px] uppercase tracking-wider text-fg-subtle font-semibold">
        <div />
        <div>{t("common.name")}</div>
        <div>{t("common.added_by")}</div>
        <div>{t("common.date_added")}</div>
        <div>{t("common.size")}</div>
        <div>{t("common.source")}</div>
      </div>
      {notes.map((n) => {
        const folder = folders.find((f) => f.id === n.folderId);
        const isSelected = selected.has(n.id);
        return (
          <div
            key={n.id}
            onClick={(e) => {
              if (selected.size > 0 || e.metaKey || e.ctrlKey || e.shiftKey) {
                onToggle(n.id);
                return;
              }
              setView({ kind: "note", id: n.id });
            }}
            className={cn(
              "grid grid-cols-[32px_1.5fr_1fr_120px_80px_80px] border-b border-border last:border-0 px-4 cursor-pointer transition-colors",
              compact ? "py-1.5" : "py-2.5",
              isSelected ? "bg-accent-soft/30" : "hover:bg-bg-elev-2",
            )}
          >
            <div className="flex items-center" onClick={(e) => { e.stopPropagation(); onToggle(n.id); }}>
              <div className={cn("grid h-4 w-4 place-items-center rounded border", isSelected ? "border-accent bg-accent" : "border-border-strong")}>
                {isSelected && <CheckSquare size={10} className="text-accent-fg" />}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-fg truncate">
              <FileText size={13} className="text-fg-subtle shrink-0" />
              <span className="truncate font-medium">{n.title || "—"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-fg-muted truncate">
              <div className="h-4 w-4 rounded-full bg-accent-soft text-[8px] text-accent flex items-center justify-center font-semibold">M</div>
              {n.authorId ?? "me@local"}
            </div>
            <div className="text-xs text-fg-muted">
              {formatDistanceToNow(n.createdAt, { addSuffix: false, locale: locale === "ru" ? ru : enUS })}
            </div>
            <div className="text-xs text-fg-muted">{formatBytes(n.contentText.length * 2)}</div>
            <div className="flex items-center gap-1 text-xs text-fg-muted">
              {SOURCE_ICONS[folder?.source ?? "local"] ?? SOURCE_ICONS.local}
              <span className="capitalize">{folder?.source?.split(":")[0] ?? "local"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
