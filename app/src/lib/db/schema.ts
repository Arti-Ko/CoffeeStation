import Dexie, { type EntityTable } from "dexie";

export type NoteType = "note" | "daily" | "template" | "canvas" | "mindmap" | "db-row";

export interface Note {
  id: string;
  title: string;
  content: string; // HTML/ProseMirror JSON serialized
  contentText: string; // plain text for search
  type: NoteType;
  folderId: string | null;
  tags: string[];
  links: string[]; // outgoing wiki-link targets (titles)
  attachments: string[]; // file ids
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  pinned: boolean;
  source?: string; // e.g. "web-clipper", "notion-import"
  authorId?: string;
  metadata?: Record<string, unknown>;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string;
  color?: string;
  createdAt: number;
  source?: string; // integration source: google-drive | notion | dropbox | onedrive | local | vault:<path>
  metadata?: Record<string, unknown>;
  /** Folder is hidden from the main tree (moves to "Скрытые" section). */
  hidden?: boolean;
  /** Sort order within the parent. Higher = lower in the list. */
  order?: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  parentTag?: string;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  blob?: Blob;
  url?: string;
  noteId?: string;
  ocrText?: string;
  transcript?: string;
  createdAt: number;
}

export interface NoteVersion {
  id: string;
  noteId: string;
  content: string;
  title: string;
  createdAt: number;
  reason?: "auto" | "manual" | "import";
}

export interface Database {
  id: string;
  name: string;
  icon?: string;
  fields: DbField[];
  defaultViewId: string;
  createdAt: number;
  updatedAt: number;
}

export type DbFieldType =
  | "text"
  | "number"
  | "date"
  | "checkbox"
  | "select"
  | "multi-select"
  | "person"
  | "file"
  | "url"
  | "email"
  | "phone"
  | "formula"
  | "relation"
  | "rollup"
  | "created-time"
  | "last-edited-time";

export interface DbField {
  id: string;
  name: string;
  type: DbFieldType;
  options?: { id: string; name: string; color: string }[];
  formula?: string;
  relationDbId?: string;
}

export interface DbView {
  id: string;
  databaseId: string;
  name: string;
  type: "table" | "board" | "calendar" | "gallery" | "timeline" | "list";
  groupBy?: string;
  filters?: DbFilter[];
  sorts?: { fieldId: string; direction: "asc" | "desc" }[];
  hiddenFields?: string[];
}

export interface DbFilter {
  fieldId: string;
  op: "eq" | "neq" | "contains" | "gt" | "lt" | "empty" | "in";
  value: unknown;
}

export interface DbRow {
  id: string;
  databaseId: string;
  values: Record<string, unknown>;
  noteId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CanvasDoc {
  id: string;
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  updatedAt: number;
}

export interface CanvasNode {
  id: string;
  type: "card" | "text" | "shape" | "image" | "note-embed" | "sticker";
  x: number;
  y: number;
  width: number;
  height: number;
  data: Record<string, unknown>;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface MindMap {
  id: string;
  name: string;
  /** Tree-structured root; typed as MindNode for callers, stored as JSON-serializable object. */
  root: MindNode;
  updatedAt: number;
}

export interface MindNode {
  id: string;
  text: string;
  color?: string;
  icon?: string;
  children: MindNode[];
}

export interface FlowGraph {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  updatedAt: number;
}

export interface FlowNode {
  id: string;
  type: "doc" | "agent" | "llm" | "tool" | "trigger" | "action" | "control" | "memory";
  label: string;
  x: number;
  y: number;
  config?: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  kind?: "model" | "memory" | "tool" | "success" | "error";
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  content: string;
  variables?: string[];
  category?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface PublishedNote {
  id: string;
  noteId: string;
  slug: string;
  visibility: "public" | "link" | "password";
  password?: string;
  publishedAt: number;
  views: number;
}

export interface KanbanColumn {
  id: string;
  name: string;
  order: number;
  color: string;
  /** A column with `done === true` archives cards that linger overnight. */
  done?: boolean;
}

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  columnId: string;
  order: number;
  createdAt: number;
  /** Last time the card moved between columns. Used for daily roll-over logic. */
  movedAt: number;
  /** Date the card was created on (yyyy-mm-dd) — used to detect "carry-over from yesterday". */
  dayCreated: string;
  /** Reference to a daily note, if the card was created from there. */
  dailyNoteId?: string;
  /** Manually archived (auto-archived when moved to `done` column on a previous day). */
  archivedAt?: number | null;
  tags?: string[];
  /** Priority badge */
  priority?: "low" | "medium" | "high";
}

/**
 * One entry per finished sync operation. Powers the Logs view and lets the
 * user inspect what `pushAll` / `pullRepo` actually did (raw stdout/stderr
 * from the git invocations, success flag, duration, reason such as
 * "manual" / "blur" / "idle"). Bounded by trimming the oldest entries to
 * 200 (see `appendSyncLog` in lib/sync/log.ts) so it never grows unbounded.
 */
export interface SyncLogEntry {
  id: string;
  kind: "push" | "pull" | "init" | "info" | "error";
  reason: string;                // "manual" | "blur" | "focus" | "idle" | ...
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  success: boolean;
  message: string;               // short headline shown in the list
  detail?: string;                // multi-line stdout/stderr for the expandable row
  added?: number;                 // number of notes synced (if known)
}

class CoffeeStationDB extends Dexie {
  notes!: EntityTable<Note, "id">;
  folders!: EntityTable<Folder, "id">;
  tags!: EntityTable<Tag, "id">;
  attachments!: EntityTable<Attachment, "id">;
  versions!: EntityTable<NoteVersion, "id">;
  databases!: EntityTable<Database, "id">;
  dbViews!: EntityTable<DbView, "id">;
  dbRows!: EntityTable<DbRow, "id">;
  canvases!: EntityTable<CanvasDoc, "id">;
  mindmaps!: EntityTable<MindMap, "id">;
  flows!: EntityTable<FlowGraph, "id">;
  templates!: EntityTable<Template, "id">;
  settings!: EntityTable<Setting, "key">;
  published!: EntityTable<PublishedNote, "id">;
  kanbanColumns!: EntityTable<KanbanColumn, "id">;
  kanbanCards!: EntityTable<KanbanCard, "id">;
  syncLog!: EntityTable<SyncLogEntry, "id">;

  constructor() {
    super("coffeestation");
    this.version(1).stores({
      notes: "id, title, type, folderId, updatedAt, createdAt, *tags, *links, pinned",
      folders: "id, parentId, name, source",
      tags: "id, name",
      attachments: "id, noteId, mime, createdAt",
      versions: "id, noteId, createdAt",
      databases: "id, name, updatedAt",
      dbViews: "id, databaseId, type",
      dbRows: "id, databaseId, updatedAt",
      canvases: "id, name, updatedAt",
      mindmaps: "id, name, updatedAt",
      flows: "id, name, updatedAt",
      templates: "id, name, category",
      settings: "key",
      published: "id, noteId, slug, publishedAt",
    });
    this.version(2).stores({
      kanbanColumns: "id, order",
      kanbanCards: "id, columnId, order, dayCreated, archivedAt, dailyNoteId",
    });
    this.version(3).stores({
      syncLog: "id, kind, startedAt, finishedAt, success",
    });
  }
}

export const db = new CoffeeStationDB();
