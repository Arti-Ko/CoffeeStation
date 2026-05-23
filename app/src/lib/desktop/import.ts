"use client";

import { db, type Folder, type Note } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { marked } from "marked";
import matter from "gray-matter";
import { isDesktop } from "./runtime";
import { extractHashtags, extractWikiLinks, plainText } from "@/lib/utils";

interface ScannedFile {
  path: string;
  relative: string;
  folder: string;
  name: string;
  content: string;
  modified: number;
}

export interface ImportResult {
  files: number;
  notes: number;
  folders: number;
  skipped: number;
  errors: string[];
}

/**
 * Configure marked once with Obsidian-compatible behaviour:
 *  - GFM tables / task lists / strikethrough
 *  - Smartypants disabled (preserve user quotes verbatim)
 *  - `breaks: true` so single `\n` becomes <br> like Obsidian
 */
marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Imports every .md/.markdown/.txt file under `rootPath` into the local IndexedDB.
 *
 * - Folder hierarchy on disk → folders in the app
 * - YAML frontmatter (`---`) → tags, aliases
 * - `[[wiki-links]]` and `#hashtags` → spans the editor understands
 * - Existing notes with the same path are updated (idempotent)
 */
export async function importVaultFromFolder(rootPath: string): Promise<ImportResult> {
  if (!isDesktop()) {
    throw new Error("Импорт из папки доступен только в десктоп-версии");
  }
  if (!rootPath) {
    throw new Error("Путь к vault не указан");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  const files = await invoke<ScannedFile[]>("scan_vault", { root: rootPath });

  const result: ImportResult = { files: files.length, notes: 0, folders: 0, skipped: 0, errors: [] };

  if (files.length === 0) {
    return result;
  }

  // Build folder structure first
  const folderIdByPath = new Map<string, string>();
  folderIdByPath.set("", null as unknown as string); // root => no folder
  const existingFolders = await db.folders.toArray();
  const existingFolderByPath = new Map<string, Folder>();
  existingFolders.forEach((f) => {
    if (f.source === `vault:${rootPath}` && f.metadata && typeof f.metadata === "object" && "relPath" in (f.metadata as Record<string, unknown>)) {
      existingFolderByPath.set(String((f.metadata as { relPath: string }).relPath), f);
    }
  });

  const allFolderPaths = new Set<string>();
  files.forEach((f) => {
    if (!f.folder) return;
    const parts = f.folder.split(/[\\/]+/).filter(Boolean);
    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      allFolderPaths.add(cur);
    }
  });

  const sortedFolderPaths = Array.from(allFolderPaths).sort();
  for (const relPath of sortedFolderPaths) {
    const existing = existingFolderByPath.get(relPath);
    if (existing) {
      folderIdByPath.set(relPath, existing.id);
      continue;
    }
    const parts = relPath.split("/");
    const name = parts[parts.length - 1];
    const parentRel = parts.slice(0, -1).join("/");
    const parentId = folderIdByPath.get(parentRel) ?? null;
    const id = nanoid(10);
    await db.folders.add({
      id,
      name,
      parentId,
      createdAt: Date.now(),
      source: `vault:${rootPath}`,
      metadata: { relPath },
    });
    folderIdByPath.set(relPath, id);
    result.folders += 1;
  }

  // Build a quick lookup of existing notes from this vault to make import idempotent
  const existingNotes = await db.notes.toArray();
  const noteByVaultPath = new Map<string, Note>();
  existingNotes.forEach((n) => {
    if (n.source && n.source.startsWith("vault:") && n.metadata && typeof n.metadata === "object" && "vaultPath" in (n.metadata as Record<string, unknown>)) {
      noteByVaultPath.set(String((n.metadata as { vaultPath: string }).vaultPath), n);
    }
  });

  // Build full add/update payload lists first, then commit in two bulk
  // operations inside a single transaction. Previously this loop did
  // `await db.notes.add()` / `db.notes.update()` per file → N IndexedDB
  // round-trips for N files. On a 500-note vault that's the difference
  // between ~5 s and <500 ms.
  const toAdd: Note[] = [];
  const toUpdate: Array<{ key: string; changes: Partial<Note> }> = [];

  for (const file of files) {
    try {
      const parsed = matter(file.content);
      const fm = (parsed.data ?? {}) as Record<string, unknown>;
      const body = parsed.content;

      // Convert markdown → HTML; then post-process [[wiki-links]] and #tags
      const html = postProcessHtml(await marked.parse(body));
      const text = plainText(html);
      const inlineTags = extractHashtags(body);
      const wikiLinks = extractWikiLinks(body);

      const fmTags: string[] = Array.isArray(fm.tags)
        ? (fm.tags as unknown[]).map((t) => String(t))
        : typeof fm.tags === "string"
          ? String(fm.tags).split(/[,\s]+/).filter(Boolean)
          : [];

      const tags = Array.from(new Set([...fmTags, ...inlineTags]));
      const folderId = folderIdByPath.get(file.folder.replace(/\\/g, "/")) ?? null;

      const existing = noteByVaultPath.get(file.path);
      if (existing) {
        if ((existing.updatedAt ?? 0) >= file.modified) {
          result.skipped += 1;
          continue;
        }
        toUpdate.push({
          key: existing.id,
          changes: {
            title: file.name,
            content: html,
            contentText: text,
            tags,
            links: wikiLinks,
            folderId,
            updatedAt: file.modified || Date.now(),
          },
        });
      } else {
        toAdd.push({
          id: nanoid(10),
          title: file.name,
          content: html,
          contentText: text,
          type: "note",
          folderId,
          tags,
          links: wikiLinks,
          attachments: [],
          createdAt: file.modified || Date.now(),
          updatedAt: file.modified || Date.now(),
          archivedAt: null,
          pinned: Boolean(fm.pinned),
          source: `vault:${rootPath}`,
          metadata: { vaultPath: file.path, relative: file.relative, frontmatter: fm },
        });
      }
      result.notes += 1;
    } catch (err) {
      result.errors.push(`${file.relative}: ${String(err)}`);
    }
  }

  if (toAdd.length > 0 || toUpdate.length > 0) {
    await db.transaction("rw", db.notes, async () => {
      if (toAdd.length > 0) await db.notes.bulkAdd(toAdd);
      if (toUpdate.length > 0) await db.notes.bulkUpdate(toUpdate);
    });
  }

  return result;
}

/**
 * Marked already converts everything except Obsidian-specific syntax. We rewrite
 * `[[Note]]` / `[[Note|alias]]` and `#tag` into the same DOM nodes that the
 * TipTap editor knows about, so they render and click like native wiki-links.
 */
function postProcessHtml(html: string): string {
  return html
    .replace(/\[\[([^\]\|#]+)(?:#[^\]\|]+)?(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => {
      const text = alias?.trim() || target.trim();
      const tgt = target.trim();
      return `<span data-type="wiki-link" class="wiki-link" data-target="${escapeAttr(tgt)}">${escapeText(text)}</span>`;
    })
    .replace(/(^|\s)#([\p{L}_][\p{L}\p{N}_/-]*)/gu, (_m, pre: string, tag: string) => {
      return `${pre}<span data-type="hashtag" class="hashtag" data-tag="${escapeAttr(tag)}">#${escapeText(tag)}</span>`;
    });
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
