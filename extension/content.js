let lastEditable = null;

function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  const isInput = tag === "INPUT" || tag === "TEXTAREA";
  const isCE = el.isContentEditable === true;
  return isInput || isCE;
}

document.addEventListener(
  "focusin",
  (e) => {
    const el = e.target;
    if (isEditable(el)) lastEditable = el;
  },
  true
);

document.addEventListener(
  "click",
  (e) => {
    const el = e.target;
    if (isEditable(el)) lastEditable = el;
  },
  true
);

function safeText(s) {
  return String(s || "").trim().slice(0, 120);
}

function getLabelText(el) {
  try {
    if (!el || !el.id) return "";
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    return safeText(label?.innerText || label?.textContent || "");
  } catch {
    return "";
  }
}

function fingerprintForElement(el) {
  // Stable-ish fingerprint for mapping form fields per-site.
  // Use attributes that tend to remain stable across visits.
  const parts = [
    el.tagName,
    safeText(el.getAttribute("name")),
    safeText(el.getAttribute("id")),
    safeText(el.getAttribute("aria-label")),
    safeText(el.getAttribute("placeholder")),
    safeText(getLabelText(el)),
    safeText(el.getAttribute("type")),
  ].filter(Boolean);

  // If everything is empty, fall back to a weak selector path
  if (parts.length <= 1) {
    parts.push(getWeakPath(el));
  }

  return parts.join("|");
}

function getWeakPath(el) {
  // "Good enough" fallback to distinguish anonymous fields.
  // We keep it short to avoid brittleness.
  try {
    let cur = el;
    const segs = [];
    let depth = 0;
    while (cur && depth < 4 && cur.nodeType === 1) {
      const tag = cur.tagName.toLowerCase();
      const id = cur.id ? `#${cur.id}` : "";
      const cls = cur.classList?.length ? `.${[...cur.classList].slice(0, 2).join(".")}` : "";
      segs.push(`${tag}${id}${cls}`);
      cur = cur.parentElement;
      depth++;
    }
    return segs.join(">");
  } catch {
    return "unknown";
  }
}

function insertInto(el, text) {
  const tag = el.tagName;

  if (tag === "INPUT" || tag === "TEXTAREA") {
    const input = el;
    input.focus();

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;

    input.value = input.value.slice(0, start) + text + input.value.slice(end);

    const pos = start + text.length;
    input.setSelectionRange(pos, pos);

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (el.isContentEditable) {
    el.focus();
    const ok = document.execCommand("insertText", false, text);
    if (ok) return true;

    el.textContent = (el.textContent || "") + text;
    return true;
  }

  return false;
}

function setValueInto(el, text) {
  // Used for filling mapped fields (not cursor insert)
  const tag = el.tagName;

  if (tag === "INPUT" || tag === "TEXTAREA") {
    el.focus();
    el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (el.isContentEditable) {
    el.focus();
    el.textContent = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  return false;
}

function collectFieldDescriptor(el) {
  return {
    fingerprint: fingerprintForElement(el),
    tag: el.tagName,
    type: safeText(el.getAttribute("type")),
    name: safeText(el.getAttribute("name")),
    id: safeText(el.getAttribute("id")),
    aria: safeText(el.getAttribute("aria-label")),
    placeholder: safeText(el.getAttribute("placeholder")),
    label: getLabelText(el),
  };
}

function detectFormType(fields) {
  const text = fields
    .map((f) => [f.label, f.placeholder, f.aria, f.name, f.id].join(" "))
    .join(" ")
    .toLowerCase();

  const has = (word) => text.includes(word);

  if (has("password") && (has("email") || has("username") || has("login"))) return "Login";
  if (has("shipping") || has("billing") || has("checkout") || has("address")) return "Checkout";
  if (has("resume") || has("cover letter") || has("education") || has("employment")) return "Job Application";
  if (has("contact") || has("message") || has("inquiry")) return "Contact";
  return "General";
}

/** =========================
 *  LIVE SYNC (web app -> extension)
 *  ========================= */
const STORAGE_KEY = "pref_vault_state_v1_ext";
const ALLOWED_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);

window.addEventListener("message", async (event) => {
  if (!ALLOWED_ORIGINS.has(event.origin)) return;

  const msg = event.data;
  if (!msg || msg.type !== "PV_SYNC_STATE") return;

  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: msg.payload });
    window.postMessage({ type: "PV_SYNC_ACK" }, event.origin);
  } catch (e) {
    window.postMessage({ type: "PV_SYNC_ERR", error: String(e) }, event.origin);
  }
});

/** =========================
 *  LEARN + FILL MAPPINGS
 *  ========================= */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Insert at cursor (your existing feature)
  if (msg?.type === "PV_INSERT_TEXT") {
    const text = String(msg.text ?? "");
    const target = lastEditable && isEditable(lastEditable) ? lastEditable : null;

    if (!target) {
      return sendResponse({
        ok: false,
        reason: "No remembered input. Click into a real text field (input/textarea) on the page first.",
      });
    }

    const ok = insertInto(target, text);
    return sendResponse(ok ? { ok: true } : { ok: false, reason: "Could not insert into that element." });
  }

  // Return fingerprint of the last clicked/focused input on the page
  if (msg?.type === "PV_GET_LAST_FINGERPRINT") {
    const target = lastEditable && isEditable(lastEditable) ? lastEditable : null;
    if (!target) {
      return sendResponse({
        ok: false,
        reason: "Click into the field you want to learn first, then try again.",
      });
    }

    const fp = fingerprintForElement(target);
    return sendResponse({
      ok: true,
      hostname: location.hostname,
      fingerprint: fp,
      debug: {
        tag: target.tagName,
        name: target.getAttribute("name") || "",
        id: target.getAttribute("id") || "",
        aria: target.getAttribute("aria-label") || "",
        placeholder: target.getAttribute("placeholder") || "",
        label: getLabelText(target) || "",
      },
    });
  }

  // Fill mapped fields on the page
  if (msg?.type === "PV_FILL_MAPPED_FIELDS") {
    const mappingsForHost = msg.mappingsForHost || {};
    const values = msg.values || {};

    let filled = 0;

    // Inputs + textareas
    const inputs = Array.from(document.querySelectorAll("input, textarea"));
    for (const el of inputs) {
      if (!isEditable(el)) continue;
      const fp = fingerprintForElement(el);
      const fieldKey = mappingsForHost[fp];
      if (!fieldKey) continue;

      const val = values[fieldKey];
      if (val == null) continue;

      if (setValueInto(el, String(val))) filled++;
    }

    // Contenteditable elements (common editors)
    const ces = Array.from(document.querySelectorAll("[contenteditable='true']"));
    for (const el of ces) {
      if (!isEditable(el)) continue;
      const fp = fingerprintForElement(el);
      const fieldKey = mappingsForHost[fp];
      if (!fieldKey) continue;

      const val = values[fieldKey];
      if (val == null) continue;

      if (setValueInto(el, String(val))) filled++;
    }

    return sendResponse({ ok: true, filled });
  }

  // Scan fields for suggestions
  if (msg?.type === "PV_SCAN_FIELDS") {
    const fields = [];
    const inputs = Array.from(document.querySelectorAll("input, textarea"));
    for (const el of inputs) {
      if (!isEditable(el)) continue;
      fields.push(collectFieldDescriptor(el));
    }

    const ces = Array.from(document.querySelectorAll("[contenteditable='true']"));
    for (const el of ces) {
      if (!isEditable(el)) continue;
      fields.push(collectFieldDescriptor(el));
    }

    const formType = detectFormType(fields);
    return sendResponse({ ok: true, fields, formType });
  }
});
