/** Dependency-free HTML extractor (regex). Enough for Woo/e-commerce detection. */
export interface ParsedHtml {
  title: string | null;
  metaDescription: string | null;
  metaGenerator: string | null;
  ogTags: Record<string, string>;
  classes: string[];
  links: string[];
  scripts: string[];
  textLength: number;
  textSnippet: string;
  raw: string;
}
function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ');
}
export function parseHtml(html: string): ParsedHtml {
  const classes = new Set<string>();
  const links = new Set<string>();
  const scripts = new Set<string>();
  const ogTags: Record<string, string> = {};

  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = t ? decode(t[1].trim()) : null;

  let metaDescription: string | null = null;
  let metaGenerator: string | null = null;
  const metaRe = /<meta\b([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html))) {
    const tag = m[1];
    const name = (tag.match(/name\s*=\s*["']([^"']*)["']/i) || [])[1]?.toLowerCase();
    const prop = (tag.match(/property\s*=\s*["']([^"']*)["']/i) || [])[1]?.toLowerCase();
    const content = (tag.match(/content\s*=\s*["']([^"']*)["']/i) || [])[1] ?? '';
    if (name === 'description' && metaDescription === null) metaDescription = decode(content);
    if (name === 'generator') metaGenerator = decode(content);
    if (prop && prop.startsWith('og:')) ogTags[prop] = decode(content);
  }

  const classRe = /\bclass\s*=\s*["']([^"']*)["']/gi;
  while ((m = classRe.exec(html))) for (const c of m[1].split(/\s+/)) { const x = c.trim(); if (x) classes.add(x.toLowerCase()); }

  const attrRe = /\b(href|src)\s*=\s*["']([^"']*)["']/gi;
  while ((m = attrRe.exec(html))) {
    const v = m[2].trim(); if (!v) continue;
    if (m[1].toLowerCase() === 'href') links.add(v); else scripts.add(v);
  }

  const text = decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();

  return { title, metaDescription, metaGenerator, ogTags, classes: [...classes], links: [...links], scripts: [...scripts], textLength: text.length, textSnippet: text.slice(0, 500), raw: html };
}
