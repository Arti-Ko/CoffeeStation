<div align="center">

<img src="app/public/icon.png" alt="CoffeeStation" width="128" height="128" />

# CoffeeStation

**Local-first база знаний — для тех, кто реально пользуется своими заметками.**

Нативное десктоп-приложение для PKM: заметки, daily-логи, канбан, граф знаний, файловое хранилище, end-to-end зашифрованная синхронизация через GitHub и студия тем. Данные живут на твоём диске в обычном Markdown — никакого облачного локина, телеметрии и подписок.

[English version →](README.md) · [Скачать](#установка) · [Сборка из исходников](#сборка-из-исходников) · [Roadmap](#roadmap)

![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![tauri](https://img.shields.io/badge/Tauri-2.x-orange)
![next](https://img.shields.io/badge/Next.js-16-black)
![rust](https://img.shields.io/badge/Rust-1.77+-red)

</div>

---

## Зачем

Большинство PKM-инструментов заставляют выбирать. Obsidian — локальный, но визуально из 2012-го. Notion — красивый, но всё лежит на чужом сервере. Logseq — мощный, но непривычный. CoffeeStation идёт третьим путём: **скорость нативного приложения, Markdown на диске как источник истины, редактор уровня Notion и современный визуал** — и всё это offline-first, с опциональной синхронизацией через твой собственный GitHub-репозиторий и end-to-end шифрованием.

Один бинарник. Никаких аккаунтов. Никаких серверов. Твоё хранилище — это просто папка.

## Скриншоты

<table>
  <tr>
    <td><img src="docs/screenshots/01-knowledge-base.png" alt="База знаний"/></td>
    <td><img src="docs/screenshots/02-note-editor.png" alt="Редактор заметок"/></td>
  </tr>
  <tr>
    <td align="center"><b>База знаний</b> — сортируемая сетка всех заметок</td>
    <td align="center"><b>Редактор</b> — WYSIWYG на TipTap с Markdown-режимом</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/03-kanban.png" alt="Канбан"/></td>
    <td><img src="docs/screenshots/04-knowledge-graph.png" alt="Граф знаний"/></td>
  </tr>
  <tr>
    <td align="center"><b>Канбан</b> — drag-карточки, интеграция с daily-заметками</td>
    <td align="center"><b>Граф знаний</b> — твои wikilink-и как force-directed граф</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/05-files.png" alt="Файлы"/></td>
    <td><img src="docs/screenshots/06-theme-studio.png" alt="Студия тем"/></td>
  </tr>
  <tr>
    <td align="center"><b>Файлы</b> — превью MP4/PDF/XLSX/DOCX прямо в приложении</td>
    <td align="center"><b>Студия тем</b> — OKLCH color-picker, живое превью</td>
  </tr>
</table>

## Возможности

### Письмо
- **WYSIWYG-редактор** на TipTap с Markdown round-trip: заголовки, списки, таблицы, блоки кода с подсветкой синтаксиса, чек-листы, callout-ы, mention-ы, wikilink-и (`[[Имя заметки]]`) и `#теги`
- **Markdown-режим** для пуристов — переключается per-note
- **Outline-панель** с кликабельными заголовками
- **Браузерные вкладки** для открытых заметок
- **Daily-заметки**, которые автоматически попадают в канбан

### Организация
- **Дерево папок** с drag-and-drop, мульти-выбором (Cmd/Ctrl-click, Shift-click диапазон), скрытием, цветами на папку
- **Mac-style карточки папок** с превью файлов
- **Правый клик → Новая заметка здесь** — чтобы заметки сразу падали в нужную папку
- **Три режима размещения новых заметок** (корень vault'а / та же папка, что у текущей / конкретная папка) — как в Obsidian
- **Канбан** с кастомными колонками, приоритетами, подтягиванием из daily-заметок
- **Граф знаний** — твои wikilink-и в виде интерактивного force-directed графа
- **Database views** — таблицы, фильтры, сортировки поверх заметок

### Файловое хранилище
- Все **MP4, MOV, MP3, PDF, PNG, SVG, JPEG, XLSX, DOCX, TXT** лежат рядом с заметками
- **Инлайн-просмотрщики и редакторы** — видео/аудио стримятся через Tauri asset protocol, PDF рендерятся внутри приложения, XLSX редактируется через SheetJS, DOCX превью через mammoth
- **Чипы с расширениями** для быстрой идентификации типа

### Синхронизация
- **GitHub Device-Flow OAuth** — никаких ручных PAT-токенов
- **Git LFS** встроен для больших бинарей (MP4, PSD и т.д.) — они едут в том же репо, а не в отдельный blob-store
- **Event-driven sync** — push на blur окна, pull на focus, push при простое (каждый триггер отключается независимо)
- **End-to-end шифрование** (XChaCha20-Poly1305 + X25519 + Argon2id) — сервер видит только шифртекст
- **Ненавязчивый индикатор синхронизации** в левом нижнем углу

### Внешний вид
- **Theme Studio** с OKLCH-токенами, живым превью, экспортом темы в JSON
- **Liquid Glass** режим (полупрозрачные surface-ы в стиле macOS) — exclusive toggle
- **Светлая / Тёмная / Системная** тема
- **Resizable панели** с императивным сворачиванием
- Кастомная типографика (serif заголовки + системный sans body)

### Приватность
- **100% local-first** — источник истины IndexedDB, on-disk Markdown — это экспорт
- **Никакой телеметрии, аналитики, phone-home**
- **Твой vault — просто папка** — направь на существующий Obsidian-vault, и всё подхватится

## Установка

### macOS
1. Скачай последний `CoffeeStation_<версия>_aarch64.dmg` из [Releases](https://github.com/Arti-Ko/CoffeeStation/releases)
2. Открой DMG, перетащи CoffeeStation в `/Applications`
3. Первый запуск: правый клик → Открыть (билд неподписанный, Gatekeeper предупредит один раз)

> **«Приложение повреждено и не может быть открыто»** — macOS вешает quarantine-атрибут на всё скачанное из браузера, а у нас бесплатная ad-hoc подпись (без покупки Apple Developer ID за $99/год). Снимай атрибут одной командой и запускай:
> ```bash
> xattr -dr com.apple.quarantine /Applications/CoffeeStation.app
> ```

> Пока только **Apple Silicon**. Intel-сборка (`x86_64-apple-darwin`) — это одна команда rebuild, открой issue если нужна.

### Windows
1. Скачай последний `CoffeeStation_<версия>_x64-setup.exe` из [Releases](https://github.com/Arti-Ko/coffeestation_lite/releases)
2. Запусти инсталлятор (NSIS) — выбери путь, опционально ярлык на рабочий стол, готово
3. Запускай из меню Пуск

## Сборка из исходников

### Что нужно
- **Node 20+** и **pnpm 9+** (или npm/yarn)
- **Rust 1.77+** (через [rustup](https://rustup.rs))
- **Tauri prerequisites** для твоей платформы — см. [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

### Шаги
```bash
git clone git@github.com:Arti-Ko/coffeestation_lite.git
cd coffeestation_lite/app
pnpm install

# Dev (hot-reload, нативное окно)
pnpm tauri:dev

# Production .dmg / .app (macOS)
pnpm tauri:build

# Production .exe / NSIS installer (Windows)
pnpm tauri:build:win
```

Артефакты появятся в `app/src-tauri/target/release/bundle/`.

## Стек

| Слой | Технологии |
|---|---|
| Десктоп-shell | [Tauri 2](https://tauri.app/) + Rust 1.77 |
| UI | [Next.js 16](https://nextjs.org/) (static export) + React 19 + Tailwind v4 |
| Редактор | [TipTap 3.x](https://tiptap.dev/) (ProseMirror) |
| Локальное хранение | [Dexie](https://dexie.org/) (IndexedDB) |
| Drag-and-drop | [@dnd-kit](https://dndkit.com/) + react-resizable-panels v4 |
| Таблицы | [SheetJS](https://sheetjs.com/) |
| DOCX превью | [mammoth.js](https://github.com/mwilliamson/mammoth.js) |
| Криптография | [libsodium](https://libsodium.gitbook.io/) (E2EE) |
| Синхронизация | git + git-lfs через shell-out |

## Структура проекта

```
CoffeeStation/
├── app/                    # Tauri-приложение
│   ├── src/                # Next.js + React UI
│   │   ├── components/
│   │   │   ├── shell/      # Верхний shell: вкладки, панели, sidebar
│   │   │   ├── views/      # Routed-views (note, kanban, graph, и т.д.)
│   │   │   ├── editor/     # TipTap-редактор и кастомные ноды
│   │   │   └── files/      # Просмотрщики файлов
│   │   └── lib/
│   │       ├── db/         # Dexie schema + хелперы
│   │       ├── desktop/    # Tauri-обёртки: paths, FS, vault scanning
│   │       ├── sync/       # GitHub OAuth, push/pull, LFS
│   │       └── crypto/     # E2EE
│   └── src-tauri/          # Rust backend
│       └── src/lib.rs      # Все Tauri-команды
├── clipper/                # Расширение для Chrome (web-clipper)
├── docs/                   # Скриншоты + документация
└── .github/workflows/      # CI / релизный пайплайн
```

## Roadmap

Сделано:
- Заметки, папки, теги, wikilink-и
- TipTap WYSIWYG + Markdown
- Канбан с интеграцией daily-заметок
- Граф знаний
- Файловое хранилище с инлайн-просмотрщиками
- GitHub Device-Flow + LFS + E2EE
- Theme studio (OKLCH)
- macOS .dmg + Windows .exe сборки

Запланировано:
- iPad-компаньон (Tauri mobile когда стабилизируется)
- Plugin API
- Переключатель нескольких vault-ов
- Умный граф (фильтр по тегу, по времени)
- Глобальная горячая клавиша для quick-capture

## Контрибьютинг

PR-ы приветствуются. Перед отправкой:
1. `pnpm tsc --noEmit` без ошибок
2. `pnpm tauri:build` собирается
3. Прокликай фичу руками в нативном окне (UI-баги проскакивают мимо type check)

Стиль: смотри что уже есть в `app/src/` — Tailwind utility classes, OKLCH токены, маленькие файлы, `cn()` для условных классов.

## Лицензия

[MIT](LICENSE) © [Arti-Ko](https://github.com/Arti-Ko)

---

<sub>Собрано на Tauri, Rust, Next.js и большом количестве эспрессо.</sub>
