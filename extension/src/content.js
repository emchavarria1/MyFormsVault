const KEY_GROUPS = [
  ["firstname", "first", "givenname", "forename", "fname"],
  ["lastname", "last", "surname", "familyname", "lname"],
  ["fullname", "name", "legalname"],
  ["email", "emailaddress", "mail"],
  ["phone", "phonenumber", "mobile", "telephone", "cell", "tel"],
  ["company", "organization", "employer", "business"],
  ["address1", "address", "street", "streetaddress", "addressline1", "line1"],
  ["address2", "addressline2", "line2", "apt", "apartment", "suite", "unit"],
  ["city", "town", "locality"],
  ["state", "province", "region", "statecode"],
  ["zipcode", "zip", "postal", "postalcode", "postcode"],
  ["country", "countryname", "nation"],
  ["dateofbirth", "dob", "birthdate", "birthday"]
];

const SKIP_INPUT_TYPES = new Set([
  "button",
  "submit",
  "reset",
  "file",
  "hidden",
  "image"
]);

function normalizeKey(value) {
  return `${value ?? ""}`.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function aliasGroup(key) {
  const normalized = normalizeKey(key);
  if (!normalized) return [];
  const group = KEY_GROUPS.find((items) => items.includes(normalized));
  return group ? group : [normalized];
}

function unique(values) {
  return [...new Set(values)];
}

function getFieldLabel(element) {
  if (element.labels && element.labels.length > 0) {
    return element.labels[0].textContent || "";
  }

  const id = element.getAttribute("id");
  if (id) {
    const linked = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (linked) return linked.textContent || "";
  }

  const wrapperLabel = element.closest("label");
  if (wrapperLabel) return wrapperLabel.textContent || "";

  return "";
}

function isEditableField(element) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
    return false;
  }

  if (element.disabled) return false;

  if (element instanceof HTMLInputElement) {
    const type = (element.type || "text").toLowerCase();
    if (SKIP_INPUT_TYPES.has(type)) return false;
    if (type === "password") return false;
  }

  return true;
}

function fieldCandidates(element) {
  const raw = [];

  if (element.dataset.autofillKey) raw.push(element.dataset.autofillKey);
  if (element.getAttribute("name")) raw.push(element.getAttribute("name"));
  if (element.getAttribute("id")) raw.push(element.getAttribute("id"));
  if (element.getAttribute("autocomplete")) raw.push(element.getAttribute("autocomplete"));
  if (element.getAttribute("aria-label")) raw.push(element.getAttribute("aria-label"));
  if (element.getAttribute("placeholder")) raw.push(element.getAttribute("placeholder"));
  raw.push(getFieldLabel(element));

  const normalized = raw.map(normalizeKey).filter(Boolean);
  const expanded = [];

  for (const key of normalized) {
    expanded.push(...aliasGroup(key));
  }

  return unique(expanded);
}

function readFieldValue(element) {
  if (element instanceof HTMLInputElement) {
    const type = (element.type || "text").toLowerCase();

    if (type === "checkbox") {
      return element.checked ? "true" : "false";
    }

    if (type === "radio") {
      return element.checked ? element.value : "";
    }

    return element.value || "";
  }

  if (element instanceof HTMLTextAreaElement) {
    return element.value || "";
  }

  if (element instanceof HTMLSelectElement) {
    if (element.multiple) {
      return [...element.selectedOptions].map((option) => option.value || option.textContent || "").join(", ");
    }
    return element.value || "";
  }

  return "";
}

function parseBoolean(value) {
  const normalized = `${value ?? ""}`.trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function writeFieldValue(element, rawValue) {
  const value = `${rawValue ?? ""}`;

  if (element instanceof HTMLInputElement) {
    const type = (element.type || "text").toLowerCase();

    if (type === "checkbox") {
      const next = parseBoolean(value);
      if (element.checked !== next) {
        element.checked = next;
      }
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (type === "radio") {
      const shouldCheck = normalizeKey(element.value) === normalizeKey(value);
      if (shouldCheck) {
        element.checked = true;
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      return false;
    }

    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (element instanceof HTMLTextAreaElement) {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (element instanceof HTMLSelectElement) {
    const normalizedTarget = normalizeKey(value);
    let matchedOption = null;

    for (const option of element.options) {
      const optionValue = normalizeKey(option.value);
      const optionText = normalizeKey(option.textContent || "");
      if (optionValue === normalizedTarget || optionText === normalizedTarget) {
        matchedOption = option;
        break;
      }
    }

    if (matchedOption) {
      element.value = matchedOption.value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }

  return false;
}

function collectFormValues() {
  const output = {};
  const elements = document.querySelectorAll("input, textarea, select");

  for (const element of elements) {
    if (!isEditableField(element)) continue;

    const value = readFieldValue(element);
    if (!value.trim()) continue;

    const candidates = fieldCandidates(element);
    if (candidates.length === 0) continue;

    const key = candidates[0];
    output[key] = value;
  }

  return output;
}

function buildTemplateLookup(fields) {
  const incoming = typeof fields === "object" && fields ? fields : {};
  const lookup = new Map();

  for (const [rawKey, rawValue] of Object.entries(incoming)) {
    const normalizedKey = normalizeKey(rawKey);
    if (!normalizedKey) continue;

    const value = `${rawValue ?? ""}`;
    if (!value.trim()) continue;

    lookup.set(normalizedKey, value);

    for (const alias of aliasGroup(normalizedKey)) {
      if (!lookup.has(alias)) {
        lookup.set(alias, value);
      }
    }
  }

  return lookup;
}

function applyTemplateValues(fields, fieldMap = {}) {
  const templateLookup = buildTemplateLookup(fields);
  const mappedValues = new Map(templateLookup);

  if (fieldMap && typeof fieldMap === "object") {
    for (const [rawTargetKey, rawSourceKey] of Object.entries(fieldMap)) {
      const targetKey = normalizeKey(rawTargetKey);
      const sourceKey = normalizeKey(rawSourceKey);
      if (!targetKey || !sourceKey) continue;

      const sourceValue = templateLookup.get(sourceKey);
      if (!sourceValue) continue;

      for (const alias of aliasGroup(targetKey)) {
        mappedValues.set(alias, sourceValue);
      }
    }
  }

  let filledCount = 0;
  const elements = document.querySelectorAll("input, textarea, select");

  for (const element of elements) {
    if (!isEditableField(element)) continue;
    const candidates = fieldCandidates(element);

    let matchedValue = "";
    for (const candidate of candidates) {
      if (mappedValues.has(candidate)) {
        matchedValue = mappedValues.get(candidate);
        break;
      }
    }

    if (!matchedValue) continue;

    const changed = writeFieldValue(element, matchedValue);
    if (changed) filledCount += 1;
  }

  return filledCount;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
    if (message?.type === "VV_CAPTURE_FORM") {
      const fields = collectFormValues();
      sendResponse({ ok: true, fields, count: Object.keys(fields).length });
      return;
    }

    if (message?.type === "VV_APPLY_TEMPLATE") {
      const fields = message?.payload?.fields;
      const fieldMap = message?.payload?.fieldMap;

      if (!fields || typeof fields !== "object") {
        sendResponse({ ok: false, error: "Missing template fields." });
        return;
      }

      const filledCount = applyTemplateValues(fields, fieldMap);
      sendResponse({ ok: true, filledCount });
      return;
    }
  } catch (error) {
    sendResponse({ ok: false, error: error?.message || "Unexpected content script error." });
  }
});
