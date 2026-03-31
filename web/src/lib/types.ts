export type FieldType = "text" | "dropdown" | "date" | "number";

export type VaultField = {
  id: string;
  key: string; // stable identifier, e.g. "email" or "address.street"
  label: string;
  type: FieldType;
  options?: string[]; // for dropdown
};

export type VaultCategory = {
  id: string;
  name: string;
  fields: VaultField[];
};

export type VaultProfile = {
  id: string;
  name: string;
  // values keyed by field.key (not field.id) so templates stay stable
  values: Record<string, string>;
};

export type TemplateDoc = {
  id: string;
  name: string;
  body: string; // uses {{field.key}} placeholders
  createdAt: number;
  updatedAt: number;
};

export type VaultState = {
  version: number;
  categories: VaultCategory[];
  profiles: VaultProfile[];
  templates: TemplateDoc[];
  activeProfileId: string | null;
};
