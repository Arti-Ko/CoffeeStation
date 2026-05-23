"use client";

import * as Popover from "@radix-ui/react-popover";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  /** When true, the popover content is positioned by a portal (avoids clipping inside scrollable panels). */
  portal?: boolean;
}

/**
 * A photo-shop-style color picker: visual saturation+hue area + hex/rgb input.
 *
 * Accepts and emits **any CSS color string** (hex / rgb / rgba / oklch / hsl).
 * The visual picker works in hex internally; non-hex values are preserved when
 * the user only edits text.
 */
export function ColorPicker({ value, onChange, label, portal = true }: ColorPickerProps) {
  const [textValue, setTextValue] = useState(value);
  useEffect(() => setTextValue(value), [value]);

  const hexValue = toHexLossy(value);

  const content = (
    <div className="space-y-2 p-3 w-64">
      <HexColorPicker color={hexValue} onChange={(hex) => onChange(hex)} />
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-fg-subtle w-6">HEX</span>
        <HexColorInput
          color={hexValue}
          onChange={(hex) => onChange(hex)}
          prefixed
          className="flex-1 h-7 rounded border border-border bg-bg-elev-1 px-2 text-[12px] font-mono outline-none focus:border-accent"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-fg-subtle w-6">CSS</span>
        <input
          value={textValue}
          onChange={(e) => {
            setTextValue(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="oklch / rgb / hex"
          className="flex-1 h-7 rounded border border-border bg-bg-elev-1 px-2 text-[11px] font-mono outline-none focus:border-accent"
        />
      </div>
      <div className="grid grid-cols-8 gap-1 pt-1">
        {SWATCHES.map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={cn(
              "h-5 w-5 rounded border border-border hover:scale-110 transition-transform",
              hexValue.toLowerCase() === s.toLowerCase() && "ring-2 ring-accent",
            )}
            style={{ background: s }}
            title={s}
          />
        ))}
      </div>
    </div>
  );

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="flex items-center gap-2 rounded-md border border-border bg-bg-elev-1 px-2 py-1.5 hover:border-accent transition-colors"
          title={label ?? "Цвет"}
        >
          <span
            className="h-6 w-6 rounded shadow-inner border border-border-strong shrink-0"
            style={{ background: value }}
          />
          {label && <span className="text-[11px] text-fg-muted truncate max-w-[120px]">{label}</span>}
          <span className="text-[10px] font-mono text-fg-subtle truncate max-w-[140px]">{value}</span>
        </button>
      </Popover.Trigger>
      {portal ? (
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            className="z-50 rounded-xl border border-border bg-bg-elev-1 shadow-2xl fade-up"
          >
            {content}
          </Popover.Content>
        </Popover.Portal>
      ) : (
        <Popover.Content
          sideOffset={6}
          className="z-50 rounded-xl border border-border bg-bg-elev-1 shadow-2xl fade-up"
        >
          {content}
        </Popover.Content>
      )}
    </Popover.Root>
  );
}

const SWATCHES = [
  "#f97316", "#ef4444", "#eab308", "#84cc16", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6",
  "#ec4899", "#64748b", "#0a0a0a", "#262626", "#525252", "#a1a1aa", "#e4e4e7", "#ffffff",
];

/** Best-effort conversion of any CSS color to hex `#rrggbb`. */
function toHexLossy(value: string): string {
  if (!value) return "#888888";
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6,8}$/i.test(trimmed)) return trimmed.slice(0, 7);
  if (/^#[0-9a-f]{3,4}$/i.test(trimmed)) {
    const r = trimmed[1], g = trimmed[2], b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  // Render once via the browser to get computed rgb()
  if (typeof document !== "undefined") {
    const el = document.createElement("div");
    el.style.color = trimmed;
    document.body.appendChild(el);
    const rgb = getComputedStyle(el).color;
    document.body.removeChild(el);
    const m = rgb.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (m) {
      const [_, r, g, b] = m;
      return "#" + [r, g, b].map((c) => parseInt(c).toString(16).padStart(2, "0")).join("");
    }
  }
  return "#888888";
}
