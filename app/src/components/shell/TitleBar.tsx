"use client";

import { useEffect, useState } from "react";
import { isDesktop, getPlatform } from "@/lib/desktop/runtime";
import { Coffee, Minus, Square, X } from "lucide-react";
import { useApp } from "@/lib/store";

export function TitleBar() {
  const [platform, setPlatform] = useState<string | null>(null);
  const view = useApp((s) => s.view);

  useEffect(() => {
    getPlatform().then((p) => setPlatform(p?.platform ?? null));
  }, []);

  if (!isDesktop()) return null;

  const isMac = platform === "macos";

  const titleForView = (() => {
    switch (view.kind) {
      case "knowledge-base": return "Knowledge Base";
      case "knowledge-graph": return "Knowledge Graph";
      case "canvas": return "Canvas";
      case "files": return "Все файлы";
      case "database": return "Databases";
      case "daily": return "Daily Notes";
      case "templates": return "Шаблоны";
      case "settings": return "Настройки";
      case "theme-studio": return "Theme Studio";
      case "note": return "Заметка";
      default: return "CoffeeStation";
    }
  })();

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 select-none items-center justify-between border-b border-border bg-bg-elev-1 px-3"
      style={{ paddingLeft: isMac ? 80 : 12 }}
    >
      <div data-tauri-drag-region className="flex items-center gap-2 pointer-events-none">
        <Coffee size={13} className="text-accent" />
        <span className="text-[12px] font-medium text-fg-muted">CoffeeStation</span>
        <span className="text-[11px] text-fg-subtle">·</span>
        <span className="text-[12px] text-fg-muted">{titleForView}</span>
      </div>
      {!isMac && <WindowsControls />}
    </div>
  );
}

function WindowsControls() {
  const minimize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  };
  const toggle = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().toggleMaximize();
  };
  const close = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  };
  return (
    <div className="flex items-center">
      <button onClick={minimize} className="grid h-9 w-11 place-items-center text-fg-muted hover:bg-bg-elev-2">
        <Minus size={13} />
      </button>
      <button onClick={toggle} className="grid h-9 w-11 place-items-center text-fg-muted hover:bg-bg-elev-2">
        <Square size={11} />
      </button>
      <button onClick={close} className="grid h-9 w-11 place-items-center text-fg-muted hover:bg-danger hover:text-white">
        <X size={13} />
      </button>
    </div>
  );
}
