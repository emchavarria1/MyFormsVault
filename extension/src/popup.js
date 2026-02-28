const DEFAULT_API_URL = "http://localhost:8787";
const STORAGE_KEYS = {
  apiBaseUrl: "apiBaseUrl",
  token: "authToken",
  userEmail: "userEmail",
};

const state = {
  mode: "login",
  token: "",
  userEmail: "",
  templates: [],
  selectedTemplateId: "",
  mappings: [],
  selectedMappingId: "",
  activeTabUrl: "",
};

const el = {
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  saveApiUrl: document.getElementById("saveApiUrl"),
  authPanel: document.getElementById("authPanel"),
  appPanel: document.getElementById("appPanel"),
  tabLogin: document.getElementById("tabLogin"),
  tabRegister: document.getElementById("tabRegister"),
  authForm: document.getElementById("authForm"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  authSubmit: document.getElementById("authSubmit"),
  authError: document.getElementById("authError"),
  userEmail: document.getElementById("userEmail"),
  logoutButton: document.getElementById("logoutButton"),
  templateSelect: document.getElementById("templateSelect"),
  fillButton: document.getElementById("fillButton"),
  refreshButton: document.getElementById("refreshButton"),
  captureButton: document.getElementById("captureButton"),
  deleteButton: document.getElementById("deleteButton"),
  newTemplateName: document.getElementById("newTemplateName"),
  activeSiteLabel: document.getElementById("activeSiteLabel"),
  mappingSelect: document.getElementById("mappingSelect"),
  newMappingButton: document.getElementById("newMappingButton"),
  sitePattern: document.getElementById("sitePattern"),
  mappingText: document.getElementById("mappingText"),
  saveMappingButton: document.getElementById("saveMappingButton"),
  deleteMappingButton: document.getElementById("deleteMappingButton"),
  statusMessage: document.getElementById("statusMessage"),
};

function setStatus(message, isError = false) {
  el.statusMessage.textContent = message;
  el.statusMessage.style.color = isError ? "#9f1239" : "#1d4ed8";
}

function setAuthError(message) {
  el.authError.textContent = message;
}

function setMode(mode) {
  state.mode = mode;
  el.tabLogin.classList.toggle("active", mode === "login");
  el.tabRegister.classList.toggle("active", mode === "register");
  el.authSubmit.textContent = mode === "login" ? "Login" : "Create account";
  el.password.autocomplete = mode === "login" ? "current-password" : "new-password";
}

async function readStorage(keys) {
  return chrome.storage.local.get(keys);
}

async function writeStorage(items) {
  return chrome.storage.local.set(items);
}

function normalizeApiBaseUrl(raw) {
  const base = (raw || "").trim();
  if (!base) return DEFAULT_API_URL;
  return base.replace(/\/$/, "");
}

function normalizeKeyToken(value) {
  return `${value ?? ""}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeSitePattern(value) {
  return `${value ?? ""}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function showAuthPanel(show) {
  el.authPanel.classList.toggle("hidden", !show);
  el.appPanel.classList.toggle("hidden", show);
}

async function getApiBaseUrl() {
  const stored = await readStorage([STORAGE_KEYS.apiBaseUrl]);
  return normalizeApiBaseUrl(stored[STORAGE_KEYS.apiBaseUrl]);
}

async function apiRequest(path, { method = "GET", body, token = state.token } = {}) {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response
    .json()
    .catch(() => ({ error: `Request failed (${response.status}).` }));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }

  return payload;
}

function selectedTemplate() {
  return state.templates.find((template) => template.id === state.selectedTemplateId) || null;
}

function selectedMapping() {
  return state.mappings.find((mapping) => mapping.id === state.selectedMappingId) || null;
}

function setMappingControlsEnabled(enabled) {
  el.mappingSelect.disabled = !enabled;
  el.sitePattern.disabled = !enabled;
  el.mappingText.disabled = !enabled;
  el.saveMappingButton.disabled = !enabled;
  el.newMappingButton.disabled = !enabled;
  el.deleteMappingButton.disabled = !enabled || !state.selectedMappingId;
}

function renderTemplateSelect() {
  const previous = state.selectedTemplateId;
  el.templateSelect.innerHTML = "";

  if (state.templates.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No templates yet";
    el.templateSelect.appendChild(option);
    el.templateSelect.disabled = true;
    el.fillButton.disabled = true;
    el.deleteButton.disabled = true;
    state.selectedTemplateId = "";
    return;
  }

  el.templateSelect.disabled = false;
  state.templates.forEach((template) => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    el.templateSelect.appendChild(option);
  });

  const selected =
    state.templates.find((template) => template.id === previous)?.id ?? state.templates[0].id;

  state.selectedTemplateId = selected;
  el.templateSelect.value = selected;
  el.fillButton.disabled = false;
  el.deleteButton.disabled = false;
}

function mappingToText(fieldMap) {
  return Object.entries(fieldMap || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([target, source]) => `${target}=${source}`)
    .join("\n");
}

function parseMappingText(text) {
  const next = {};
  const lines = `${text ?? ""}`.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    let index = line.indexOf("=");
    if (index < 0) {
      index = line.indexOf(":");
    }

    if (index <= 0) continue;

    const target = normalizeKeyToken(line.slice(0, index));
    const source = normalizeKeyToken(line.slice(index + 1));

    if (!target || !source) continue;
    next[target] = source;
  }

  return next;
}

function getHostPathFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch (_error) {
    return "";
  }
}

function suggestPatternFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.hostname.toLowerCase()}/*`;
  } catch (_error) {
    return "";
  }
}

function wildcardToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function mappingMatchesUrl(mapping, rawUrl) {
  const pattern = normalizeSitePattern(mapping.sitePattern);
  if (!pattern || !rawUrl) return false;

  const fullUrl = `${rawUrl}`.toLowerCase();
  const hostPath = getHostPathFromUrl(rawUrl);
  if (!hostPath) return false;

  const target = pattern.startsWith("http://") || pattern.startsWith("https://")
    ? fullUrl
    : hostPath;

  try {
    return wildcardToRegExp(pattern).test(target);
  } catch (_error) {
    return false;
  }
}

function mappingSpecificity(mapping) {
  const pattern = normalizeSitePattern(mapping.sitePattern);
  return pattern.replace(/\*/g, "").length;
}

function pickBestMapping(rawUrl, mappings) {
  const matches = mappings.filter((mapping) => mappingMatchesUrl(mapping, rawUrl));
  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const specificityDiff = mappingSpecificity(b) - mappingSpecificity(a);
    if (specificityDiff !== 0) return specificityDiff;

    const aTime = Date.parse(a.updatedAt || "") || 0;
    const bTime = Date.parse(b.updatedAt || "") || 0;
    return bTime - aTime;
  });

  return matches[0];
}

function renderMappingSelect() {
  const previous = state.selectedMappingId;
  const template = selectedTemplate();

  el.mappingSelect.innerHTML = "";

  const newOption = document.createElement("option");
  newOption.value = "";
  newOption.textContent = "New mapping draft";
  el.mappingSelect.appendChild(newOption);

  if (!template) {
    state.selectedMappingId = "";
    el.mappingSelect.value = "";
    setMappingControlsEnabled(false);
    el.sitePattern.value = suggestPatternFromUrl(state.activeTabUrl);
    el.mappingText.value = "";
    return;
  }

  state.mappings.forEach((mapping) => {
    const option = document.createElement("option");
    option.value = mapping.id;
    option.textContent = `${mapping.sitePattern} (${Object.keys(mapping.fieldMap || {}).length})`;
    el.mappingSelect.appendChild(option);
  });

  state.selectedMappingId =
    state.mappings.find((mapping) => mapping.id === previous)?.id ?? "";

  el.mappingSelect.value = state.selectedMappingId;

  const activeMapping = selectedMapping();
  if (activeMapping) {
    el.sitePattern.value = activeMapping.sitePattern;
    el.mappingText.value = mappingToText(activeMapping.fieldMap);
  } else {
    el.sitePattern.value = suggestPatternFromUrl(state.activeTabUrl);
    el.mappingText.value = "";
  }

  setMappingControlsEnabled(true);
  el.deleteMappingButton.disabled = !state.selectedMappingId;
}

function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        reject(new Error("No active tab available."));
        return;
      }
      resolve(tab);
    });
  });
}

async function refreshActiveTabContext() {
  try {
    const tab = await getActiveTab();
    state.activeTabUrl = typeof tab.url === "string" ? tab.url : "";

    const hostPath = getHostPathFromUrl(state.activeTabUrl);
    if (hostPath) {
      el.activeSiteLabel.textContent = `Active site: ${hostPath}`;
    } else {
      el.activeSiteLabel.textContent = "Active site: unavailable on this page";
    }

    if (!state.selectedMappingId) {
      const suggestion = suggestPatternFromUrl(state.activeTabUrl);
      if (suggestion) {
        el.sitePattern.value = suggestion;
      }
    }
  } catch (_error) {
    state.activeTabUrl = "";
    el.activeSiteLabel.textContent = "Active site: unavailable";
  }
}

async function sendToContentScript(message) {
  const tab = await getActiveTab();
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(
          new Error(
            "Could not reach page script. Reload the page and try again."
          )
        );
        return;
      }
      resolve(response);
    });
  });
}

async function loadMappingsForSelectedTemplate() {
  const template = selectedTemplate();

  if (!template) {
    state.mappings = [];
    state.selectedMappingId = "";
    renderMappingSelect();
    return;
  }

  const payload = await apiRequest(`/api/templates/${template.id}/mappings`);
  state.mappings = payload.mappings || [];

  const stillSelected = state.mappings.some((mapping) => mapping.id === state.selectedMappingId);
  if (!stillSelected) {
    state.selectedMappingId = "";
  }

  renderMappingSelect();
}

async function loadTemplates() {
  const payload = await apiRequest("/api/templates");
  state.templates = payload.templates || [];
  renderTemplateSelect();
  await loadMappingsForSelectedTemplate();
}

async function handleLoginOrRegister(event) {
  event.preventDefault();
  setAuthError("");

  const email = el.email.value.trim();
  const password = el.password.value;

  if (!email || !password) {
    setAuthError("Email and password are required.");
    return;
  }

  try {
    const path = state.mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload = await apiRequest(path, {
      method: "POST",
      body: { email, password },
      token: "",
    });

    state.token = payload.token;
    state.userEmail = payload.user.email;

    await writeStorage({
      [STORAGE_KEYS.token]: state.token,
      [STORAGE_KEYS.userEmail]: state.userEmail,
    });

    el.userEmail.textContent = state.userEmail;
    showAuthPanel(false);
    await refreshActiveTabContext();
    await loadTemplates();
    setStatus("Signed in.");
    el.password.value = "";
  } catch (error) {
    setAuthError(error.message || "Authentication failed.");
  }
}

async function handleLogout() {
  state.token = "";
  state.userEmail = "";
  state.templates = [];
  state.selectedTemplateId = "";
  state.mappings = [];
  state.selectedMappingId = "";

  await writeStorage({
    [STORAGE_KEYS.token]: "",
    [STORAGE_KEYS.userEmail]: "",
  });

  renderTemplateSelect();
  renderMappingSelect();
  showAuthPanel(true);
  setStatus("Signed out.");
}

async function handleFillCurrentPage() {
  const template = selectedTemplate();
  if (!template) {
    setStatus("Select a template first.", true);
    return;
  }

  try {
    await refreshActiveTabContext();
    const mapping = pickBestMapping(state.activeTabUrl, state.mappings);

    const response = await sendToContentScript({
      type: "VV_APPLY_TEMPLATE",
      payload: {
        fields: template.fields,
        fieldMap: mapping?.fieldMap || {},
      },
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Could not apply template.");
    }

    if (mapping) {
      setStatus(`Filled ${response.filledCount || 0} field(s) using ${mapping.sitePattern}.`);
    } else {
      setStatus(`Filled ${response.filledCount || 0} field(s).`);
    }
  } catch (error) {
    setStatus(error.message || "Could not fill the page.", true);
  }
}

async function handleCaptureFromPage() {
  const name = el.newTemplateName.value.trim();
  if (!name) {
    setStatus("Enter a template name first.", true);
    return;
  }

  try {
    const response = await sendToContentScript({ type: "VV_CAPTURE_FORM" });
    if (!response?.ok) {
      throw new Error(response?.error || "Could not read fields from this page.");
    }

    const fields = response.fields || {};
    const keys = Object.keys(fields);

    if (keys.length === 0) {
      setStatus("No form values found on this page.", true);
      return;
    }

    await apiRequest("/api/templates", {
      method: "POST",
      body: { name, fields },
    });

    el.newTemplateName.value = "";
    await loadTemplates();
    setStatus(`Saved template with ${keys.length} field(s).`);
  } catch (error) {
    setStatus(error.message || "Could not save template.", true);
  }
}

async function handleDeleteSelectedTemplate() {
  const template = selectedTemplate();
  if (!template) {
    setStatus("Select a template first.", true);
    return;
  }

  if (!window.confirm(`Delete template "${template.name}"?`)) {
    return;
  }

  try {
    await apiRequest(`/api/templates/${template.id}`, { method: "DELETE" });
    await loadTemplates();
    setStatus("Template deleted.");
  } catch (error) {
    setStatus(error.message || "Could not delete template.", true);
  }
}

async function handleSaveMapping() {
  const template = selectedTemplate();
  if (!template) {
    setStatus("Select a template first.", true);
    return;
  }

  const sitePattern = normalizeSitePattern(el.sitePattern.value);
  const fieldMap = parseMappingText(el.mappingText.value);

  if (!sitePattern) {
    setStatus("Site pattern is required.", true);
    return;
  }

  if (Object.keys(fieldMap).length === 0) {
    setStatus("Add at least one target=source mapping line.", true);
    return;
  }

  try {
    let payload;

    if (state.selectedMappingId) {
      payload = await apiRequest(`/api/mappings/${state.selectedMappingId}`, {
        method: "PUT",
        body: { sitePattern, fieldMap },
      });
      setStatus("Site mapping updated.");
    } else {
      payload = await apiRequest(`/api/templates/${template.id}/mappings`, {
        method: "POST",
        body: { sitePattern, fieldMap },
      });
      setStatus("Site mapping created.");
    }

    const mappingId = payload?.mapping?.id;
    if (mappingId) {
      state.selectedMappingId = mappingId;
    }

    await loadMappingsForSelectedTemplate();
  } catch (error) {
    setStatus(error.message || "Could not save mapping.", true);
  }
}

async function handleDeleteSelectedMapping() {
  const mapping = selectedMapping();
  if (!mapping) {
    setStatus("Select a mapping first.", true);
    return;
  }

  if (!window.confirm(`Delete mapping "${mapping.sitePattern}"?`)) {
    return;
  }

  try {
    await apiRequest(`/api/mappings/${mapping.id}`, { method: "DELETE" });
    state.selectedMappingId = "";
    await loadMappingsForSelectedTemplate();
    setStatus("Mapping deleted.");
  } catch (error) {
    setStatus(error.message || "Could not delete mapping.", true);
  }
}

function startNewMappingDraft() {
  state.selectedMappingId = "";
  renderMappingSelect();
}

async function initialize() {
  const stored = await readStorage([
    STORAGE_KEYS.apiBaseUrl,
    STORAGE_KEYS.token,
    STORAGE_KEYS.userEmail,
  ]);

  const apiBaseUrl = normalizeApiBaseUrl(stored[STORAGE_KEYS.apiBaseUrl]);
  el.apiBaseUrl.value = apiBaseUrl;

  state.token = stored[STORAGE_KEYS.token] || "";
  state.userEmail = stored[STORAGE_KEYS.userEmail] || "";

  setMode("login");
  renderTemplateSelect();
  await refreshActiveTabContext();
  renderMappingSelect();

  el.tabLogin.addEventListener("click", () => setMode("login"));
  el.tabRegister.addEventListener("click", () => setMode("register"));
  el.authForm.addEventListener("submit", handleLoginOrRegister);
  el.logoutButton.addEventListener("click", () => void handleLogout());

  el.templateSelect.addEventListener("change", async () => {
    state.selectedTemplateId = el.templateSelect.value;
    state.selectedMappingId = "";
    try {
      await loadMappingsForSelectedTemplate();
    } catch (error) {
      setStatus(error.message || "Could not load mappings.", true);
    }
  });

  el.mappingSelect.addEventListener("change", () => {
    state.selectedMappingId = el.mappingSelect.value;
    renderMappingSelect();
  });

  el.newMappingButton.addEventListener("click", startNewMappingDraft);
  el.saveMappingButton.addEventListener("click", () => void handleSaveMapping());
  el.deleteMappingButton.addEventListener("click", () => void handleDeleteSelectedMapping());

  el.fillButton.addEventListener("click", () => void handleFillCurrentPage());
  el.refreshButton.addEventListener("click", async () => {
    try {
      await refreshActiveTabContext();
      await loadTemplates();
      setStatus("Templates and mappings refreshed.");
    } catch (error) {
      setStatus(error.message || "Could not load templates.", true);
    }
  });

  el.captureButton.addEventListener("click", () => void handleCaptureFromPage());
  el.deleteButton.addEventListener("click", () => void handleDeleteSelectedTemplate());

  el.saveApiUrl.addEventListener("click", async () => {
    const value = normalizeApiBaseUrl(el.apiBaseUrl.value);
    el.apiBaseUrl.value = value;
    await writeStorage({ [STORAGE_KEYS.apiBaseUrl]: value });
    setStatus(`Backend URL saved: ${value}`);
  });

  if (!state.token) {
    showAuthPanel(true);
    return;
  }

  try {
    await apiRequest("/api/auth/me");
    showAuthPanel(false);
    el.userEmail.textContent = state.userEmail || "Authenticated";
    await loadTemplates();
  } catch (_error) {
    await handleLogout();
    setAuthError("Session expired. Please log in again.");
  }
}

void initialize();
