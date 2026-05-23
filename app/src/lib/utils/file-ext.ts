/**
 * Detect a primary file-extension chip for a note based on its embedded media.
 *
 * Looks at the HTML content for video/audio/PDF/iframe and returns the
 * dominant extension (MP4, MOV, MP3, PDF, …) — used to render a label chip
 * on the right side of file rows.
 */
export function detectNoteExtension(html: string): string | null {
  if (!html) return null;
  // Try data: MIME first
  const dataMime = html.match(/<(?:video|audio|iframe|img)[^>]+src=["']data:([^;]+);/);
  if (dataMime) {
    const mime = dataMime[1];
    const ext = MIME_TO_EXT[mime];
    if (ext) return ext.toUpperCase();
    const sub = mime.split("/")[1]?.toUpperCase();
    if (sub) return sub.slice(0, 4);
  }
  // Inspect inner tags
  if (/<iframe[^>]+src=["'][^"']*\.pdf/i.test(html) || /<iframe[^>]+src=["']data:application\/pdf/i.test(html)) return "PDF";
  if (/<video/i.test(html)) return "MP4";
  if (/<audio/i.test(html)) return "MP3";
  // Look at first explicit attachment link
  const link = html.match(/<a[^>]+download=["']([^"']+)["']/i);
  if (link) {
    const ext = link[1].split(".").pop();
    if (ext) return ext.toUpperCase();
  }
  return null;
}

const MIME_TO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/json": "json",
};

const COLOR_BY_EXT: Record<string, string> = {
  MP4: "#a855f7",
  MOV: "#a855f7",
  WEBM: "#a855f7",
  MP3: "#ec4899",
  WAV: "#ec4899",
  OGG: "#ec4899",
  M4A: "#ec4899",
  PNG: "#3b82f6",
  JPG: "#3b82f6",
  JPEG: "#3b82f6",
  GIF: "#3b82f6",
  WEBP: "#3b82f6",
  SVG: "#3b82f6",
  PDF: "#ef4444",
  DOCX: "#0ea5e9",
  XLSX: "#10b981",
  PPTX: "#f59e0b",
  TXT: "#64748b",
  MD: "#64748b",
  CSV: "#10b981",
  JSON: "#f59e0b",
};

export function colorForExtension(ext: string): string {
  return COLOR_BY_EXT[ext.toUpperCase()] ?? "#64748b";
}
