"use client";

import { db } from "@/lib/db/schema";

/**
 * Persisted graph-view settings. Loaded once on mount, written back per change.
 * Mirrors Obsidian's Graph view options 1:1 so users who come from there get
 * exactly the toggles they expect.
 */
export interface GraphSettings {
  mode: "2d" | "3d";

  // ── Filters
  search: string;             // text + operators (tag:foo, path:bar, line:N)
  showOrphans: boolean;       // notes with zero links
  showGhosts: boolean;        // [[unresolved]] wiki-links
  showAttachments: boolean;   // non-markdown files (we don't have these as nodes yet)
  showTags: boolean;          // tags rendered as nodes
  showExistingOnly: boolean;  // alias for !showGhosts (Obsidian terminology)

  // ── Color groups: rules tried in order, first match wins
  groups: ColorGroup[];

  // ── Display
  arrows: boolean;            // draw arrowheads on links
  textFadeThreshold: number;  // node label visibility (0..2, lower = labels appear sooner)
  nodeSize: number;           // base radius multiplier 0.5..3
  linkThickness: number;      // base link width multiplier 0.5..3
  lineColorWithGroup: boolean;// links inherit color of source node

  // ── Forces
  centerForce: number;        // 0..1
  repelForce: number;         // -1500..0 (more negative = stronger repulsion)
  linkForce: number;          // 0..2
  linkDistance: number;       // 20..400
}

export interface ColorGroup {
  /** Obsidian-style query: free text matches title, `tag:foo` matches notes
   *  with that tag, `path:bar` matches by folder chain, `line:NN` matches by
   *  body line, `#foo` is shorthand for `tag:foo`. */
  query: string;
  color: string;              // CSS colour (hex / oklch / var)
}

const KEY = "graph.settings";

export const DEFAULT_SETTINGS: GraphSettings = {
  mode: "2d",
  search: "",
  showOrphans: true,
  showGhosts: true,
  showAttachments: false,
  showTags: false,
  showExistingOnly: false,
  groups: [
    { query: "tag:todo", color: "oklch(75% 0.16 70)" },
    { query: "tag:idea", color: "oklch(70% 0.18 140)" },
  ],
  arrows: false,
  textFadeThreshold: 1.4,
  nodeSize: 1,
  linkThickness: 1,
  lineColorWithGroup: false,
  centerForce: 0.05,
  repelForce: -180,
  linkForce: 0.5,
  linkDistance: 90,
};

export async function loadGraphSettings(): Promise<GraphSettings> {
  const row = await db.settings.get(KEY);
  if (!row?.value) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(row.value as Partial<GraphSettings>) };
}

export async function saveGraphSettings(partial: Partial<GraphSettings>): Promise<GraphSettings> {
  const current = await loadGraphSettings();
  const merged = { ...current, ...partial };
  await db.settings.put({ key: KEY, value: merged });
  return merged;
}
