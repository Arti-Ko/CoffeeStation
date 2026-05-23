"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { isDesktop } from "@/lib/desktop/runtime";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Download, X, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * Tauri's updater plugin checks `tauri.conf.json -> plugins.updater.endpoints`
 * (we point at the GitHub Releases `latest.json` manifest) and returns either
 * `null` or an `Update` object with the metadata + binaries ready to install.
 *
 * Three user actions, persisted in IndexedDB so they survive restarts:
 *   - "Обновиться сейчас": download + install + restart
 *   - "Обновиться в следующий раз": dismiss for this session only
 *   - "Пропустить эту версию": persist version into `update.skipped`, never
 *     show modal again until a newer release appears
 */
const SKIPPED_KEY = "update.skippedVersions";

interface UpdateState {
  version: string;
  notes?: string | null;
  apply: () => Promise<void>;
}

export function UpdateModal() {
  const skippedRow = useLiveQuery(() => db.settings.get(SKIPPED_KEY));
  const skipped = (skippedRow?.value as string[] | undefined) ?? [];
  const updateCheckNonce = useApp((s) => s.updateCheckNonce);
  const [available, setAvailable] = useState<UpdateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Re-checks on mount AND every time `requestUpdateCheck()` is called from
  // somewhere else (e.g. Settings → Проверить обновление). When the user
  // triggers manually we also surface a "you're up to date" toast — for the
  // mount-time check we stay silent to avoid notification spam.
  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    const isManual = updateCheckNonce > 0;
    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (cancelled) return;
        if (!update) {
          if (isManual) toast.success("Вы используете последнюю версию");
          return;
        }
        setAvailable({
          version: update.version,
          notes: update.body ?? null,
          apply: async () => {
            setBusy(true);
            await update.downloadAndInstall((event) => {
              if (event.event === "Started") {
                setProgress({ downloaded: 0, total: event.data.contentLength ?? null });
              } else if (event.event === "Progress") {
                setProgress((p) =>
                  p ? { ...p, downloaded: p.downloaded + event.data.chunkLength } : null,
                );
              }
            });
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await relaunch();
          },
        });
        // Manual trigger: forcibly re-show even if the user previously skipped
        // or dismissed this version — they're explicitly asking to see it.
        if (isManual) setDismissed(false);
      } catch (e) {
        if (isManual) toast.error("Не удалось проверить обновления", { description: String(e) });
        // eslint-disable-next-line no-console
        console.debug("[updater] check failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [updateCheckNonce]);

  if (!available || dismissed) return null;
  if (skipped.includes(available.version) && updateCheckNonce === 0) return null;

  const skipThisVersion = async () => {
    const next = Array.from(new Set([...skipped, available.version]));
    await db.settings.put({ key: SKIPPED_KEY, value: next });
    setDismissed(true);
    toast.message(`Версия ${available.version} пропущена`, {
      description: "Уведомлений о ней больше не будет.",
    });
  };

  const installNow = async () => {
    try {
      await available.apply();
    } catch (e) {
      setBusy(false);
      toast.error("Не удалось обновиться", { description: String(e) });
    }
  };

  const pct =
    progress && progress.total
      ? Math.round((progress.downloaded / progress.total) * 100)
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        // Click outside = "later" — same as the explicit button.
        if (e.target === e.currentTarget && !busy) setDismissed(true);
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-bg-elev-1 shadow-2xl fade-up">
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="rounded-xl bg-accent-soft p-2.5 text-accent">
            <ArrowUpCircle size={20} />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-semibold tracking-tight">
              Доступна новая версия
            </div>
            <div className="text-[12px] text-fg-muted">
              CoffeeStation <code>{available.version}</code>
            </div>
          </div>
          {!busy && (
            <button
              onClick={() => setDismissed(true)}
              className="rounded-md p-1 text-fg-subtle hover:bg-bg-elev-2 hover:text-fg"
              aria-label="Закрыть"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {available.notes && (
          <div className="mx-5 mt-3 max-h-44 overflow-y-auto rounded-md border border-border bg-bg px-3 py-2.5 text-[12px] leading-relaxed text-fg-muted">
            <ReleaseNotes raw={available.notes} />
          </div>
        )}

        {busy && (
          <div className="mx-5 mt-4 rounded-md bg-bg-elev-2 px-3 py-2">
            <div className="text-[11.5px] text-fg-muted mb-1.5">
              {pct !== null ? `Загрузка ${pct}%` : "Загрузка…"}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: pct !== null ? `${pct}%` : "30%" }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 px-5 pb-5 pt-4">
          <Button onClick={installNow} disabled={busy} className="w-full">
            <Download size={13} /> Обновиться сейчас
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDismissed(true)}
              className="flex-1"
            >
              В следующий раз
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={skipThisVersion}
              className="flex-1"
            >
              Пропустить
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Lightweight Markdown-ish renderer for release notes. We deliberately don't
 * pull in a full Markdown parser — the release body for this app is always a
 * short bullet list, so a few regex passes give us the right look:
 *
 *   - Heading lines (`##`) become small caps section labels
 *   - Lines starting with `-` or `*` become rendered bullets with accent dot
 *   - `**bold**`, `*italic*`, and `` `code` `` get inline styling
 *   - Blank lines flush the current bullet group
 */
function ReleaseNotes({ raw }: { raw: string }) {
  const lines = raw.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1 space-y-1">
        {bulletBuffer.map((b, i) => (
          <li key={i} className="flex gap-2 leading-snug">
            <span className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full bg-accent" />
            <span dangerouslySetInnerHTML={{ __html: inlineMd(b) }} />
          </li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      bulletBuffer.push(bullet[1]);
      continue;
    }
    flushBullets();
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <div
          key={`h-${blocks.length}`}
          className="mt-2 mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-fg"
        >
          {heading[1]}
        </div>,
      );
      continue;
    }
    blocks.push(
      <p
        key={`p-${blocks.length}`}
        className="my-1"
        dangerouslySetInnerHTML={{ __html: inlineMd(trimmed) }}
      />,
    );
  }
  flushBullets();
  return <>{blocks}</>;
}

/** Inline markdown: `**bold**`, `*italic*`, `` `code` ``. Escapes HTML first. */
function inlineMd(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, '<code class="rounded bg-bg-elev-2 px-1 py-0.5 text-[11px]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-fg">$1</strong>')
    .replace(/(^|\s)\*([^*]+)\*/g, '$1<em>$2</em>');
}
