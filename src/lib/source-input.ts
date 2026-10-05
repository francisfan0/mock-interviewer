const URL_RE = /^https?:\/\/\S+$/i;

export function splitSourceInput(raw: string): { sourceUrl?: string; sourceText?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (URL_RE.test(trimmed)) return { sourceUrl: trimmed };

  const newline = trimmed.search(/\s/);
  const first = newline === -1 ? trimmed : trimmed.slice(0, newline);
  if (URL_RE.test(first)) {
    const rest = trimmed.slice(first.length).trim();
    return rest ? { sourceUrl: first, sourceText: rest } : { sourceUrl: first };
  }
  return { sourceText: trimmed };
}
