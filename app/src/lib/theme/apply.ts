"use client";

import type { ColorPalette, ThemeTokens } from "./tokens";

const CSS_VAR_MAP: Record<keyof ColorPalette, string> = {
  bg: "--bg",
  bgElev1: "--bg-elev-1",
  bgElev2: "--bg-elev-2",
  bgElev3: "--bg-elev-3",
  fg: "--fg",
  fgMuted: "--fg-muted",
  fgSubtle: "--fg-subtle",
  border: "--border",
  borderStrong: "--border-strong",
  accent: "--accent",
  accentFg: "--accent-fg",
  accentSoft: "--accent-soft",
  danger: "--danger",
  success: "--success",
  warning: "--warning",
};

const DENSITY_SCALE: Record<NonNullable<ThemeTokens["geometry"]["density"]>, number> = {
  compact: 0.85,
  comfortable: 1,
  spacious: 1.15,
};

/**
 * Applies a ThemeTokens object to the document by injecting CSS variables.
 * Light + dark palettes are both written; the active `.dark` / no-class
 * toggle decides which set is used.
 */
export function applyTheme(theme: ThemeTokens, isDark: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const palette = isDark ? theme.colors.dark : theme.colors.light;

  for (const [k, cssVar] of Object.entries(CSS_VAR_MAP) as [keyof ColorPalette, string][]) {
    root.style.setProperty(cssVar, palette[k]);
  }

  // Typography
  root.style.setProperty("--font-sans", theme.typography.fontSans);
  root.style.setProperty("--font-serif", theme.typography.fontSerif);
  root.style.setProperty("--font-mono", theme.typography.fontMono);
  root.style.setProperty("--text-base", `${theme.typography.baseSize}px`);
  root.style.setProperty("--leading", String(theme.typography.lineHeight));
  root.style.setProperty("--tracking", `${theme.typography.letterSpacing}em`);
  root.style.setProperty("--weight-body", String(theme.typography.weightBody));
  root.style.setProperty("--weight-heading", String(theme.typography.weightHeading));

  // Geometry
  const r = theme.geometry.radius;
  root.style.setProperty("--radius-xs", `${Math.max(0, r - 6)}px`);
  root.style.setProperty("--radius-sm", `${Math.max(0, r - 4)}px`);
  root.style.setProperty("--radius-md", `${r}px`);
  root.style.setProperty("--radius-lg", `${r + 4}px`);
  root.style.setProperty("--radius-xl", `${r + 10}px`);

  const density = DENSITY_SCALE[theme.geometry.density];
  root.style.setProperty("--density", String(density));
  root.style.setProperty("--space-1", `${4 * density}px`);
  root.style.setProperty("--space-2", `${8 * density}px`);
  root.style.setProperty("--space-3", `${12 * density}px`);
  root.style.setProperty("--space-4", `${16 * density}px`);
  root.style.setProperty("--space-6", `${24 * density}px`);

  root.style.setProperty("--border-width", `${theme.geometry.borderWidth}px`);

  // Element overrides
  const o = theme.overrides ?? {};
  setOrClear(root, "--sidebar-bg", o.sidebarBg);
  setOrClear(root, "--sidebar-fg", o.sidebarFg);
  setOrClear(root, "--editor-surface", o.editorSurface);
  setOrClear(root, "--editor-accent", o.editorAccent);
  setOrClear(root, "--toolbar-bg", o.toolbarBg);
  setOrClear(root, "--graph-node-stroke", o.graphNodeStroke);
  if (o.buttonRadius != null) {
    root.style.setProperty("--button-radius", `${o.buttonRadius}px`);
  } else {
    root.style.removeProperty("--button-radius");
  }

  // Apply base font-size & body styles
  document.body.style.fontSize = `${theme.typography.baseSize}px`;
  document.body.style.lineHeight = String(theme.typography.lineHeight);
  document.body.style.letterSpacing = `${theme.typography.letterSpacing}em`;

  // Custom CSS — injected as a single <style> tag (replaceable)
  injectCustomCss(theme.customCss ?? "");

  // Liquid Glass body class
  document.body.classList.toggle("liquid-glass", Boolean(theme.liquidGlass));

  // Background may be a gradient (Liquid Glass) — push it to body
  document.body.style.backgroundImage = palette.bg.includes("gradient") ? palette.bg : "";
  document.body.style.backgroundColor = palette.bg.includes("gradient") ? "transparent" : palette.bg;
}

function setOrClear(root: HTMLElement, name: string, value: string | undefined) {
  if (value && value.length > 0) root.style.setProperty(name, value);
  else root.style.removeProperty(name);
}

function injectCustomCss(css: string) {
  let el = document.getElementById("user-theme-css") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "user-theme-css";
    document.head.appendChild(el);
  }
  el.textContent = css;
}
