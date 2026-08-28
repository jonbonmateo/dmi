import * as cheerio from "cheerio";

export type Doc = cheerio.CheerioAPI;

export function parse(html: string): Doc {
  return cheerio.load(html);
}

export function text($: Doc, sel: string): string {
  return $(sel).first().text().trim();
}

export function attr($: Doc, sel: string, name: string): string | null {
  return $(sel).first().attr(name)?.trim() ?? null;
}

/** All in-scope links, absolutised and de-duplicated. */
export function links($: Doc, baseUrl: string): { href: string; text: string }[] {
  const out = new Map<string, string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")!;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) return;
    try {
      const abs = new URL(href, baseUrl).toString();
      if (!out.has(abs)) out.set(abs, $(el).text().replace(/\s+/g, " ").trim());
    } catch {
      /* malformed href */
    }
  });
  return [...out].map(([href, t]) => ({ href, text: t }));
}

export function sameHost(a: string, b: string): boolean {
  try {
    const strip = (h: string) => h.replace(/^www\./, "");
    return strip(new URL(a).hostname) === strip(new URL(b).hostname);
  } catch {
    return false;
  }
}

/** Visible body text with script/style/nav noise removed. */
export function visibleText($: Doc): string {
  const clone = $.root().clone();
  clone.find("script, style, noscript, svg").remove();
  return clone.text().replace(/\s+/g, " ").trim();
}

export function excerpt(s: string, n = 220): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}
