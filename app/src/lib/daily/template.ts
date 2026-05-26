"use client";

import { db, type Note } from "@/lib/db/schema";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { extractTodayTasks } from "./parse";

interface CarryOverResult {
  planned: string[];
  done: Array<{ title: string }>;
  notDone: Array<{ title: string; status: string }>;
}

/**
 * Build the HTML body for a new daily note dated `date`. The template is
 * dynamic — it pulls live state from yesterday's daily + kanban so the user
 * doesn't have to re-type their carry-over tasks every morning.
 *
 * Structure:
 *
 *   <h1>{{date}}</h1>
 *   <h2>Вчера</h2>
 *     <h3>Планировал</h3>     ← tasks that were under "Сегодня" yesterday
 *     <h3>Сделал</h3>         ← of those, the ones that reached a "done" column
 *     <h3>Не сделал</h3>      ← the rest, with the column they're stuck in
 *   <h2>Сегодня</h2>          ← empty task list, ready to plan
 *   <h2>📓 Журнал</h2>
 *   <h2>💡 Идеи</h2>
 *
 * Yesterday's note is the most recent daily note with `createdAt < date`.
 * If none exists, the "Вчера" sections come out empty (still rendered so the
 * layout doesn't shift the first time you onboard).
 */
export async function buildDailyTemplateHtml(date: Date): Promise<string> {
  const headline = format(date, "yyyy-MM-dd · EEEE", { locale: ru });
  const carry = await collectCarryOver(date);
  return [
    `<h1>${escapeHtml(headline)}</h1>`,
    `<h2>Вчера</h2>`,
    `<h3>Планировал</h3>`,
    renderTaskList(carry.planned.map((title) => ({ title, checked: false }))),
    `<h3>Сделал</h3>`,
    renderTaskList(carry.done.map((d) => ({ title: d.title, checked: true }))),
    `<h3>Не сделал</h3>`,
    renderNotDone(carry.notDone),
    `<h2>Сегодня</h2>`,
    renderTaskList([{ title: "", checked: false }]),
    `<h2>📓 Журнал</h2>`,
    `<p></p>`,
    `<h2>💡 Идеи</h2>`,
    `<p></p>`,
  ].join("");
}

/**
 * Walk yesterday's daily + kanban, classify the carried-over tasks into
 * planned / done / not-done buckets.
 */
async function collectCarryOver(date: Date): Promise<CarryOverResult> {
  const empty: CarryOverResult = { planned: [], done: [], notDone: [] };
  const yesterday = await findPreviousDaily(date);
  if (!yesterday) return empty;

  const planned = extractTodayTasks(yesterday.content).map((t) => t.title);
  if (planned.length === 0) return empty;

  const [columns, cards] = await Promise.all([
    db.kanbanColumns.toArray(),
    db.kanbanCards.toArray(),
  ]);
  const colById = new Map(columns.map((c) => [c.id, c]));
  // Cards spawned from yesterday's daily — keyed by title so we can look up
  // their current status. `syncDailyTasks` keys on `dailyNoteId::title`.
  const cardByTitle = new Map<string, (typeof cards)[number]>();
  cards.forEach((c) => {
    if (c.dailyNoteId === yesterday.id) cardByTitle.set(c.title, c);
  });

  const done: CarryOverResult["done"] = [];
  const notDone: CarryOverResult["notDone"] = [];
  for (const title of planned) {
    const card = cardByTitle.get(title);
    if (!card) {
      // No corresponding kanban card — couldn't reach a "done" column then.
      // Treat as not-done with no known status.
      notDone.push({ title, status: "—" });
      continue;
    }
    const col = colById.get(card.columnId);
    if (col?.done) done.push({ title });
    else notDone.push({ title, status: col?.name ?? "—" });
  }

  return { planned, done, notDone };
}

/**
 * Find the most recent daily note strictly before `date` (start-of-day).
 * Uses `createdAt` since daily notes index that as the canonical "for this
 * day" timestamp.
 */
async function findPreviousDaily(date: Date): Promise<Note | null> {
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dailies = await db.notes
    .where("type")
    .equals("daily")
    .toArray();
  // Filter + sort in memory: the table is tiny relative to total notes
  // (one entry per day) so a full pass is cheaper than maintaining an index.
  const before = dailies
    .filter((n) => n.archivedAt == null && n.createdAt < startOfTarget)
    .sort((a, b) => b.createdAt - a.createdAt);
  return before[0] ?? null;
}

interface TaskRow {
  title: string;
  checked: boolean;
}

function renderTaskList(items: TaskRow[]): string {
  if (items.length === 0) return `<p><em>—</em></p>`;
  const lis = items
    .map((it) => {
      const checked = it.checked ? "true" : "false";
      const checkedAttr = it.checked ? "checked" : "";
      const text = escapeHtml(it.title);
      return `<li data-checked="${checked}"><label><input type="checkbox" ${checkedAttr}/></label><div><p>${text}</p></div></li>`;
    })
    .join("");
  return `<ul data-type="taskList">${lis}</ul>`;
}

function renderNotDone(items: CarryOverResult["notDone"]): string {
  if (items.length === 0) return `<p><em>—</em></p>`;
  const lis = items
    .map(
      (it) =>
        `<li data-checked="false"><label><input type="checkbox"/></label><div><p>${escapeHtml(it.title)} <em>(${escapeHtml(it.status)})</em></p></div></li>`,
    )
    .join("");
  return `<ul data-type="taskList">${lis}</ul>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
