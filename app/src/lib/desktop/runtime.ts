"use client";

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface PlatformInfo {
  platform: string;
  arch: string;
  version: string;
}

export async function getPlatform(): Promise<PlatformInfo | null> {
  if (!isDesktop()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<PlatformInfo>("platform_info");
}
