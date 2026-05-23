"use client";

import { Command } from "cmdk";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Note, type Database } from "@/lib/db/schema";
import Fuse from "fuse.js";
import {
  FileText,
  Coffee,
  CalendarDays,
  Network,
  Layers,
  Database as DatabaseIcon,
  Settings,
  Sparkles,
  Plus,
  Palette,
} from "lucide-react";
import { plainText } from "@/lib/utils";
import { createNewNote } from "@/lib/db/note-create";

export function CommandPalette() {
  const commandPaletteOpen = useApp((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useApp((s) => s.setCommandPaletteOpen);
  const setView = useApp((s) => s.setView);
  const [search, setSearch] = useState("");

  // Gate both live queries on `commandPaletteOpen`. When the palette is
  // closed, the query returns an empty array immediately — Dexie's
  // observable still exists but with no table reads. That stops the
  // auto-save in the editor from firing a full `db.notes.toArray()` +
  // DOMParser pass + Fuse-index rebuild on every single keystroke just
  // to keep this hidden component "fresh". The real data is re-fetched
  // the next time the user hits ⌘K.
  const notes =
    useLiveQuery<Note[]>(
      () => (commandPaletteOpen ? db.notes.toArray() : Promise.resolve([])),
      [commandPaletteOpen],
    ) ?? [];
  const databases =
    useLiveQuery<Database[]>(
      () => (commandPaletteOpen ? db.databases.toArray() : Promise.resolve([])),
      [commandPaletteOpen],
    ) ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === "Escape") setCommandPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const fuse = useMemo(
    () => new Fuse(notes.map((n) => ({ id: n.id, title: n.title, text: plainText(n.content) })), {
      keys: ["title", "text"],
      threshold: 0.4,
      includeMatches: true,
    }),
    [notes],
  );

  const noteResults = search ? fuse.search(search).slice(0, 6).map((r) => r.item) : notes.slice(0, 6);

  if (!commandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[18vh]"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-border bg-bg-elev-1 shadow-2xl fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command palette">
          <Command.Input
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder="Найти заметку, команду, базу данных…"
          />
          <Command.List className="max-h-96 overflow-y-auto py-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-fg-subtle">
              Ничего не найдено
            </Command.Empty>

            <Command.Group heading="Действия">
              <Item
                onSelect={async () => {
                  const id = await createNewNote();
                  setView({ kind: "note", id });
                  setCommandPaletteOpen(false);
                }}
                Icon={Plus}
              >
                Создать новую заметку
              </Item>
              <Item onSelect={() => { setView({ kind: "daily" }); setCommandPaletteOpen(false); }} Icon={CalendarDays}>
                Открыть Daily Notes
              </Item>
              <Item onSelect={() => { setView({ kind: "knowledge-graph" }); setCommandPaletteOpen(false); }} Icon={Network}>
                Knowledge Graph
              </Item>
              <Item onSelect={() => { setView({ kind: "canvas" }); setCommandPaletteOpen(false); }} Icon={Layers}>
                Канвас
              </Item>
              <Item onSelect={() => { setView({ kind: "templates" }); setCommandPaletteOpen(false); }} Icon={Sparkles}>
                Шаблоны
              </Item>
              <Item onSelect={() => { setView({ kind: "theme-studio" }); setCommandPaletteOpen(false); }} Icon={Palette}>
                Theme Studio — настроить внешний вид
              </Item>
              <Item onSelect={() => { setView({ kind: "settings" }); setCommandPaletteOpen(false); }} Icon={Settings}>
                Настройки
              </Item>
            </Command.Group>

            <Command.Group heading="Заметки">
              {noteResults.map((n) => (
                <Item
                  key={n.id}
                  onSelect={() => {
                    setView({ kind: "note", id: n.id });
                    setCommandPaletteOpen(false);
                  }}
                  Icon={FileText}
                >
                  {n.title}
                </Item>
              ))}
            </Command.Group>

            {databases.length > 0 && (
              <Command.Group heading="Базы данных">
                {databases.map((d) => (
                  <Item
                    key={d.id}
                    onSelect={() => {
                      setView({ kind: "database", id: d.id });
                      setCommandPaletteOpen(false);
                    }}
                    Icon={DatabaseIcon}
                  >
                    {d.name}
                  </Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function Item({
  Icon,
  children,
  onSelect,
}: {
  Icon: React.ComponentType<{ size?: number }>;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <Command.Item onSelect={onSelect}>
      <Icon size={13} />
      <span>{children}</span>
    </Command.Item>
  );
}
