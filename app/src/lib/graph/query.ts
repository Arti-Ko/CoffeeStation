"use client";

import type { Note, Folder } from "@/lib/db/schema";

/**
 * Obsidian-style search-query DSL.
 *
 * Supported operators (space-separated, AND between them):
 *   tag:foo           — note has the tag "foo"
 *   path:Work/Notes   — folder chain matches this segment (substring)
 *   path:/regex/      — folder chain matches the regex (slashes wrap a regex literal)
 *   line:hello world  — body text contains this substring
 *   #foo              — shorthand for tag:foo
 *   -tag:archived     — NEGATED: must NOT have the tag
 *   plain words       — fall through to title/body match
 *
 * Returns a predicate `(note) => boolean`. Empty / unparseable queries match
 * everything.
 */
export type NotePredicate = (
  note: Note,
  folderChain: string,
) => boolean;

interface Term {
  negated: boolean;
  kind: "tag" | "path" | "line" | "text";
  value: string;
  regex?: RegExp;
}

export function parseQuery(raw: string): NotePredicate {
  const q = raw.trim();
  if (!q) return () => true;
  const terms: Term[] = [];

  // Split on spaces, but keep quoted strings as one term: handles
  // `line:"some phrase"` and free phrases like `"Hello world"`.
  const tokens = q.match(/-?(?:[a-z]+:)?(?:"[^"]*"|\/[^/]+\/|\S+)/gi) ?? [];

  for (const rawTok of tokens) {
    let tok = rawTok;
    let negated = false;
    if (tok.startsWith("-")) {
      negated = true;
      tok = tok.slice(1);
    }
    if (tok.startsWith("#")) {
      terms.push({ negated, kind: "tag", value: tok.slice(1).toLowerCase() });
      continue;
    }
    const opMatch = tok.match(/^(tag|path|line):(.*)$/i);
    if (opMatch) {
      const op = opMatch[1].toLowerCase() as Term["kind"];
      let val = opMatch[2];
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      let regex: RegExp | undefined;
      if (val.startsWith("/") && val.endsWith("/") && val.length > 2) {
        try {
          regex = new RegExp(val.slice(1, -1), "i");
        } catch {
          /* fall through to substring match */
        }
      }
      terms.push({ negated, kind: op, value: val.toLowerCase(), regex });
      continue;
    }
    let val = tok;
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    terms.push({ negated, kind: "text", value: val.toLowerCase() });
  }

  return (note, folderChain) => {
    const title = (note.title || "").toLowerCase();
    const body = note.contentText.toLowerCase();
    const tags = note.tags.map((t) => t.toLowerCase());
    const path = folderChain.toLowerCase();

    for (const t of terms) {
      let match = false;
      switch (t.kind) {
        case "tag":
          match = tags.some((tag) => tag === t.value || tag.startsWith(t.value + "/"));
          break;
        case "path":
          match = t.regex ? t.regex.test(folderChain) : path.includes(t.value);
          break;
        case "line":
          match = body.includes(t.value);
          break;
        case "text":
          match = title.includes(t.value) || body.includes(t.value);
          break;
      }
      if (t.negated ? match : !match) return false;
    }
    return true;
  };
}

/** Walk parents and return "Folder / Subfolder / Sub-sub" — used by the
 *  query engine for `path:` matches and by colour groups. */
export function folderChainFor(
  folderId: string | null,
  folders: Folder[],
): string {
  if (!folderId) return "";
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  let cur = byId.get(folderId) ?? null;
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
  }
  return parts.join(" / ");
}
