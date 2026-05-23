"use client";

export type Mode = "light" | "dark";

export interface ColorPalette {
  bg: string;
  bgElev1: string;
  bgElev2: string;
  bgElev3: string;
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentFg: string;
  accentSoft: string;
  danger: string;
  success: string;
  warning: string;
}

export interface Typography {
  fontSans: string;
  fontSerif: string;
  fontMono: string;
  baseSize: number; // px
  lineHeight: number;
  letterSpacing: number; // em
  weightBody: number;
  weightHeading: number;
}

export interface Geometry {
  radius: number; // px, base
  density: "compact" | "comfortable" | "spacious";
  borderWidth: number; // px
}

export interface ElementOverrides {
  sidebarBg?: string;
  sidebarFg?: string;
  editorSurface?: string;
  editorAccent?: string;
  toolbarBg?: string;
  graphNodeStroke?: string;
  buttonRadius?: number;
}

export interface ThemeTokens {
  id: string;
  name: string;
  mode: Mode;
  colors: { light: ColorPalette; dark: ColorPalette };
  typography: Typography;
  geometry: Geometry;
  overrides: ElementOverrides;
  customCss?: string;
  /** Enables Liquid Glass effects: backdrop-filter blur, refraction borders, animated gradients. */
  liquidGlass?: boolean;
}

export const DEFAULT_LIGHT: ColorPalette = {
  bg: "oklch(99% 0.003 250)",
  bgElev1: "oklch(97.5% 0.005 250)",
  bgElev2: "oklch(95% 0.006 250)",
  bgElev3: "oklch(92% 0.008 250)",
  fg: "oklch(18% 0.01 250)",
  fgMuted: "oklch(45% 0.012 250)",
  fgSubtle: "oklch(62% 0.012 250)",
  border: "oklch(90% 0.008 250)",
  borderStrong: "oklch(82% 0.012 250)",
  accent: "oklch(58% 0.18 32)",
  accentFg: "oklch(99% 0.002 250)",
  accentSoft: "oklch(94% 0.04 32)",
  danger: "oklch(58% 0.21 25)",
  success: "oklch(58% 0.16 150)",
  warning: "oklch(72% 0.16 75)",
};

export const DEFAULT_DARK: ColorPalette = {
  bg: "oklch(15% 0.008 260)",
  bgElev1: "oklch(18% 0.01 260)",
  bgElev2: "oklch(22% 0.012 260)",
  bgElev3: "oklch(26% 0.014 260)",
  fg: "oklch(96% 0.005 250)",
  fgMuted: "oklch(74% 0.01 250)",
  fgSubtle: "oklch(56% 0.012 250)",
  border: "oklch(28% 0.012 260)",
  borderStrong: "oklch(36% 0.016 260)",
  accent: "oklch(72% 0.18 32)",
  accentFg: "oklch(15% 0.008 260)",
  accentSoft: "oklch(28% 0.06 32)",
  danger: "oklch(68% 0.20 25)",
  success: "oklch(72% 0.15 150)",
  warning: "oklch(78% 0.16 75)",
};

export const DEFAULT_TYPOGRAPHY: Typography = {
  fontSans: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
  fontSerif: '"Iowan Old Style", "Charter", "Georgia", ui-serif, serif',
  fontMono: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
  baseSize: 16,
  lineHeight: 1.7,
  letterSpacing: 0,
  weightBody: 400,
  weightHeading: 700,
};

export const DEFAULT_GEOMETRY: Geometry = {
  radius: 10,
  density: "comfortable",
  borderWidth: 1,
};

export function defaultTheme(): ThemeTokens {
  return {
    id: "default",
    name: "Default",
    mode: "light",
    colors: { light: DEFAULT_LIGHT, dark: DEFAULT_DARK },
    typography: DEFAULT_TYPOGRAPHY,
    geometry: DEFAULT_GEOMETRY,
    overrides: {},
  };
}
