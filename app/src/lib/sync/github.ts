"use client";

import { db, type Note } from "@/lib/db/schema";
import { noteToMarkdown } from "@/lib/desktop/export";
import { isDesktop } from "@/lib/desktop/runtime";

export interface GitHubConfig {
  /** OAuth App Client ID (Device-flow). Empty = use PAT fallback. */
  oauthClientId: string;
  /** OAuth username after device-flow auth. */
  oauthLogin: string;
  /** Cached avatar URL. */
  oauthAvatar?: string;
  repoUrl: string;
  token: string;
  localPath: string;
  authorName: string;
  authorEmail: string;
  /** Auto-sync on idle (5–10 min no input). */
  autoIdleEnabled: boolean;
  idleMinutes: number;
  /** Auto commit+push on window blur. */
  autoBlurEnabled: boolean;
  /** Auto pull on window focus. */
  autoFocusEnabled: boolean;
  /** Skip files larger than this (in MB) — stored via Git LFS. */
  largeFileThresholdMb: number;
  /** Use Git LFS for large media files (when available). */
  lfsEnabled: boolean;
  /** File-extension patterns to track via LFS. */
  lfsPatterns: string[];
  lastSyncedAt?: number;
  lastError?: string;
}

// GitHub CLI's published OAuth Client ID — public, well-known, used by `gh`
// for the same Device Flow. Safe to embed (no secret). Users can override.
export const DEFAULT_CLIENT_ID = "178c6fc778ccc68e1d6a";

export const DEFAULT_LFS_PATTERNS = [
  "*.mp4", "*.mov", "*.webm", "*.mkv",
  "*.mp3", "*.wav", "*.m4a", "*.flac", "*.ogg",
  "*.psd", "*.ai", "*.sketch",
  "*.zip", "*.tar", "*.tar.gz", "*.7z",
  "*.iso", "*.dmg",
];

const KEY = "github.sync";

export async function getGitHubConfig(): Promise<GitHubConfig> {
  const row = await db.settings.get(KEY);
  if (row?.value) {
    const cfg = row.value as Partial<GitHubConfig>;
    return {
      oauthClientId: cfg.oauthClientId ?? DEFAULT_CLIENT_ID,
      oauthLogin: cfg.oauthLogin ?? "",
      oauthAvatar: cfg.oauthAvatar,
      repoUrl: cfg.repoUrl ?? "",
      token: cfg.token ?? "",
      localPath: cfg.localPath ?? "",
      authorName: cfg.authorName ?? "",
      authorEmail: cfg.authorEmail ?? "",
      autoIdleEnabled: cfg.autoIdleEnabled ?? false,
      idleMinutes: cfg.idleMinutes ?? 7,
      autoBlurEnabled: cfg.autoBlurEnabled ?? false,
      autoFocusEnabled: cfg.autoFocusEnabled ?? false,
      largeFileThresholdMb: cfg.largeFileThresholdMb ?? 50,
      lfsEnabled: cfg.lfsEnabled ?? true,
      lfsPatterns: cfg.lfsPatterns ?? DEFAULT_LFS_PATTERNS,
      lastSyncedAt: cfg.lastSyncedAt,
      lastError: cfg.lastError,
    };
  }
  return {
    oauthClientId: DEFAULT_CLIENT_ID,
    oauthLogin: "",
    repoUrl: "",
    token: "",
    localPath: "",
    authorName: "",
    authorEmail: "",
    autoIdleEnabled: false,
    idleMinutes: 7,
    autoBlurEnabled: false,
    autoFocusEnabled: false,
    largeFileThresholdMb: 50,
    lfsEnabled: true,
    lfsPatterns: DEFAULT_LFS_PATTERNS,
  };
}

export async function saveGitHubConfig(cfg: Partial<GitHubConfig>): Promise<GitHubConfig> {
  const current = await getGitHubConfig();
  const merged = { ...current, ...cfg };
  await db.settings.put({ key: KEY, value: merged });
  return merged;
}

interface SyncResult {
  ok: boolean;
  added: number;
  message: string;
  detail?: string;
}

async function invoke<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(name, args);
}

/**
 * Mirror all notes from IndexedDB into the local git directory as .md files.
 * Folder structure on disk mirrors the in-app folders.
 */
async function exportNotesToWorkingDir(cfg: GitHubConfig): Promise<number> {
  const notes = await db.notes.filter((n) => n.archivedAt == null).toArray();
  const folders = await db.folders.toArray();
  const byId = new Map(folders.map((f) => [f.id, f]));

  const pathFor = (n: Note): string => {
    const parts: string[] = [];
    let cur = n.folderId ? byId.get(n.folderId) : null;
    while (cur) {
      parts.unshift(safeName(cur.name));
      cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
    }
    parts.push(`${safeName(n.title || "untitled")}.md`);
    return parts.join("/");
  };

  // Parallelise the writes through the Tauri bridge. File I/O is
  // independent per note, so awaiting each in series wasted RTTs.
  // Process in chunks to avoid swamping the OS with thousands of
  // concurrent opens on huge vaults.
  const CHUNK = 32;
  let written = 0;
  for (let i = 0; i < notes.length; i += CHUNK) {
    const slice = notes.slice(i, i + CHUNK);
    await Promise.all(
      slice.map((n) => {
        const full = `${cfg.localPath}/${pathFor(n)}`;
        return invoke<void>("write_text_file_at", {
          path: full,
          content: noteToMarkdown(n),
        });
      }),
    );
    written += slice.length;
  }
  return written;
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 100) || "untitled";
}

async function rustConfig(cfg: GitHubConfig) {
  return {
    repo_url: cfg.repoUrl,
    token: cfg.token,
    local_path: cfg.localPath,
    author_name: cfg.authorName || null,
    author_email: cfg.authorEmail || null,
  };
}

interface GitResult {
  success: boolean;
  stdout: string;
  stderr: string;
  command: string;
}

export async function initRepo(): Promise<SyncResult> {
  if (!isDesktop()) return { ok: false, added: 0, message: "Только на десктопе" };
  const cfg = await getGitHubConfig();
  if (!cfg.localPath) return { ok: false, added: 0, message: "Не указана локальная папка" };
  const res = await invoke<GitResult>("git_init_or_clone", { config: await rustConfig(cfg) });
  return {
    ok: res.success,
    added: 0,
    message: res.success ? "Репозиторий готов" : "Ошибка инициализации",
    detail: res.stdout || res.stderr,
  };
}

export async function pullRepo(opts: { silent?: boolean; reason?: string } = {}): Promise<SyncResult> {
  if (!isDesktop()) return { ok: false, added: 0, message: "Только на десктопе" };
  const cfg = await getGitHubConfig();
  if (!cfg.repoUrl || !cfg.token || !cfg.localPath) {
    return { ok: false, added: 0, message: "GitHub не настроен" };
  }

  // Drive the live progress indicator (LogsView reads this) and record
  // the full operation in the syncLog table when finished. Each phase
  // updates the message so the user sees what's actually happening.
  const reason = opts.reason ?? "manual";
  const startedAt = Date.now();
  const { useApp } = await import("@/lib/store");
  const { appendSyncLog } = await import("./log");
  useApp.getState().setSyncOp({
    kind: "pull",
    reason,
    message: "Получаем изменения с GitHub…",
    startedAt,
  });

  let res: GitResult | undefined;
  let imported = 0;
  let success = false;
  let message = "";
  let detail = "";
  try {
    res = await invoke<GitResult>("git_pull", { config: await rustConfig(cfg) });
    success = res.success;
    // Combine stdout + stderr so the user sees BOTH the successful step
    // output (e.g. the commit summary) AND the failure reason. Earlier this
    // was `stdout || stderr`, which silently hid the real "Push не удался"
    // stderr when commit step produced any stdout.
    detail = [res.stdout, res.stderr].filter(Boolean).join("\n\n").trim();

    let importError: string | null = null;
    if (res.success) {
      useApp.getState().setSyncOp({
        kind: "pull",
        reason,
        message: "Сканируем vault и импортируем заметки в базу…",
        startedAt,
      });
      try {
        const { importVaultFromFolder } = await import("@/lib/desktop/import");
        const result = await importVaultFromFolder(cfg.localPath);
        imported = result.notes;
        // Surface import outcome in the detail so the user can see what
        // happened. Previously a 0-note result looked identical to a
        // working import that found nothing new — masking bugs like
        // wrong localPath or a half-finished clone on a fresh device.
        const importSummary = `[import] scanned ${result.files} file(s), imported ${result.notes}, skipped ${result.skipped}, folders ${result.folders}`;
        detail = [detail, importSummary].filter(Boolean).join("\n\n").trim();
        if (result.errors.length > 0) {
          detail = [detail, `[import errors]\n  ${result.errors.slice(0, 5).join("\n  ")}`]
            .filter(Boolean)
            .join("\n\n");
        }
      } catch (e) {
        importError = e instanceof Error ? e.message : String(e);
        detail = [detail, `[import] FAILED: ${importError}`].filter(Boolean).join("\n\n").trim();
      }
    }

    message = res.success
      ? importError
        ? "Pull прошёл, но импорт vault не удался"
        : imported > 0
          ? `Получено и импортировано: ${imported} заметок`
          : "Изменения получены"
      : "Pull не удался";
    // An import failure shouldn't claim success — the user opened Pull to
    // see new notes, and if the import bombed the data isn't actually in
    // the DB.
    if (importError) success = false;
  } finally {
    useApp.getState().setSyncOp(null);
    await saveGitHubConfig({
      lastSyncedAt: Date.now(),
      lastError: success ? undefined : res?.stderr,
    });
    await appendSyncLog({
      kind: "pull",
      reason,
      startedAt,
      success,
      message: message || (success ? "Pull ok" : "Pull failed"),
      detail,
      added: imported,
    });
  }

  return { ok: success, added: imported, message, detail };
}

export async function pushAll(message?: string, reason: string = "manual"): Promise<SyncResult> {
  if (!isDesktop()) return { ok: false, added: 0, message: "Только на десктопе" };
  const cfg = await getGitHubConfig();
  if (!cfg.repoUrl || !cfg.token || !cfg.localPath) {
    return { ok: false, added: 0, message: "GitHub не настроен" };
  }

  const startedAt = Date.now();
  const { useApp } = await import("@/lib/store");
  const { appendSyncLog } = await import("./log");
  useApp.getState().setSyncOp({
    kind: "push",
    reason,
    message: "Подготавливаем файлы из базы…",
    startedAt,
  });

  let written = 0;
  let success = false;
  let detail = "";
  let resultMessage = "";
  try {
    written = await exportNotesToWorkingDir(cfg);
    useApp.getState().setSyncOp({
      kind: "push",
      reason,
      message: `Коммит и push на GitHub (${written} файлов)…`,
      startedAt,
    });
    const msg = message ?? `CoffeeStation sync: ${written} notes @ ${new Date().toISOString()}`;
    const res = await invoke<GitResult>("git_commit_and_push", {
      config: await rustConfig(cfg),
      message: msg,
    });
    success = res.success;
    // Combine stdout + stderr so the user sees BOTH the successful step
    // output (e.g. the commit summary) AND the failure reason. Earlier this
    // was `stdout || stderr`, which silently hid the real "Push не удался"
    // stderr when commit step produced any stdout.
    detail = [res.stdout, res.stderr].filter(Boolean).join("\n\n").trim();
    resultMessage = res.success ? `Pushed: ${written} файлов` : "Push не удался";
    await saveGitHubConfig({
      lastSyncedAt: Date.now(),
      lastError: success ? undefined : res.stderr,
    });
  } finally {
    useApp.getState().setSyncOp(null);
    await appendSyncLog({
      kind: "push",
      reason,
      startedAt,
      success,
      message: resultMessage || (success ? "Push ok" : "Push failed"),
      detail,
      added: written,
    });
  }

  return { ok: success, added: written, message: resultMessage, detail };
}

export async function isGitAvailable(): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    return await invoke<boolean>("git_check", {});
  } catch {
    return false;
  }
}

export async function isLfsAvailable(): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    return await invoke<boolean>("git_lfs_check", {});
  } catch {
    return false;
  }
}

// ───────────────── OAuth Device Flow ─────────────────

export interface DeviceStart {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
}

export interface GitHubUserInfo {
  login: string;
  name?: string;
  email?: string;
  avatar_url?: string;
}

/**
 * Starts the GitHub Device Flow. Returns a user_code (to show to the user) and
 * verification_uri (to open in the browser). Caller is responsible for polling.
 */
export async function deviceFlowStart(clientId: string): Promise<DeviceStart> {
  return invoke<DeviceStart>("github_device_start", { clientId });
}

interface PollResult {
  status: "pending" | "slow_down" | "ok" | "error";
  token: string | null;
  message: string | null;
}

/**
 * Polls until the user authorises the device. Resolves with the access token.
 * Times out after the device code's lifetime (returns null on timeout).
 */
export async function deviceFlowPoll(
  clientId: string,
  deviceCode: string,
  intervalSec: number,
  expiresIn: number,
  onTick?: (secondsLeft: number) => void,
): Promise<string | null> {
  const deadline = Date.now() + expiresIn * 1000;
  let interval = Math.max(intervalSec, 1);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval * 1000));
    onTick?.(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    const res = await invoke<PollResult>("github_device_poll", {
      clientId,
      deviceCode,
    });
    if (res.status === "ok" && res.token) return res.token;
    if (res.status === "error") throw new Error(res.message ?? "Authorization failed");
    if (res.status === "slow_down") interval += 5;
  }
  return null;
}

export async function fetchUser(token: string): Promise<GitHubUserInfo> {
  return invoke<GitHubUserInfo>("github_user", { token });
}

export interface EnsureRepoResult {
  clone_url: string;
  html_url: string;
  created: boolean;
}

/**
 * Returns the clone URL for `<user>/<name>`, creating it as a private repo if
 * it doesn't exist. The repo is initialised with auto_init=true so the first
 * push doesn't need to fight an empty remote.
 */
export async function ensureRepo(token: string, name: string, privateRepo = true): Promise<EnsureRepoResult> {
  return invoke<EnsureRepoResult>("github_ensure_repo", {
    token,
    name,
    private: privateRepo,
  });
}

interface GitResult {
  success: boolean;
  stdout: string;
  stderr: string;
  command: string;
}

export async function setupLfs(localPath: string, patterns: string[]): Promise<GitResult> {
  return invoke<GitResult>("git_lfs_setup", { localPath, patterns });
}

/**
 * Full automatic onboarding flow. Caller provides token + repo name + working
 * dir; this clones (or inits) the repo, sets up LFS (if available + enabled),
 * and persists the resulting config.
 */
export async function autoOnboard(opts: {
  token: string;
  repoName: string;
  localPath: string;
  user: GitHubUserInfo;
}): Promise<{ ok: boolean; message: string }> {
  // 1. Ensure repo exists on GitHub
  const repo = await ensureRepo(opts.token, opts.repoName, true);

  // 2. Persist auth + repo config
  await saveGitHubConfig({
    token: opts.token,
    oauthLogin: opts.user.login,
    oauthAvatar: opts.user.avatar_url,
    repoUrl: repo.clone_url,
    localPath: opts.localPath,
    authorName: opts.user.name || opts.user.login,
    authorEmail: opts.user.email || `${opts.user.login}@users.noreply.github.com`,
  });

  // 3. Clone or init
  const init = await initRepo();
  if (!init.ok) return { ok: false, message: init.message + " · " + (init.detail ?? "") };

  // 4. Set up LFS if available + enabled
  const cfg = await getGitHubConfig();
  if (cfg.lfsEnabled && (await isLfsAvailable())) {
    await setupLfs(opts.localPath, cfg.lfsPatterns);
  }

  // 5. First-time bring-down. For a brand-new install connecting to an
  //    existing vault, the clone above may have put files on disk but
  //    nothing has populated IndexedDB yet — so the app boots empty even
  //    though the vault is right there. Run a pull (which scans the
  //    working dir and imports into Dexie) so the user sees their notes
  //    immediately. If this is a fresh repo (nothing to pull), pull's
  //    import step is still a no-op, so this is safe either way.
  let firstPullSummary = "";
  try {
    const pull = await pullRepo({ silent: true, reason: "auto-onboard" });
    if (pull.ok && pull.added > 0) {
      firstPullSummary = ` · импортировано ${pull.added} заметок`;
    } else if (!pull.ok) {
      // Not a hard error — the connect itself succeeded. Surface as
      // soft warning text the caller can show. The Pull button stays
      // available for a retry.
      firstPullSummary = ` · pull не удался: ${pull.message}`;
    }
  } catch (e) {
    firstPullSummary = ` · pull выбросил: ${e instanceof Error ? e.message : String(e)}`;
  }

  return {
    ok: true,
    message: (repo.created
      ? `Создан приватный repo ${opts.user.login}/${opts.repoName}`
      : `Подключён ${opts.user.login}/${opts.repoName}`) + firstPullSummary,
  };
}
