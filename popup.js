const logEl = document.getElementById("log");
const liveEl = document.getElementById("live");
const sentEl = document.getElementById("sent");
const skippedEl = document.getElementById("skipped");
const failedEl = document.getElementById("failed");
const progressEl = document.getElementById("progress");

function render(data) {
  const stats = data.stats || { sent: 0, skipped: 0, failed: 0, total: 0, index: 0 };
  sentEl.textContent = stats.sent || 0;
  skippedEl.textContent = stats.skipped || 0;
  failedEl.textContent = stats.failed || 0;
  progressEl.textContent = `${stats.index || 0}/${stats.total || 0}`;

  const logs = data.logs || [];
  logEl.textContent = logs.length ? logs.map((l) => l.msg).join("\n") : "Ready.";
  logEl.scrollTop = logEl.scrollHeight;

  liveEl.className = "pill";
  if (data.running) {
    liveEl.textContent = "Running";
    liveEl.classList.add("run");
  } else if ((data.statusText || "").toLowerCase().includes("captcha")) {
    liveEl.textContent = "Captcha";
    liveEl.classList.add("warn");
  } else {
    liveEl.textContent = "Idle";
    liveEl.classList.add("idle");
  }
}

chrome.storage.local.get(["logs", "stats", "running", "statusText"], render);
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== "local") return;
  chrome.storage.local.get(["logs", "stats", "running", "statusText"], render);
});

document.getElementById("start").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    logEl.textContent = "No active tab";
    return;
  }
  chrome.runtime.sendMessage({ type: "START", tabId: tab.id, windowId: tab.windowId });
});

document.getElementById("stop").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP" });
});
