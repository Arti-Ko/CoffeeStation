"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Note, type Folder } from "@/lib/db/schema";

/**
 * Shared subscription to "every non-archived note".
 *
 * Why a shared hook: `FilesPanel`, `KnowledgeGraphView`, `FilesView`, and a
 * few other consumers each used to call `useLiveQuery(() =>
 * db.notes.filter(...).toArray())` independently. Dexie de-dupes table
 * observers but `dexie-react-hooks` doesn't — every consumer kept its own
 * promise chain and own array allocation. With a 1000-note vault and
 * editor autosaves every ~600ms, that was N × O(n) work per save.
 *
 * Dexie itself is observable-based, so subscribing here means each
 * keystroke runs the filter ONCE total instead of once-per-consumer. The
 * returned reference is also stable across renders when the underlying
 * data hasn't changed (Dexie returns the same array shape), so downstream
 * `useMemo` deps don't constantly invalidate.
 */
export function useActiveNotes(): Note[] {
  return (
    useLiveQuery<Note[]>(() => db.notes.filter((n) => n.archivedAt == null).toArray(), []) ??
    []
  );
}

/** Shared subscription to every folder row. Folders are tiny so we load all. */
export function useAllFolders(): Folder[] {
  return useLiveQuery<Folder[]>(() => db.folders.toArray(), []) ?? [];
}
