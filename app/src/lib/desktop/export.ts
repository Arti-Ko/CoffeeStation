"use client";

import type { Note } from "@/lib/db/schema";
import TurndownService from "turndown";
import { isDesktop } from "./runtime";
import { getVaultPaths } from "./paths";

const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
td.addRule("wikiLink", {
  filter: (node) => node.nodeName === "SPAN" && (node as HTMLElement).getAttribute("data-type") === "wiki-link",
  replacement: (_content, node) => {
    const t = (node as HTMLElement).getAttribute("data-target") ?? (node as HTMLElement).textContent ?? "";
    return `[[${t}]]`;
  },
});
td.addRule("hashtag", {
  filter: (node) => node.nodeName === "SPAN" && (node as HTMLElement).getAttribute("data-type") === "hashtag",
  replacement: (_content, node) => {
    const t = (node as HTMLElement).getAttribute("data-tag") ?? (node as HTMLElement).textContent ?? "";
    return `#${t}`;
  },
});

function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

export async function exportNoteToHtml(note: Note): Promise<string | null> {
  const styles = await getStandaloneStyles();
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(note.title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${styles}</style>
</head>
<body>
<article>
  <header>
    <h1>${escapeHtml(note.title)}</h1>
    <p class="meta">Exported from CoffeeStation · ${new Date().toLocaleString()}</p>
  </header>
  <main>${note.content}</main>
</article>
</body>
</html>`;
  return saveText(html, `${safeFilename(note.title)}.html`, [{ name: "HTML", extensions: ["html"] }]);
}

export async function exportNoteToMarkdown(note: Note): Promise<string | null> {
  const md = noteToMarkdown(note);
  return saveText(md, `${safeFilename(note.title)}.md`, [{ name: "Markdown", extensions: ["md"] }]);
}

export function noteToMarkdown(note: Note): string {
  return `# ${note.title}\n\n${td.turndown(note.content)}`;
}

async function saveText(
  content: string,
  defaultName: string,
  filters: { name: string; extensions: string[] }[],
): Promise<string | null> {
  if (isDesktop()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile, mkdir, exists } = await import("@tauri-apps/plugin-fs");
    const paths = await getVaultPaths();
    const baseDir = paths.exports || undefined;
    if (baseDir && !(await exists(baseDir))) {
      await mkdir(baseDir, { recursive: true });
    }
    const defaultPath = baseDir ? `${baseDir}/${defaultName}` : defaultName;
    const path = await save({ defaultPath, filters });
    if (!path) return null;
    await writeTextFile(path, content);
    return path;
  }
  // Web fallback: trigger browser download
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return defaultName;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getStandaloneStyles(): Promise<string> {
  return `
:root { color-scheme: light dark; --bg: #ffffff; --fg: #18181b; --muted: #71717a; --border: #e4e4e7; --accent: #f97316; }
@media (prefers-color-scheme: dark) { :root { --bg: #0a0a0a; --fg: #fafafa; --muted: #a1a1aa; --border: #27272a; } }
* { box-sizing: border-box; }
body { font-family: -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--fg); margin: 0; line-height: 1.7; }
article { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
header { border-bottom: 1px solid var(--border); padding-bottom: 20px; margin-bottom: 28px; }
h1 { font-family: 'Iowan Old Style', Charter, Georgia, serif; font-size: 2.5rem; margin: 0; letter-spacing: -0.02em; }
h2 { font-family: 'Iowan Old Style', Charter, Georgia, serif; font-size: 1.6rem; margin-top: 2em; }
h3 { font-size: 1.25rem; margin-top: 1.6em; }
p, li { font-size: 1rem; }
.meta { color: var(--muted); font-size: 0.85rem; }
blockquote { border-left: 3px solid var(--accent); padding-left: 1rem; color: var(--muted); margin: 1.5em 0; }
code { background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 0.9em; }
pre { background: rgba(0,0,0,0.06); padding: 18px; border-radius: 10px; overflow-x: auto; }
pre code { background: transparent; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 1.5em 0; }
th, td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
th { background: rgba(0,0,0,0.04); font-weight: 600; }
img { max-width: 100%; height: auto; }
[data-type="wiki-link"] { color: var(--accent); border-bottom: 1px dashed var(--accent); font-weight: 500; }
[data-type="hashtag"] { color: var(--accent); background: rgba(249,115,22,0.1); padding: 1px 6px; border-radius: 4px; font-size: 0.875em; font-weight: 500; }
`;
}
