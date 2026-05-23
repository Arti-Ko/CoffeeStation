"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Download,
  ExternalLink,
  Save,
  Loader2,
  X,
  ImageIcon,
  FileVideo,
  FileAudio,
  FileText,
  FileSpreadsheet,
  File as FileGeneric,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatBytes } from "@/lib/utils";
import {
  fileAssetUrl,
  readBinaryFile,
  readTextFile,
  writeBinaryFile,
  writeTextFile,
  type VaultFileEntry,
} from "@/lib/desktop/vault-files";

interface ViewerProps {
  file: VaultFileEntry;
  onClose: () => void;
  onOpenInSystem: () => void;
}

/**
 * Universal in-app file viewer.
 *
 * Read-only viewers:
 *   image  · <img>
 *   video  · <video controls>
 *   audio  · <audio controls>
 *   pdf    · <iframe> (browser PDF renderer)
 *   docx   · mammoth → HTML preview (no edit; opens externally for editing)
 *   other  · just metadata + "Open in system"
 *
 * Editable viewers:
 *   text/markdown/csv/json/code · plain text editor with save-back
 *   xlsx/xls                    · SheetJS spreadsheet editor with save-back
 *
 * All viewers stream from disk via Tauri's asset:// protocol — no need to
 * load a 500 MB video into memory.
 */
export function FileViewer({ file, onClose, onOpenInSystem }: ViewerProps) {
  const meta = META[file.kind];
  const Icon = meta.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl border border-border bg-bg-elev-1 shadow-2xl fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Icon size={14} style={{ color: meta.color }} />
            <span className="truncate text-[13px] font-medium">{file.name}</span>
            <span className="shrink-0 text-[11px] text-fg-subtle">
              {formatBytes(file.size)} · {file.relative}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="outline" onClick={onOpenInSystem}>
              <ExternalLink size={11} /> Открыть в системе
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X size={13} />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <ContentSwitch file={file} />
        </div>
      </div>
    </div>
  );
}

function ContentSwitch({ file }: { file: VaultFileEntry }) {
  switch (file.kind) {
    case "image":
      return <ImageView file={file} />;
    case "video":
      return <VideoView file={file} />;
    case "audio":
      return <AudioView file={file} />;
    case "pdf":
      return <PdfView file={file} />;
    case "text":
    case "code":
    case "note":
      return <TextEditor file={file} />;
    case "sheet":
      return <SheetEditor file={file} />;
    case "doc":
      return <DocxPreview file={file} />;
    default:
      return <GenericFallback file={file} />;
  }
}

function ImageView({ file }: { file: VaultFileEntry }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fileAssetUrl(file.path).then(setUrl);
  }, [file.path]);
  if (!url) return <Spinner />;
  return (
    <div className="flex flex-1 items-center justify-center overflow-auto bg-bg-elev-2 p-4">
      <img src={url} alt={file.name} className="max-h-full max-w-full rounded-md object-contain" />
    </div>
  );
}

function VideoView({ file }: { file: VaultFileEntry }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fileAssetUrl(file.path).then(setUrl);
  }, [file.path]);
  if (!url) return <Spinner />;
  return (
    <div className="flex flex-1 items-center justify-center bg-black p-4">
      <video
        src={url}
        controls
        autoPlay
        className="max-h-full max-w-full rounded-md"
        style={{ maxHeight: "80vh" }}
      />
    </div>
  );
}

function AudioView({ file }: { file: VaultFileEntry }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fileAssetUrl(file.path).then(setUrl);
  }, [file.path]);
  if (!url) return <Spinner />;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-12">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent-soft text-accent">
        <FileAudio size={48} />
      </div>
      <div className="text-center">
        <div className="text-[15px] font-semibold">{file.name}</div>
        <div className="text-[12px] text-fg-subtle">{file.ext.toUpperCase()} · {formatBytes(file.size)}</div>
      </div>
      <audio src={url} controls className="w-full max-w-md" />
    </div>
  );
}

function PdfView({ file }: { file: VaultFileEntry }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fileAssetUrl(file.path).then(setUrl);
  }, [file.path]);
  if (!url) return <Spinner />;
  return <iframe src={url} className="h-[80vh] w-full rounded-md bg-white" />;
}

function TextEditor({ file }: { file: VaultFileEntry }) {
  const [content, setContent] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    readTextFile(file.path).then((c) => {
      setContent(c);
      setDirty(false);
    }).catch((e) => {
      toast.error("Не удалось прочитать файл", { description: String(e) });
      setContent("");
    });
  }, [file.path]);

  const save = async () => {
    if (content == null) return;
    setSaving(true);
    try {
      await writeTextFile(file.path, content);
      setDirty(false);
      toast.success("Сохранено");
    } catch (e) {
      toast.error("Не удалось сохранить", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  // Cmd+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty && !saving) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, saving, content]); // eslint-disable-line react-hooks/exhaustive-deps

  if (content == null) return <Spinner />;
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-bg-elev-2 px-3 py-1.5 text-[11px]">
        <span className="text-fg-muted">{dirty ? "Изменён · не сохранён" : "Сохранён"}</span>
        <span className="text-fg-subtle">·</span>
        <span className="text-fg-subtle">{file.ext.toUpperCase()}</span>
        <span className="text-fg-subtle">·</span>
        <span className="text-fg-subtle">{content.split("\n").length} строк</span>
        <Button
          size="sm"
          variant={dirty ? "default" : "ghost"}
          onClick={save}
          disabled={!dirty || saving}
          className="ml-auto"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
          Сохранить
          <kbd className="ml-1 rounded bg-bg-elev-3 px-1 py-0.5 text-[9px] font-mono">⌘S</kbd>
        </Button>
      </div>
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
        }}
        className="flex-1 resize-none bg-bg p-4 font-mono text-[13px] leading-relaxed outline-none"
        spellCheck={false}
      />
    </div>
  );
}

function SheetEditor({ file }: { file: VaultFileEntry }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [sheetName, setSheetName] = useState("Sheet1");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const XLSX = await import("xlsx");
        const data = await readBinaryFile(file.path);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.SheetNames[0];
        setSheetName(sheet);
        const ws = wb.Sheets[sheet];
        const json = XLSX.utils.sheet_to_json<string[]>(ws, {
          header: 1,
          defval: "",
          raw: false,
        });
        setRows(json as string[][]);
      } catch (e) {
        toast.error("Не удалось открыть таблицу", { description: String(e) });
        setRows([[]]);
      }
    })();
  }, [file.path]);

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const out = XLSX.write(wb, { type: "array", bookType: file.ext as never });
      await writeBinaryFile(file.path, new Uint8Array(out));
      setDirty(false);
      toast.success("Таблица сохранена");
    } catch (e) {
      toast.error("Не удалось сохранить", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const updateCell = (r: number, c: number, v: string) => {
    if (!rows) return;
    const next = rows.map((row) => [...row]);
    while (next.length <= r) next.push([]);
    while (next[r].length <= c) next[r].push("");
    next[r][c] = v;
    setRows(next);
    setDirty(true);
  };

  const addRow = () => {
    if (!rows) return;
    const width = Math.max(rows[0]?.length ?? 0, 1);
    setRows([...rows, Array(width).fill("")]);
    setDirty(true);
  };

  const addCol = () => {
    if (!rows) return;
    setRows(rows.map((r) => [...r, ""]));
    setDirty(true);
  };

  if (!rows) return <Spinner />;
  const cols = Math.max(...rows.map((r) => r.length), 1);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-bg-elev-2 px-3 py-1.5 text-[11px]">
        <span className="text-fg-muted">{sheetName}</span>
        <span className="text-fg-subtle">·</span>
        <span className="text-fg-subtle">{rows.length}×{cols}</span>
        <Button size="sm" variant="ghost" onClick={addRow}>+ Строка</Button>
        <Button size="sm" variant="ghost" onClick={addCol}>+ Колонка</Button>
        <Button
          size="sm"
          variant={dirty ? "default" : "ghost"}
          onClick={save}
          disabled={!dirty || saving}
          className="ml-auto"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
          Сохранить
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-10 w-12 border border-border bg-bg-elev-2 text-fg-subtle"></th>
              {Array.from({ length: cols }, (_, i) => (
                <th
                  key={i}
                  className="sticky top-0 z-10 min-w-[100px] border border-border bg-bg-elev-2 px-2 py-1 text-fg-subtle font-medium"
                >
                  {colLabel(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                <th className="sticky left-0 w-12 border border-border bg-bg-elev-2 px-2 py-1 text-fg-subtle text-[10px]">
                  {r + 1}
                </th>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className="border border-border p-0">
                    <input
                      value={row[c] ?? ""}
                      onChange={(e) => updateCell(r, c, e.target.value)}
                      className="w-full bg-transparent px-2 py-1 outline-none focus:bg-accent-soft/40"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function colLabel(n: number): string {
  let s = "";
  let i = n;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

function DocxPreview({ file }: { file: VaultFileEntry }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const mammoth = (await import("mammoth")).default;
        const bytes = await readBinaryFile(file.path);
        const copy = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(copy).set(bytes);
        const result = await mammoth.convertToHtml({ arrayBuffer: copy });
        setHtml(result.value);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [file.path]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-fg-muted text-sm">
        <p>Не удалось показать DOCX в приложении.</p>
        <p className="text-[11px] text-fg-subtle">Откройте в системной программе для редактирования.</p>
      </div>
    );
  }
  if (!html) return <Spinner />;

  return (
    <div className="flex-1 overflow-auto bg-white p-12">
      <div
        className="docx-preview mx-auto max-w-3xl text-[#222] [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2 [&_p]:my-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_table]:border-collapse [&_table_td]:border [&_table_td]:border-gray-300 [&_table_td]:p-2 [&_table_th]:border [&_table_th]:border-gray-300 [&_table_th]:p-2 [&_table_th]:bg-gray-100"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <div className="mx-auto mt-6 max-w-3xl text-center text-[11px] text-gray-500">
        ⚠ Превью DOCX read-only. Для редактирования нажмите «Открыть в системе» (Word / Pages).
      </div>
    </div>
  );
}

function GenericFallback({ file }: { file: VaultFileEntry }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center">
      <FileGeneric size={56} className="text-fg-subtle opacity-50" />
      <div>
        <div className="text-[15px] font-semibold">{file.name}</div>
        <div className="text-[12px] text-fg-subtle mt-1">
          {file.ext.toUpperCase()} · {formatBytes(file.size)}
        </div>
      </div>
      <p className="max-w-md text-[12px] text-fg-muted">
        Этот формат не поддерживается во встроенном просмотрщике. Откройте в системной программе.
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center text-fg-subtle">
      <Loader2 size={24} className="animate-spin" />
    </div>
  );
}

const META: Record<
  VaultFileEntry["kind"],
  { color: string; icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }> }
> = {
  image: { color: "#3b82f6", icon: ImageIcon },
  video: { color: "#a855f7", icon: FileVideo },
  audio: { color: "#ec4899", icon: FileAudio },
  pdf: { color: "#ef4444", icon: FileText },
  doc: { color: "#0ea5e9", icon: FileText },
  sheet: { color: "#10b981", icon: FileSpreadsheet },
  text: { color: "#64748b", icon: FileText },
  code: { color: "#f59e0b", icon: FileText },
  note: { color: "#64748b", icon: FileText },
  other: { color: "#94a3b8", icon: FileGeneric },
};
