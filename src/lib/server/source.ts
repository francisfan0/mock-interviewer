const MAX_BYTES = 1_500_000;
const MAX_CHARS = 40_000;

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[::1\]|\[fd)/i;

export function isPublicHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (PRIVATE_HOST.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Turns HTML into readable prose, keeping <pre> blocks as fenced code. */
export function htmlToPlaintext(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const withCode = withoutNoise.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner: string) => {
    const code = decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/\s+$/, "");
    return `\n\n\`\`\`\n${code}\n\`\`\`\n\n`;
  });

  const text = decodeEntities(
    withCode
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<h[1-6][^>]*>/gi, "\n# ")
      .replace(/<[^>]+>/g, " "),
  );

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, MAX_CHARS);
}

export async function fetchSourcePage(rawUrl: string): Promise<{ url: string; title: string; text: string }> {
  const url = isPublicHttpUrl(rawUrl);
  if (!url) throw new Error("That doesn't look like a public http(s) URL.");

  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "mock-interviewer/0.1 (personal practice tool)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Could not fetch that page (${res.status}).`);

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error("That page is too large to import.");
  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? url.hostname;
  const text = htmlToPlaintext(html);
  if (text.length < 80) throw new Error("Fetched the page, but couldn't extract enough text. Paste the problem instead.");
  return { url: url.toString(), title: decodeEntities(title).slice(0, 200), text };
}
