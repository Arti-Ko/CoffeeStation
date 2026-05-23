import { nanoid } from "nanoid";
import { db } from "./schema";

const now = () => Date.now();

/**
 * Ensures a default Kanban board exists. Runs *independently* from note seeding so
 * users who imported notes from Obsidian still get a working board on first launch.
 */
export async function seedKanbanIfEmpty() {
  const count = await db.kanbanColumns.count();
  if (count > 0) return;
  const todoCol = nanoid(10);
  const doingCol = nanoid(10);
  const reviewCol = nanoid(10);
  const doneCol = nanoid(10);
  await db.kanbanColumns.bulkAdd([
    { id: todoCol, name: "Todo", order: 0, color: "#64748b" },
    { id: doingCol, name: "Doing", order: 1, color: "#3b82f6" },
    { id: reviewCol, name: "Review", order: 2, color: "#a855f7" },
    { id: doneCol, name: "Done", order: 3, color: "#10b981", done: true },
  ]);
  const today = new Date().toISOString().slice(0, 10);
  await db.kanbanCards.bulkAdd([
    { id: nanoid(10), title: "Создайте свою первую задачу", columnId: todoCol, order: 0, createdAt: now(), movedAt: now(), dayCreated: today, priority: "medium" },
    { id: nanoid(10), title: "Перетащите карточку между колонками", columnId: doingCol, order: 0, createdAt: now(), movedAt: now(), dayCreated: today, priority: "low" },
  ]);
}

export async function seedIfEmpty() {
  await seedKanbanIfEmpty();
  const count = await db.notes.count();
  if (count > 0) return;

  const folderResearch: string = nanoid(10);
  const folderProjects: string = nanoid(10);
  const folderOnboarding: string = nanoid(10);
  const folderDaily: string = nanoid(10);
  const folderTemplates: string = nanoid(10);

  await db.folders.bulkAdd([
    { id: folderResearch, name: "Research", parentId: null, icon: "FlaskConical", color: "#a855f7", createdAt: now(), source: "local" },
    { id: folderProjects, name: "Projects", parentId: null, icon: "FolderKanban", color: "#f97316", createdAt: now(), source: "local" },
    { id: folderOnboarding, name: "Onboarding", parentId: null, icon: "BookOpen", color: "#10b981", createdAt: now(), source: "notion" },
    { id: folderDaily, name: "Daily Notes", parentId: null, icon: "CalendarDays", color: "#3b82f6", createdAt: now(), source: "local" },
    { id: folderTemplates, name: "Templates", parentId: null, icon: "FileText", color: "#64748b", createdAt: now(), source: "local" },
    { id: nanoid(10), name: "CRDT Notes", parentId: folderResearch, icon: "Folder", color: "#a855f7", createdAt: now(), source: "google-drive" },
  ]);

  await db.tags.bulkAdd([
    { id: nanoid(8), name: "research", color: "#a855f7" },
    { id: nanoid(8), name: "product", color: "#f97316" },
    { id: nanoid(8), name: "идея", color: "#10b981" },
    { id: nanoid(8), name: "todo", color: "#3b82f6" },
  ]);

  const welcome = nanoid(10);
  const crdt = nanoid(10);
  const aiNote = nanoid(10);
  const e2ee = nanoid(10);
  const meeting = nanoid(10);

  await db.notes.bulkAdd([
    {
      id: welcome,
      title: "Welcome to CoffeeStation",
      content: `<h1>Welcome to CoffeeStation ☕</h1><p>Это ваш «второй мозг» нового поколения — гибрид Obsidian, Notion и AI-ассистента, с E2EE и локальным хранилищем.</p><h2>Что попробовать</h2><ul><li>Создайте wiki-ссылку набором <code>[[CRDT и синхронизация]]</code></li><li>Поставьте <span class="hashtag">#research</span> хэштег</li><li>Откройте <strong>Knowledge Graph</strong> в боковой панели</li><li>Постройте свой пайплайн в <strong>Flow Graph</strong></li><li>Создайте базу данных в стиле Notion</li></ul><blockquote>Все данные хранятся локально (IndexedDB) и шифруются при синхронизации (E2EE).</blockquote>`,
      contentText: "Welcome to CoffeeStation. Это ваш второй мозг.",
      type: "note",
      folderId: null,
      tags: ["product"],
      links: ["CRDT и синхронизация"],
      attachments: [],
      createdAt: now(),
      updatedAt: now(),
      archivedAt: null,
      pinned: true,
    },
    {
      id: crdt,
      title: "CRDT и синхронизация",
      content: `<h1>CRDT и синхронизация</h1><p>Conflict-free Replicated Data Types — структура данных для распределённой коллаборации без конфликтов.</p><h2>Библиотеки</h2><ul><li><strong>Yjs</strong> — производительный CRDT, embed в TipTap</li><li><strong>Automerge</strong> — JSON-like CRDT с богатой семантикой</li></ul><p>Связано с <span class="wiki-link">[[E2EE архитектура]]</span> и <span class="hashtag">#research</span>.</p>`,
      contentText: "CRDT и синхронизация Yjs Automerge",
      type: "note",
      folderId: folderResearch,
      tags: ["research"],
      links: ["E2EE архитектура"],
      attachments: [],
      createdAt: now() - 86400000,
      updatedAt: now() - 3600000,
      archivedAt: null,
      pinned: false,
    },
    {
      id: e2ee,
      title: "E2EE архитектура",
      content: `<h1>E2EE архитектура</h1><p>End-to-end encryption: XChaCha20-Poly1305 + X25519 + Argon2id.</p><h2>Принципы</h2><ol><li>Ключи деривуются из пароля пользователя</li><li>Сервер хранит только blob-ы</li><li>Sync через CRDT поверх зашифрованных данных</li></ol><p>См. также <span class="wiki-link">[[CRDT и синхронизация]]</span></p>`,
      contentText: "E2EE архитектура XChaCha20 X25519 Argon2id",
      type: "note",
      folderId: folderResearch,
      tags: ["research"],
      links: ["CRDT и синхронизация"],
      attachments: [],
      createdAt: now() - 86400000 * 2,
      updatedAt: now() - 7200000,
      archivedAt: null,
      pinned: false,
    },
    {
      id: aiNote,
      title: "AI ассистент и RAG",
      content: `<h1>AI ассистент и RAG</h1><p>Семантический поиск по базе знаний через embeddings + LLM-генерация ответа с цитатами.</p><ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"/></label><div><p>Реализовать ingestion pipeline</p></div></li><li data-checked="false"><label><input type="checkbox"/></label><div><p>Подключить Vercel AI Gateway</p></div></li></ul>`,
      contentText: "AI ассистент RAG embeddings",
      type: "note",
      folderId: folderResearch,
      tags: ["product", "research"],
      links: [],
      attachments: [],
      createdAt: now() - 86400000 * 3,
      updatedAt: now() - 86400000,
      archivedAt: null,
      pinned: false,
    },
    {
      id: meeting,
      title: "Meeting · Product sync 2026-05-22",
      content: `<h1>Product sync</h1><p><strong>Участники:</strong> Анна, Олег, Дарья</p><h2>Решения</h2><ul><li>Закрываем MVP-скоуп к концу месяца</li><li>AI через BYOK на Pro</li></ul><h2>Action items</h2><ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"/></label><div><p>Аня готовит дизайн графа</p></div></li><li data-checked="true"><label><input type="checkbox" checked/></label><div><p>Олег — архитектура sync</p></div></li></ul>`,
      contentText: "Meeting Product sync Анна Олег Дарья",
      type: "note",
      folderId: folderProjects,
      tags: ["todo"],
      links: [],
      attachments: [],
      createdAt: now() - 86400000,
      updatedAt: now() - 1800000,
      archivedAt: null,
      pinned: false,
    },
  ]);

  // Templates
  await db.templates.bulkAdd([
    {
      id: nanoid(10),
      name: "Daily Note",
      description: "Шаблон ежедневной заметки с целями и журналом",
      category: "daily",
      content: `<h1>{{date}}</h1><h2>🎯 Цели дня</h2><ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"/></label><div><p></p></div></li></ul><h2>📓 Журнал</h2><p></p><h2>💡 Идеи</h2><p></p>`,
      variables: ["date"],
    },
    {
      id: nanoid(10),
      name: "Meeting Note",
      description: "Шаблон заметки встречи",
      category: "meeting",
      content: `<h1>Meeting · {{title}}</h1><p><strong>Дата:</strong> {{date}}</p><p><strong>Участники:</strong> </p><h2>Повестка</h2><ul><li></li></ul><h2>Решения</h2><ul><li></li></ul><h2>Action items</h2><ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"/></label><div><p></p></div></li></ul>`,
      variables: ["title", "date"],
    },
    {
      id: nanoid(10),
      name: "Book Note",
      description: "Литературные заметки в стиле Zettelkasten",
      category: "literature",
      content: `<h1>{{title}}</h1><p><strong>Автор:</strong> </p><p><strong>Год:</strong> </p><h2>Ключевые идеи</h2><ul><li></li></ul><h2>Цитаты</h2><blockquote></blockquote><h2>Связи</h2><p>См. <span class="wiki-link">[[]]</span></p>`,
      variables: ["title"],
    },
    {
      id: nanoid(10),
      name: "Project Brief",
      description: "Бриф нового проекта",
      category: "project",
      content: `<h1>{{title}}</h1><h2>Цель</h2><p></p><h2>Контекст</h2><p></p><h2>Skopе</h2><ul><li></li></ul><h2>Timeline</h2><p></p>`,
      variables: ["title"],
    },
  ]);

  // Sample database — Tasks
  const dbId = nanoid(10);
  const statusFieldId = nanoid(6);
  const titleFieldId = nanoid(6);
  const priorityFieldId = nanoid(6);
  const dueFieldId = nanoid(6);
  const assigneeFieldId = nanoid(6);
  const tagsFieldId = nanoid(6);
  const tableViewId = nanoid(8);
  const boardViewId = nanoid(8);
  const calViewId = nanoid(8);

  await db.databases.add({
    id: dbId,
    name: "Tasks",
    icon: "ListChecks",
    defaultViewId: tableViewId,
    createdAt: now(),
    updatedAt: now(),
    fields: [
      { id: titleFieldId, name: "Title", type: "text" },
      { id: statusFieldId, name: "Status", type: "select", options: [
        { id: "todo", name: "Todo", color: "#64748b" },
        { id: "doing", name: "Doing", color: "#3b82f6" },
        { id: "review", name: "Review", color: "#a855f7" },
        { id: "done", name: "Done", color: "#10b981" },
      ]},
      { id: priorityFieldId, name: "Priority", type: "select", options: [
        { id: "low", name: "Low", color: "#94a3b8" },
        { id: "med", name: "Medium", color: "#f59e0b" },
        { id: "high", name: "High", color: "#ef4444" },
      ]},
      { id: dueFieldId, name: "Due", type: "date" },
      { id: assigneeFieldId, name: "Assignee", type: "text" },
      { id: tagsFieldId, name: "Tags", type: "multi-select", options: [
        { id: "fe", name: "frontend", color: "#3b82f6" },
        { id: "be", name: "backend", color: "#10b981" },
        { id: "ai", name: "ai", color: "#a855f7" },
      ]},
    ],
  });

  await db.dbViews.bulkAdd([
    { id: tableViewId, databaseId: dbId, name: "All tasks", type: "table" },
    { id: boardViewId, databaseId: dbId, name: "Board by status", type: "board", groupBy: statusFieldId },
    { id: calViewId, databaseId: dbId, name: "Calendar", type: "calendar", groupBy: dueFieldId },
  ]);

  const tasks = [
    { title: "Spec out CRDT sync engine", status: "doing", priority: "high", assignee: "Олег", tags: ["be"], due: now() + 86400000 * 2 },
    { title: "Design Knowledge Graph filters", status: "review", priority: "med", assignee: "Анна", tags: ["fe"], due: now() + 86400000 * 4 },
    { title: "Wire RAG pipeline (embeddings)", status: "todo", priority: "high", assignee: "Михаил", tags: ["ai"], due: now() + 86400000 * 7 },
    { title: "Web Clipper bookmarklet", status: "done", priority: "low", assignee: "Дарья", tags: ["fe"], due: now() - 86400000 },
    { title: "Threat model E2EE", status: "todo", priority: "high", assignee: "Олег", tags: ["be"], due: now() + 86400000 * 10 },
  ];
  await db.dbRows.bulkAdd(tasks.map((t) => ({
    id: nanoid(10),
    databaseId: dbId,
    createdAt: now(),
    updatedAt: now(),
    values: {
      [titleFieldId]: t.title,
      [statusFieldId]: t.status,
      [priorityFieldId]: t.priority,
      [dueFieldId]: t.due,
      [assigneeFieldId]: t.assignee,
      [tagsFieldId]: t.tags,
    },
  })));

  // Sample canvas
  const canvasId = nanoid(10);
  await db.canvases.add({
    id: canvasId,
    name: "Product strategy",
    updatedAt: now(),
    nodes: [
      { id: "n1", type: "card", x: 80, y: 100, width: 220, height: 120, data: { title: "MVP scope", body: "Desktop · Web · Sync" } },
      { id: "n2", type: "card", x: 380, y: 60, width: 220, height: 120, data: { title: "AI features", body: "RAG · Suggestions" } },
      { id: "n3", type: "card", x: 380, y: 240, width: 220, height: 120, data: { title: "E2EE", body: "Zero-knowledge" } },
      { id: "n4", type: "text", x: 680, y: 140, width: 200, height: 80, data: { text: "Дифференциация: PKM + AI + E2EE" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", label: "depends on" },
      { id: "e2", source: "n1", target: "n3", label: "secured by" },
      { id: "e3", source: "n2", target: "n4" },
      { id: "e4", source: "n3", target: "n4" },
    ],
  });

  // Sample mind map
  await db.mindmaps.add({
    id: nanoid(10),
    name: "CoffeeStation overview",
    updatedAt: now(),
    root: {
      id: "r",
      text: "CoffeeStation",
      children: [
        { id: "r1", text: "Editor", color: "#f97316", children: [
          { id: "r11", text: "WYSIWYG", children: [] },
          { id: "r12", text: "Markdown", children: [] },
          { id: "r13", text: "Wiki-links", children: [] },
        ]},
        { id: "r2", text: "Knowledge Base", color: "#3b82f6", children: [
          { id: "r21", text: "Folders", children: [] },
          { id: "r22", text: "Tags", children: [] },
          { id: "r23", text: "Search", children: [] },
        ]},
        { id: "r3", text: "AI", color: "#a855f7", children: [
          { id: "r31", text: "RAG", children: [] },
          { id: "r32", text: "OCR / STT", children: [] },
        ]},
        { id: "r4", text: "Sync · E2EE", color: "#10b981", children: [
          { id: "r41", text: "CRDT (Yjs)", children: [] },
          { id: "r42", text: "Zero-knowledge", children: [] },
        ]},
      ],
    },
  });

  // Sample flow graph
  await db.flows.add({
    id: nanoid(10),
    name: "Research pipeline",
    updatedAt: now(),
    nodes: [
      { id: "t1", type: "trigger", label: "On note created", x: 0, y: 100 },
      { id: "a1", type: "agent", label: "Summarizer", x: 240, y: 60, config: { prompt: "Summarize note in 5 bullets" } },
      { id: "l1", type: "llm", label: "Claude 4.7", x: 240, y: 200 },
      { id: "t2", type: "tool", label: "Tagger", x: 500, y: 60 },
      { id: "ac1", type: "action", label: "Save metadata", x: 760, y: 100 },
    ],
    edges: [
      { id: "fe1", source: "t1", target: "a1" },
      { id: "fe2", source: "l1", target: "a1", kind: "model" },
      { id: "fe3", source: "a1", target: "t2", kind: "tool" },
      { id: "fe4", source: "t2", target: "ac1", kind: "success" },
    ],
  });

  await db.settings.bulkPut([
    { key: "theme", value: "system" },
    { key: "locale", value: "ru" },
    { key: "vault.name", value: "My Vault" },
    { key: "ai.provider", value: "gateway" },
    { key: "sync.enabled", value: false },
    { key: "e2ee.enabled", value: true },
  ]);
}
