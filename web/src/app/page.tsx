"use client";

import React, { useEffect, useMemo, useState } from "react";
import { VaultCategory, VaultField, VaultProfile, TemplateDoc, VaultState } from "@/lib/types";
import { loadState, saveState, cryptoId, defaultState } from "@/lib/storage";
import { extractPlaceholders, renderTemplate } from "@/lib/template";
import { syncToExtension } from "@/lib/extensionSync";

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function HomePage() {
  const [state, setState] = useState<VaultState>(() => defaultState());
  const [activeTab, setActiveTab] = useState<"vault" | "templates" | "export">("vault");

  useEffect(() => {
    const s = loadState();
    setState(s);
  }, []);

  useEffect(() => {
    // persist on change
    if (typeof window !== "undefined") {
      saveState(state);
      syncToExtension(state);
    }
  }, [state]);

  const activeProfile = useMemo(() => {
    return state.profiles.find((p) => p.id === state.activeProfileId) ?? null;
  }, [state]);

  const allFieldKeys = useMemo(() => {
    const keys: { key: string; label: string }[] = [];
    for (const cat of state.categories) {
      for (const f of cat.fields) keys.push({ key: f.key, label: `${cat.name} • ${f.label}` });
    }
    return keys;
  }, [state.categories]);

  function setActiveProfile(profileId: string) {
    setState((s) => ({ ...s, activeProfileId: profileId }));
  }

  function addProfile() {
    const id = cryptoId();
    setState((s) => ({
      ...s,
      profiles: [...s.profiles, { id, name: `Profile ${s.profiles.length + 1}`, values: {} }],
      activeProfileId: id,
    }));
  }

  function renameProfile(id: string, name: string) {
    setState((s) => ({
      ...s,
      profiles: s.profiles.map((p) => (p.id === id ? { ...p, name } : p)),
    }));
  }

  function updateValue(key: string, value: string) {
    if (!activeProfile) return;
    setState((s) => ({
      ...s,
      profiles: s.profiles.map((p) =>
        p.id === activeProfile.id ? { ...p, values: { ...p.values, [key]: value } } : p
      ),
    }));
  }

  function addCategory() {
    setState((s) => ({
      ...s,
      categories: [...s.categories, { id: cryptoId(), name: `Category ${s.categories.length + 1}`, fields: [] }],
    }));
  }

  function renameCategory(catId: string, name: string) {
    setState((s) => ({
      ...s,
      categories: s.categories.map((c) => (c.id === catId ? { ...c, name } : c)),
    }));
  }

  function addField(catId: string) {
    setState((s) => ({
      ...s,
      categories: s.categories.map((c) => {
        if (c.id !== catId) return c;
        const newField: VaultField = {
          id: cryptoId(),
          key: `field_${Date.now()}`,
          label: "New field",
          type: "text",
        };
        return { ...c, fields: [...c.fields, newField] };
      }),
    }));
  }

  function updateField(catId: string, fieldId: string, patch: Partial<VaultField>) {
    setState((s) => ({
      ...s,
      categories: s.categories.map((c) => {
        if (c.id !== catId) return c;
        return {
          ...c,
          fields: c.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
        };
      }),
    }));
  }

  function deleteField(catId: string, fieldId: string) {
    setState((s) => ({
      ...s,
      categories: s.categories.map((c) => {
        if (c.id !== catId) return c;
        return { ...c, fields: c.fields.filter((f) => f.id !== fieldId) };
      }),
    }));
  }

  function addTemplate() {
    const now = Date.now();
    setState((s) => ({
      ...s,
      templates: [
        ...s.templates,
        { id: cryptoId(), name: `Template ${s.templates.length + 1}`, body: "Hello {{full_name}}!", createdAt: now, updatedAt: now },
      ],
    }));
  }

  function updateTemplate(id: string, patch: Partial<TemplateDoc>) {
    setState((s) => ({
      ...s,
      templates: s.templates.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)),
    }));
  }

  function deleteTemplate(id: string) {
    setState((s) => ({ ...s, templates: s.templates.filter((t) => t.id !== id) }));
  }

  function exportJson(): string {
    return JSON.stringify(state, null, 2);
  }

  function importJson(raw: string) {
    try {
      const parsed = JSON.parse(raw) as VaultState;
      if (!parsed || !parsed.version) throw new Error("Invalid");
      setState(parsed);
    } catch {
      alert("Import failed: invalid JSON or wrong format.");
    }
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-6xl p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Preference Vault v1</h1>
            <p className="text-sm text-neutral-600">
              Local-first vault + templates. Export JSON to share with the extension.
            </p>
          </div>

          <nav className="flex gap-2">
            <button className={tabBtn(activeTab === "vault")} onClick={() => setActiveTab("vault")}>Vault</button>
            <button className={tabBtn(activeTab === "templates")} onClick={() => setActiveTab("templates")}>Templates</button>
            <button className={tabBtn(activeTab === "export")} onClick={() => setActiveTab("export")}>Export/Import</button>
          </nav>
        </header>

        <main className="mt-6">
          {activeTab === "vault" && (
            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              <section className="rounded-2xl border p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium">Profiles</h2>
                  <button className="rounded-xl border px-3 py-1 text-sm" onClick={addProfile}>
                    + Add
                  </button>
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  {state.profiles.map((p) => (
                    <div key={p.id} className={cls("rounded-xl border p-2", p.id === state.activeProfileId && "bg-neutral-50")}>
                      <button className="w-full text-left" onClick={() => setActiveProfile(p.id)}>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-neutral-600">{p.id === state.activeProfileId ? "Active" : ""}</div>
                      </button>
                      <input
                        className="mt-2 w-full rounded-lg border px-2 py-1 text-sm"
                        value={p.name}
                        onChange={(e) => renameProfile(p.id, e.target.value)}
                        placeholder="Profile name"
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium">Categories & Fields</h2>
                  <button className="rounded-xl border px-3 py-1 text-sm" onClick={addCategory}>
                    + Category
                  </button>
                </div>

                {!activeProfile ? (
                  <p className="mt-4 text-sm text-neutral-600">Create a profile to begin.</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {state.categories.map((cat) => (
                      <div key={cat.id} className="rounded-2xl border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            className="w-full rounded-xl border px-3 py-2 font-medium"
                            value={cat.name}
                            onChange={(e) => renameCategory(cat.id, e.target.value)}
                          />
                          <button className="rounded-xl border px-3 py-2 text-sm" onClick={() => addField(cat.id)}>
                            + Field
                          </button>
                        </div>

                        <div className="mt-3 space-y-3">
                          {cat.fields.length === 0 ? (
                            <p className="text-sm text-neutral-600">No fields yet.</p>
                          ) : (
                            cat.fields.map((f) => (
                              <FieldRow
                                key={f.id}
                                category={cat}
                                field={f}
                                value={activeProfile.values[f.key] ?? ""}
                                onValueChange={(v) => updateValue(f.key, v)}
                                onFieldChange={(patch) => updateField(cat.id, f.id, patch)}
                                onDelete={() => deleteField(cat.id, f.id)}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === "templates" && (
            <TemplatesPanel
              templates={state.templates}
              values={activeProfile?.values ?? {}}
              allFieldKeys={allFieldKeys}
              onAdd={addTemplate}
              onUpdate={updateTemplate}
              onDelete={deleteTemplate}
            />
          )}

          {activeTab === "export" && (
            <ExportImportPanel
              exportJson={exportJson()}
              onImport={importJson}
            />
          )}
        </main>

        <footer className="mt-10 text-xs text-neutral-500">
          v1 goal: store structured preferences + generate template output + bridge to extension via JSON.
        </footer>
      </div>
    </div>
  );
}

function tabBtn(active: boolean) {
  return cls(
    "rounded-xl border px-3 py-2 text-sm",
    active ? "bg-black text-white" : "bg-white"
  );
}

function FieldRow({
  category,
  field,
  value,
  onValueChange,
  onFieldChange,
  onDelete,
}: {
  category: VaultCategory;
  field: VaultField;
  value: string;
  onValueChange: (v: string) => void;
  onFieldChange: (patch: Partial<VaultField>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-2xl border p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_220px_120px_60px]">
        <div className="flex flex-col gap-2">
          <label className="text-xs text-neutral-600">Label</label>
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            value={field.label}
            onChange={(e) => onFieldChange({ label: e.target.value })}
          />
          <div className="text-xs text-neutral-500">Key: <span className="font-mono">{field.key}</span></div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-neutral-600">Key</label>
          <input
            className="rounded-xl border px-3 py-2 text-sm font-mono"
            value={field.key}
            onChange={(e) => onFieldChange({ key: e.target.value })}
          />
          <div className="text-[11px] text-neutral-500">Used in templates: <span className="font-mono">{`{{${field.key}}}`}</span></div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-neutral-600">Type</label>
          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={field.type}
            onChange={(e) => onFieldChange({ type: e.target.value as any })}
          >
            <option value="text">text</option>
            <option value="dropdown">dropdown</option>
            <option value="date">date</option>
            <option value="number">number</option>
          </select>
        </div>

        <div className="flex items-end">
          <button className="w-full rounded-xl border px-3 py-2 text-sm" onClick={onDelete}>
            Del
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="text-xs text-neutral-600">Value (active profile)</label>
          {field.type === "dropdown" ? (
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
            >
              <option value="">(none)</option>
              {(field.options ?? []).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder={`Enter ${field.label}`}
              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
            />
          )}
        </div>

        {field.type === "dropdown" && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-neutral-600">Dropdown options (comma-separated)</label>
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              value={(field.options ?? []).join(", ")}
              onChange={(e) =>
                onFieldChange({
                  options: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="CA, NY, TX"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TemplatesPanel({
  templates,
  values,
  allFieldKeys,
  onAdd,
  onUpdate,
  onDelete,
}: {
  templates: TemplateDoc[];
  values: Record<string, string>;
  allFieldKeys: { key: string; label: string }[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<TemplateDoc>) => void;
  onDelete: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(templates[0]?.id ?? null);

  useEffect(() => {
    if (!selectedId && templates[0]?.id) setSelectedId(templates[0].id);
  }, [templates, selectedId]);

  const selected = templates.find((t) => t.id === selectedId) ?? null;
  const output = selected ? renderTemplate(selected.body, values) : "";
  const used = selected ? extractPlaceholders(selected.body) : [];

  function copyOutput() {
    navigator.clipboard.writeText(output);
    alert("Copied output to clipboard.");
  }

  function insertPlaceholder(key: string) {
    if (!selected) return;
    const token = `{{${key}}}`;
    onUpdate(selected.id, { body: selected.body + (selected.body.endsWith("\n") ? "" : "\n") + token });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <section className="rounded-2xl border p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Templates</h2>
          <button className="rounded-xl border px-3 py-1 text-sm" onClick={onAdd}>
            + Add
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              className={cls("rounded-xl border p-2 text-left", t.id === selectedId && "bg-neutral-50")}
              onClick={() => setSelectedId(t.id)}
            >
              <div className="text-sm font-medium">{t.name}</div>
              <div className="text-xs text-neutral-600">{new Date(t.updatedAt).toLocaleString()}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border p-4 shadow-sm">
        {!selected ? (
          <p className="text-sm text-neutral-600">Create a template to begin.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <input
                className="w-full rounded-xl border px-3 py-2 text-base font-medium"
                value={selected.name}
                onChange={(e) => onUpdate(selected.id, { name: e.target.value })}
              />
              <div className="flex gap-2">
                <button className="rounded-xl border px-3 py-2 text-sm" onClick={copyOutput}>Copy output</button>
                <button className="rounded-xl border px-3 py-2 text-sm" onClick={() => onDelete(selected.id)}>Delete</button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-medium">Template body</div>
                <textarea
                  className="h-80 w-full rounded-2xl border p-3 font-mono text-sm"
                  value={selected.body}
                  onChange={(e) => onUpdate(selected.id, { body: e.target.value })}
                />
                <div className="mt-2 text-xs text-neutral-600">
                  Tip: Use placeholders like <span className="font-mono">{`{{email}}`}</span>.
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">Rendered output</div>
                <textarea
                  className="h-80 w-full rounded-2xl border p-3 font-mono text-sm"
                  value={output}
                  readOnly
                />

                <div className="mt-3 rounded-2xl border p-3">
                  <div className="text-sm font-medium">Insert placeholder</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {allFieldKeys.map((k) => (
                      <button
                        key={k.key}
                        className="rounded-xl border px-3 py-2 text-left text-sm"
                        onClick={() => insertPlaceholder(k.key)}
                        title={`Insert {{${k.key}}}`}
                      >
                        <div className="text-xs text-neutral-600">{k.label}</div>
                        <div className="font-mono text-xs">{`{{${k.key}}}`}</div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 text-xs text-neutral-600">
                    Used in this template: {used.length ? used.map((u) => `{{${u}}}`).join(", ") : "none"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border p-3">
              <div className="text-sm font-medium">For the extension</div>
              <p className="mt-1 text-sm text-neutral-600">
                Copy the rendered output and paste anywhere, or export JSON and import it inside the extension.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ExportImportPanel({
  exportJson,
  onImport,
}: {
  exportJson: string;
  onImport: (raw: string) => void;
}) {
  const [raw, setRaw] = useState(exportJson);

  useEffect(() => setRaw(exportJson), [exportJson]);

  function copy() {
    navigator.clipboard.writeText(exportJson);
    alert("Copied JSON export to clipboard.");
  }

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="font-medium">Export / Import</h2>
        <div className="flex gap-2">
          <button className="rounded-xl border px-3 py-2 text-sm" onClick={copy}>
            Copy export JSON
          </button>
          <button className="rounded-xl border px-3 py-2 text-sm" onClick={() => onImport(raw)}>
            Import from editor
          </button>
        </div>
      </div>

      <textarea
        className="mt-4 h-[520px] w-full rounded-2xl border p-3 font-mono text-sm"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />

      <p className="mt-2 text-xs text-neutral-600">
        Import replaces your local vault.
      </p>
    </div>
  );
}
