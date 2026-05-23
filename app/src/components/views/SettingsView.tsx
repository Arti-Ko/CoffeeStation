"use client";

import { useApp } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { useEffect, useState } from "react";
import {
  Sun,
  Moon,
  Monitor,
  Languages,
  Shield,
  Cloud,
  KeyRound,
  Sparkles,
  Download,
  Upload,
  Trash2,
  FolderOpen,
  Folder,
  ExternalLink,
} from "lucide-react";
import { deriveMasterKey, generateKeyPair, fingerprintKey } from "@/lib/crypto/e2ee";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getVaultPaths, setVaultPaths, pickFolder, revealFolder, ensureFolder, type VaultPaths } from "@/lib/desktop/paths";
import {
  getNewNotePref,
  saveNewNotePref,
  type NewNoteLocation,
} from "@/lib/db/note-create";
import { isDesktop } from "@/lib/desktop/runtime";
import { importVaultFromFolder, type ImportResult } from "@/lib/desktop/import";
import { FolderInput, GripVertical, Eye, EyeOff, GitBranch, ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { NAV_ITEMS } from "@/components/shell/Sidebar";
import {
  getGitHubConfig,
  saveGitHubConfig,
  initRepo,
  pullRepo,
  pushAll,
  isGitAvailable,
  isLfsAvailable,
  deviceFlowStart,
  deviceFlowPoll,
  fetchUser,
  autoOnboard,
  setupLfs,
  DEFAULT_CLIENT_ID,
  DEFAULT_LFS_PATTERNS,
  type GitHubConfig,
  type GitHubUserInfo,
} from "@/lib/sync/github";

export function SettingsView() {
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const locale = useApp((s) => s.locale);
  const setLocale = useApp((s) => s.setLocale);
  const t = useT();
  const settings = useLiveQuery(() => db.settings.toArray()) ?? [];
  const get = (k: string, fallback?: unknown) => settings.find((s) => s.key === k)?.value ?? fallback;

  const [vaultName, setVaultName] = useState<string>("My Vault");
  const [e2eeEnabled, setE2eeEnabled] = useState<boolean>(true);
  const [pubKey, setPubKey] = useState<string>("");
  const [paths, setPaths] = useState<VaultPaths | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setVaultName(String(get("vault.name", "My Vault")));
    setE2eeEnabled(Boolean(get("e2ee.enabled", true)));
    setPubKey(String(get("e2ee.pubkey", "")));
  }, [settings.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getVaultPaths().then(setPaths);
  }, []);

  const updatePath = async (key: keyof VaultPaths, value: string | boolean) => {
    const next = await setVaultPaths({ [key]: value } as Partial<VaultPaths>);
    setPaths(next);
    // vaultRoot is now also the GitHub sync's working dir. The next call to
    // getGitHubConfig() resolves to the new vaultRoot automatically; we
    // nudge any mounted GitHubSyncSection to re-fetch via a custom event
    // so the "Git работает в …" label updates without a navigation away
    // and back.
    if (key === "vaultRoot" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("cs:vault-root-changed", { detail: value }));
    }
  };

  const pickAndSet = async (key: keyof VaultPaths, label: string) => {
    if (!paths) return;
    const current = paths[key];
    const chosen = await pickFolder(`Выберите папку: ${label}`, typeof current === "string" ? current : undefined);
    if (chosen) {
      await updatePath(key, chosen);
      await ensureFolder(chosen);
      toast.success(`${label}: путь обновлён`, { description: chosen });
      if (key === "vaultRoot") {
        // Ask if user wants to import the contents (Obsidian/markdown vault)
        const wantImport = await confirmImport(chosen);
        if (wantImport) await runImport(chosen);
      }
    }
  };

  const runImport = async (root: string) => {
    setImporting(true);
    const toastId = toast.loading("Сканирую vault…", { description: root });
    try {
      const res: ImportResult = await importVaultFromFolder(root);
      toast.success(
        `Импорт завершён: ${res.notes} заметок · ${res.folders} папок`,
        {
          id: toastId,
          description: `${res.files} файлов всего · ${res.skipped} без изменений${res.errors.length ? ` · ${res.errors.length} ошибок` : ""}`,
          duration: 6000,
        },
      );
      if (res.errors.length) {
        console.warn("Vault import errors:", res.errors);
      }
    } catch (e) {
      toast.error("Не удалось импортировать", { id: toastId, description: String(e) });
    } finally {
      setImporting(false);
    }
  };

  const save = async (key: string, value: unknown) => {
    await db.settings.put({ key, value });
  };

  const generateE2eeKeys = async () => {
    const kp = await generateKeyPair();
    await save("e2ee.pubkey", kp.publicKey);
    await save("e2ee.seckey", kp.secretKey); // в проде — в keychain
    const fp = await fingerprintKey(kp.publicKey);
    setPubKey(kp.publicKey);
    toast.success("Сгенерирована новая пара ключей", { description: "Fingerprint: " + fp });
  };

  const exportVault = async () => {
    const data = {
      notes: await db.notes.toArray(),
      folders: await db.folders.toArray(),
      tags: await db.tags.toArray(),
      databases: await db.databases.toArray(),
      dbViews: await db.dbViews.toArray(),
      dbRows: await db.dbRows.toArray(),
      canvases: await db.canvases.toArray(),
      mindmaps: await db.mindmaps.toArray(),
      flows: await db.flows.toArray(),
      templates: await db.templates.toArray(),
      versions: await db.versions.toArray(),
      settings: await db.settings.toArray(),
      exportedAt: Date.now(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coffeestation-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Vault экспортирован");
  };

  const importVault = async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text);
    await db.transaction("rw", db.tables, async () => {
      if (data.notes) await db.notes.bulkPut(data.notes);
      if (data.folders) await db.folders.bulkPut(data.folders);
      if (data.tags) await db.tags.bulkPut(data.tags);
      if (data.databases) await db.databases.bulkPut(data.databases);
      if (data.dbViews) await db.dbViews.bulkPut(data.dbViews);
      if (data.dbRows) await db.dbRows.bulkPut(data.dbRows);
      if (data.canvases) await db.canvases.bulkPut(data.canvases);
      if (data.mindmaps) await db.mindmaps.bulkPut(data.mindmaps);
      if (data.flows) await db.flows.bulkPut(data.flows);
      if (data.templates) await db.templates.bulkPut(data.templates);
      if (data.versions) await db.versions.bulkPut(data.versions);
      if (data.settings) await db.settings.bulkPut(data.settings);
    });
    toast.success("Импорт завершён");
  };

  const wipeAll = async () => {
    if (!confirm("Удалить все данные локально? Действие необратимо.")) return;
    await db.delete();
    location.reload();
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-3">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
          Настройки
        </h2>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
        <Section title="Vault" description="Имя и базовые параметры хранилища">
          <Row label="Имя vault">
            <Input value={vaultName} onChange={(e) => setVaultName(e.target.value)} onBlur={() => save("vault.name", vaultName)} />
          </Row>
        </Section>

        {paths && (
          <Section
            title="Пути к файлам"
            description={
              isDesktop()
                ? "Где хранятся ваши .md заметки, attachments, экспорты и бэкапы. По умолчанию — ~/Documents/CoffeeStation."
                : "Десктоп-версия использует папки на диске. Веб-версия игнорирует эти настройки."
            }
          >
            <PathRow
              label="Vault root"
              value={paths.vaultRoot}
              onPick={() => pickAndSet("vaultRoot", "Vault root")}
              onReveal={() => revealFolder(paths.vaultRoot)}
              onChange={(v) => updatePath("vaultRoot", v)}
              disabled={!isDesktop()}
            />
            <Row label="Импорт из vault">
              <Button
                size="sm"
                variant="default"
                onClick={() => paths.vaultRoot && runImport(paths.vaultRoot)}
                disabled={!isDesktop() || !paths.vaultRoot || importing}
              >
                <FolderInput size={13} />
                {importing ? "Импортирую…" : "Загрузить .md из Vault root"}
              </Button>
              <span className="text-[11px] text-fg-subtle">
                Подхватывает .md/.markdown/.txt рекурсивно. Frontmatter, теги и <code>[[wiki-links]]</code> сохраняются. Идемпотентно.
              </span>
            </Row>
            <PathRow
              label="Attachments"
              value={paths.attachments}
              onPick={() => pickAndSet("attachments", "Attachments")}
              onReveal={() => revealFolder(paths.attachments)}
              onChange={(v) => updatePath("attachments", v)}
              disabled={!isDesktop()}
            />
            <PathRow
              label="Папка экспорта"
              value={paths.exports}
              onPick={() => pickAndSet("exports", "Папка экспорта")}
              onReveal={() => revealFolder(paths.exports)}
              onChange={(v) => updatePath("exports", v)}
              disabled={!isDesktop()}
            />
            <PathRow
              label="Бэкапы"
              value={paths.backups}
              onPick={() => pickAndSet("backups", "Бэкапы")}
              onReveal={() => revealFolder(paths.backups)}
              onChange={(v) => updatePath("backups", v)}
              disabled={!isDesktop()}
            />
            <PathRow
              label="Темы (Theme Studio)"
              value={paths.themes}
              onPick={() => pickAndSet("themes", "Темы")}
              onReveal={() => revealFolder(paths.themes)}
              onChange={(v) => updatePath("themes", v)}
              disabled={!isDesktop()}
            />
            <p className="text-[11px] text-fg-subtle leading-relaxed mt-1 max-w-md">
              Когда Vault root задан, заметки автоматически зеркалируются на диск
              как <code>{"<title>.md"}</code> в той же подпапке, в которой они
              лежат в дереве слева. Источник истины — IndexedDB.
            </p>
          </Section>
        )}

        <Section title="Тема" description="Цветовая схема приложения">
          <div className="flex gap-2">
            <ThemeBtn current={theme} value="light" setTheme={setTheme} Icon={Sun}>Светлая</ThemeBtn>
            <ThemeBtn current={theme} value="dark" setTheme={setTheme} Icon={Moon}>Тёмная</ThemeBtn>
            <ThemeBtn current={theme} value="system" setTheme={setTheme} Icon={Monitor}>Системная</ThemeBtn>
          </div>
        </Section>

        <Section title="Язык" description="Интерфейс">
          <div className="flex gap-2">
            <Button variant={locale === "ru" ? "default" : "secondary"} onClick={() => setLocale("ru")}>
              <Languages size={13} /> Русский
            </Button>
            <Button variant={locale === "en" ? "default" : "secondary"} onClick={() => setLocale("en")}>
              <Languages size={13} /> English
            </Button>
          </div>
        </Section>

        <Section
          title="Поведение при запуске"
          description="Как должны выглядеть папки в Files-панели сразу после открытия приложения"
        >
          <StartupExpandPicker />
        </Section>

        <Section
          title="Куда сохранять новые заметки"
          description="То же поведение, что и в Obsidian: «Default location for new notes»"
        >
          <NewNoteLocationPicker />
        </Section>

        <NavCustomizationSection />

        <Section title="E2EE и синхронизация" description="Zero-knowledge шифрование контента">
          <Row label="E2EE включено">
            <input
              type="checkbox"
              checked={e2eeEnabled}
              onChange={(e) => { setE2eeEnabled(e.target.checked); save("e2ee.enabled", e.target.checked); }}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </Row>
          <Row label="Public key">
            <div className="flex items-center gap-2 flex-1">
              <Input readOnly value={pubKey || "не сгенерирован"} className="font-mono text-[11px]" />
              <Button size="sm" variant="secondary" onClick={generateE2eeKeys}>
                <KeyRound size={12} /> Сгенерировать
              </Button>
            </div>
          </Row>
          <p className="text-[11px] text-fg-subtle leading-relaxed mt-2 max-w-md">
            Алгоритмы: XChaCha20-Poly1305 (данные) + X25519 (обмен ключами) + Argon2id (KDF).
            Сервер хранит только зашифрованные blob-ы — содержимое недоступно даже нам.
          </p>
        </Section>

        <Section title="Экспорт / Импорт" description="Backup всего vault в JSON">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportVault}><Download size={13} /> Экспорт JSON</Button>
            <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-bg-elev-2 px-3 h-8 text-sm font-medium hover:bg-bg-elev-3">
              <Upload size={13} /> Импорт
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importVault(f);
                }}
              />
            </label>
          </div>
        </Section>

        <GitHubSyncSection />

        <Section title="Опасная зона" description="Полная очистка локальной базы">
          <Button variant="danger" onClick={wipeAll}>
            <Trash2 size={13} /> Удалить все локальные данные
          </Button>
        </Section>

        <AboutSection />
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 border-b border-border pb-6 last:border-0">
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-center gap-3">
      <div className="text-[13px] text-fg-muted">{label}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

async function confirmImport(path: string): Promise<boolean> {
  if (isDesktop()) {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return await ask(
      `Импортировать все .md/.markdown/.txt файлы из «${path}» в CoffeeStation?\n\nСтруктура папок и frontmatter будут сохранены. Повторный импорт обновит только изменённые заметки.`,
      { title: "Импорт vault", kind: "info", okLabel: "Импортировать", cancelLabel: "Позже" },
    );
  }
  return confirm(`Импортировать .md файлы из ${path}?`);
}

function PathRow({
  label,
  value,
  onPick,
  onReveal,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onPick: () => void;
  onReveal: () => void;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-center gap-3">
      <div className="text-[13px] text-fg-muted">{label}</div>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={disabled ? "только в десктоп-версии" : "/path/to/folder"}
          className="font-mono text-[11.5px]"
          disabled={disabled}
        />
        <Button size="sm" variant="secondary" onClick={onPick} disabled={disabled}>
          <FolderOpen size={12} /> Выбрать…
        </Button>
        <Button size="sm" variant="ghost" onClick={onReveal} disabled={disabled || !value} title="Открыть в Finder/Explorer">
          <ExternalLink size={12} />
        </Button>
      </div>
    </div>
  );
}

function ThemeBtn({
  current,
  value,
  setTheme,
  Icon,
  children,
}: {
  current: string;
  value: "light" | "dark" | "system";
  setTheme: (v: "light" | "dark" | "system") => void;
  Icon: React.ComponentType<{ size?: number }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => setTheme(value)}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        current === value ? "bg-accent text-accent-fg" : "bg-bg-elev-2 text-fg-muted hover:bg-bg-elev-3"
      }`}
    >
      <Icon size={13} />
      {children}
    </button>
  );
}

function NavCustomizationSection() {
  const hidden = useLiveQuery(() => db.settings.get("ui.hiddenNav"));
  const order = useLiveQuery(() => db.settings.get("ui.navOrder"));
  const hiddenSet = new Set((hidden?.value ?? []) as string[]);
  const orderArr = (order?.value as string[] | undefined) ?? NAV_ITEMS.map((n) => n.key);

  const items = orderArr
    .map((k) => NAV_ITEMS.find((n) => n.key === k))
    .filter(Boolean) as typeof NAV_ITEMS;
  const extras = NAV_ITEMS.filter((n) => !orderArr.includes(n.key));
  const allItems = [...items, ...extras];

  const setHidden = async (next: string[]) => {
    await db.settings.put({ key: "ui.hiddenNav", value: next });
  };
  const setOrder = async (next: string[]) => {
    await db.settings.put({ key: "ui.navOrder", value: next });
  };

  const toggle = (key: string) => {
    if (hiddenSet.has(key)) setHidden(Array.from(hiddenSet).filter((k) => k !== key));
    else setHidden([...Array.from(hiddenSet), key]);
  };

  const onDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.setData("text/plain", key);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDropAt = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    const sourceKey = e.dataTransfer.getData("text/plain");
    if (!sourceKey || sourceKey === targetKey) return;
    const current = allItems.map((n) => n.key);
    const without = current.filter((k) => k !== sourceKey);
    const idx = without.indexOf(targetKey);
    without.splice(idx, 0, sourceKey);
    setOrder(without);
  };

  return (
    <Section
      title="Панель инструментов"
      description="Включайте/выключайте пункты и перетаскивайте, чтобы изменить порядок"
    >
      <div className="space-y-1">
        {allItems.map((item) => {
          const isHidden = hiddenSet.has(item.key);
          return (
            <div
              key={item.key}
              draggable
              onDragStart={(e) => onDragStart(e, item.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropAt(e, item.key)}
              className="group flex items-center gap-3 rounded-md border border-border bg-bg-elev-1 px-2.5 py-1.5 hover:border-accent transition-colors"
            >
              <GripVertical size={12} className="text-fg-subtle cursor-grab active:cursor-grabbing" />
              <item.Icon size={13} className="text-fg-muted" />
              <span className={`flex-1 text-[13px] ${isHidden ? "text-fg-subtle line-through" : "text-fg"}`}>
                {item.fallbackLabel}
              </span>
              <button
                onClick={() => toggle(item.key)}
                className="text-fg-subtle hover:text-fg p-1 rounded hover:bg-bg-elev-2"
                title={isHidden ? "Показать" : "Скрыть"}
              >
                {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}



function GitHubSyncSection() {
  const [cfg, setCfg] = useState<GitHubConfig | null>(null);
  const [gitAvailable, setGitAvailable] = useState<boolean | null>(null);
  const [lfsAvailable, setLfsAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<{
    user_code: string;
    verification_uri: string;
    secondsLeft: number;
  } | null>(null);
  const [repoName, setRepoName] = useState("coffeestation-vault");

  useEffect(() => {
    getGitHubConfig().then(setCfg);
    isGitAvailable().then(setGitAvailable);
    isLfsAvailable().then(setLfsAvailable);
    // vaultRoot lives in a sibling component now (Пути к файлам). When it
    // changes, the derived cfg.localPath here is stale until refetched.
    const onVaultChange = () => {
      getGitHubConfig().then(setCfg);
    };
    window.addEventListener("cs:vault-root-changed", onVaultChange);
    return () => window.removeEventListener("cs:vault-root-changed", onVaultChange);
  }, []);

  if (!cfg) return null;

  const update = async (patch: Partial<GitHubConfig>) => {
    const next = await saveGitHubConfig(patch);
    setCfg(next);
  };

  const connectGitHub = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const clientId = cfg.oauthClientId || DEFAULT_CLIENT_ID;
      const start = await deviceFlowStart(clientId);
      setDevice({
        user_code: start.user_code,
        verification_uri: start.verification_uri,
        secondsLeft: start.expires_in,
      });
      // copy user_code → clipboard for convenience
      await navigator.clipboard.writeText(start.user_code).catch(() => {});
      // open browser
      const { open: openUrl } = await import("@tauri-apps/plugin-shell");
      await openUrl(start.verification_uri);
      toast.info("Код скопирован, вставьте на github.com", {
        description: start.user_code,
        duration: 6000,
      });
      const token = await deviceFlowPoll(
        clientId,
        start.device_code,
        start.interval,
        start.expires_in,
        (left) => setDevice((d) => (d ? { ...d, secondsLeft: left } : null)),
      );
      setDevice(null);
      if (!token) {
        toast.error("Время авторизации истекло");
        return;
      }
      const user = await fetchUser(token);
      // Default the git working tree to the vault root itself. Putting `.git`
      // *inside* the vault means git tracks the same `.md` files that the
      // editor auto-mirrors — no parallel "_git" subfolder. Old configs that
      // still point at `<root>/_git` keep working, they're just deprecated.
      const paths = await getVaultPaths();
      const localPath = cfg.localPath || paths.vaultRoot || "";
      await update({
        token,
        oauthLogin: user.login,
        oauthAvatar: user.avatar_url,
        authorName: cfg.authorName || user.name || user.login,
        authorEmail:
          cfg.authorEmail || user.email || `${user.login}@users.noreply.github.com`,
        localPath,
      });
      toast.success(`Вошли как ${user.login}`);
    } catch (e) {
      setDevice(null);
      toast.error("Авторизация не удалась", { description: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const createOrConnectRepo = async () => {
    if (busy || !cfg.token) return;
    setBusy(true);
    try {
      const user = await fetchUser(cfg.token);
      const paths = await getVaultPaths();
      const localPath = cfg.localPath || paths.vaultRoot || "";
      const res = await autoOnboard({
        token: cfg.token,
        repoName: repoName.trim() || "coffeestation-vault",
        localPath,
        user,
      });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      const fresh = await getGitHubConfig();
      setCfg(fresh);
    } catch (e) {
      toast.error("Не удалось подключить repo", { description: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Отключить GitHub? Локальные файлы и репозиторий не удаляются.")) return;
    await update({
      token: "",
      oauthLogin: "",
      oauthAvatar: undefined,
      repoUrl: "",
      lastSyncedAt: undefined,
      lastError: undefined,
    });
    toast.success("GitHub отключён");
  };

  const run = async (fn: () => Promise<{ ok: boolean; message: string; detail?: string }>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) toast.success(res.message, { description: res.detail?.slice(0, 200) });
      else toast.error(res.message, { description: res.detail?.slice(0, 300) });
      const fresh = await getGitHubConfig();
      setCfg(fresh);
    } finally {
      setBusy(false);
    }
  };

  const isConnected = Boolean(cfg.token && cfg.oauthLogin);
  const hasRepo = Boolean(cfg.repoUrl && cfg.localPath);

  return (
    <Section
      title="GitHub синхронизация"
      description={
        gitAvailable === false
          ? "⚠️ git не установлен. macOS: xcode-select --install"
          : "Авторизуйтесь через GitHub Device Flow — приложение само создаст приватный репозиторий и настроит LFS для больших файлов."
      }
    >
      {!isConnected ? (
        <div className="space-y-3">
          {device ? (
            <div className="rounded-lg border border-accent bg-accent-soft/30 p-4 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-fg-subtle">
                Введите код на странице GitHub
              </div>
              <div className="font-mono text-2xl font-bold tracking-widest text-accent select-all">
                {device.user_code}
              </div>
              <div className="text-[11px] text-fg-muted">
                Код уже скопирован в буфер. Если страница не открылась —{" "}
                <a href={device.verification_uri} target="_blank" rel="noreferrer" className="text-accent underline">
                  github.com/login/device
                </a>
                . Ждём подтверждения · {Math.max(0, Math.floor(device.secondsLeft / 60))}:
                {String(device.secondsLeft % 60).padStart(2, "0")} осталось.
              </div>
            </div>
          ) : (
            <Button size="md" variant="default" onClick={connectGitHub} disabled={busy || gitAvailable === false}>
              <GitBranch size={14} /> Войти через GitHub
            </Button>
          )}
          <details className="text-[11px] text-fg-subtle">
            <summary className="cursor-pointer hover:text-fg-muted">Расширенные настройки OAuth Client ID</summary>
            <div className="mt-2 pl-2">
              <Input
                value={cfg.oauthClientId}
                onChange={(e) => setCfg({ ...cfg, oauthClientId: e.target.value })}
                onBlur={() => update({ oauthClientId: cfg.oauthClientId || DEFAULT_CLIENT_ID })}
                placeholder={DEFAULT_CLIENT_ID}
                className="font-mono text-[11.5px]"
              />
              <p className="mt-1 text-[10.5px]">
                По умолчанию — публичный Client ID GitHub CLI. Можно подменить своим OAuth App.
              </p>
            </div>
          </details>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Connected user banner */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-elev-2 p-3">
            {cfg.oauthAvatar ? (
              <img src={cfg.oauthAvatar} alt="" className="h-9 w-9 rounded-full" />
            ) : (
              <div className="h-9 w-9 rounded-full bg-bg-elev-3 flex items-center justify-center text-fg-muted">
                <GitBranch size={16} />
              </div>
            )}
            <div className="flex-1">
              <div className="text-[13px] font-semibold">{cfg.oauthLogin}</div>
              <div className="text-[11px] text-fg-subtle">
                {hasRepo ? `Подключён ${cfg.repoUrl.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "")}` : "Не выбран репозиторий"}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={disconnect}>
              Выйти
            </Button>
          </div>

          {!hasRepo && (
            <div className="rounded-lg border border-dashed border-border bg-bg p-3 space-y-2">
              <div className="text-[12px] text-fg">Создать или подключить репозиторий</div>
              <div className="flex gap-2">
                <Input
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="coffeestation-vault"
                  className="font-mono text-[12px]"
                />
                <Button size="sm" variant="default" onClick={createOrConnectRepo} disabled={busy}>
                  <GitBranch size={12} /> Создать / подключить
                </Button>
              </div>
              <p className="text-[10.5px] text-fg-subtle">
                Если такого репозитория ещё нет — он будет создан приватным. Если есть — будет
                клонирован в локальную папку и подключён.
              </p>
            </div>
          )}

          {hasRepo && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => run(() => pullRepo())} disabled={busy}>
                  <ArrowDown size={12} /> Pull
                </Button>
                <Button size="sm" variant="default" onClick={() => run(() => pushAll())} disabled={busy}>
                  <ArrowUp size={12} /> Push сейчас
                </Button>
                {lfsAvailable && cfg.lfsEnabled && cfg.localPath && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => run(async () => {
                      const r = await setupLfs(cfg.localPath, cfg.lfsPatterns);
                      return { ok: r.success, message: r.success ? "LFS настроен" : "LFS ошибка", detail: r.stderr || r.stdout };
                    })}
                    disabled={busy}
                  >
                    <RefreshCw size={12} /> Перенастроить LFS
                  </Button>
                )}
                {busy && (
                  <span className="flex items-center gap-1 text-[11px] text-fg-subtle">
                    <RefreshCw size={11} className="animate-spin" /> Идёт sync…
                  </span>
                )}
                {cfg.lastSyncedAt && (
                  <span className="text-[11px] text-fg-subtle self-center">
                    Последний sync: {new Date(cfg.lastSyncedAt).toLocaleString()}
                  </span>
                )}
              </div>

              {/*
                Git working dir is the same as Vault root — change it in the
                "Пути к файлам" section above. Keeping a separate input here
                let users set two different paths and silently break sync.
              */}
              <div className="rounded-md border border-border bg-bg-elev-0 px-3 py-2 text-[11.5px] text-fg-muted leading-relaxed">
                Git работает в той же папке, что и Vault root —
                <code className="font-mono text-fg ml-1">{cfg.localPath || "(не задана)"}</code>.
                Чтобы сменить — отредактируйте Vault root в разделе «Пути к файлам» выше.
              </div>
            </>
          )}

          {/* Auto-sync */}
          <div className="pt-3 mt-3 border-t border-border space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1">Авто-синхронизация</div>
            <Row label="При бездействии">
              <input
                type="checkbox"
                checked={cfg.autoIdleEnabled}
                onChange={(e) => update({ autoIdleEnabled: e.target.checked })}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="text-[11px] text-fg-subtle">через</span>
              <input
                type="number"
                min={1}
                max={120}
                value={cfg.idleMinutes}
                onChange={(e) => update({ idleMinutes: parseInt(e.target.value) || 7 })}
                className="w-14 h-7 rounded border border-border bg-bg-elev-1 px-2 text-sm text-center"
              />
              <span className="text-[11px] text-fg-subtle">мин → push</span>
            </Row>
            <Row label="При потере фокуса">
              <input
                type="checkbox"
                checked={cfg.autoBlurEnabled}
                onChange={(e) => update({ autoBlurEnabled: e.target.checked })}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="text-[11px] text-fg-subtle">переключение → push</span>
            </Row>
            <Row label="При возврате фокуса">
              <input
                type="checkbox"
                checked={cfg.autoFocusEnabled}
                onChange={(e) => update({ autoFocusEnabled: e.target.checked })}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="text-[11px] text-fg-subtle">возврат → pull</span>
            </Row>
          </div>

          {/* Large files via LFS */}
          <div className="pt-3 mt-3 border-t border-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-fg-subtle">
                Большие файлы (Git LFS)
              </div>
              <span
                className={cn(
                  "text-[10px] uppercase tracking-wider font-semibold",
                  lfsAvailable ? "text-success" : "text-warning",
                )}
              >
                {lfsAvailable === null ? "…" : lfsAvailable ? "git-lfs OK" : "git-lfs не установлен"}
              </span>
            </div>
            {!lfsAvailable && (
              <p className="text-[11px] text-warning">
                Установите Git LFS: <code className="font-mono">brew install git-lfs</code>, затем
                перезапустите приложение.
              </p>
            )}
            <Row label="Использовать LFS">
              <input
                type="checkbox"
                checked={cfg.lfsEnabled}
                onChange={(e) => update({ lfsEnabled: e.target.checked })}
                disabled={!lfsAvailable}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="text-[11px] text-fg-subtle">
                видео / аудио / PDF / архивы → LFS (доступно 1 ГБ free на GitHub)
              </span>
            </Row>
            <Row label="Порог в МБ">
              <input
                type="number"
                min={1}
                max={5000}
                value={cfg.largeFileThresholdMb}
                onChange={(e) => update({ largeFileThresholdMb: parseInt(e.target.value) || 50 })}
                className="w-20 h-7 rounded border border-border bg-bg-elev-1 px-2 text-sm"
              />
              <span className="text-[11px] text-fg-subtle">≥ этого размера всегда через LFS</span>
            </Row>
            <Row label="LFS-паттерны">
              <textarea
                value={cfg.lfsPatterns.join(" ")}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    lfsPatterns: e.target.value.split(/\s+/).filter(Boolean),
                  })
                }
                onBlur={() => update({ lfsPatterns: cfg.lfsPatterns })}
                rows={2}
                className="flex-1 font-mono text-[11px] rounded border border-border bg-bg-elev-1 px-2 py-1 outline-none focus:border-accent"
                placeholder="*.mp4 *.mov *.pdf"
              />
            </Row>
            <p className="text-[10.5px] text-fg-subtle">
              По умолчанию LFS отслеживает: {DEFAULT_LFS_PATTERNS.slice(0, 8).join(" ")} … и др. Можно
              изменить пробел-разделённым списком.
            </p>
          </div>
        </div>
      )}
    </Section>
  );
}

function StartupExpandPicker() {
  const row = useLiveQuery(() => db.settings.get("ui.startupExpand"));
  const current = (row?.value as "collapsed" | "expanded") ?? "collapsed";
  const set = async (v: "collapsed" | "expanded") => {
    await db.settings.put({ key: "ui.startupExpand", value: v });
  };
  return (
    <div className="flex gap-2">
      <button
        onClick={() => set("collapsed")}
        className={cn(
          "flex-1 rounded-md border px-3 py-2 text-sm text-left transition-colors",
          current === "collapsed"
            ? "border-accent bg-accent-soft text-accent"
            : "border-border bg-bg-elev-1 text-fg-muted hover:bg-bg-elev-2",
        )}
      >
        <div className="font-medium">Свернуто</div>
        <div className="text-[11px] mt-0.5 opacity-80">
          Все папки закрыты — компактный вид
        </div>
      </button>
      <button
        onClick={() => set("expanded")}
        className={cn(
          "flex-1 rounded-md border px-3 py-2 text-sm text-left transition-colors",
          current === "expanded"
            ? "border-accent bg-accent-soft text-accent"
            : "border-border bg-bg-elev-1 text-fg-muted hover:bg-bg-elev-2",
        )}
      >
        <div className="font-medium">Развернуто</div>
        <div className="text-[11px] mt-0.5 opacity-80">
          Все папки раскрыты — видно весь vault сразу
        </div>
      </button>
    </div>
  );
}

function NewNoteLocationPicker() {
  const [pref, setPref] = useState<{ location: NewNoteLocation; specificFolderId: string | null }>(
    { location: "vault-root", specificFolderId: null },
  );
  const folders = useLiveQuery(() => db.folders.toArray()) ?? [];

  useEffect(() => {
    getNewNotePref().then(setPref);
  }, []);

  const set = async (patch: Partial<typeof pref>) => {
    const next = await saveNewNotePref(patch);
    setPref(next);
  };

  const folderName = (id: string | null): string => {
    if (!id) return "";
    const chain: string[] = [];
    const byId = new Map(folders.map((f) => [f.id, f]));
    let cur = byId.get(id) ?? null;
    while (cur) {
      chain.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
    }
    return chain.join(" / ");
  };

  const options: { value: NewNoteLocation; title: string; desc: string }[] = [
    {
      value: "vault-root",
      title: "В корень vault'а",
      desc: "Заметки создаются на верхнем уровне (без папки)",
    },
    {
      value: "current-folder",
      title: "В ту же папку",
      desc: "Туда же, где лежит текущая открытая заметка",
    },
    {
      value: "specific-folder",
      title: "В указанную папку",
      desc: "Выбрать конкретную папку из списка ниже",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => set({ location: opt.value })}
            className={cn(
              "flex flex-col items-start rounded-md border px-3 py-2 text-left transition-colors",
              pref.location === opt.value
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-bg-elev-1 text-fg-muted hover:bg-bg-elev-2",
            )}
          >
            <div className="text-sm font-medium">{opt.title}</div>
            <div className="text-[11px] mt-0.5 opacity-80">{opt.desc}</div>
          </button>
        ))}
      </div>

      {pref.location === "specific-folder" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-fg-subtle">Папка</label>
          <select
            value={pref.specificFolderId ?? ""}
            onChange={(e) => set({ specificFolderId: e.target.value || null })}
            className="rounded-md border border-border bg-bg-elev-1 px-2.5 py-1.5 text-sm text-fg outline-none focus:border-accent"
          >
            <option value="">— не выбрана —</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {folderName(f.id)}
              </option>
            ))}
          </select>
          {pref.specificFolderId && !folders.find((f) => f.id === pref.specificFolderId) && (
            <p className="text-[11px] text-warning">
              Выбранная папка удалена — новые заметки будут создаваться в корне vault'а.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Bottom-of-Settings card showing the currently-running version and a manual
 * "check for updates" button. Identifies the build via the Tauri-side
 * `platform_info` command so it reflects what's actually installed, not what
 * package.json says — they can diverge if the user is running an older binary
 * after a downgrade.
 */
function AboutSection() {
  const requestUpdateCheck = useApp((s) => s.requestUpdateCheck);
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    (async () => {
      if (!isDesktop()) {
        setVersion("dev (web)");
        return;
      }
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const info = await invoke<{ version: string; platform: string; arch: string }>(
          "platform_info",
        );
        setVersion(info.version);
      } catch {
        setVersion("?");
      }
    })();
  }, []);

  const onCheck = async () => {
    setChecking(true);
    requestUpdateCheck();
    // The actual check runs inside UpdateModal; we just give the button a
    // brief "checking…" state. UpdateModal surfaces its own toast/modal.
    setTimeout(() => setChecking(false), 1500);
  };

  return (
    <Section title="О приложении" description="Версия и обновления">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-elev-1 px-3 py-2.5">
        <div className="flex flex-col">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Версия</div>
          <div className="font-mono text-[13px] text-fg">
            CoffeeStation <span className="text-accent">{version ?? "…"}</span>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={onCheck} disabled={checking}>
          <RefreshCw size={12} className={checking ? "animate-spin" : ""} />
          {checking ? "Проверяю…" : "Проверить обновление"}
        </Button>
      </div>
    </Section>
  );
}
