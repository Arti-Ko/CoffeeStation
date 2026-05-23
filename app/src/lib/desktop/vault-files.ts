"use client";

import { isDesktop } from "./runtime";

export interface VaultFileEntry {
  path: string;
  relative: string;
  name: string;
  ext: string;
  size: number;
  modified: number;
  kind: "image" | "video" | "audio" | "pdf" | "doc" | "sheet" | "text" | "code" | "note" | "other";
}

export async function scanVaultFiles(root: string): Promise<VaultFileEntry[]> {
  if (!isDesktop() || !root) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<VaultFileEntry[]>("scan_vault_files", { root });
}

/**
 * Converts an absolute file path to a webview-loadable URL using Tauri's
 * asset protocol. Works with the global `assetProtocol` enabled in
 * tauri.conf.json. Returns `null` on web.
 */
export async function fileAssetUrl(absolutePath: string): Promise<string | null> {
  if (!isDesktop() || !absolutePath) return null;
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(absolutePath, "asset");
}

export async function readTextFile(path: string): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("read_text_file", { path });
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<void>("write_text_file_at", { path, content });
}

export async function readBinaryFile(path: string): Promise<Uint8Array> {
  const { invoke } = await import("@tauri-apps/api/core");
  const arr = await invoke<number[]>("read_binary_file", { path });
  return Uint8Array.from(arr);
}

export async function writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<void>("write_binary_file", { path, content: Array.from(bytes) });
}
