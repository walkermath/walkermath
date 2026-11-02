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

test('Notes modules are one list of pages: a blank page is a blackboard', () => {
  const m = newModule('notes');
  assert.equal(m.config.slides.length, 1, 'a new module is one blank board');
  assert.equal(m.config.slides[0].markdown, '');
  assert.equal('mode' in m.config, false);

  m.config.slides = [{ id: 'not-a-uuid', markdown: '  # Hi \r\n$x$  ' }, { markdown: '', kind: 'image' }];
  const clean = cleanModule(m, 0);
  assert.equal(clean.config.slides[0].markdown, '# Hi \n$x$');
  assert.match(clean.config.slides[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(clean.config.slides[1].kind, 'markdown');
  assert.equal(clean.config.slides[1].markdown, '', 'blank pages are kept in place');

  assert.equal(cleanModule({ ...m, config: { slides: [] } }, 0).config.slides.length, 1, 'never empty');
  assert.equal(cleanModule({ ...m, config: {} }, 0).config.slides.length, 1);
  assert.equal(typeof cleanModule({ ...m, config: { slides: [{ markdown: 'x'.repeat(LIMITS.slide + 1) }] } }, 0), 'string');
  assert.equal(typeof cleanModule({ ...m, config: { slides: Array.from({ length: LIMITS.slides + 1 }, () => ({ markdown: 'a' })) } }, 0), 'string');
});

test('older Notes configs are upgraded', () => {
  const md = upgradeNotesConfig({ source: 'markdown', noteId: '', markdown: 'a\n---\nb', revealSections: true });
  assert.deepEqual(md.slides.map((s) => s.markdown), ['a', 'b']);
  const linked = upgradeNotesConfig({ source: 'note', noteId: 'equations', markdown: '', revealSections: false });
  assert.match(linked.slides[0].markdown, /\/notes\/equations/);
  const blank = upgradeNotesConfig({ source: 'note', noteId: '', markdown: '' });
  assert.deepEqual(blank.slides.map((s) => s.markdown), ['']);
  const modeEra = upgradeNotesConfig({ mode: 'prewritten', slides: [{ id: 'x', kind: 'markdown', markdown: 'kept' }] });
  assert.deepEqual(modeEra.slides.map((s) => s.markdown), ['kept']);
  assert.equal('mode' in modeEra, false);
  assert.equal(upgradeNotesConfig({ mode: 'freeform', slides: [] }).slides.length, 1);
  assert.equal(upgradeNotesConfig(undefined).slides.length, 1);
});
