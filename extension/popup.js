const STORAGE_KEY = "pref_vault_state_v1_ext";
const MAPPINGS_KEY = "anyforms_mappings_v1";
const CAUTION_KEY = "anyforms_caution_v1";

function $(id) { return document.getElementById(id); }

async function loadState() {
  const res = await chrome.storage.local.get([STORAGE_KEY]);
  return res[STORAGE_KEY] || null;
}

async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

async function loadMappings() {
  const res = await chrome.storage.local.get([MAPPINGS_KEY]);
  return res[MAPPINGS_KEY] || {}; // { [hostname]: { [fingerprint]: fieldKey } }
}

async function saveMappings(mappings) {
  await chrome.storage.local.set({ [MAPPINGS_KEY]: mappings });
}

async function loadCaution() {
  const res = await chrome.storage.local.get([CAUTION_KEY]);
  return res[CAUTION_KEY] || "balanced";
}

async function saveCaution(value) {
  await chrome.storage.local.set({ [CAUTION_KEY]: value });
}

function buildFieldList(state) {
  const fields = [];
  for (const cat of state.categories || []) {
    for (const f of cat.fields || []) {
      fields.push({ key: f.key, label: `${cat.name} • ${f.label} (${f.key})` });
    }
  }
  return fields;
}

function getActiveProfile(state) {
  return (state.profiles || []).find(p => p.id === state.activeProfileId) || null;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, reason: "No active tab." };

  return await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, message, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve({ ok: false, reason: err.message });
      resolve(resp || { ok: false, reason: "No response from content script." });
    });
  });
}

async function getAllFrames(tabId) {
  return await new Promise((resolve) => {
    chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve([]);
      resolve(frames || []);
    });
  });
}

async function sendToFrame(tabId, frameId, message) {
  return await new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, { frameId }, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve({ ok: false, reason: err.message });
      resolve(resp || { ok: false, reason: "No response from frame content script." });
    });
  });
}

async function sendToAnyFrame(message) {
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, reason: "No active tab." };

  const frames = await getAllFrames(tab.id);
  const ordered = [{ frameId: 0 }, ...frames.filter(f => f.frameId !== 0)];

  let lastReason = "No frames responded.";
  for (const f of ordered) {
    const resp = await sendToFrame(tab.id, f.frameId, message);
    if (resp?.ok) return resp;
    if (resp?.reason) lastReason = resp.reason;
  }

  return { ok: false, reason: lastReason };
}

function setStatus(text) {
  $("status").textContent = text || "";
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(text) {
  const tokens = normalize(text).split(" ").filter((t) => t.length >= 2);
  return new Set(tokens);
}

function overlapScore(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersect = 0;
  for (const t of setA) if (setB.has(t)) intersect++;
  const union = setA.size + setB.size - intersect;
  return union ? intersect / union : 0;
}

function inferFieldType(desc) {
  const text = normalize(
    [desc.label, desc.placeholder, desc.aria, desc.name, desc.id].join(" ")
  );
  const type = String(desc.type || "").toLowerCase();

  const has = (w) => text.includes(w);
  const score = (s, t) => ({ type: t, score: s });

  if (type === "password" || has("password")) return score(0.98, "password");
  if (type === "email" || has("email")) return score(0.95, "email");
  if (type === "tel" || has("phone") || has("mobile")) return score(0.9, "phone");
  if (has("first name") || has("firstname")) return score(0.9, "first_name");
  if (has("last name") || has("lastname")) return score(0.9, "last_name");
  if (has("full name") || has("name")) return score(0.7, "full_name");
  if (has("company") || has("organization") || has("employer")) return score(0.8, "company");
  if (has("address") || has("street")) return score(0.85, "address");
  if (has("city")) return score(0.8, "city");
  if (has("state") || has("province")) return score(0.75, "state");
  if (has("zip") || has("postal")) return score(0.75, "zip");
  if (has("country")) return score(0.7, "country");
  if (has("title") || has("role")) return score(0.65, "title");
  if (has("website") || has("url")) return score(0.65, "website");

  return score(0.4, "unknown");
}

function inferVaultType(field) {
  const text = normalize(`${field.key} ${field.label}`);
  const has = (w) => text.includes(w);
  if (has("password")) return "password";
  if (has("email")) return "email";
  if (has("phone") || has("mobile")) return "phone";
  if (has("first") && has("name")) return "first_name";
  if (has("last") && has("name")) return "last_name";
  if (has("full") && has("name")) return "full_name";
  if (has("company") || has("organization") || has("employer")) return "company";
  if (has("address") || has("street")) return "address";
  if (has("city")) return "city";
  if (has("state") || has("province")) return "state";
  if (has("zip") || has("postal")) return "zip";
  if (has("country")) return "country";
  if (has("title") || has("role")) return "title";
  if (has("website") || has("url")) return "website";
  return "unknown";
}

function cautionThreshold(level) {
  if (level === "conservative") return 0.85;
  if (level === "aggressive") return 0.55;
  return 0.7;
}

function buildSuggestions(fields, vaultFields, cautionLevel) {
  const threshold = cautionThreshold(cautionLevel);
  const suggestions = {};

  for (const f of fields) {
    const inferred = inferFieldType(f);
    let best = { key: null, score: 0 };

    for (const vf of vaultFields) {
      const vaultType = inferVaultType(vf);
      const overlap = overlapScore(
        [f.label, f.placeholder, f.aria, f.name, f.id].join(" "),
        `${vf.key} ${vf.label}`
      );
      const typeMatch = inferred.type !== "unknown" && inferred.type === vaultType;
      const score =
        inferred.score * 0.6 +
        overlap * 0.3 +
        (typeMatch ? 0.2 : 0);

      if (score > best.score) best = { key: vf.key, score };
    }

    if (best.key && best.score >= threshold) {
      suggestions[f.fingerprint] = { key: best.key, score: best.score };
    }
  }

  return suggestions;
}

function renderMappingSummary(state, mappings, hostname) {
  const el = $("mappingSummary");
  if (!el) return;
  if (!hostname) {
    el.textContent = "This site: (open a page to see mappings)";
    return;
  }

  const mapForHost = mappings[hostname] || {};
  const keys = Object.values(mapForHost);

  if (!keys.length) {
    el.textContent = "This site: (no mappings yet)";
    return;
  }

  const labelByKey = {};
  for (const cat of state.categories || []) {
    for (const f of cat.fields || []) {
      labelByKey[f.key] = f.label || f.key;
    }
  }

  const lines = keys.map((k) => `• ${k} → ${labelByKey[k] || k}`);
  el.innerHTML = `This site:<br/>${lines.join("<br/>")}`;
}

async function refreshUI() {
  const state = await loadState();
  const mappings = await loadMappings();
  const caution = await loadCaution();

  const profileSelect = $("profileSelect");
  const fieldSelect = $("fieldSelect");
  const cautiousSelect = $("cautiousSelect");

  if (cautiousSelect) cautiousSelect.value = caution;

  profileSelect.innerHTML = "";
  fieldSelect.innerHTML = "";

  if (!state) {
    profileSelect.innerHTML = `<option value="">(no data yet)</option>`;
    fieldSelect.innerHTML = `<option value="">(no data yet)</option>`;
    setStatus("No vault state found. Open the web app so live sync can populate it.");
    renderMappingSummary({ categories: [] }, mappings, "");
    return;
  }

  setStatus("Ready.");

  for (const p of state.profiles || []) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === state.activeProfileId) opt.selected = true;
    profileSelect.appendChild(opt);
  }

  const fields = buildFieldList(state);
  for (const f of fields) {
    const opt = document.createElement("option");
    opt.value = f.key;
    opt.textContent = f.label;
    fieldSelect.appendChild(opt);
  }

  // mapping info for current site
  const tab = await getActiveTab();
  const hostname = (tab?.url ? new URL(tab.url).hostname : "");
  const count = hostname && mappings[hostname] ? Object.keys(mappings[hostname]).length : 0;
  $("mapInfo").textContent = hostname
    ? `Site: ${hostname} • Mapped fields: ${count}`
    : `Open a page to see mapping info.`;

  renderMappingSummary(state, mappings, hostname);
}

async function insertTextIntoActive(text) {
  const resp = await sendToActiveTab({ type: "PV_INSERT_TEXT", text });
  if (!resp?.ok) {
    alert(resp?.reason || "Could not insert. Click into an input first.");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await refreshUI();

  $("cautiousSelect").addEventListener("change", async (e) => {
    await saveCaution(e.target.value);
    setStatus(`Caution set to ${e.target.value}.`);
  });

  // JSON view helpers (optional now that live sync exists)
  $("btnLoadJson").addEventListener("click", async () => {
    const state = await loadState();
    $("jsonArea").value = state ? JSON.stringify(state, null, 2) : "";
  });

  $("btnExport").addEventListener("click", async () => {
    const state = await loadState();
    if (!state) return alert("Nothing to export yet.");
    $("jsonArea").value = JSON.stringify(state, null, 2);
  });

  $("btnSaveJson").addEventListener("click", async () => {
    try {
      const raw = $("jsonArea").value.trim();
      const parsed = JSON.parse(raw);
      await saveState(parsed);
      setStatus("Saved JSON to extension storage.");
      await refreshUI();
    } catch {
      alert("Invalid JSON.");
    }
  });

  $("btnClearMappings").addEventListener("click", async () => {
    await saveMappings({});
    setStatus("Cleared all mappings.");
    await refreshUI();
  });

  $("profileSelect").addEventListener("change", async (e) => {
    const state = await loadState();
    if (!state) return;
    state.activeProfileId = e.target.value;
    await saveState(state);
    setStatus("Active profile updated.");
  });

  $("btnInsert").addEventListener("click", async () => {
    const state = await loadState();
    if (!state) return alert("No vault data yet.");
    const profile = getActiveProfile(state);
    if (!profile) return alert("No active profile.");
    const key = $("fieldSelect").value;
    const val = (profile.values || {})[key] || "";
    await insertTextIntoActive(val);
  });

  $("btnCopy").addEventListener("click", async () => {
    const state = await loadState();
    if (!state) return alert("No vault data yet.");
    const profile = getActiveProfile(state);
    if (!profile) return alert("No active profile.");
    const key = $("fieldSelect").value;
    const val = (profile.values || {})[key] || "";
    await navigator.clipboard.writeText(val);
    setStatus("Copied.");
  });

  // ✅ Suggest mappings (auto)
  $("btnSuggest").addEventListener("click", async () => {
    const state = await loadState();
    if (!state) return alert("No vault data yet.");

    const caution = await loadCaution();
    const resp = await sendToAnyFrame({ type: "PV_SCAN_FIELDS" });
    if (!resp?.ok) return alert(resp?.reason || "Could not scan fields.");

    const tab = await getActiveTab();
    if (!tab?.url) return alert("No active tab URL.");
    const hostname = new URL(tab.url).hostname;

    const vaultFields = buildFieldList(state);
    const suggestions = buildSuggestions(resp.fields || [], vaultFields, caution);

    const mappings = await loadMappings();
    mappings[hostname] = mappings[hostname] || {};

    let added = 0;
    for (const [fingerprint, item] of Object.entries(suggestions)) {
      if (!mappings[hostname][fingerprint]) {
        mappings[hostname][fingerprint] = item.key;
        added++;
      }
    }

    await saveMappings(mappings);
    setStatus(`✓ Mapped ${added} fields on ${hostname} (${resp.formType || "General"})`);
    await refreshUI();
  });

  // ✅ Learn mapping
  $("btnLearn").addEventListener("click", async () => {
    const state = await loadState();
    if (!state) return alert("No vault data yet.");
    const fieldKey = $("fieldSelect").value;
    if (!fieldKey) return alert("Pick a field to map first.");

    const resp = await sendToAnyFrame({ type: "PV_GET_LAST_FINGERPRINT" });
    if (!resp?.ok) {
      return alert(resp?.reason || "Could not learn field.");
    }

    const mappings = await loadMappings();
    mappings[resp.hostname] = mappings[resp.hostname] || {};
    mappings[resp.hostname][resp.fingerprint] = fieldKey;
    await saveMappings(mappings);

    setStatus(`✓ ${fieldKey} mapped on ${resp.hostname}`);
    $("mapInfo").textContent =
      `Mapped ${fieldKey} ↔ ${resp.fingerprint}\n` +
      `Debug: name="${resp.debug?.name}" id="${resp.debug?.id}" aria="${resp.debug?.aria}" placeholder="${resp.debug?.placeholder}" label="${resp.debug?.label}"`;

    await refreshUI();
  });

  // ✅ Fill mapped fields
  $("btnFillMapped").addEventListener("click", async () => {
    const state = await loadState();
    if (!state) return alert("No vault data yet.");
    const profile = getActiveProfile(state);
    if (!profile) return alert("No active profile.");

    const tab = await getActiveTab();
    if (!tab?.url) return alert("No active tab URL.");
    const hostname = new URL(tab.url).hostname;

    const mappings = await loadMappings();
    const mappingsForHost = mappings[hostname] || {};

    const resp = await sendToAnyFrame({
      type: "PV_FILL_MAPPED_FIELDS",
      mappingsForHost,
      values: profile.values || {},
    });

    if (!resp?.ok) return alert(resp?.reason || "Fill failed.");
    setStatus(`✓ Filled ${resp.filled} fields on ${hostname}`);
    await refreshUI();
  });

  $("btnPasteTemplate").addEventListener("click", async () => {
    const text = $("templateOutput").value;
    if (!text.trim()) return alert("Paste template output first.");
    await insertTextIntoActive(text);
  });

  $("btnCopyTemplate").addEventListener("click", async () => {
    const text = $("templateOutput").value;
    await navigator.clipboard.writeText(text);
    setStatus("Copied template output.");
  });
});
