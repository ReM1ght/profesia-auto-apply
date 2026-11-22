window.__paa = {
  tick() {
    return tick();
  },
};

const CACHE = { text: "", krok: 0, els: null };

function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function visible(el) {
  if (!el || el.nodeType !== 1) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const st = getComputedStyle(el);
  if (st.display === "none" || st.visibility === "hidden") return false;
  return true;
}

function deepElements(root = document) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === 1) {
      out.push(node);
      if (node.shadowRoot) walk(node.shadowRoot);
    }
    const kids = node.children || [];
    for (const kid of kids) walk(kid);
  };
  walk(root.documentElement || root);
  return out;
}

function refreshCache() {
  CACHE.els = deepElements();
  CACHE.text = norm(document.body ? document.body.innerText : "").slice(0, 40000);
  CACHE.krok = krokFrom(CACHE.text);
}

function bodyText() {
  return CACHE.text;
}

function labelOf(el) {
  return norm(
    [
      el.innerText,
      el.textContent,
      el.value,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function isBackish(t) {
  return t.includes("spat") || t.includes("upravit") || t.includes("zrus") || t.includes("nahlad");
}

function clickable(el) {
  if (!el || el.nodeType !== 1) return null;
  return (
    el.closest("button, a, input, [role=button], [class*='MuiButton'], [class*='button']") ||
    (el.tagName === "BUTTON" || el.tagName === "A" ? el : null)
  );
}

function findByNeedles(needles, preferBottom) {
  const wanted = needles.map(norm);
  const hits = [];

  for (const el of CACHE.els) {
    const t = labelOf(el);
    if (!t || t.length > 80) continue;
    if (!wanted.some((w) => t === w || t.includes(w))) continue;
    const target = clickable(el) || el;
    if (!hits.includes(target)) hits.push(target);
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = norm(walker.currentNode.textContent);
    if (!t || t.length > 80) continue;
    if (!wanted.some((w) => t.includes(w))) continue;
    const target = clickable(walker.currentNode.parentElement);
    if (target && !hits.includes(target)) hits.push(target);
  }

  const vis = hits.filter(visible);
  const list = vis.length ? vis : hits;
  if (!list.length) return null;
  if (preferBottom) {
    list.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
  }
  return list[0];
}

function bottomPrimary() {
  const hits = CACHE.els.filter((el) => {
    if (!visible(el)) return false;
    const tag = el.tagName;
    if (tag !== "BUTTON" && tag !== "A" && el.getAttribute("role") !== "button") {
      if (!/MuiButton|button/i.test(el.className || "")) return false;
    }
    const t = labelOf(el);
    if (!t || t.length > 60 || isBackish(t)) return false;
    const cls = String(el.className || "");
    const type = (el.getAttribute("type") || "").toLowerCase();
    return type === "submit" || /primary|contained/i.test(cls);
  });
  hits.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
  return hits[0] || null;
}

function krokFrom(t) {
  if (t.includes("pred odoslanim") || t.includes("skontrolujte udaje") || t.includes("krok 2 z 2")) {
    return 2;
  }
  if (
    t.includes("zvolte zivotopis") ||
    t.includes("krok 1 z 2") ||
    t.includes("dalsie prilohy") ||
    t.includes("sprievodny text") ||
    t.includes("vybrat inu moznost") ||
    t.includes("chcete este nieco pridat")
  ) {
    return 1;
  }
  return 0;
}

function krok() {
  return CACHE.krok;
}

function alreadyApplied() {
  const t = bodyText();
  const href = location.href.toLowerCase();
  return (
    t.includes("uz ste reagovali") ||
    t.includes("you have already applied") ||
    t.includes("вы ответили на предложение") ||
    t.includes("ответили на предложение о работе") ||
    t.includes("datum vasej reakcie") ||
    t.includes("odoslane prilohy") ||
    t.includes("firma uz videla vas zivotopis") ||
    /historia.?reakc|\/reactions?\b|\/applied\b/i.test(href)
  );
}

function sendFailedRetry() {
  const t = bodyText();
  return (
    t.includes("nepodarilo odoslat") ||
    t.includes("odoslat znova") ||
    t.includes("skuste ju prosim")
  );
}

function consentRequiredError() {
  const t = bodyText();
  const required =
    t.includes("je povinna") ||
    t.includes("je povinne") ||
    t.includes("pole je povinne") ||
    t.includes("this field is required") ||
    t.includes("required field");
  const consent = t.includes("suhlas") || t.includes("consent") || t.includes("gdpr");
  return required && consent;
}

function consentText(el) {
  let text = labelOf(el);
  if (el.id) {
    const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lab) text += " " + labelOf(lab);
  }
  const wrap = el.closest("label, .MuiFormControlLabel-root, [class*='FormControlLabel']");
  if (wrap) text += " " + labelOf(wrap);
  const parent = el.parentElement;
  if (parent) text += " " + labelOf(parent);
  return text;
}

function isConsentCopy(t) {
  if (!t) return false;
  if (t.includes("suhlasim") || t.includes("suhlas") || t.includes("i agree") || t.includes("consent")) {
    return t.includes("osobn") || t.includes("udaj") || t.includes("gdpr") || t.includes("sprac") || t.includes("suhlasim");
  }
  return false;
}

function isCheckedBox(el) {
  if (el.tagName === "INPUT") return !!el.checked;
  return el.getAttribute("aria-checked") === "true" || el.classList.contains("Mui-checked");
}

function findConsentCheckbox() {
  const nodes = CACHE.els;
  for (const el of nodes) {
    if (el.tagName !== "INPUT" || el.type !== "checkbox") continue;
    if (el.checked) continue;
    if (el.closest("#onetrust-banner-sdk, #CybotCookiebotDialog, [id*='cookie'], [class*='cookie']")) continue;
    if (isConsentCopy(consentText(el))) {
      return el.closest("label, .MuiFormControlLabel-root, [class*='FormControlLabel']") || el;
    }
  }
  for (const el of nodes) {
    if (el.getAttribute("role") !== "checkbox") continue;
    if (isCheckedBox(el)) continue;
    if (isConsentCopy(consentText(el))) return el;
  }
  for (const el of nodes) {
    const t = labelOf(el);
    if (t.length < 8 || t.length > 280) continue;
    if (!isConsentCopy(t)) continue;
    if (el.matches("label, .MuiFormControlLabel-root, [class*='FormControlLabel']")) {
      const input = el.querySelector("input[type=checkbox]");
      if (input && input.checked) continue;
      return el;
    }
  }
  return null;
}

function isSuccess(sendBtn) {
  const href = location.href.toLowerCase();
  if (/reakcia-odoslana|reaction-sent|reakcia-bola-odoslana/.test(href)) return true;

  const t = bodyText();
  if (sendBtn && krok() === 2) return false;

  return (
    t.includes("hotovo") ||
    t.includes("сделанный") ||
    t.includes("зроблено") ||
    t.includes("dakujeme za vasu reakciu") ||
    t.includes("reakcia bola odoslana") ||
    t.includes("uspesne odoslan") ||
    t.includes("ваша реакция на позицию") ||
    t.includes("your application has been sent") ||
    t.includes("vratit sa k hladaniu") ||
    t.includes("вернуться к поиску предложений")
  );
}

function findApply() {
  if (krok() > 0) return null;
  return (
    document.querySelector("a#sendCvToCompany, #sendCvToCompany, a#offer-reaction, #offer-reaction") ||
    findByNeedles(["reagovat na ponuku", "apply for a job"])
  );
}

function findContinue() {
  if (krok() === 2) return null;
  return findByNeedles(["pokracovat", "pokracuj"], true) || (krok() === 1 ? bottomPrimary() : null);
}

function findSend() {
  if (krok() === 1) return null;
  return (
    findByNeedles(["odoslat reakciu", "odoslat ponuku", "send application"], true) ||
    (krok() === 2 ? bottomPrimary() : null)
  );
}

function hasCaptcha() {
  const href = location.href.toLowerCase();
  if (/awswaf|token\.awswaf|challenge\.cloudflare/.test(href)) return true;

  const frames = document.querySelectorAll("iframe");
  for (const f of frames) {
    const src = (f.src || "").toLowerCase();
    if (src.includes("awswaf") || src.includes("captcha") || src.includes("challenge")) return true;
  }
  if (document.querySelector("#captcha-container, [class*='aws-waf'], [id*='awswaf']")) return true;

  const raw = document.body && document.body.innerText ? document.body.innerText : "";
  const n = norm(raw.slice(0, 8000));
  return (
    n.includes("вы человек") ||
    n.includes("что вы человек") ||
    n.includes("проверку безопасности") ||
    n.includes("не бот") ||
    n.includes("verify you are human") ||
    n.includes("confirm you are human") ||
    n.includes("i am human") ||
    n.includes("nie som robot") ||
    n.includes("potvrdte ze ste clovek") ||
    n.includes("waf captcha")
  );
}

function findCaptchaBegin() {
  return findByNeedles(["начинать", "begin", "get started"]);
}

function dismissCookies() {
  const btn = findByNeedles(["prijat vsetky", "prijat nevyhnutne", "accept all"]);
  if (btn) clickEl(btn);
}

function jitter(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function clickEl(el) {
  if (!el) return false;
  const target = clickable(el) || el;
  target.scrollIntoView({ block: "center", inline: "nearest" });
  const r = target.getBoundingClientRect();
  const x = r.left + r.width * (0.35 + Math.random() * 0.3);
  const y = r.top + r.height * (0.35 + Math.random() * 0.3);
  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: 0,
    buttons: 1,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  };
  try {
    target.focus({ preventScroll: true });
  } catch {
    /* ignore */
  }
  try {
    target.dispatchEvent(new PointerEvent("pointerover", base));
    target.dispatchEvent(new MouseEvent("mouseover", base));
    target.dispatchEvent(new PointerEvent("pointermove", base));
    target.dispatchEvent(new PointerEvent("pointerdown", base));
    target.dispatchEvent(new MouseEvent("mousedown", base));
    const up = { ...base, buttons: 0 };
    target.dispatchEvent(new PointerEvent("pointerup", up));
    target.dispatchEvent(new MouseEvent("mouseup", up));
    target.dispatchEvent(new MouseEvent("click", up));
  } catch {
    /* ignore */
  }
  if (typeof target.click === "function") target.click();
  return true;
}

function markConsent(el) {
  const input =
    el.tagName === "INPUT" && el.type === "checkbox"
      ? el
      : el.querySelector
        ? el.querySelector("input[type=checkbox]")
        : null;
  const target = input || el;
  clickEl(target);
  if (input && !input.checked) {
    input.checked = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return true;
}

function buttonDump() {
  return CACHE.els
    .filter((el) => el.tagName === "BUTTON" || el.tagName === "A" || el.getAttribute("role") === "button")
    .filter(visible)
    .map((el) => (el.innerText || el.textContent || "").trim().replace(/\s+/g, " "))
    .filter((t) => t && t.length < 50)
    .slice(0, 8);
}

function tick() {
  refreshCache();

  if (hasCaptcha()) {
    if (!window.__paaCaptchaBegin) {
      const begin = findCaptchaBegin();
      if (begin) {
        window.__paaCaptchaBegin = true;
        clickEl(begin);
      }
    }
    return { ok: true, action: "captcha", waitMs: 1500, detail: "Captcha" };
  }

  window.__paaCaptchaBegin = false;
  dismissCookies();

  if (/\/uchadzac\/prihlasenie|\/login/i.test(location.href)) {
    return { ok: true, action: "login", detail: "Login page" };
  }

  if (alreadyApplied()) {
    return { ok: true, action: "skip", detail: "Already applied" };
  }

  const k = krok();
  const apply = findApply();
  const cont = findContinue();
  const send = findSend();

  if (isSuccess(send)) {
    return { ok: true, action: "done", detail: "Sent" };
  }

  if (cont && k !== 2) {
    clickEl(cont);
    return { ok: true, action: "clicked", krok: k || 1, waitMs: jitter(520, 780), detail: "Continue" };
  }

  if (k === 2 || send || consentRequiredError()) {
    const box = findConsentCheckbox();
    if (box) {
      markConsent(box);
      return { ok: true, action: "clicked", krok: 2, waitMs: jitter(280, 420), detail: "Consent" };
    }
  }

  if (send) {
    const now = Date.now();
    const last = window.__paaLastSend || 0;
    const failed = sendFailedRetry();
    const gap = failed ? jitter(1400, 1900) : jitter(700, 980);
    if (now - last < gap) {
      return {
        ok: true,
        action: "wait",
        krok: 2,
        waitMs: gap - (now - last),
        detail: failed ? "Retry send" : "Waiting after send",
      };
    }
    window.__paaLastSend = now;
    clickEl(send);
    return {
      ok: true,
      action: "clicked",
      krok: 2,
      waitMs: failed ? jitter(1400, 1800) : jitter(650, 900),
      detail: failed ? "Resend" : "Send",
    };
  }

  if (apply && k === 0) {
    clickEl(apply);
    return { ok: true, action: "clicked", krok: 0, waitMs: jitter(480, 720), detail: "Apply" };
  }

  return {
    ok: true,
    action: "wait",
    krok: k,
    detail: `Waiting (step ${k})`,
    dump: buttonDump(),
  };
}
