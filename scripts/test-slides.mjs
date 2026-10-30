// Slide splitting and Notes module validation. Run: npm run test:slides
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const { splitSlides, noteToSlides } = await import('../src/lib/lesson/slides.ts');
const { cleanModule, newModule, upgradeNotesConfig, LIMITS } = await import('../src/lib/lesson/modules.ts');

const noteBody = (id) => readFileSync(new URL(`../src/content/notes/${id}.mdx`, import.meta.url), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');

test('a line of --- starts a new slide, but never inside code, $$ math or an HTML block', () => {
  assert.deepEqual(splitSlides('a\n---\nb'), ['a', 'b']);
  assert.deepEqual(splitSlides('a\n\n---\n\n---\nb\n---'), ['a', 'b'], 'empty slides are dropped');
  assert.deepEqual(splitSlides('```\n---\n```\n---\n$$\n---\n$$'), ['```\n---\n```', '$$\n---\n$$']);
  assert.deepEqual(splitSlides('<div>\n---\n</div>\n---\nz'), ['<div>\n---\n</div>', 'z']);
  assert.deepEqual(splitSlides(' --- '), []);
});

test('a note is cut at --- and headings; heading-only slides join the next one', () => {
  assert.deepEqual(noteToSlides('# Title\n\n## Part 1\ntext\n### Part 2\nmore'), ['# Title\n\n## Part 1\ntext', '### Part 2\nmore']);
  assert.deepEqual(noteToSlides('import X from "y";\n\nhello {/* note */}\n\n<div className="a">$x$</div>'), [
    'hello \n\n<div class="a">$x$</div>'
  ]);
  const eq = noteToSlides(noteBody('equations'));
  assert.equal(eq.length, 4);
  assert.ok(eq[0].startsWith('# Equations'));
  const tape = noteToSlides(noteBody('tape-diagrams'));
  assert.ok(tape.length >= 5);
  for (const s of tape) {
    const opens = (s.match(/<div\b/g) ?? []).length;
    assert.equal(opens, (s.match(/<\/div>/g) ?? []).length, 'every diagram lands whole on one slide');
    assert.ok(s.length <= LIMITS.slide);
  }
  assert.ok(tape.reduce((n, s) => n + s.length, 0) <= LIMITS.markdown, 'the longest note fits one module');
});

test('Notes modules: freeform or pre-written slides, validated', () => {
  const free = newModule('notes');
  assert.deepEqual(free.config, { mode: 'freeform', slides: [] });
  const pre = newModule('notes', 'prewritten');
  assert.equal(pre.config.mode, 'prewritten');
  assert.equal(pre.config.slides.length, 1);

  pre.config.slides = [{ id: 'not-a-uuid', markdown: '  # Hi \r\n$x$  ' }, { markdown: 'two', kind: 'image' }];
  const clean = cleanModule(pre, 0);
  assert.equal(clean.config.slides[0].markdown, '# Hi \n$x$');
  assert.match(clean.config.slides[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(clean.config.slides[1].kind, 'markdown');

  assert.equal(typeof cleanModule({ ...pre, config: { mode: 'prewritten', slides: [{ markdown: 'x'.repeat(LIMITS.slide + 1) }] } }, 0), 'string');
  assert.equal(typeof cleanModule({ ...pre, config: { mode: 'prewritten', slides: Array.from({ length: LIMITS.slides + 1 }, () => ({ markdown: 'a' })) } }, 0), 'string');
  assert.equal(cleanModule({ ...pre, config: { mode: 'chalk' } }, 0).config.mode, 'freeform');
  const kept = cleanModule({ ...pre, config: { mode: 'freeform', slides: [{ markdown: 'kept' }] } }, 0);
  assert.equal(kept.config.slides[0].markdown, 'kept', 'switching to freeform keeps the slides');
});

test('Notes saved before slides existed are upgraded', () => {
  const md = upgradeNotesConfig({ source: 'markdown', noteId: '', markdown: 'a\n---\nb', revealSections: true });
  assert.equal(md.mode, 'prewritten');
  assert.deepEqual(md.slides.map((s) => s.markdown), ['a', 'b']);
  const linked = upgradeNotesConfig({ source: 'note', noteId: 'equations', markdown: '', revealSections: false });
  assert.equal(linked.mode, 'prewritten');
  assert.match(linked.slides[0].markdown, /\/notes\/equations/);
  assert.deepEqual(upgradeNotesConfig({ source: 'note', noteId: '', markdown: '' }), { mode: 'freeform', slides: [] });
  const current = { mode: 'freeform', slides: [] };
  assert.equal(upgradeNotesConfig(current), current);
});
