"use client";

import { db, type SyncLogEntry } from "@/lib/db/schema";
import { nanoid } from "nanoid";

/** Maximum entries kept in the syncLog table. Older rows get trimmed when
 *  the table grows past this. Pick a number that's big enough to debug
 *  recent failures but small enough to never blow up IndexedDB. */
const RETAIN = 200;

export async function appendSyncLog(
  entry: Omit<SyncLogEntry, "id" | "finishedAt" | "durationMs"> & {
    finishedAt?: number;
  },
): Promise<void> {
  const finishedAt = entry.finishedAt ?? Date.now();
  const row: SyncLogEntry = {
    id: nanoid(12),
    ...entry,
    finishedAt,
    durationMs: finishedAt - entry.startedAt,
  };
  await db.syncLog.add(row);
  // Trim oldest if we passed the cap. Cheap because `startedAt` is indexed.
  const count = await db.syncLog.count();
  if (count > RETAIN) {
    const overflow = count - RETAIN;
    const oldIds = await db.syncLog
      .orderBy("startedAt")
      .limit(overflow)
      .primaryKeys();
    if (oldIds.length > 0) await db.syncLog.bulkDelete(oldIds);
  }
}
