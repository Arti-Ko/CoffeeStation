"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { isDesktop } from "@/lib/desktop/runtime";
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
  const [available, setAvailable] = useState<UpdateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Check for an update once on mount. Tauri's updater plugin caches the
  // result internally, so this stays cheap. Browser/dev runs are skipped.
  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (cancelled || !update) return;
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
      } catch (e) {
        // Network down, no release yet, signature mismatch — silently no-op.
        // The user can re-trigger via "Проверить обновления" in Settings (TBD).
        // eslint-disable-next-line no-console
        console.debug("[updater] check failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available || dismissed) return null;
  if (skipped.includes(available.version)) return null;

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
          <div className="mx-5 mt-3 max-h-40 overflow-y-auto rounded-md border border-border bg-bg px-3 py-2 text-[12px] leading-relaxed text-fg-muted whitespace-pre-wrap">
            {available.notes}
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
