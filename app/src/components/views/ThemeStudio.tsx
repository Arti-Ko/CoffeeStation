"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import type { ColorPalette, ThemeTokens } from "@/lib/theme/tokens";
import { defaultTheme } from "@/lib/theme/tokens";
import { PRESETS } from "@/lib/theme/presets";
import { applyTheme as applyThemeTokens } from "@/lib/theme/apply";
import { db } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Palette,
  Type,
  Ruler,
  Sparkles,
  Code2,
  RotateCcw,
  Download,
  Upload,
  Check,
  Eye,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { isDesktop } from "@/lib/desktop/runtime";
import { ColorPicker } from "@/components/ui/color-picker";

const COLOR_FIELDS: { key: keyof ColorPalette; label: string; group: string }[] = [
  { key: "bg", label: "Background", group: "Background" },
  { key: "bgElev1", label: "Elevation +1", group: "Background" },
  { key: "bgElev2", label: "Elevation +2", group: "Background" },
  { key: "bgElev3", label: "Elevation +3", group: "Background" },
  { key: "fg", label: "Text", group: "Foreground" },
  { key: "fgMuted", label: "Text muted", group: "Foreground" },
  { key: "fgSubtle", label: "Text subtle", group: "Foreground" },
  { key: "border", label: "Border", group: "Lines" },
  { key: "borderStrong", label: "Border strong", group: "Lines" },
  { key: "accent", label: "Accent", group: "Brand" },
  { key: "accentFg", label: "Accent text", group: "Brand" },
  { key: "accentSoft", label: "Accent soft", group: "Brand" },
  { key: "danger", label: "Danger", group: "Semantic" },
  { key: "success", label: "Success", group: "Semantic" },
  { key: "warning", label: "Warning", group: "Semantic" },
];

const FONT_OPTIONS = [
  { value: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif", label: "Geist Sans" },
  { value: '"Iowan Old Style", "Charter", "Georgia", ui-serif, serif', label: "Charter / Iowan Serif" },
  { value: '"JetBrains Mono", ui-monospace, monospace', label: "JetBrains Mono" },
  { value: '"SF Pro", -apple-system, system-ui, sans-serif', label: "SF Pro / System" },
  { value: '"Helvetica Neue", Helvetica, Arial, sans-serif', label: "Helvetica Neue" },
  { value: '"Inter", system-ui, sans-serif', label: "Inter" },
  { value: 'Georgia, "Times New Roman", serif', label: "Georgia" },
];

export function ThemeStudio() {
  const tokens = useApp((s) => s.theme_tokens);
  const setThemeTokens = useApp((s) => s.setThemeTokens);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const [previewMode, setPreviewMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    setPreviewMode(
      theme === "dark" ||
        (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark"
        : "light",
    );
  }, [theme]);

  const persistTokens = async (t: ThemeTokens) => {
    setThemeTokens(t);
    await db.settings.put({ key: "theme.tokens", value: t });
  };

  const update = <K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => {
    persistTokens({ ...tokens, [key]: value });
  };

  const updateColor = (mode: "light" | "dark", key: keyof ColorPalette, value: string) => {
    persistTokens({
      ...tokens,
      colors: {
        ...tokens.colors,
        [mode]: { ...tokens.colors[mode], [key]: value },
      },
    });
  };

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    persistTokens({ ...p, id: tokens.id, name: p.name });
    toast.success(`Тема «${p.name}» применена`);
  };

  const reset = () => {
    persistTokens(defaultTheme());
    toast.message("Сброшено к Default");
  };

  const exportTheme = async () => {
    const json = JSON.stringify(tokens, null, 2);
    if (isDesktop()) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({
        defaultPath: `${tokens.name.toLowerCase().replace(/\s+/g, "-")}.coffeestation-theme.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) {
        await writeTextFile(path, json);
        toast.success("Тема экспортирована");
      }
    } else {
      await navigator.clipboard.writeText(json);
      toast.success("Тема скопирована в буфер");
    }
  };

  const importTheme = async (file?: File) => {
    let json = "";
    if (file) {
      json = await file.text();
    } else if (isDesktop()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await open({ filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path || Array.isArray(path)) return;
      json = await readTextFile(path);
    } else return;
    try {
      const t = JSON.parse(json) as ThemeTokens;
      persistTokens(t);
      toast.success("Тема импортирована");
    } catch (e) {
      toast.error("Невалидный файл темы");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
            Theme Studio
          </h2>
          <p className="text-xs text-fg-subtle mt-0.5">
            Полная кастомизация: цвета, типографика, геометрия, custom CSS · изменения применяются мгновенно
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => persistTokens({ ...tokens, liquidGlass: !tokens.liquidGlass })}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border transition-all",
              tokens.liquidGlass
                ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white border-transparent shadow-lg"
                : "border-border bg-bg-elev-1 text-fg-muted hover:border-accent",
            )}
            title="Эксклюзивный glassmorphism с backdrop-blur"
          >
            <Sparkles size={11} /> Liquid Glass
          </button>
          <div className="flex items-center rounded-md border border-border bg-bg-elev-1 p-0.5">
            <button
              onClick={() => { setTheme("light"); setPreviewMode("light"); }}
              className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium", theme === "light" ? "bg-bg shadow-sm" : "text-fg-muted")}
            >
              <Sun size={11} /> Light
            </button>
            <button
              onClick={() => { setTheme("dark"); setPreviewMode("dark"); }}
              className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium", theme === "dark" ? "bg-bg shadow-sm" : "text-fg-muted")}
            >
              <Moon size={11} /> Dark
            </button>
          </div>
          <Button size="sm" variant="ghost" onClick={reset}><RotateCcw size={12} /> Сброс</Button>
          <Button size="sm" variant="outline" onClick={exportTheme}><Download size={12} /> Export</Button>
          <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-bg-elev-2 px-3 h-8 text-sm font-medium hover:bg-bg-elev-3">
            <Upload size={12} /> Import
            <input type="file" accept="application/json" className="hidden" onChange={(e) => importTheme(e.target.files?.[0])} />
          </label>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
          <Tabs defaultValue="presets">
            <TabsList className="w-full">
              <TabsTrigger value="presets" className="flex-1 gap-1"><Sparkles size={11} /> Presets</TabsTrigger>
              <TabsTrigger value="colors" className="flex-1 gap-1"><Palette size={11} /> Цвета</TabsTrigger>
              <TabsTrigger value="typography" className="flex-1 gap-1"><Type size={11} /> Шрифты</TabsTrigger>
              <TabsTrigger value="geometry" className="flex-1 gap-1"><Ruler size={11} /> Геометрия</TabsTrigger>
              <TabsTrigger value="overrides" className="flex-1 gap-1"><Eye size={11} /> Элементы</TabsTrigger>
              <TabsTrigger value="css" className="flex-1 gap-1"><Code2 size={11} /> CSS</TabsTrigger>
            </TabsList>

            <TabsContent value="presets" className="mt-4">
              <div className="grid grid-cols-2 gap-3">
                {PRESETS.map((p) => (
                  <PresetCard key={p.id} preset={p} activeId={tokens.name === p.name ? p.id : undefined} onClick={() => applyPreset(p.id)} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="colors" className="mt-4 space-y-6">
              {(["light", "dark"] as const).map((mode) => (
                <section key={mode}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold capitalize">{mode === "light" ? "Светлая палитра" : "Тёмная палитра"}</h3>
                    <button
                      onClick={() => setPreviewMode(mode)}
                      className="text-[11px] text-accent hover:underline"
                    >
                      → preview
                    </button>
                  </div>
                  <div className="space-y-3">
                    {groupBy(COLOR_FIELDS, (f) => f.group).map(([group, fields]) => (
                      <div key={group}>
                        <div className="mb-1.5 text-[10px] uppercase tracking-wider text-fg-subtle">{group}</div>
                        <div className="grid grid-cols-2 gap-2">
                          {fields.map((f) => (
                            <ColorField
                              key={f.key}
                              label={f.label}
                              value={tokens.colors[mode][f.key]}
                              onChange={(v) => updateColor(mode, f.key, v)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </TabsContent>

            <TabsContent value="typography" className="mt-4 space-y-4">
              <Row label="Sans font">
                <select
                  value={tokens.typography.fontSans}
                  onChange={(e) => update("typography", { ...tokens.typography, fontSans: e.target.value })}
                  className="h-8 rounded-md border border-border bg-bg-elev-1 px-2 text-sm flex-1"
                >
                  {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </Row>
              <Row label="Serif font">
                <select
                  value={tokens.typography.fontSerif}
                  onChange={(e) => update("typography", { ...tokens.typography, fontSerif: e.target.value })}
                  className="h-8 rounded-md border border-border bg-bg-elev-1 px-2 text-sm flex-1"
                >
                  {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </Row>
              <Row label="Mono font">
                <select
                  value={tokens.typography.fontMono}
                  onChange={(e) => update("typography", { ...tokens.typography, fontMono: e.target.value })}
                  className="h-8 rounded-md border border-border bg-bg-elev-1 px-2 text-sm flex-1"
                >
                  {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </Row>
              <SliderRow label="Base size (px)" value={tokens.typography.baseSize} min={12} max={22} step={1}
                onChange={(v) => update("typography", { ...tokens.typography, baseSize: v })} />
              <SliderRow label="Line height" value={tokens.typography.lineHeight} min={1.2} max={2.2} step={0.05}
                onChange={(v) => update("typography", { ...tokens.typography, lineHeight: v })} />
              <SliderRow label="Letter spacing" value={tokens.typography.letterSpacing} min={-0.05} max={0.1} step={0.005}
                onChange={(v) => update("typography", { ...tokens.typography, letterSpacing: v })} />
              <SliderRow label="Body weight" value={tokens.typography.weightBody} min={300} max={700} step={100}
                onChange={(v) => update("typography", { ...tokens.typography, weightBody: v })} />
              <SliderRow label="Heading weight" value={tokens.typography.weightHeading} min={500} max={900} step={100}
                onChange={(v) => update("typography", { ...tokens.typography, weightHeading: v })} />
            </TabsContent>

            <TabsContent value="geometry" className="mt-4 space-y-4">
              <SliderRow label="Скругление (px)" value={tokens.geometry.radius} min={0} max={24} step={1}
                onChange={(v) => update("geometry", { ...tokens.geometry, radius: v })} />
              <SliderRow label="Толщина границ (px)" value={tokens.geometry.borderWidth} min={0} max={4} step={1}
                onChange={(v) => update("geometry", { ...tokens.geometry, borderWidth: v })} />
              <Row label="Плотность">
                <div className="flex gap-1">
                  {(["compact", "comfortable", "spacious"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => update("geometry", { ...tokens.geometry, density: d })}
                      className={cn("flex-1 rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                        tokens.geometry.density === d ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:bg-bg-elev-2")}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </Row>
            </TabsContent>

            <TabsContent value="overrides" className="mt-4 space-y-3">
              <p className="text-xs text-fg-subtle mb-2">Точечные переопределения для конкретных элементов UI.</p>
              <OverrideRow label="Sidebar background" value={tokens.overrides.sidebarBg ?? ""}
                onChange={(v) => update("overrides", { ...tokens.overrides, sidebarBg: v })} />
              <OverrideRow label="Sidebar text" value={tokens.overrides.sidebarFg ?? ""}
                onChange={(v) => update("overrides", { ...tokens.overrides, sidebarFg: v })} />
              <OverrideRow label="Editor surface" value={tokens.overrides.editorSurface ?? ""}
                onChange={(v) => update("overrides", { ...tokens.overrides, editorSurface: v })} />
              <OverrideRow label="Editor accent (cursor, wiki links)" value={tokens.overrides.editorAccent ?? ""}
                onChange={(v) => update("overrides", { ...tokens.overrides, editorAccent: v })} />
              <OverrideRow label="Toolbar background" value={tokens.overrides.toolbarBg ?? ""}
                onChange={(v) => update("overrides", { ...tokens.overrides, toolbarBg: v })} />
              <OverrideRow label="Graph node stroke" value={tokens.overrides.graphNodeStroke ?? ""}
                onChange={(v) => update("overrides", { ...tokens.overrides, graphNodeStroke: v })} />
              <SliderRow label="Button radius (px)" value={tokens.overrides.buttonRadius ?? tokens.geometry.radius} min={0} max={24} step={1}
                onChange={(v) => update("overrides", { ...tokens.overrides, buttonRadius: v })} />
            </TabsContent>

            <TabsContent value="css" className="mt-4 space-y-2">
              <p className="text-xs text-fg-subtle">Свой CSS — применяется поверх всех стилей. Удобно для тонкой настройки и плагинов.</p>
              <textarea
                value={tokens.customCss ?? ""}
                onChange={(e) => update("customCss", e.target.value)}
                spellCheck={false}
                className="w-full h-72 rounded-md border border-border bg-bg-elev-1 px-3 py-2 font-mono text-[12px] outline-none focus:border-accent"
                placeholder={`/* Пример */\n.tree-row.active { background: linear-gradient(90deg, var(--accent-soft), transparent); }\n.ProseMirror h1 { background: linear-gradient(90deg, var(--accent), var(--success)); -webkit-background-clip: text; color: transparent; }`}
              />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="w-[420px] shrink-0 border-l border-border bg-bg-elev-1 overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg-elev-1 px-4 py-2">
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle">Live preview</div>
            <div className="flex items-center rounded-md border border-border bg-bg p-0.5">
              <button
                onClick={() => setPreviewMode("light")}
                className={cn("rounded px-2 py-0.5 text-[10px]", previewMode === "light" ? "bg-bg-elev-2 font-medium" : "text-fg-subtle")}
              >Light</button>
              <button
                onClick={() => setPreviewMode("dark")}
                className={cn("rounded px-2 py-0.5 text-[10px]", previewMode === "dark" ? "bg-bg-elev-2 font-medium" : "text-fg-subtle")}
              >Dark</button>
            </div>
          </div>
          <PreviewCanvas tokens={tokens} mode={previewMode} />
        </aside>
      </div>
    </div>
  );
}

function groupBy<T, K>(arr: T[], key: (t: T) => K): [K, T[]][] {
  const map = new Map<K, T[]>();
  arr.forEach((x) => {
    const k = key(x);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(x);
  });
  return Array.from(map.entries());
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="rounded-md border border-border bg-bg-elev-1 p-1.5">
      <div className="text-[10px] text-fg-muted mb-1 px-1 truncate">{label}</div>
      <ColorPicker value={value} onChange={onChange} />
    </div>
  );
}

function OverrideRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-center gap-3">
      <div className="text-[12px] text-fg-muted">{label}</div>
      <div className="flex items-center gap-2">
        {value ? (
          <ColorPicker value={value} onChange={onChange} />
        ) : (
          <Input
            placeholder="(наследует) — введите цвет или выберите палитрой"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="font-mono text-[11px]"
          />
        )}
        {value && (
          <button
            onClick={() => onChange("")}
            className="text-[10px] text-fg-subtle hover:text-danger px-1"
          >
            сбросить
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-center gap-3">
      <div className="text-[12px] text-fg-muted">{label}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function SliderRow({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <Row label={label}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-[var(--accent)]"
      />
      <span className="text-[11px] font-mono w-12 text-right text-fg-muted">{value}</span>
    </Row>
  );
}

function PresetCard({ preset, activeId, onClick }: { preset: ThemeTokens; activeId?: string; onClick: () => void }) {
  const isActive = activeId === preset.id;
  const p = preset.colors.light;
  return (
    <button
      onClick={onClick}
      className={cn("group relative overflow-hidden rounded-xl border bg-bg-elev-1 text-left transition-all hover:shadow-lg fade-up",
        isActive ? "border-accent ring-2 ring-accent/30" : "border-border")}
    >
      <div className="grid h-20 grid-cols-5">
        {[p.bg, p.bgElev2, p.fg, p.accent, p.border].map((c, i) => (
          <div key={i} style={{ background: c }} />
        ))}
      </div>
      <div className="flex items-center justify-between p-3">
        <div>
          <div className="text-[13px] font-semibold">{preset.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-fg-subtle mt-0.5">
            r{preset.geometry.radius} · {preset.geometry.density}
          </div>
        </div>
        {isActive && <Check size={14} className="text-accent" />}
      </div>
    </button>
  );
}

/**
 * A live preview that re-renders sample UI using the current tokens,
 * scoped to the preview pane so the rest of the app reflects active changes too.
 */
function PreviewCanvas({ tokens, mode }: { tokens: ThemeTokens; mode: "light" | "dark" }) {
  const palette = tokens.colors[mode];
  const r = tokens.geometry.radius;
  const styles: React.CSSProperties = {
    background: palette.bg,
    color: palette.fg,
    fontFamily: tokens.typography.fontSans,
    fontSize: tokens.typography.baseSize,
    lineHeight: tokens.typography.lineHeight,
  };
  return (
    <div className="p-4" style={styles}>
      <div className="rounded-2xl p-5" style={{ background: palette.bgElev1, border: `1px solid ${palette.border}`, borderRadius: r + 8 }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: palette.danger }} />
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: palette.warning }} />
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: palette.success }} />
        </div>
        <h1 style={{ fontFamily: tokens.typography.fontSerif, fontWeight: tokens.typography.weightHeading, fontSize: tokens.typography.baseSize * 1.8, letterSpacing: "-0.02em", marginBottom: 8 }}>
          Заметка нового дня
        </h1>
        <p style={{ color: palette.fgMuted, marginBottom: 12 }}>
          Это <span style={{ color: palette.accent, borderBottom: `1px dashed ${palette.accent}`, fontWeight: 500 }}>wiki-ссылка</span> и <span style={{ background: palette.accentSoft, color: palette.accent, padding: "1px 6px", borderRadius: 4, fontSize: "0.875em", fontWeight: 500 }}>#hashtag</span> в одном предложении.
        </p>
        <blockquote style={{ borderLeft: `3px solid ${palette.accent}`, paddingLeft: 12, color: palette.fgMuted, fontStyle: "italic", margin: "12px 0" }}>
          Цитата с акцентным цветом — проверка контраста.
        </blockquote>
        <div className="flex items-center gap-2 mt-4">
          <button
            style={{
              background: palette.accent,
              color: palette.accentFg,
              padding: "6px 14px",
              borderRadius: tokens.overrides.buttonRadius ?? r,
              fontSize: 13,
              fontWeight: 500,
              border: "none",
            }}
          >
            Primary
          </button>
          <button
            style={{
              background: "transparent",
              color: palette.fg,
              padding: "6px 14px",
              borderRadius: tokens.overrides.buttonRadius ?? r,
              fontSize: 13,
              fontWeight: 500,
              border: `${tokens.geometry.borderWidth}px solid ${palette.borderStrong}`,
            }}
          >
            Secondary
          </button>
          <button
            style={{
              background: palette.bgElev2,
              color: palette.fgMuted,
              padding: "6px 14px",
              borderRadius: tokens.overrides.buttonRadius ?? r,
              fontSize: 13,
              fontWeight: 500,
              border: "none",
            }}
          >
            Ghost
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {(["bg", "bgElev1", "bgElev2"] as const).map((k) => (
          <div key={k} className="rounded-lg p-3 text-[10px]" style={{ background: palette[k], border: `1px solid ${palette.border}`, borderRadius: r, color: palette.fgSubtle }}>
            {k}
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-2xl overflow-hidden" style={{ background: palette.bgElev1, border: `1px solid ${palette.border}`, borderRadius: r + 8 }}>
        <div style={{ background: tokens.overrides.toolbarBg ?? palette.bgElev2, padding: "6px 12px", borderBottom: `1px solid ${palette.border}`, fontSize: 11, color: palette.fgSubtle }}>
          File · Edit · View · …
        </div>
        <div className="grid grid-cols-[120px_1fr]">
          <div style={{ background: tokens.overrides.sidebarBg ?? palette.bgElev1, color: tokens.overrides.sidebarFg ?? palette.fgMuted, padding: 10, fontSize: 11, borderRight: `1px solid ${palette.border}` }}>
            <div style={{ padding: "4px 8px", borderRadius: r - 4, background: palette.accentSoft, color: palette.accent, fontWeight: 500, marginBottom: 2 }}>
              ◇ Knowledge
            </div>
            <div style={{ padding: "4px 8px" }}>◇ Daily</div>
            <div style={{ padding: "4px 8px" }}>◇ Graph</div>
          </div>
          <div style={{ background: tokens.overrides.editorSurface ?? palette.bg, padding: 16, fontSize: 12, color: palette.fg }}>
            <p>The quick brown fox jumps over <span style={{ color: tokens.overrides.editorAccent ?? palette.accent }}>the lazy dog</span>.</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {["danger", "success", "warning", "accent"].map((sem) => (
          <span key={sem}
            style={{
              background: (palette as unknown as Record<string, string>)[sem] + "22",
              color: (palette as unknown as Record<string, string>)[sem],
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
            }}>
            {sem}
          </span>
        ))}
      </div>
    </div>
  );
}
