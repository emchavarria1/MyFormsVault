import cors from "cors";
import express from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { comparePassword, hashPassword, signToken, verifyToken } from "./auth.js";
import { config } from "./config.js";
import { db } from "./db.js";
const app = express();
app.use(cors({
    origin: (_origin, callback) => callback(null, true),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
const authSchema = z.object({
    email: z.string().email().max(320),
    password: z.string().min(8).max(128),
});
const templateBodySchema = z.object({
    name: z.string().min(1).max(120),
    fields: z.record(z.string().max(5000)),
});
const mappingBodySchema = z.object({
    sitePattern: z.string().min(1).max(500),
    fieldMap: z.record(z.string().max(120), z.string().max(120)),
});
function normalizeKeyToken(value) {
    return `${value ?? ""}`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}
function normalizeFields(fields) {
    const next = {};
    for (const [rawKey, rawValue] of Object.entries(fields)) {
        const key = normalizeKeyToken(rawKey);
        if (!key)
            continue;
        const value = `${rawValue ?? ""}`;
        if (!value.trim())
            continue;
        next[key] = value;
    }
    return next;
}
function normalizeSitePattern(sitePattern) {
    return sitePattern.trim().toLowerCase().replace(/\s+/g, "");
}
function normalizeFieldMap(fieldMap) {
    const next = {};
    for (const [rawTarget, rawSource] of Object.entries(fieldMap)) {
        const target = normalizeKeyToken(rawTarget);
        const source = normalizeKeyToken(rawSource);
        if (!target || !source)
            continue;
        next[target] = source;
    }
    return next;
}
function toTemplateResponse(row) {
    return {
        id: row.id,
        name: row.name,
        fields: JSON.parse(row.fields_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function toSiteMappingResponse(row) {
    return {
        id: row.id,
        templateId: row.template_id,
        sitePattern: row.site_pattern,
        fieldMap: JSON.parse(row.field_map_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function requireAuth(req, res, next) {
    const authHeader = req.header("authorization") ?? "";
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ error: "Missing bearer token." });
    }
    try {
        req.auth = verifyToken(token);
        return next();
    }
    catch (_error) {
        return res.status(401).json({ error: "Invalid or expired token." });
    }
}
function findOwnedTemplate(templateId, userId) {
    return db
        .prepare("select id, user_id, name, fields_json, created_at, updated_at from templates where id = ? and user_id = ?")
        .get(templateId, userId);
}
function findOwnedMapping(mappingId, userId) {
    return db
        .prepare("select id, user_id, template_id, site_pattern, field_map_json, created_at, updated_at from site_mappings where id = ? and user_id = ?")
        .get(mappingId, userId);
}
function pathParamToString(value) {
    if (Array.isArray(value)) {
        return value[0] ?? "";
    }
    return value ?? "";
}
app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "form-autofill-backend" });
});
app.post("/api/auth/register", async (req, res) => {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const email = parsed.data.email.trim().toLowerCase();
    const existing = db
        .prepare("select id from users where email = ?")
        .get(email);
    if (existing) {
        return res.status(409).json({ error: "Email is already registered." });
    }
    const userId = randomUUID();
    const passwordHash = await hashPassword(parsed.data.password);
    const nowIso = new Date().toISOString();
    db.prepare("insert into users (id, email, password_hash, created_at) values (?, ?, ?, ?)").run(userId, email, passwordHash, nowIso);
    const token = signToken({ userId, email });
    return res.status(201).json({ token, user: { id: userId, email } });
});
app.post("/api/auth/login", async (req, res) => {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const email = parsed.data.email.trim().toLowerCase();
    const row = db
        .prepare("select id, email, password_hash from users where email = ?")
        .get(email);
    if (!row) {
        return res.status(401).json({ error: "Invalid email or password." });
    }
    const matches = await comparePassword(parsed.data.password, row.password_hash);
    if (!matches) {
        return res.status(401).json({ error: "Invalid email or password." });
    }
    const token = signToken({ userId: row.id, email: row.email });
    return res.json({ token, user: { id: row.id, email: row.email } });
});
app.get("/api/auth/me", requireAuth, (req, res) => {
    return res.json({ user: { id: req.auth.userId, email: req.auth.email } });
});
app.get("/api/templates", requireAuth, (req, res) => {
    const rows = db
        .prepare("select id, user_id, name, fields_json, created_at, updated_at from templates where user_id = ? order by updated_at desc")
        .all(req.auth.userId);
    return res.json({ templates: rows.map(toTemplateResponse) });
});
app.post("/api/templates", requireAuth, (req, res) => {
    const parsed = templateBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const normalizedName = parsed.data.name.trim();
    const fields = normalizeFields(parsed.data.fields);
    if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: "Template must include at least one non-empty field." });
    }
    const id = randomUUID();
    const nowIso = new Date().toISOString();
    try {
        db.prepare("insert into templates (id, user_id, name, fields_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?)").run(id, req.auth.userId, normalizedName, JSON.stringify(fields), nowIso, nowIso);
    }
    catch (insertError) {
        if (insertError?.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({ error: "A template with that name already exists." });
        }
        throw insertError;
    }
    const row = db
        .prepare("select id, user_id, name, fields_json, created_at, updated_at from templates where id = ?")
        .get(id);
    return res.status(201).json({ template: toTemplateResponse(row) });
});
app.put("/api/templates/:id", requireAuth, (req, res) => {
    const parsed = templateBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const normalizedName = parsed.data.name.trim();
    const fields = normalizeFields(parsed.data.fields);
    if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: "Template must include at least one non-empty field." });
    }
    const nowIso = new Date().toISOString();
    try {
        const result = db
            .prepare("update templates set name = ?, fields_json = ?, updated_at = ? where id = ? and user_id = ?")
            .run(normalizedName, JSON.stringify(fields), nowIso, req.params.id, req.auth.userId);
        if (result.changes === 0) {
            return res.status(404).json({ error: "Template not found." });
        }
    }
    catch (updateError) {
        if (updateError?.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({ error: "A template with that name already exists." });
        }
        throw updateError;
    }
    const row = db
        .prepare("select id, user_id, name, fields_json, created_at, updated_at from templates where id = ?")
        .get(req.params.id);
    return res.json({ template: toTemplateResponse(row) });
});
app.delete("/api/templates/:id", requireAuth, (req, res) => {
    const result = db
        .prepare("delete from templates where id = ? and user_id = ?")
        .run(req.params.id, req.auth.userId);
    if (result.changes === 0) {
        return res.status(404).json({ error: "Template not found." });
    }
    return res.status(204).send();
});
app.get("/api/templates/:id/mappings", requireAuth, (req, res) => {
    const templateId = pathParamToString(req.params.id);
    const template = findOwnedTemplate(templateId, req.auth.userId);
    if (!template) {
        return res.status(404).json({ error: "Template not found." });
    }
    const rows = db
        .prepare("select id, user_id, template_id, site_pattern, field_map_json, created_at, updated_at from site_mappings where user_id = ? and template_id = ? order by updated_at desc")
        .all(req.auth.userId, template.id);
    return res.json({ mappings: rows.map(toSiteMappingResponse) });
});
app.post("/api/templates/:id/mappings", requireAuth, (req, res) => {
    const templateId = pathParamToString(req.params.id);
    const template = findOwnedTemplate(templateId, req.auth.userId);
    if (!template) {
        return res.status(404).json({ error: "Template not found." });
    }
    const parsed = mappingBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const sitePattern = normalizeSitePattern(parsed.data.sitePattern);
    if (!sitePattern) {
        return res.status(400).json({ error: "Site pattern is required." });
    }
    const fieldMap = normalizeFieldMap(parsed.data.fieldMap);
    if (Object.keys(fieldMap).length === 0) {
        return res.status(400).json({ error: "Field map must include at least one valid target=source pair." });
    }
    const id = randomUUID();
    const nowIso = new Date().toISOString();
    try {
        db.prepare("insert into site_mappings (id, user_id, template_id, site_pattern, field_map_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)").run(id, req.auth.userId, template.id, sitePattern, JSON.stringify(fieldMap), nowIso, nowIso);
    }
    catch (insertError) {
        if (insertError?.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({ error: "A mapping for that site pattern already exists on this template." });
        }
        throw insertError;
    }
    const row = db
        .prepare("select id, user_id, template_id, site_pattern, field_map_json, created_at, updated_at from site_mappings where id = ?")
        .get(id);
    return res.status(201).json({ mapping: toSiteMappingResponse(row) });
});
app.put("/api/mappings/:id", requireAuth, (req, res) => {
    const mappingId = pathParamToString(req.params.id);
    const existing = findOwnedMapping(mappingId, req.auth.userId);
    if (!existing) {
        return res.status(404).json({ error: "Mapping not found." });
    }
    const parsed = mappingBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const sitePattern = normalizeSitePattern(parsed.data.sitePattern);
    if (!sitePattern) {
        return res.status(400).json({ error: "Site pattern is required." });
    }
    const fieldMap = normalizeFieldMap(parsed.data.fieldMap);
    if (Object.keys(fieldMap).length === 0) {
        return res.status(400).json({ error: "Field map must include at least one valid target=source pair." });
    }
    const nowIso = new Date().toISOString();
    try {
        db.prepare("update site_mappings set site_pattern = ?, field_map_json = ?, updated_at = ? where id = ? and user_id = ?").run(sitePattern, JSON.stringify(fieldMap), nowIso, existing.id, req.auth.userId);
    }
    catch (updateError) {
        if (updateError?.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({ error: "A mapping for that site pattern already exists on this template." });
        }
        throw updateError;
    }
    const row = findOwnedMapping(existing.id, req.auth.userId);
    return res.json({ mapping: toSiteMappingResponse(row) });
});
app.delete("/api/mappings/:id", requireAuth, (req, res) => {
    const result = db
        .prepare("delete from site_mappings where id = ? and user_id = ?")
        .run(req.params.id, req.auth.userId);
    if (result.changes === 0) {
        return res.status(404).json({ error: "Mapping not found." });
    }
    return res.status(204).send();
});
app.use((err, _req, res, _next) => {
    console.error("Unhandled error:", err);
    return res.status(500).json({ error: "Internal server error." });
});
app.listen(config.port, () => {
    console.log(`[backend] listening on http://localhost:${config.port}`);
});
