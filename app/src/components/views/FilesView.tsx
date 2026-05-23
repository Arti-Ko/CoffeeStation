"use client";

import { type Note } from "@/lib/db/schema";
import { useActiveNotes } from "@/lib/db/hooks";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ImageIcon,
  FileVideo,
  FileAudio,
  FileText,
  FileSpreadsheet,
  File as FileGeneric,
  Search,
  Download,
  ExternalLink,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { isDesktop } from "@/lib/desktop/runtime";
import { toast } from "sonner";
import { scanVaultFiles, type VaultFileEntry } from "@/lib/desktop/vault-files";
import { getVaultPaths } from "@/lib/desktop/paths";
import { FileViewer } from "@/components/files/FileViewer";
import { colorForExtension } from "@/lib/utils/file-ext";

type FileKind = "image" | "video" | "audio" | "pdf" | "doc" | "sheet" | "text" | "code" | "other";

interface FileEntry {
  id: string;
  name: string;
  kind: FileKind;
  mime: string;
  src: string;
  size: number;
  noteId: string;
  noteTitle: string;
  /** Present when this entry came from disk (not from a note's HTML). */
  vaultFile?: VaultFileEntry;
}

function mapVaultKind(k: VaultFileEntry["kind"]): FileKind {
  switch (k) {
    case "image": return "image";
    case "video": return "video";
    case "audio": return "audio";
    case "pdf": return "pdf";
    case "doc": return "doc";
    case "sheet": return "sheet";
    case "text": return "text";
    case "code": return "code";
    default: return "other";
  }
}

const KIND_META: Record<FileKind, { label: string; icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>; color: string }> = {
  image: { label: "Изображения", icon: ImageIcon, color: "#3b82f6" },
  video: { label: "Видео", icon: FileVideo, color: "#a855f7" },
  audio: { label: "Аудио", icon: FileAudio, color: "#ec4899" },
  pdf: { label: "PDF", icon: FileText, color: "#ef4444" },
  doc: { label: "Документы", icon: FileText, color: "#0ea5e9" },
  sheet: { label: "Таблицы", icon: FileSpreadsheet, color: "#10b981" },
  text: { label: "Текст", icon: FileText, color: "#64748b" },
  code: { label: "Код", icon: FileText, color: "#f59e0b" },
  other: { label: "Прочее", icon: FileGeneric, color: "#94a3b8" },
};

const FILTERS: { kind: FileKind | "all"; label: string }[] = [
  { kind: "all", label: "Все" },
  { kind: "image", label: "Изображения" },
  { kind: "video", label: "Видео" },
  { kind: "audio", label: "Аудио" },
  { kind: "pdf", label: "PDF" },
  { kind: "doc", label: "Документы" },
  { kind: "sheet", label: "Таблицы" },
  { kind: "text", label: "Текст" },
  { kind: "other", label: "Прочее" },
];

export function FilesView() {
  const notes = useActiveNotes();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FileKind | "all">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const [vaultFiles, setVaultFiles] = useState<VaultFileEntry[]>([]);
  const [vaultPreview, setVaultPreview] = useState<VaultFileEntry | null>(null);

  // Scan vault folder for standalone files (mp4, pdf, png …)
  useEffect(() => {
    (async () => {
      if (!isDesktop()) return;
      const paths = await getVaultPaths();
      if (!paths.vaultRoot) return;
      try {
        const list = await scanVaultFiles(paths.vaultRoot);
        // Exclude .md files (they're already represented as notes)
        setVaultFiles(list.filter((f) => f.kind !== "note"));
      } catch {
        // ignore — vault may not exist yet
      }
    })();
  }, []);

  const files = useMemo(() => {
    const fromNotes = extractFiles(notes);
    const fromVault: FileEntry[] = vaultFiles.map((v) => ({
      id: "vault:" + v.path,
      name: v.name,
      kind: mapVaultKind(v.kind),
      mime: "",
      src: v.path, // absolute path — viewers convert via asset://
      size: v.size,
      noteId: "",
      noteTitle: v.relative,
      vaultFile: v,
    }));
    return [...fromVault, ...fromNotes];
  }, [notes, vaultFiles]);

  const visible = useMemo(() => {
    let r = files;
    if (filter !== "all") r = r.filter((f) => f.kind === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter((f) => f.name.toLowerCase().includes(q) || f.noteTitle.toLowerCase().includes(q));
    }
    return r;
  }, [files, filter, query]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    files.forEach((f) => map.set(f.kind, (map.get(f.kind) ?? 0) + 1));
    return map;
  }, [files]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
            Все файлы
          </h2>
          <p className="text-xs text-fg-subtle mt-0.5">
            {files.length} файлов · из {notes.length} заметок · {filter !== "all" && `показано ${visible.length}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-md border border-border bg-bg-elev-1 p-0.5">
            <button
              onClick={() => setView("grid")}
              className={cn("flex h-6 w-6 items-center justify-center rounded", view === "grid" ? "bg-bg-elev-3 text-fg" : "text-fg-subtle")}
            >
              <LayoutGrid size={12} />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn("flex h-6 w-6 items-center justify-center rounded", view === "list" ? "bg-bg-elev-3 text-fg" : "text-fg-subtle")}
            >
              <ListIcon size={12} />
            </button>
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-bg-elev-1 px-6 py-2 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <Input
              placeholder="Поиск по имени файла или заметке…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-7"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const count = f.kind === "all" ? files.length : counts.get(f.kind) ?? 0;
            return (
              <button
                key={f.kind}
                onClick={() => setFilter(f.kind)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors flex items-center gap-1",
                  filter === f.kind ? "bg-accent text-accent-fg" : "bg-bg-elev-2 text-fg-muted hover:bg-bg-elev-3",
                )}
              >
                {f.label}
                <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-bg-elev-1 py-16 text-center text-sm text-fg-subtle">
            Файлов не найдено. Перетащите файлы в редактор заметки — они появятся здесь.
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {visible.map((f) => (
              <FileCard
                key={f.id}
                file={f}
                onPreview={() => f.vaultFile ? setVaultPreview(f.vaultFile) : setPreview(f)}
              />
            ))}
          </div>
        ) : (
          <FileTable
            files={visible}
            onPreview={(f) => f.vaultFile ? setVaultPreview(f.vaultFile) : setPreview(f)}
          />
        )}
      </div>

      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
      {vaultPreview && (
        <FileViewer
          file={vaultPreview}
          onClose={() => setVaultPreview(null)}
          onOpenInSystem={() => openInDefaultPath(vaultPreview.path)}
        />
      )}
    </div>
  );
}

function FileCard({ file, onPreview }: { file: FileEntry; onPreview: () => void }) {
  const meta = KIND_META[file.kind];
  const Icon = meta.icon;
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);

  useEffect(() => {
    if (file.vaultFile && (file.kind === "image" || file.kind === "video")) {
      import("@/lib/desktop/vault-files").then((m) => m.fileAssetUrl(file.src)).then(setThumbSrc);
    } else if (!file.vaultFile) {
      setThumbSrc(file.src);
    }
  }, [file]);

  const ext = file.vaultFile?.ext ?? file.name.split(".").pop()?.toLowerCase() ?? "";
  const extColor = ext ? colorForExtension(ext) : meta.color;

  return (
    <button
      onClick={onPreview}
      onDoubleClick={file.vaultFile ? () => openInDefaultPath(file.vaultFile!.path) : openInDefault.bind(null, file)}
      className="group flex flex-col gap-2 rounded-xl border border-border bg-bg-elev-1 p-2 text-left transition-all hover:border-accent hover:shadow-md fade-up overflow-hidden"
    >
      <div className="aspect-video w-full rounded-md bg-bg-elev-2 overflow-hidden flex items-center justify-center relative">
        {file.kind === "image" && thumbSrc ? (
          <img src={thumbSrc} alt={file.name} className="h-full w-full object-cover" loading="lazy" />
        ) : file.kind === "video" && thumbSrc ? (
          <video src={thumbSrc} className="h-full w-full object-cover" muted preload="metadata" />
        ) : (
          <Icon size={28} style={{ color: meta.color, opacity: 0.6 }} />
        )}
        {ext && (
          <span
            className="absolute right-1.5 bottom-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
            style={{ background: extColor + "DD", color: "#fff" }}
          >
            {ext}
          </span>
        )}
      </div>
      <div>
        <div className="text-[12px] font-medium text-fg truncate">{file.name}</div>
        <div className="text-[10px] text-fg-subtle mt-0.5 flex items-center gap-1">
          <span style={{ color: meta.color }}>●</span>
          <span className="truncate">{file.noteTitle}</span>
        </div>
      </div>
    </button>
  );
}

function FileTable({ files, onPreview }: { files: FileEntry[]; onPreview: (f: FileEntry) => void }) {
  const setView = useApp((s) => s.setView);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-elev-1">
      <div className="grid grid-cols-[32px_2fr_1fr_120px_80px_80px] border-b border-border bg-bg-elev-2 px-4 py-2 text-[10px] uppercase tracking-wider text-fg-subtle font-semibold">
        <div />
        <div>Имя</div>
        <div>Заметка</div>
        <div>Тип</div>
        <div>Размер</div>
        <div></div>
      </div>
      {files.map((f) => {
        const meta = KIND_META[f.kind];
        const Icon = meta.icon;
        return (
          <div
            key={f.id}
            onClick={() => onPreview(f)}
            onDoubleClick={() => openInDefault(f)}
            className="grid grid-cols-[32px_2fr_1fr_120px_80px_80px] border-b border-border last:border-0 px-4 py-2 cursor-pointer hover:bg-bg-elev-2"
          >
            <Icon size={14} style={{ color: meta.color }} />
            <div className="text-[13px] truncate font-medium">{f.name}</div>
            <button
              onClick={(e) => { e.stopPropagation(); setView({ kind: "note", id: f.noteId }); }}
              className="text-[12px] text-fg-muted hover:text-accent truncate text-left"
            >
              {f.noteTitle}
            </button>
            <div className="text-[12px] text-fg-muted">{meta.label}</div>
            <div className="text-[12px] text-fg-muted">{formatBytes(f.size)}</div>
            <div className="flex items-center gap-1 justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); openInDefault(f); }}
                className="text-fg-subtle hover:text-fg p-1 rounded"
                title="Открыть в системной программе"
              >
                <ExternalLink size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); downloadFile(f); }}
                className="text-fg-subtle hover:text-fg p-1 rounded"
                title="Скачать"
              >
                <Download size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FilePreview({ file, onClose }: { file: FileEntry; onClose: () => void }) {
  const meta = KIND_META[file.kind];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="max-w-[90vw] max-h-[90vh] rounded-xl border border-border bg-bg-elev-1 shadow-2xl flex flex-col fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <meta.icon size={14} style={{ color: meta.color }} />
            <span className="text-[13px] font-medium">{file.name}</span>
            <span className="text-[11px] text-fg-subtle">из «{file.noteTitle}»</span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => openInDefault(file)}>
              <ExternalLink size={11} /> Открыть в системе
            </Button>
            <Button size="sm" variant="outline" onClick={() => downloadFile(file)}>
              <Download size={11} /> Скачать
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 min-w-[400px]">
          <FileContent file={file} />
        </div>
      </div>
    </div>
  );
}

function FileContent({ file }: { file: FileEntry }) {
  if (file.kind === "image") {
    return <img src={file.src} alt={file.name} className="max-w-full max-h-[70vh] mx-auto rounded-lg" />;
  }
  if (file.kind === "video") {
    return <video src={file.src} controls autoPlay className="max-w-full max-h-[70vh] mx-auto rounded-lg" />;
  }
  if (file.kind === "audio") {
    return (
      <div className="py-8 flex flex-col items-center gap-4">
        <FileAudio size={64} className="text-accent opacity-60" />
        <audio src={file.src} controls className="w-96" />
      </div>
    );
  }
  if (file.kind === "pdf") {
    return <iframe src={file.src} className="w-[80vw] h-[70vh] rounded-lg border border-border" />;
  }
  // doc/sheet/text/code/other
  return (
    <div className="py-12 flex flex-col items-center gap-3 text-fg-muted">
      <p className="text-sm">Просмотр в браузере не поддерживается для этого формата.</p>
      <Button variant="default" onClick={() => openInDefault(file)}>
        <ExternalLink size={12} /> Открыть в системной программе
      </Button>
    </div>
  );
}

async function openInDefaultPath(path: string) {
  if (!isDesktop()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_in_finder", { path });
  } catch (e) {
    toast.error("Не удалось открыть: " + String(e));
  }
}

async function openInDefault(file: FileEntry) {
  if (!isDesktop()) {
    downloadFile(file);
    return;
  }
  try {
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const { tempDir, join } = await import("@tauri-apps/api/path");
    const { invoke } = await import("@tauri-apps/api/core");
    const tmp = await tempDir();
    const filename = file.name.replace(/[\\/:*?"<>|]/g, "_");
    const fullPath = await join(tmp, "coffeestation-open-" + Date.now() + "-" + filename);
    const dataUrl = file.src;
    const base64 = dataUrl.split(",")[1] ?? "";
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    await writeFile(fullPath, bytes);
    await invoke("open_in_finder", { path: fullPath });
    toast.success("Открыт в системной программе");
  } catch (e) {
    toast.error("Не удалось открыть: " + String(e));
  }
}

function downloadFile(file: FileEntry) {
  const a = document.createElement("a");
  a.href = file.src;
  a.download = file.name;
  a.click();
}

/**
 * Extracts every embedded asset reference from every note's HTML.
 * Looks for: <img src=…>, <video src=…>, <audio src=…>, <iframe src=…>,
 * and <a download=…>.
 */
function extractFiles(notes: Note[]): FileEntry[] {
  if (typeof DOMParser === "undefined") return [];
  const parser = new DOMParser();
  const out: FileEntry[] = [];
  const seen = new Set<string>();

  notes.forEach((note) => {
    if (!note.content) return;
    const doc = parser.parseFromString(note.content, "text/html");
    const queries: { tag: string; kindFor: (mime: string, src: string) => FileKind }[] = [
      { tag: "img", kindFor: () => "image" },
      { tag: "video", kindFor: () => "video" },
      { tag: "audio", kindFor: () => "audio" },
      { tag: "iframe", kindFor: () => "pdf" }, // we only insert iframes for PDFs
    ];

    for (const q of queries) {
      doc.querySelectorAll(q.tag).forEach((el) => {
        const src = (el as HTMLElement).getAttribute("src");
        if (!src) return;
        const key = note.id + "::" + src.slice(0, 80);
        if (seen.has(key)) return;
        seen.add(key);
        const mime = mimeOf(src);
        const kind = q.kindFor(mime, src);
        const name = (el as HTMLElement).getAttribute("alt") || (el as HTMLElement).getAttribute("data-name") || guessName(src, kind);
        out.push({
          id: key,
          name,
          kind,
          mime,
          src,
          size: estimateBytes(src),
          noteId: note.id,
          noteTitle: note.title || "Untitled",
        });
      });
    }

    doc.querySelectorAll("a[download]").forEach((el) => {
      const href = (el as HTMLElement).getAttribute("href");
      if (!href) return;
      const name = (el as HTMLElement).getAttribute("download") || el.textContent || "attachment";
      const key = note.id + "::" + href.slice(0, 80);
      if (seen.has(key)) return;
      seen.add(key);
      const mime = mimeOf(href);
      const kind = kindFromMime(mime);
      out.push({
        id: key,
        name,
        kind,
        mime,
        src: href,
        size: estimateBytes(href),
        noteId: note.id,
        noteTitle: note.title || "Untitled",
      });
    });
  });

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function mimeOf(src: string): string {
  if (src.startsWith("data:")) {
    const m = src.match(/^data:([^;]+)/);
    return m?.[1] ?? "application/octet-stream";
  }
  const ext = src.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

const EXT_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword", xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint",
  txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
};

function kindFromMime(mime: string): FileKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (/wordprocessingml|msword/.test(mime)) return "doc";
  if (/spreadsheetml|ms-excel/.test(mime)) return "sheet";
  if (/text\/(plain|markdown|csv)/.test(mime)) return "text";
  if (mime === "application/json") return "code";
  return "other";
}

function guessName(src: string, kind: FileKind): string {
  if (src.startsWith("data:")) {
    const ext = (src.match(/data:[^/]+\/([\w+-]+)/) ?? [])[1] ?? "bin";
    return `${kind}-${src.slice(-6, -2)}.${ext.split("+")[0]}`;
  }
  return src.split("/").pop() || "file";
}

function estimateBytes(src: string): number {
  if (src.startsWith("data:")) {
    const b64 = src.split(",")[1] ?? "";
    return Math.floor((b64.length * 3) / 4);
  }
  return src.length;
}
