chrome.storage.sync.get(["endpoint"]).then(({ endpoint }) => {
  document.getElementById("endpoint").value = endpoint || "http://localhost:3000";
});
document.getElementById("save").addEventListener("click", () => {
  const endpoint = document.getElementById("endpoint").value.trim();
  chrome.storage.sync.set({ endpoint }, () => {
    const el = document.getElementById("saved");
    el.hidden = false;
    setTimeout(() => (el.hidden = true), 1500);
  });
});
