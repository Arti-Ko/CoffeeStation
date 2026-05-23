"use client";

import { useApp } from "./store";

type Locale = "ru" | "en";

const dict: Record<string, Record<Locale, string>> = {
  "nav.knowledge_base": { ru: "База знаний", en: "Knowledge Base" },
  "nav.daily": { ru: "Daily Notes", en: "Daily Notes" },
  "nav.graph": { ru: "Knowledge Graph", en: "Knowledge Graph" },
  "nav.flow": { ru: "Flow Graph", en: "Flow Graph" },
  "nav.canvas": { ru: "Канвас", en: "Canvas" },
  "nav.mindmap": { ru: "Mind Map", en: "Mind Map" },
  "nav.databases": { ru: "Базы данных", en: "Databases" },
  "nav.templates": { ru: "Шаблоны", en: "Templates" },
  "nav.publishing": { ru: "Публикация", en: "Publishing" },
  "nav.search": { ru: "Поиск", en: "Search" },
  "nav.logs": { ru: "Логи", en: "Logs" },
  "nav.settings": { ru: "Настройки", en: "Settings" },
  "nav.clipper": { ru: "Web Clipper", en: "Web Clipper" },
  "nav.ai": { ru: "AI ассистент", en: "AI assistant" },
  "nav.history": { ru: "История", en: "History" },
  "nav.backlinks": { ru: "Backlinks", en: "Backlinks" },
  "nav.outline": { ru: "Структура", en: "Outline" },
  "nav.recent": { ru: "Недавние", en: "Recent" },
  "nav.pinned": { ru: "Закреплённые", en: "Pinned" },
  "nav.folders": { ru: "Папки", en: "Folders" },
  "nav.tags": { ru: "Теги", en: "Tags" },
  "btn.new_note": { ru: "Новая заметка", en: "New note" },
  "btn.new_folder": { ru: "Новая папка", en: "New folder" },
  "btn.new_database": { ru: "Новая БД", en: "New database" },
  "btn.create": { ru: "Создать", en: "Create" },
  "btn.cancel": { ru: "Отмена", en: "Cancel" },
  "btn.save": { ru: "Сохранить", en: "Save" },
  "btn.delete": { ru: "Удалить", en: "Delete" },
  "btn.publish": { ru: "Опубликовать", en: "Publish" },
  "btn.send": { ru: "Отправить", en: "Send" },
  "btn.summarize": { ru: "Суммаризировать", en: "Summarize" },
  "btn.translate": { ru: "Перевести", en: "Translate" },
  "btn.improve": { ru: "Улучшить", en: "Improve" },
  "btn.extract_todo": { ru: "Извлечь задачи", en: "Extract TODOs" },
  "common.search_placeholder": { ru: "Поиск по базе знаний…", en: "Search knowledge base…" },
  "common.untitled": { ru: "Без названия", en: "Untitled" },
  "common.empty": { ru: "Пусто", en: "Empty" },
  "common.loading": { ru: "Загрузка…", en: "Loading…" },
  "common.files": { ru: "Файлы", en: "Files" },
  "common.size": { ru: "Размер", en: "Size" },
  "common.source": { ru: "Источник", en: "Source" },
  "common.added_by": { ru: "Кем добавлено", en: "Added by" },
  "common.date_added": { ru: "Дата добавления", en: "Date added" },
  "common.name": { ru: "Имя", en: "Name" },
  "editor.placeholder": { ru: "Начните писать…", en: "Start typing…" },
};

export function useT() {
  const locale = useApp((s) => s.locale);
  return (key: string) => dict[key]?.[locale] ?? key;
}
