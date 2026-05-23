// CoffeeStation Web Clipper — background service worker
// Posts captured payloads to <endpoint>/api/clip

const DEFAULT_ENDPOINT = "http://localhost:3000";

async function getEndpoint() {
  const { endpoint } = await chrome.storage.sync.get(["endpoint"]);
  return endpoint || DEFAULT_ENDPOINT;
}

async function send(payload) {
  const endpoint = await getEndpoint();
  try {
    const res = await fetch(endpoint.replace(/\/$/, "") + "/api/clip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (e) {
    console.error("CoffeeStation clip failed:", e);
    chrome.notifications?.create({
      type: "basic",
      iconUrl: "icon.png",
      title: "CoffeeStation",
      message: "Не удалось отправить клип: " + e.message,
    });
    throw e;
  }
}

async function clipActiveTab(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageContent,
    args: [mode],
  });
  await send({ ...result, url: tab.url, title: tab.title, clippedAt: Date.now() });
  chrome.action.setBadgeText({ text: "✓" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
}

function extractPageContent(mode) {
  function getText() {
    const sel = window.getSelection?.()?.toString() ?? "";
    if (mode === "selection" && sel) return { html: sel, text: sel };
    const article = document.querySelector("article, main") || document.body;
    return { html: article.innerHTML, text: article.innerText };
  }
  const { html, text } = getText();
  return {
    html,
    text,
    selection: window.getSelection?.()?.toString() ?? "",
  };
}

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "clip-page") clipActiveTab("page");
  if (cmd === "clip-selection") clipActiveTab("selection");
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "clip-selection",
    title: "Сохранить в CoffeeStation",
    contexts: ["selection", "page"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "clip-selection") {
    clipActiveTab(info.selectionText ? "selection" : "page");
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "CLIP") {
    clipActiveTab(msg.mode ?? "page").then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
});
