"use client";

import { db } from "@/lib/db/schema";
import { isDesktop } from "./runtime";

export interface VaultPaths {
  /** Root folder where notes are mirrored as .md files. */
  vaultRoot: string;
  /** Folder for media (images, audio, video) attached to notes. */
  attachments: string;
  /** Default folder for export → HTML / Markdown / PDF. */
  exports: string;
  /** Folder for JSON backups (full-vault snapshots). */
  backups: string;
  /** Folder for theme JSONs. */
  themes: string;
  /** Mirror notes as files on disk on every save. */
  fileMirror: boolean;
}

const KEY = "fs.paths";

export async function getVaultPaths(): Promise<VaultPaths> {
  const stored = await db.settings.get(KEY);
  if (stored?.value) return stored.value as VaultPaths;
  return await getDefaultPaths();
}

export async function setVaultPaths(paths: Partial<VaultPaths>): Promise<VaultPaths> {
  const current = await getVaultPaths();
  const merged = { ...current, ...paths };
  await db.settings.put({ key: KEY, value: merged });
  return merged;
}

async function getDefaultPaths(): Promise<VaultPaths> {
  if (!isDesktop()) {
    return {
      vaultRoot: "",
      attachments: "",
      exports: "",
      backups: "",
      themes: "",
      fileMirror: false,
    };
  }
  try {
    const { documentDir, join } = await import("@tauri-apps/api/path");
    const docs = await documentDir();
    const root = await join(docs, "CoffeeStation");
    return {
      vaultRoot: root,
      attachments: await join(root, "attachments"),
      exports: await join(root, "exports"),
      backups: await join(root, "backups"),
      themes: await join(root, "themes"),
      fileMirror: false,
    };
  } catch {
    return {
      vaultRoot: "",
      attachments: "",
      exports: "",
      backups: "",
      themes: "",
      fileMirror: false,
    };
  }
}

/**
 * Opens the native folder-picker. Returns the chosen path or null if cancelled.
 */
export async function pickFolder(title: string, defaultPath?: string): Promise<string | null> {
  if (!isDesktop()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ directory: true, title, defaultPath, multiple: false });
  if (!result || Array.isArray(result)) return null;
  return result;
}

/**
 * Ensures the given folder exists (recursively). Safe no-op if it already does.
 */
export async function ensureFolder(path: string): Promise<void> {
  if (!isDesktop() || !path) return;
  const { mkdir, exists } = await import("@tauri-apps/plugin-fs");
  if (await exists(path)) return;
  await mkdir(path, { recursive: true });
}

/** Reveal a folder in Finder / Explorer (creates it if missing) */
export async function revealFolder(path: string): Promise<void> {
  if (!isDesktop() || !path) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_in_finder", { path });
}

/** Forbidden characters in note titles when materialized as filenames. */
const TITLE_REPLACE_REGEX = /[\\/:*?"<>|]/g;

/** Convert a note title to a safe filename (same rules as the Rust side). */
export function titleToFilename(title: string): string {
  return title.replace(TITLE_REPLACE_REGEX, "_");
}

/** Absolute path of a note's `.md` mirror given vault root + folder chain + title. */
export function noteDiskPath(
  vaultRoot: string,
  relativeFolder: string,
  title: string,
): string {
  const root = vaultRoot.replace(/\/$/, "");
  const folder = relativeFolder
    ? `${root}/${relativeFolder.replace(/^\/+|\/+$/g, "")}`
    : root;
  return `${folder}/${titleToFilename(title)}.md`;
}

/**
 * Mirror a note to disk as a `.md` file. The note ends up at
 *   <vaultRoot>/<relativeFolder>/<title>.md
 * so the folder hierarchy on disk matches the in-app folders. If
 * `relativeFolder` is empty, the file lands at the vault root.
 */
export async function mirrorNoteToDisk(
  vaultRoot: string,
  relativeFolder: string,
  title: string,
  markdown: string,
): Promise<string | null> {
  if (!isDesktop() || !vaultRoot) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const folder = relativeFolder
    ? `${vaultRoot.replace(/\/$/, "")}/${relativeFolder.replace(/^\/+|\/+$/g, "")}`
    : vaultRoot;
  return invoke<string>("mirror_note_to_disk", {
    path: folder,
    title,
    markdown,
  });
}

/** Delete a single file on disk. Silently succeeds if it doesn't exist. */
export async function deleteFileAt(path: string): Promise<void> {
  if (!isDesktop() || !path) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("delete_file_at", { path });
}

/** Recursive directory removal. Silently succeeds if it doesn't exist. */
export async function deleteDirAt(path: string): Promise<void> {
  if (!isDesktop() || !path) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("delete_dir_at", { path });
}

/**
 * Build the slash-separated folder chain a note lives under, walking the
 * given folder map. Same shape `mirrorNoteToDisk` expects.
 */
function chainOf(folderId: string | null, byId: Map<string, { id: string; name: string; parentId: string | null }>): string {
  if (!folderId) return "";
  const parts: string[] = [];
  let cur = byId.get(folderId) ?? null;
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
  }
  return parts.join("/");
}

/**
 * Remove every `.md` mirror of the given notes from the on-disk vault. Best-
 * effort: missing files are ignored. Called by every code path that deletes
 * or trashes notes — without it, deleted notes used to linger in the vault
 * directory until the user manually `rm`'d them.
 *
 * Caller must pass the notes BEFORE the DB mutation (so paths can still be
 * resolved) along with the current folder list.
 */
export async function removeNotesOnDisk(
  notes: { title: string; folderId: string | null }[],
  folders: { id: string; name: string; parentId: string | null }[],
): Promise<void> {
  if (!isDesktop() || notes.length === 0) return;
  const paths = await getVaultPaths();
  if (!paths.vaultRoot) return;
  const byId = new Map(folders.map((f) => [f.id, f]));
  await Promise.all(
    notes.map((n) =>
      deleteFileAt(noteDiskPath(paths.vaultRoot, chainOf(n.folderId, byId), n.title)).catch(
        () => undefined,
      ),
    ),
  );
}

/**
 * Remove every folder (recursively, including any leftover files) of the
 * given folder ids from disk. Walks the chain to compute the absolute path
 * for each.
 */
export async function removeFoldersOnDisk(
  toRemove: { id: string }[],
  allFolders: { id: string; name: string; parentId: string | null }[],
): Promise<void> {
  if (!isDesktop() || toRemove.length === 0) return;
  const paths = await getVaultPaths();
  if (!paths.vaultRoot) return;
  const byId = new Map(allFolders.map((f) => [f.id, f]));
  const root = paths.vaultRoot.replace(/\/$/, "");
  await Promise.all(
    toRemove.map((f) => {
      const chain = chainOf(f.id, byId);
      if (!chain) return Promise.resolve();
      return deleteDirAt(`${root}/${chain}`).catch(() => undefined);
    }),
  );
}
