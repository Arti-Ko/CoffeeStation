"use client";

export interface DailyTask {
  title: string;
  checked: boolean;
}

/**
 * Pull task items (`<li data-checked>`) belonging to the **"Сегодня"** section
 * of a daily note. Anything under "Вчера" (auto-generated carry-over) is
 * ignored — those tasks were already actioned and shouldn't spawn new kanban
 * cards.
 *
 * Walks the DOM looking for an `<h1>/<h2>/<h3>` whose text matches "Сегодня"
 * (case-insensitive, emoji-tolerant), then collects every task in the
 * following siblings up to the next same-or-higher heading.
 *
 * Fallback: a note with no "Сегодня" heading is pre-template (or hand-rolled),
 * so we return every task — preserving the original behaviour for old notes.
 * The fallback is *only* taken when no "Сегодня" heading exists; the presence
 * of "Вчера" alone never widens the scan, because that would re-import the
 * carry-over tasks.
 */
export function extractTodayTasks(html: string): DailyTask[] {
  if (!html || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const headings = Array.from(doc.querySelectorAll("h1, h2, h3"));
  const todayHeading = headings.find((h) =>
    /сегодня/i.test((h.textContent ?? "").trim()),
  );
  if (todayHeading) {
    const tasks: DailyTask[] = [];
    const stopLevel = headingLevel(todayHeading.tagName);
    let el: Element | null = todayHeading.nextElementSibling;
    while (el) {
      if (isHeading(el) && headingLevel(el.tagName) <= stopLevel) break;
      readTasks(el, tasks);
      el = el.nextElementSibling;
    }
    return tasks;
  }
  // No "Сегодня" heading — pre-v0.2.27 note. Walk the whole doc.
  return readAllTasks(doc.body);
}

function isHeading(el: Element): boolean {
  return /^h[1-6]$/i.test(el.tagName);
}

function headingLevel(tag: string): number {
  return parseInt(tag.slice(1), 10);
}

function readTasks(root: Element, out: DailyTask[]): void {
  root.querySelectorAll("li[data-checked]").forEach((li) => {
    const title = (li.textContent ?? "").trim();
    if (!title) return;
    out.push({ title, checked: li.getAttribute("data-checked") === "true" });
  });
}

function readAllTasks(root: Element): DailyTask[] {
  const out: DailyTask[] = [];
  readTasks(root, out);
  return out;
}
