// src/lib/glossary.ts
// Vocabulary for the dotted underlines. Definitions come in LAYERS, most specific first:
//   lesson terms (a teacher's own, saved with the lesson)  >  page terms (a notes page, app or game)
//   >  this site glossary. mergeGlossaries() combines layers; a more specific entry with the same id
//   replaces the less specific one completely.
//
// How it shows up:
//   - rehypeGlossary() runs inside renderMarkdown (src/lib/lesson/markdown.ts) when a screen asks for
//     it. It wraps the first match of each term in a fragment as
//       <span class="gloss" data-gloss="id" data-term="Term" data-def="definition">
//     so the word CARRIES its definition. Anything can write that span by hand (a Svelte <Term>, an
//     .mdx note): the popover does not care where the definition came from.
//   - The site-wide script in HelpTools.astro underlines only the FIRST of each id on the screen
//     (class "gloss-on"), makes it tappable, and opens the definition in a small popover.
//   - Pages without that script (the projector) show the words as plain text.
//
// Matching is whole-word and ignores case. `also` lists other forms (plurals, abbreviations).
// Code, math (KaTeX), links and buttons are never touched.

export interface GlossaryEntry {
  id: string;
  term: string;
  also?: string[];
  def: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  /* ---------- algebra ---------- */
  { id: 'variable', term: 'variable', also: ['variables'], def: 'A letter, like x, that stands for a number we don\'t know yet or that can change.' },
  { id: 'constant', term: 'constant', also: ['constants'], def: 'A number on its own, with no variable attached. In 3x + 5, the constant is 5.' },
  { id: 'coefficient', term: 'coefficient', also: ['coefficients'], def: 'The number multiplied by a variable. In 3x + 5, the coefficient of x is 3.' },
  { id: 'term', term: 'term', also: ['terms'], def: 'One piece of an expression, separated from the others by + or −. 3x + 5 has two terms: 3x and 5.' },
  { id: 'like-terms', term: 'like terms', def: 'Terms with exactly the same variable part, so they can be combined. 3x and −7x are like terms; 3x and 3x² are not.' },
  { id: 'expression', term: 'expression', also: ['expressions'], def: 'Numbers, variables and operations with no equals sign, like 2x − 4.' },
  { id: 'equation', term: 'equation', also: ['equations'], def: 'A statement that two expressions are equal, like 2x − 4 = 10.' },
  { id: 'inequality', term: 'inequality', also: ['inequalities'], def: 'A statement that compares two expressions with <, >, ≤ or ≥, like x + 3 > 7.' },
  { id: 'solution', term: 'solution', also: ['solutions'], def: 'A value of the variable that makes the equation or inequality true.' },
  { id: 'factor', term: 'factor', also: ['factors'], def: 'Something multiplied to make a product. 3 and x + 2 are factors of 3(x + 2).' },
  { id: 'gcf', term: 'greatest common factor', also: ['GCF'], def: 'The largest factor that every term shares. The GCF of 6x and 9 is 3.' },
  { id: 'lcm', term: 'least common multiple', also: ['LCM'], def: 'The smallest number that is a multiple of each number. The LCM of 4 and 6 is 12.' },
  { id: 'monomial', term: 'monomial', also: ['monomials'], def: 'A polynomial with one term, like 5x².' },
  { id: 'binomial', term: 'binomial', also: ['binomials'], def: 'A polynomial with two terms, like x + 3.' },
  { id: 'trinomial', term: 'trinomial', also: ['trinomials'], def: 'A polynomial with three terms, like x² + 5x + 6.' },
  { id: 'polynomial', term: 'polynomial', also: ['polynomials'], def: 'An expression made of terms with whole-number powers of the variable, added or subtracted.' },
  { id: 'quadratic', term: 'quadratic', also: ['quadratics'], def: 'A polynomial whose highest power is 2, like x² − 4x + 3. Its graph is a parabola.' },
  { id: 'slope', term: 'slope', def: 'How steep a line is: the change in y divided by the change in x (rise over run).' },
  { id: 'y-intercept', term: 'y-intercept', def: 'Where a graph crosses the y-axis: the value of y when x = 0.' },
  { id: 'system', term: 'system of equations', also: ['systems of equations'], def: 'Two or more equations that share variables. Its solution makes every equation true at once.' },

  /* ---------- statistics ---------- */
  { id: 'population', term: 'population', also: ['populations'], def: 'The whole group you want to know about.' },
  { id: 'sample', term: 'sample', also: ['samples'], def: 'The part of the population you actually collect data from.' },
  { id: 'parameter', term: 'parameter', also: ['parameters'], def: 'A number that describes a population, like μ or σ. Usually unknown.' },
  { id: 'statistic', term: 'statistic', def: 'A number that describes a sample, like x̄ or s. We use it to estimate a parameter.' },
  { id: 'mean', term: 'mean', def: 'The average: add the values and divide by how many there are.' },
  { id: 'median', term: 'median', def: 'The middle value when the data are in order.' },
  { id: 'standard-deviation', term: 'standard deviation', also: ['standard deviations', 'SD'], def: 'A typical distance of the values from the mean. Bigger means more spread out.' },
  { id: 'distribution', term: 'distribution', also: ['distributions'], def: 'What values a variable takes and how often it takes them.' },
  { id: 'normal-distribution', term: 'normal distribution', also: ['normal curve', 'normal model'], def: 'A symmetric, bell-shaped distribution described by its mean μ and standard deviation σ.' },
  { id: 'z-score', term: 'z-score', also: ['z-scores'], def: 'How many standard deviations a value is above (+) or below (−) the mean: z = (value − mean) / SD.' },
  { id: 'sampling-distribution', term: 'sampling distribution', also: ['sampling distributions'], def: 'The distribution of a statistic (like x̄) over many samples of the same size.' },
  { id: 'standard-error', term: 'standard error', def: 'The standard deviation of a sampling distribution. For x̄ it is σ/√n.' },
  { id: 'probability', term: 'probability', also: ['probabilities'], def: 'How likely something is, from 0 (never) to 1 (always).' },
  { id: 'proportion', term: 'proportion', also: ['proportions'], def: 'The fraction of a group with some feature, written as a decimal between 0 and 1.' },
  { id: 'percentile', term: 'percentile', also: ['percentiles'], def: 'The value with that percent of the data at or below it. The 90th percentile is above 90% of the data.' }
];

const byId = new Map(GLOSSARY.map((e) => [e.id, e]));
export const glossaryEntry = (id: string | null | undefined): GlossaryEntry | undefined => (id ? byId.get(id) : undefined);

/** Layers of entries, least specific first: a later entry with the same id replaces an earlier one. */
export function mergeGlossaries(...layers: (GlossaryEntry[] | undefined)[]): GlossaryEntry[] {
  const merged = new Map<string, GlossaryEntry>();
  for (const layer of layers) for (const e of layer ?? []) merged.set(e.id, e);
  return [...merged.values()];
}

/* ---------------- matching ---------------- */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Everything needed to find one dictionary's terms in text. Build once per dictionary. */
export interface Matcher {
  entries: Map<string, GlossaryEntry>;
  forms: { text: string; id: string }[];
  formId: Map<string, string>;
  caseSensitive: Set<string>;
  re: RegExp | null;
}

export function buildMatcher(entries: GlossaryEntry[]): Matcher {
  const usable = entries.filter((e) => e.id && e.term.trim() && e.def.trim());
  // Every written form, longest first (so "like terms" wins over "term"), mapped to its entry id.
  const forms = usable
    .flatMap((e) => [e.term, ...(e.also ?? [])].filter((t) => t.trim()).map((text) => ({ text, id: e.id })))
    .sort((a, b) => b.text.length - a.text.length);
  // Whole words: not inside another word, and not glued to a hyphenated word ("re-sample"). Group 1
  // is the character before (or the start), group 2 the term. No lookbehind: older iPad Safari can't
  // parse it, and a regex that fails to load would break every lesson's text.
  const re = forms.length
    ? new RegExp(`(^|[^\\p{L}\\p{N}_-])(${forms.map((f) => escapeRe(f.text)).join('|')})(?![\\p{L}\\p{N}_-])`, 'giu')
    : null;
  return {
    entries: new Map(usable.map((e) => [e.id, e])),
    forms,
    formId: new Map(forms.map((f) => [f.text.toLowerCase(), f.id])),
    // Short all-capitals forms (GCF, LCM, SD) match only as written, so "sd" inside a word is left alone.
    caseSensitive: new Set(forms.filter((f) => f.text.length <= 4 && f.text === f.text.toUpperCase()).map((f) => f.text)),
    re
  };
}

/** The site glossary's matcher. */
export const SITE_MATCHER = buildMatcher(GLOSSARY);

/** Elements whose text is never searched. */
const SKIP_TAGS = new Set(['code', 'pre', 'a', 'button', 'script', 'style', 'kbd', 'samp', 'svg', 'math', 'input', 'textarea', 'select', 'label']);
const skipByClass = (cls: unknown) =>
  Array.isArray(cls) && cls.some((c) => typeof c === 'string' && (c.startsWith('katex') || c === 'gloss' || c.startsWith('math')));

type HNode = { type: string; tagName?: string; value?: string; properties?: Record<string, any>; children?: HNode[] };

/**
 * Splits one text value into text and glossary spans. `used` holds entry ids already wrapped in this
 * fragment; each id is wrapped at most once per fragment.
 */
export function splitText(value: string, used: Set<string>, matcher: Matcher = SITE_MATCHER): HNode[] | null {
  const re = matcher.re;
  if (!re) return null;
  const out: HNode[] = [];
  let last = 0;
  let changed = false;
  re.lastIndex = 0;
  for (let m = re.exec(value); m; m = re.exec(value)) {
    const text = m[2];
    const start = m.index + m[1].length;
    // The character before was consumed: step back so a term right after this one can still match.
    re.lastIndex = start + text.length;
    const id = matcher.formId.get(text.toLowerCase());
    const entry = id ? matcher.entries.get(id) : undefined;
    if (!id || !entry || used.has(id)) continue;
    const exact = matcher.forms.find((f) => f.text.toLowerCase() === text.toLowerCase())?.text ?? text;
    if (matcher.caseSensitive.has(exact) && text !== exact) continue;
    used.add(id);
    changed = true;
    if (start > last) out.push({ type: 'text', value: value.slice(last, start) });
    out.push({
      type: 'element',
      tagName: 'span',
      properties: { className: ['gloss'], dataGloss: id, dataTerm: entry.term, dataDef: entry.def },
      children: [{ type: 'text', value: text }]
    });
    last = start + text.length;
  }
  if (!changed) return null;
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

/** Walks a HAST tree and wraps glossary terms in place. Exported for tests. */
export function markGlossary(tree: HNode, used: Set<string> = new Set(), matcher: Matcher = SITE_MATCHER): HNode {
  const walk = (node: HNode) => {
    if (!node.children) return;
    const next: HNode[] = [];
    for (const child of node.children) {
      if (child.type === 'text' && typeof child.value === 'string') {
        const parts = splitText(child.value, used, matcher);
        if (parts) next.push(...parts);
        else next.push(child);
        continue;
      }
      if (child.type === 'element' && (SKIP_TAGS.has(child.tagName ?? '') || skipByClass(child.properties?.className))) {
        next.push(child);
        continue;
      }
      walk(child);
      next.push(child);
    }
    node.children = next;
  };
  walk(tree);
  return tree;
}

/** The rehype plugin for renderMarkdown. Runs after sanitizing, so its spans are kept. */
export function rehypeGlossary(options?: { matcher?: Matcher }) {
  const matcher = options?.matcher ?? SITE_MATCHER;
  return (tree: any) => {
    markGlossary(tree as HNode, new Set(), matcher);
  };
}
