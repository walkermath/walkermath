// src/lib/lesson/slides.ts
// Splitting Markdown into slides, for pre-written Notes. Pure functions (no DOM, no libraries),
// shared by the builder and the server.
//
//   splitSlides(md)  a line with only --- starts a new slide (the rule teachers type by)
//   noteToSlides(md) a walkerMath note, cut into slides at --- and at headings
//
// Neither ever cuts inside a ``` code fence, a $$ math block or a raw HTML block (the <div>
// diagrams in the notes), so those always land whole on one slide.

type Line = { text: string; inBlock: boolean };

/** Marks each line that sits inside a code fence, a $$ block or an open HTML <div>. */
function scan(md: string): Line[] {
  const out: Line[] = [];
  let fence: string | null = null;
  let math = false;
  let divDepth = 0;
  for (const text of md.replace(/\r\n?/g, '\n').split('\n')) {
    const t = text.trim();
    const wasInBlock = fence !== null || math || divDepth > 0;
    if (fence !== null) {
      if (t.startsWith(fence)) fence = null;
    } else if (math) {
      if (t.endsWith('$$')) math = false;
    } else if (divDepth === 0 && /^(```|~~~)/.test(t)) {
      fence = t.slice(0, 3);
    } else if (divDepth === 0 && t.startsWith('$$') && !(t.length > 2 && t.endsWith('$$'))) {
      math = true;
    } else {
      divDepth += (t.match(/<div\b/gi) ?? []).length - (t.match(/<\/div>/gi) ?? []).length;
      if (divDepth < 0) divDepth = 0;
    }
    out.push({ text, inBlock: wasInBlock });
  }
  return out;
}

const isRule = (l: Line) => !l.inBlock && l.text.trim() === '---';
const isHeading = (l: Line) => !l.inBlock && /^#{1,4}\s+\S/.test(l.text.trim());

function cut(lines: Line[], startsSlide: (l: Line) => boolean, dropsLine: (l: Line) => boolean): string[] {
  const slides: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    const s = cur.join('\n').trim();
    if (s) slides.push(s);
    cur = [];
  };
  for (const l of lines) {
    if (startsSlide(l)) flush();
    if (!dropsLine(l)) cur.push(l.text);
  }
  flush();
  return slides;
}

/** Splits at lines that are exactly ---. Empty slides are dropped. */
export function splitSlides(md: string): string[] {
  return cut(scan(md), isRule, isRule);
}

/** Lines MDX needs but a slide can't use (import/export statements at the top level). */
const MDX_ONLY = /^(import|export)\s/;

/**
 * Cuts a walkerMath note into slides: at every --- and before every heading (# to ####).
 * A slide that would hold only a heading is joined to the next one.
 */
export function noteToSlides(md: string): string[] {
  // MDX-only syntax: {/* comments */} and React's className=.
  md = md.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\bclassName=/g, 'class=');
  const lines = scan(md).filter((l) => l.inBlock || !MDX_ONLY.test(l.text));
  const raw = cut(lines, (l) => isRule(l) || isHeading(l), isRule);
  const slides: string[] = [];
  let carry = '';
  for (const s of raw) {
    const onlyHeading = s.split('\n').every((line) => !line.trim() || /^#{1,6}\s/.test(line.trim()));
    if (onlyHeading) {
      carry = carry ? `${carry}\n\n${s}` : s;
      continue;
    }
    slides.push(carry ? `${carry}\n\n${s}` : s);
    carry = '';
  }
  if (carry) slides.push(carry);
  return slides;
}
