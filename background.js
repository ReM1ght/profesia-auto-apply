let running = false;
let stopFlag = false;
let keepAlive = null;
let stats = { sent: 0, skipped: 0, failed: 0, external: 0, total: 0, index: 0 };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "START") {
    startFrom(msg.tabId, msg.windowId);
    sendResponse({ ok: true });
  }
  if (msg.type === "STOP") {
    stopFlag = true;
    running = false;
    pushLog("Stopped");
    sendResponse({ ok: true });
  }
  return true;
});

function pulse() {
  if (keepAlive) clearInterval(keepAlive);
  keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 15000);
}

function stopPulse() {
  if (keepAlive) {
    clearInterval(keepAlive);
    keepAlive = null;
  }
}

function jitter(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function persist() {
  const { logs = [] } = await chrome.storage.local.get("logs");
  const last = logs.length ? logs[logs.length - 1] : null;
  await chrome.storage.local.set({ running, stats, statusText: (last && last.msg) || "" });
}

async function pushLog(msg) {
  const { logs = [] } = await chrome.storage.local.get("logs");
  logs.push({ t: Date.now(), msg });
  await chrome.storage.local.set({
    running,
    stats,
    statusText: msg,
    logs: logs.slice(-60),
  });
}

function setBadge(text) {
  chrome.action.setBadgeBackgroundColor({ color: "#3a3c3f" });
  chrome.action.setBadgeText({ text: String(text || "") });
}

function isProfesia(url) {
  try {
    const h = new URL(url).hostname;
    return h === "profesia.sk" || h.endsWith(".profesia.sk");
  } catch {
    return false;
  }
}

function isLogin(url) {
  return /\/uchadzac\/prihlasenie|\/login/i.test(url || "");
}

function isChallenge(url) {
  return /awswaf|captcha|challenge/i.test(url || "");
}

async function inject(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"],
    });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
    } catch {
      /* chrome:// or closed tab */
    }
  }
}

async function tick(tabId) {
  await inject(tabId);
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        if (!window.__paa) return { ok: false, error: "no-script" };
        return window.__paa.tick();
      },
    });
    const results = (frames || []).map((f) => f.result).filter(Boolean);
    return (
      results.find((r) => r.action === "captcha") ||
      results.find((r) => r.action === "login") ||
      results.find((r) => r.action === "done") ||
      results.find((r) => r.action === "skip") ||
      results.find((r) => r.action === "clicked") ||
      results.find((r) => r.ok) ||
      results[0] || { ok: false }
    );
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* already closed */
  }
}

async function waitComplete(tabId, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return null;
    if (tab.status === "complete") return tab;
    await sleep(180);
  }
  return chrome.tabs.get(tabId).catch(() => null);
}

async function waitOutCaptcha(tabId) {
  await pushLog("Captcha — pass the check in this tab, then I continue");
  while (!stopFlag) {
    await sleep(1400);
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return { action: "skip", detail: "tab gone" };
    if (isChallenge(tab.url) && !isProfesia(tab.url)) continue;
    const info = await tick(tabId);
    if (info.action === "captcha" || info.error === "no-script") continue;
    await pushLog("Captcha done, continuing");
    return info;
  }
  return { action: "stopped", detail: "Stopped" };
}

async function processTab(tabId, index, total) {
  await chrome.tabs.update(tabId, { active: true }).catch(() => null);
  await waitComplete(tabId);
  await sleep(jitter(160, 280));

  let started = Date.now();
  let lastHref = "";
  let idleRounds = 0;
  let lastLogged = "";

  while (!stopFlag && Date.now() - started < 90000) {
    const current = await chrome.tabs.get(tabId).catch(() => null);
    if (!current) return "gone";

    const href = current.url || "";
    if (isLogin(href)) return "need-login";

    if (!isProfesia(href) && !isChallenge(href)) {
      await closeTab(tabId);
      return "external";
    }

    let info = await tick(tabId);
    if (info.action === "captcha" || isChallenge(href)) {
      info = await waitOutCaptcha(tabId);
      if (info.action === "stopped") return "stopped";
      started = Date.now();
    }

    const action = info.action || "wait";
    stats.index = index + 1;
    stats.total = total;
    const line = `${index + 1}/${total}  ${info.detail || action}`;
    if (line !== lastLogged && action !== "wait") {
      lastLogged = line;
      await pushLog(line);
    } else {
      await persist();
    }

    if (info.action === "login") return "need-login";
    if (info.action === "done") {
      await sleep(jitter(160, 260));
      await closeTab(tabId);
      return "sent";
    }
    if (info.action === "skip") {
      await closeTab(tabId);
      return "already";
    }

    if (href === lastHref && (action === "wait" || action === "missing")) idleRounds += 1;
    else idleRounds = 0;
    lastHref = href;

    if (idleRounds > 28) {
      await closeTab(tabId);
      return "failed";
    }

    const waitMs = Number(info.waitMs) || (info.action === "clicked" ? jitter(520, 760) : jitter(280, 420));
    await sleep(Math.max(180, waitMs));
  }

  if (!stopFlag) await closeTab(tabId);
  return stopFlag ? "stopped" : "timeout";
}

async function startFrom(startTabId, windowId) {
  if (running) {
    await pushLog("Already running");
    return;
  }

  const tabs = await chrome.tabs.query({ windowId });
  tabs.sort((a, b) => a.index - b.index);
  const start = tabs.find((t) => t.id === startTabId);
  if (!start) {
    await pushLog("No start tab");
    return;
  }

  const queue = tabs.filter((t) => t.index >= start.index);
  running = true;
  stopFlag = false;
  stats = { sent: 0, skipped: 0, failed: 0, external: 0, total: queue.length, index: 0 };
  setBadge("0");
  pulse();
  await chrome.storage.local.set({ logs: [] });
  await pushLog(`Queue ${queue.length} tabs`);

  for (let i = 0; i < queue.length; i++) {
    if (stopFlag) break;
    const id = queue[i].id;
    let tab;
    try {
      tab = await chrome.tabs.get(id);
    } catch {
      stats.skipped += 1;
      continue;
    }

    try {
      const result = await processTab(id, i, queue.length);
      if (result === "need-login") {
        running = false;
        stopPulse();
        await pushLog("Login required — sign in, then Start");
        return;
      }
      if (result === "sent") stats.sent += 1;
      else if (result === "already" || result === "gone") stats.skipped += 1;
      else if (result === "external") stats.external += 1;
      else if (result === "stopped") break;
      else stats.failed += 1;
      setBadge(String(stats.sent));
    } catch (err) {
      stats.failed += 1;
      await pushLog(`Error: ${err.message || err}`);
    }

    if (i < queue.length - 1 && !stopFlag) {
      let extra = 0;
      if (stats.sent > 0 && stats.sent % 4 === 0) extra = jitter(5000, 8000);
      if (stats.sent > 0 && stats.sent % 7 === 0) extra = jitter(9000, 14000);
      await sleep(jitter(700, 1300) + extra);
    }
  }

  running = false;
  stopPulse();
  await pushLog(
    stopFlag
      ? `Stopped · sent ${stats.sent} · skip ${stats.skipped} · fail ${stats.failed}`
      : `Done · sent ${stats.sent} · skip ${stats.skipped} · fail ${stats.failed}`
  );
}
