// scripts/test-glossary-render.mjs
// The glossary inside renderMarkdown (src/lib/lesson/markdown.ts). Needs the site's Markdown packages
// (npm install first), unlike test-glossary.mjs, which is dependency-free.
//   npm run test:glossary-render

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/lib/lesson/markdown.ts';

test('renderMarkdown: plain by default, site terms on request, lesson terms layered on top', () => {
  const md = 'Find the leading coefficient and the slope.';
  assert.ok(!renderMarkdown(md).includes('class="gloss"'));
  const site = renderMarkdown(md, { glossary: true });
  assert.ok(site.includes('data-gloss="slope"'));
  assert.ok(!site.includes('data-gloss="leading-coefficient"'));
  const lesson = renderMarkdown(md, { glossary: [{ id: 'leading-coefficient', term: 'leading coefficient', def: 'The number in front.' }] });
  assert.ok(lesson.includes('data-gloss="leading-coefficient"'));
  assert.ok(lesson.includes('data-def="The number in front."'));
  assert.ok(lesson.includes('data-gloss="slope"'));
});

test('renderMarkdown: a definition with quotes or tags cannot break out of its attribute', () => {
  const html = renderMarkdown('a thing here', { glossary: [{ id: 't', term: 'thing', def: '"><img src=x onerror=alert(1)>' }] });
  // The quote is escaped, so the whole definition stays inside data-def as text...
  const def = html.match(/data-def="([^"]*)"/);
  assert.ok(def, html);
  assert.equal(def[1], '&#x22;><img src=x onerror=alert(1)>');
  // ...and with attribute values taken out, no real tag from the definition is left in the markup.
  const markup = html.replace(/="[^"]*"/g, '=""');
  assert.ok(!/<img/i.test(markup), markup);
  assert.equal(markup, '<p>a <span class="" data-gloss="" data-term="" data-def="">thing</span> here</p>');
});

test('renderMarkdown: math, code and links are not marked', () => {
  const html = renderMarkdown('$slope$ and `slope` and [slope](https://example.com) and slope', { glossary: true });
  assert.equal((html.match(/class="gloss"/g) ?? []).length, 1);
});
