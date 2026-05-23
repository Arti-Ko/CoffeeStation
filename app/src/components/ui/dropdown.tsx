"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export const MenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenu.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[180px] rounded-lg border border-border bg-bg-elev-1 p-1 shadow-xl",
        className,
      )}
      {...props}
    />
  </DropdownMenu.Portal>
));
MenuContent.displayName = "MenuContent";

export const MenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenu.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenu.Item
    ref={ref}
    className={cn(
      "flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-[13px] text-fg-muted outline-none data-[highlighted]:bg-bg-elev-2 data-[highlighted]:text-fg",
      className,
    )}
    {...props}
  />
));
MenuItem.displayName = "MenuItem";

export const MenuSeparator = React.forwardRef<
  React.ComponentRef<typeof DropdownMenu.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenu.Separator ref={ref} className={cn("my-1 h-px bg-border", className)} {...props} />
));
MenuSeparator.displayName = "MenuSeparator";

export const MenuLabel = React.forwardRef<
  React.ComponentRef<typeof DropdownMenu.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenu.Label
    ref={ref}
    className={cn("px-2.5 py-1 text-[10px] uppercase tracking-wider text-fg-subtle", className)}
    {...props}
  />
));
MenuLabel.displayName = "MenuLabel";
