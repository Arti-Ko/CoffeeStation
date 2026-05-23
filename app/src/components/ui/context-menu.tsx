"use client";

import * as React from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuPortal = ContextMenuPrimitive.Portal;
export const ContextMenuGroup = ContextMenuPrimitive.Group;
export const ContextMenuSub = ContextMenuPrimitive.Sub;

export const ContextMenuContent = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={cn(
        "z-50 min-w-[200px] rounded-lg border border-border bg-bg-elev-1 p-1 shadow-xl fade-up",
        className,
      )}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = "ContextMenuContent";

export const ContextMenuSubContent = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.SubContent
      ref={ref}
      className={cn(
        "z-50 min-w-[200px] rounded-lg border border-border bg-bg-elev-1 p-1 shadow-xl fade-up",
        className,
      )}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
));
ContextMenuSubContent.displayName = "ContextMenuSubContent";

export const ContextMenuSubTrigger = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-[13px] text-fg-muted outline-none data-[state=open]:bg-bg-elev-2 data-[highlighted]:bg-bg-elev-2 data-[highlighted]:text-fg",
      className,
    )}
    {...props}
  >
    {children}
    <span className="ml-auto text-fg-subtle">›</span>
  </ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger";

export const ContextMenuItem = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={cn(
      "flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-[13px] text-fg-muted outline-none data-[highlighted]:bg-bg-elev-2 data-[highlighted]:text-fg data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
      className,
    )}
    {...props}
  />
));
ContextMenuItem.displayName = "ContextMenuItem";

export const ContextMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator ref={ref} className={cn("my-1 h-px bg-border", className)} {...props} />
));
ContextMenuSeparator.displayName = "ContextMenuSeparator";

export const ContextMenuLabel = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    className={cn("px-2.5 py-1 text-[10px] uppercase tracking-wider text-fg-subtle", className)}
    {...props}
  />
));
ContextMenuLabel.displayName = "ContextMenuLabel";

/** Color swatch grid for the "Цвет" submenu. */
export function ColorSwatchPicker({
  current,
  onPick,
  onClear,
}: {
  current?: string;
  onPick: (color: string) => void;
  onClear?: () => void;
}) {
  return (
    <div className="p-2 w-44">
      <div className="grid grid-cols-6 gap-1.5">
        {SWATCHES.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className={cn(
              "h-6 w-6 rounded-md border border-border-strong hover:scale-110 transition-transform relative",
              current?.toLowerCase() === s.toLowerCase() && "ring-2 ring-accent",
            )}
            style={{ background: s }}
            title={s}
          >
            {current?.toLowerCase() === s.toLowerCase() && (
              <Check size={11} className="absolute inset-0 m-auto text-white drop-shadow" />
            )}
          </button>
        ))}
      </div>
      {onClear && (
        <button
          onClick={onClear}
          className="mt-2 w-full rounded-md border border-border bg-bg-elev-2 px-2 py-1 text-[11px] text-fg-muted hover:text-fg"
        >
          Сбросить цвет
        </button>
      )}
    </div>
  );
}

const SWATCHES = [
  "#ef4444", "#f97316", "#eab308", "#84cc16",
  "#10b981", "#14b8a6", "#06b6d4", "#3b82f6",
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#64748b", "#0a0a0a",
  "#525252", "#a1a1aa",
];
