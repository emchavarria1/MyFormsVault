export function extractPlaceholders(body: string): string[] {
  const re = /\{\{\s*([a-zA-Z0-9._-]+)\s*\}\}/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.add(m[1]);
  return [...out];
}

export function renderTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9._-]+)\s*\}\}/g, (_, key) => {
    const v = values[key];
    return (v ?? "").toString();
  });
}
