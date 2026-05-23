"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { getGitHubConfig, pullRepo, pushAll, type GitHubConfig } from "@/lib/sync/github";
import { CloudCheck, CircleAlert, ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";

type SyncState = "idle" | "pushing" | "pulling" | "error" | "ok";

/**
 * Unobtrusive sync indicator pinned to the bottom-right corner.
 *
 * Drives the event-driven sync model:
 *   - Window blur          → push (debounced)
 *   - Window focus         → pull
 *   - User idle N minutes  → push
 *
 * Each trigger is independently toggle-able in Settings. The badge shows
 * state and last sync time on hover.
 */
export function SyncStatusBadge() {
  const cfgRow = useLiveQuery(() => db.settings.get("github.sync"));
  const cfg = (cfgRow?.value ?? null) as GitHubConfig | null;

  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState<string>("");

  const cfgRef = useRef<GitHubConfig | null>(cfg);
  useEffect(() => { cfgRef.current = cfg; }, [cfg]);

  const stateRef = useRef<SyncState>("idle");
  useEffect(() => { stateRef.current = state; }, [state]);

  const runPush = useCallback(async (reason: string) => {
    const c = cfgRef.current;
    if (!c || !c.repoUrl || !c.token || stateRef.current === "pushing") return;
    setState("pushing");
    setMessage(`Push (${reason})…`);
    const res = await pushAll();
    if (res.ok) {
      setState("ok");
      setMessage(res.added > 0 ? `Pushed ${res.added}` : "Up to date");
    } else {
      setState("error");
      setMessage(res.message);
    }
    setTimeout(() => stateRef.current === "ok" && setState("idle"), 4000);
  }, []);

  const runPull = useCallback(async (reason: string) => {
    const c = cfgRef.current;
    if (!c || !c.repoUrl || !c.token || stateRef.current === "pulling") return;
    setState("pulling");
    setMessage(`Pull (${reason})…`);
    const res = await pullRepo({ silent: true });
    if (res.ok) {
      setState("ok");
      setMessage("Pulled");
    } else {
      setState("error");
      setMessage(res.message);
    }
    setTimeout(() => stateRef.current === "ok" && setState("idle"), 4000);
  }, []);

  // ── Window blur → push, focus → pull
  useEffect(() => {
    const onBlur = () => {
      if (cfgRef.current?.autoBlurEnabled) runPush("blur");
    };
    const onFocus = () => {
      if (cfgRef.current?.autoFocusEnabled) runPull("focus");
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [runPush, runPull]);

  // ── Idle detection
  useEffect(() => {
    const evts = ["keydown", "mousedown", "mousemove", "wheel", "touchstart"] as const;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const arm = () => {
      if (timer) clearTimeout(timer);
      const c = cfgRef.current;
      if (!c?.autoIdleEnabled) return;
      const ms = Math.max(60, c.idleMinutes ?? 7) * 60 * 1000;
      timer = setTimeout(() => runPush("idle"), ms);
    };

    const onAct = () => arm();
    evts.forEach((e) => window.addEventListener(e, onAct, { passive: true }));
    arm();
    return () => {
      evts.forEach((e) => window.removeEventListener(e, onAct));
      if (timer) clearTimeout(timer);
    };
  }, [runPush, cfg?.autoIdleEnabled, cfg?.idleMinutes]);

  if (!cfg?.repoUrl) return null;

  // Hide when truly idle — only surface during activity, after recent action,
  // or on errors. This keeps the corner uncluttered.
  if (state === "idle" && !cfg.lastError) return null;

  const Icon = ICONS[state];
  return (
    <div
      className={cn(
        // bottom-LEFT corner — far from the right sidebar's settings gear and
        // sonner toasts (which live in the bottom-right).
        "fixed bottom-3 left-3 z-40 flex items-center gap-1.5 rounded-full border bg-bg-elev-1 px-2.5 py-1 text-[11px] shadow-xl fade-up backdrop-blur-md max-w-[260px]",
        state === "error" ? "border-danger text-danger" :
        state === "ok" ? "border-success/40 text-success" :
        state === "pushing" || state === "pulling" ? "border-accent text-accent" :
        "border-border text-fg-muted",
      )}
      title={cfg.lastSyncedAt ? `Последний sync: ${new Date(cfg.lastSyncedAt).toLocaleTimeString()}` : "Не синхронизировано"}
    >
      <Icon size={11} className={state === "pushing" || state === "pulling" ? "animate-spin" : ""} />
      <span className="truncate">{message || "Sync ready"}</span>
    </div>
  );
}

const ICONS: Record<SyncState, React.ComponentType<{ size?: number; className?: string }>> = {
  idle: CloudCheck,
  pushing: ArrowUp,
  pulling: ArrowDown,
  error: CircleAlert,
  ok: CloudCheck,
};
