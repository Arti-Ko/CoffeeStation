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
