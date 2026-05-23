"use client";

import { db } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { useApp } from "@/lib/store";

export type NewNoteLocation =
  /** Always at vault root (no folder). Obsidian's "Vault folder". */
  | "vault-root"
  /** Same folder as the currently-open note. Obsidian's "Same folder as current". */
  | "current-folder"
  /** A specific configured folder. Obsidian's "In the folder specified below". */
  | "specific-folder";

export interface NewNotePref {
  location: NewNoteLocation;
  /** When location === "specific-folder", id of the target folder. */
  specificFolderId: string | null;
}

const KEY = "notes.newLocation";

export async function getNewNotePref(): Promise<NewNotePref> {
  const row = await db.settings.get(KEY);
  if (row?.value) return row.value as NewNotePref;
  return { location: "vault-root", specificFolderId: null };
}

export async function saveNewNotePref(p: Partial<NewNotePref>): Promise<NewNotePref> {
  const cur = await getNewNotePref();
  const merged = { ...cur, ...p };
  await db.settings.put({ key: KEY, value: merged });
  return merged;
}

/**
 * Creates a new note in the location chosen by the user in Settings.
 *  - "vault-root": folderId = null
 *  - "current-folder": folderId of the currently-open note (fallback: null)
 *  - "specific-folder": folderId from settings (fallback: null if folder
 *    was deleted)
 */
export async function createNewNote(opts?: {
  title?: string;
  content?: string;
  /** Override the location preference for this one call. */
  folderId?: string | null;
}): Promise<string> {
  const id = nanoid(10);
  const pref = await getNewNotePref();

  let folderId: string | null = null;
  if (opts?.folderId !== undefined) {
    folderId = opts.folderId;
  } else {
    switch (pref.location) {
      case "vault-root":
        folderId = null;
        break;
      case "current-folder": {
        const view = useApp.getState().view;
        if (view.kind === "note") {
          const cur = await db.notes.get(view.id);
          folderId = cur?.folderId ?? null;
        }
        break;
      }
      case "specific-folder":
        if (pref.specificFolderId) {
          const exists = await db.folders.get(pref.specificFolderId);
          folderId = exists ? pref.specificFolderId : null;
        }
        break;
    }
  }

  await db.notes.add({
    id,
    title: opts?.title ?? "Новая заметка",
    content: opts?.content ?? "<p></p>",
    contentText: "",
    type: "note",
    folderId,
    tags: [],
    links: [],
    attachments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archivedAt: null,
    pinned: false,
  });
  return id;
}
