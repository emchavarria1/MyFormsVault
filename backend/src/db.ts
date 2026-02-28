import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "app.db");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  create table if not exists users (
    id text primary key,
    email text not null unique,
    password_hash text not null,
    created_at text not null
  );

  create table if not exists templates (
    id text primary key,
    user_id text not null,
    name text not null,
    fields_json text not null,
    created_at text not null,
    updated_at text not null,
    foreign key (user_id) references users(id) on delete cascade
  );

  create index if not exists templates_user_updated_idx
    on templates(user_id, updated_at desc);

  create unique index if not exists templates_user_name_unique
    on templates(user_id, lower(name));

  create table if not exists site_mappings (
    id text primary key,
    user_id text not null,
    template_id text not null,
    site_pattern text not null,
    field_map_json text not null,
    created_at text not null,
    updated_at text not null,
    foreign key (user_id) references users(id) on delete cascade,
    foreign key (template_id) references templates(id) on delete cascade
  );

  create index if not exists site_mappings_template_updated_idx
    on site_mappings(template_id, updated_at desc);

  create unique index if not exists site_mappings_user_template_pattern_unique
    on site_mappings(user_id, template_id, lower(site_pattern));
`);
