document.getElementById("clip-page").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLIP", mode: "page" }, (res) => window.close());
});
document.getElementById("clip-selection").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLIP", mode: "selection" }, (res) => window.close());
});
chrome.storage.sync.get(["endpoint"]).then(({ endpoint }) => {
  document.getElementById("endpoint").textContent = endpoint || "http://localhost:3000";
});
