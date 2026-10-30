// src/lib/lesson/markdown.ts
// Renders one slide's Markdown to HTML, in the browser (the builder now; teacher and student
// views in Phase 4). Same flavour as the /notes pages: GitHub-style Markdown, $...$ and $$...$$
// math with KaTeX, and the raw HTML the notes use for diagrams.
//
// Slides are written by teachers but shown on students' devices, so the HTML is sanitized:
// no scripts, no event handlers, no style attributes, links only to http(s), mailto or this site.
// KaTeX runs after the sanitizer so its own markup is kept.

import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

/* Allow class="" on every allowed tag (the notes' diagrams are Tailwind classes), and nothing else
   beyond the default safe set. Tag-specific className rules are dropped so '*' decides. */
const attributes: Record<string, any[]> = {};
for (const [tag, list] of Object.entries(defaultSchema.attributes ?? {})) {
  attributes[tag] = (list as any[]).filter((a) => (Array.isArray(a) ? a[0] : a) !== 'className');
}
attributes['*'] = [...(attributes['*'] ?? []), 'className'];

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'u', 'mark', 'small'],
  attributes,
  protocols: { ...defaultSchema.protocols, href: ['http', 'https', 'mailto'] }
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Markdown doesn't look inside raw HTML blocks, so math written there (the notes' tape diagrams:
 * <p>a) $x + 7 = 12$</p>) is marked up here the way remark-math would, for KaTeX to pick up.
 */
function remarkMathInHtml() {
  const MATH = /(^|[^\\])(\$\$([^$]+)\$\$|\$([^$\n]+)\$)/g;
  const walk = (node: any) => {
    if (node.type === 'html' && typeof node.value === 'string' && node.value.includes('$')) {
      node.value = node.value.replace(MATH, (_m: string, pre: string, _all: string, display?: string, inline?: string) =>
        display !== undefined
          ? `${pre}<pre><code class="language-math math-display">${escapeHtml(display)}</code></pre>`
          : `${pre}<code class="language-math math-inline">${escapeHtml(inline ?? '')}</code>`
      );
    }
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  return (tree: any) => walk(tree);
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkMathInHtml)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, schema as any)
  .use(rehypeKatex, { throwOnError: false, strict: false })
  .use(rehypeStringify);

const cache = new Map<string, string>();

export function renderMarkdown(md: string): string {
  const hit = cache.get(md);
  if (hit !== undefined) return hit;
  let html: string;
  try {
    html = String(processor.processSync(md));
  } catch {
    html = `<pre>${escapeHtml(md)}</pre>`;
  }
  if (cache.size > 200) cache.clear();
  cache.set(md, html);
  return html;
}
