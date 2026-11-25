// scripts/test-glossary.mjs
// The shared glossary (src/lib/glossary.ts): which words get wrapped for the dotted underline.
//   npm run test:glossary

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARY, buildMatcher, glossaryEntry, markGlossary, mergeGlossaries, splitText } from '../src/lib/glossary.ts';

const text = (value) => ({ type: 'text', value });
const el = (tagName, children, properties = {}) => ({ type: 'element', tagName, properties, children });
/** The wrapped ids and words of a tree, in order. */
const wrapped = (node, out = []) => {
  if (node.type === 'element' && node.properties?.className?.includes('gloss')) out.push([node.properties.dataGloss, node.children[0].value]);
  for (const c of node.children ?? []) wrapped(c, out);
  return out;
};
/** The tree's text, joined: wrapping must never change what the words say. */
const flat = (node) => (node.type === 'text' ? node.value : (node.children ?? []).map(flat).join(''));

test('every entry has an id, a term and a definition, and ids are unique', () => {
  const ids = new Set();
  for (const e of GLOSSARY) {
    assert.ok(e.id && e.term && e.def, JSON.stringify(e));
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
  }
  assert.equal(glossaryEntry('slope')?.term, 'slope');
  assert.equal(glossaryEntry('nope'), undefined);
});

test('wraps whole words, any case, once per fragment, without changing the text', () => {
  const tree = el('p', [text('The Coefficient of x is 3. Each coefficient multiplies a variable.')]);
  const before = flat(tree);
  markGlossary(tree);
  assert.deepEqual(wrapped(tree), [['coefficient', 'Coefficient'], ['variable', 'variable']]);
  assert.equal(flat(tree), before);
});

test('never inside another word or a hyphenated word', () => {
  assert.equal(splitText('termination and resample and pre-mean', new Set()), null);
  assert.equal(splitText('meaningful', new Set()), null);
});

test('longer forms win: "like terms" is one term, not "term"', () => {
  const tree = el('p', [text('Combine like terms, then check each term.')]);
  markGlossary(tree);
  assert.deepEqual(wrapped(tree), [['like-terms', 'like terms'], ['term', 'term']]);
});

test('two terms side by side both match', () => {
  const tree = el('p', [text('sample mean')]);
  markGlossary(tree);
  assert.deepEqual(wrapped(tree), [['sample', 'sample'], ['mean', 'mean']]);
});

test('hyphenated terms and plurals match', () => {
  const tree = el('p', [text('Find the z-scores and the y-intercept.')]);
  markGlossary(tree);
  assert.deepEqual(wrapped(tree), [['z-score', 'z-scores'], ['y-intercept', 'y-intercept']]);
});

test('abbreviations match only as written', () => {
  assert.equal(splitText('find the gcf', new Set()), null);
  const parts = splitText('Find the GCF.', new Set());
  assert.equal(parts?.[1].properties.dataGloss, 'gcf');
});

test('code, math, links and buttons are left alone', () => {
  const tree = el('div', [
    el('code', [text('slope')]),
    el('span', [text('slope')], { className: ['katex'] }),
    el('a', [text('slope')], { href: '/x' }),
    el('button', [text('slope')]),
    el('p', [text('the slope is 2')])
  ]);
  markGlossary(tree);
  assert.deepEqual(wrapped(tree), [['slope', 'slope']]);
  assert.equal(tree.children[4].children[1].properties.dataGloss, 'slope');
});

test('one fragment shares its "already used" list across paragraphs', () => {
  const tree = el('div', [el('p', [text('An equation.')]), el('p', [text('Another equation.')])]);
  markGlossary(tree);
  assert.deepEqual(wrapped(tree), [['equation', 'equation']]);
});

test('text with no terms is returned untouched', () => {
  const tree = el('p', [text('Hello there.')]);
  const child = tree.children[0];
  markGlossary(tree);
  assert.equal(tree.children[0], child);
});

test('a marked word carries its own term and definition', () => {
  const tree = el('p', [text('The slope is 2.')]);
  markGlossary(tree);
  const span = tree.children[1];
  assert.equal(span.properties.dataGloss, 'slope');
  assert.equal(span.properties.dataTerm, 'slope');
  assert.equal(span.properties.dataDef, glossaryEntry('slope').def);
});

test('a lesson\'s own terms are matched, and override the site glossary by id', () => {
  const lesson = [
    { id: 'leading-coefficient', term: 'leading coefficient', also: ['leading coefficients'], def: 'The number in front of the highest power.' },
    { id: 'mean', term: 'mean', def: 'My own wording of mean.' }
  ];
  const matcher = buildMatcher(mergeGlossaries(GLOSSARY, lesson));
  const tree = el('p', [text('The leading coefficients and the mean.')]);
  markGlossary(tree, new Set(), matcher);
  assert.deepEqual(wrapped(tree), [['leading-coefficient', 'leading coefficients'], ['mean', 'mean']]);
  assert.equal(tree.children[3].properties.dataDef, 'My own wording of mean.');
  // the site glossary alone knows only "coefficient", not the whole phrase
  const siteOnly = splitText('leading coefficient', new Set());
  assert.equal(siteOnly?.[1].properties.dataGloss, 'coefficient');
  assert.equal(siteOnly?.[0].value, 'leading ');
  assert.equal(mergeGlossaries(GLOSSARY, lesson).filter((e) => e.id === 'mean').length, 1);
});

test('entries missing a term or a definition are ignored, and an empty dictionary matches nothing', () => {
  const matcher = buildMatcher([{ id: 'x', term: 'blank def', def: '  ' }, { id: 'y', term: '', def: 'no term' }]);
  assert.equal(splitText('blank def and no term', new Set(), matcher), null);
});
