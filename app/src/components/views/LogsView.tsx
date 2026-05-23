"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, type SyncLogEntry } from "@/lib/db/schema";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  GitBranch,
  Info,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Sync activity log. Two stacked sections:
 *   - "Сейчас" — live progress card if any git op is in flight
 *   - "История" — descending list of finished operations from db.syncLog
 *
 * Designed to be opened when something looks wrong (а в идеале — почти
 * никогда) — so the live card prefers clarity over decoration: clear icon,
 * what's happening right now, how long it's been running.
 */
export function LogsView() {
  const syncOp = useApp((s) => s.syncOp);
  const log =
    useLiveQuery<SyncLogEntry[]>(
      () => db.syncLog.orderBy("startedAt").reverse().limit(200).toArray(),
      [],
    ) ?? [];

  const stats = useMemo(() => {
    const total = log.length;
    const fails = log.filter((e) => !e.success).length;
    const lastOk = log.find((e) => e.success);
    return { total, fails, lastOk: lastOk?.finishedAt };
  }, [log]);

  const clearAll = async () => {
    if (!confirm("Очистить весь лог синхронизаций?")) return;
    await db.syncLog.clear();
    toast.success("Лог очищен");
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h2
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Логи синхронизации
          </h2>
          <p className="text-xs text-fg-subtle mt-0.5">
            Всего: {stats.total} · С ошибкой: {stats.fails}
            {stats.lastOk && (
              <>
                {" · "}
                Последний успех: {formatTime(stats.lastOk)}
              </>
            )}
          </p>
        </div>
        {log.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clearAll}>
            <Trash2 size={12} /> Очистить
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        <LiveCard op={syncOp} />

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle mb-2">
            История
          </h3>
          {log.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-[12px] text-fg-subtle">
              Пока ничего не было. Логи появятся когда выполнится push, pull или
              ручной sync.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {log.map((entry) => (
                <LogRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function LiveCard({ op }: { op: ReturnType<typeof useApp.getState>["syncOp"] }) {
  const [tick, setTick] = useState(0);

  // Heartbeat to refresh elapsed time once per second while an op runs.
  // We don't trigger a re-render otherwise so the rest of the view stays calm.
  useMemo(() => {
    if (!op) return;
    const t = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op?.kind, op?.reason, op?.startedAt]);

  if (!op) {
    return (
      <section className="rounded-md border border-border bg-bg-elev-1 p-4 flex items-center gap-3 text-[12.5px] text-fg-subtle">
        <div className="h-2 w-2 rounded-full bg-success/70 animate-pulse" />
        <span>Синхронизация неактивна — sync запустится при следующем push или pull.</span>
      </section>
    );
  }

  const Icon = op.kind === "push" ? ArrowUp : op.kind === "pull" ? ArrowDown : GitBranch;
  const elapsed = formatDuration(Date.now() - op.startedAt);
  void tick; // referenced to keep the lint check quiet about unused state
  const pct = op.progress
    ? Math.round((op.progress.current / Math.max(1, op.progress.total)) * 100)
    : null;

  return (
    <section className="rounded-md border border-accent bg-accent-soft/30 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-accent text-accent-fg p-2 mt-0.5">
          <Icon size={14} className="animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="text-[13px] font-semibold tracking-tight text-fg">
              {op.kind === "push"
                ? "Push на GitHub"
                : op.kind === "pull"
                  ? "Pull с GitHub"
                  : "Инициализация репозитория"}
              <span className="ml-2 text-[11px] font-normal text-fg-muted">
                ({op.reason})
              </span>
            </div>
            <span className="text-[11px] font-mono text-fg-subtle">{elapsed}</span>
          </div>

          <div className="text-[12.5px] text-fg-muted leading-relaxed">{op.message}</div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bg/60">
            <div
              className={cn(
                "h-full bg-accent transition-all",
                pct === null && "indeterminate-bar",
              )}
              style={{ width: pct !== null ? `${pct}%` : "40%" }}
            />
          </div>
          {pct !== null && (
            <div className="mt-1.5 text-right text-[10.5px] font-mono text-fg-subtle">
              {op.progress!.current} / {op.progress!.total} ({pct}%)
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function LogRow({ entry }: { entry: SyncLogEntry }) {
  const [open, setOpen] = useState(false);
  const Icon = entry.success ? CircleCheck : CircleAlert;
  const KindIcon =
    entry.kind === "push"
      ? ArrowUp
      : entry.kind === "pull"
        ? ArrowDown
        : entry.kind === "init"
          ? GitBranch
          : Info;

  return (
    <li
      className={cn(
        "rounded-md border bg-bg overflow-hidden transition-colors",
        entry.success ? "border-border" : "border-danger/40 bg-danger/5",
      )}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-elev-2"
      >
        <Icon
          size={14}
          className={cn(entry.success ? "text-success" : "text-danger", "shrink-0")}
        />
        <KindIcon size={11} className="text-fg-subtle shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] text-fg truncate">{entry.message}</div>
          <div className="text-[10.5px] text-fg-subtle mt-0.5 flex items-center gap-2">
            <span>{formatTime(entry.finishedAt)}</span>
            <span>·</span>
            <span>{entry.reason}</span>
            <span>·</span>
            <span className="font-mono">{formatDuration(entry.durationMs)}</span>
            {typeof entry.added === "number" && entry.added > 0 && (
              <>
                <span>·</span>
                <span>{entry.added} заметок</span>
              </>
            )}
          </div>
        </div>
        {open ? (
          <ChevronDown size={12} className="text-fg-subtle shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-fg-subtle shrink-0" />
        )}
      </button>
      {open && entry.detail && (
        <pre className="border-t border-border bg-bg-elev-2/60 px-3 py-2 text-[11px] font-mono text-fg-muted whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
          {entry.detail}
        </pre>
      )}
    </li>
  );
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} мс`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} с`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s - m * 60);
  return `${m} мин ${rest} с`;
}
