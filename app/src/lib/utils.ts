import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  wait: number,
): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  }) as T;
}

export function extractWikiLinks(content: string): string[] {
  const matches = content.matchAll(/\[\[([^\]\|#]+)(?:#[^\]\|]+)?(?:\|[^\]]+)?\]\]/g);
  return Array.from(matches, (m) => m[1].trim());
}

/**
 * Extracts Obsidian-style #hashtags from content. Filters out:
 *   - pure-numeric tokens (#123, #1077) — usually issue refs
 *   - hex colors (#00ffcc, #a1a1aa, #fff)
 *   - markdown heading markers at line start (handled by requiring whitespace before)
 *
 * First character of the tag body must be a letter or underscore.
 */
export function extractHashtags(content: string): string[] {
  const matches = content.matchAll(/(?:^|\s)#([\p{L}_][\p{L}\p{N}_/-]*)/gu);
  return Array.from(new Set(Array.from(matches, (m) => m[1])));
}

export function plainText(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, " ");
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}
