// scripts/test-terms.mjs
// A lesson's own tooltips (src/lib/lesson/terms.ts): cleaning, adding, layering over the site glossary.
//   npm run test:terms

import assert from 'node:assert/strict';
import test from 'node:test';
import { GLOSSARY, buildMatcher, markGlossary, mergeGlossaries } from '../src/lib/glossary.ts';
import { TERMS, cleanTerms, parseTerms, selectableTerm, termId, upsertTerm } from '../src/lib/lesson/terms.ts';

test('ids come from the words, never from the client', () => {
  assert.equal(termId('Leading  Coefficient!'), 'leading-coefficient');
  const [t] = cleanTerms([{ id: 'evil', term: ' Leading coefficient ', def: ' The   number\nin front. ' }]);
  assert.deepEqual(t, { id: 'leading-coefficient', term: 'Leading coefficient', def: 'The number in front.' });
});

test('cleaning drops blanks and repeats, keeps plural forms, and caps the list', () => {
  assert.deepEqual(cleanTerms([{ term: '', def: 'x' }, { term: 'a', def: '' }, 5, null]), []);
  const two = cleanTerms([{ term: 'Root', def: 'one', also: 'roots, Root, zeros' }, { term: 'root', def: 'two' }]);
  assert.equal(two.length, 1, 'one definition per term');
  assert.deepEqual(two[0].also, ['roots', 'zeros']);
  const many = cleanTerms(Array.from({ length: 80 }, (_, i) => ({ term: `word ${i}`, def: 'd' })));
  assert.equal(many.length, TERMS.max);
  assert.equal(cleanTerms([{ term: 'x'.repeat(200), def: 'y'.repeat(900) }])[0].def.length, TERMS.def);
});

test('storage: missing or broken JSON is no terms', () => {
  assert.deepEqual(parseTerms(undefined), []);
  assert.deepEqual(parseTerms('not json'), []);
  assert.equal(parseTerms(JSON.stringify([{ term: 'slope', def: 'steepness' }])).length, 1);
});

test('adding a term the lesson already has replaces its definition', () => {
  const a = upsertTerm([], 'Vertex', 'The turning point.');
  const b = upsertTerm(a, 'vertex', 'The highest or lowest point of a parabola.');
  assert.equal(b.length, 1);
  assert.equal(b[0].def, 'The highest or lowest point of a parabola.');
});

test('only a word or short phrase on one line can become a tooltip', () => {
  assert.equal(selectableTerm('  leading coefficient '), 'leading coefficient');
  assert.equal(selectableTerm('a'), null);
  assert.equal(selectableTerm('line one\nline two'), null);
  assert.equal(selectableTerm('$x^2$'), null);
  assert.equal(selectableTerm('  ?!  '), null);
  assert.equal(selectableTerm('x'.repeat(80)), null);
});

test('a lesson term is underlined, and beats the site glossary for the same word', () => {
  const terms = cleanTerms([
    { term: 'leading coefficient', def: 'The number in front of the highest power.' },
    { term: 'slope', def: 'Our class word: rise over run.' }
  ]);
  const matcher = buildMatcher(mergeGlossaries(GLOSSARY, terms));
  const tree = {
    type: 'root',
    children: [{ type: 'element', tagName: 'p', children: [{ type: 'text', value: 'Find the leading coefficient and the slope of each.' }] }]
  };
  markGlossary(tree, new Set(), matcher);
  const spans = tree.children[0].children.filter((n) => n.tagName === 'span');
  const byId = Object.fromEntries(spans.map((s) => [s.properties.dataGloss, s.properties.dataDef]));
  assert.equal(byId['leading-coefficient'], 'The number in front of the highest power.');
  assert.equal(byId['slope'], 'Our class word: rise over run.');
  assert.equal(byId['coefficient'], undefined, 'the longer lesson phrase wins over the site word inside it');
});
