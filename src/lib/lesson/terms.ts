// src/lib/lesson/terms.ts
// A lesson's own tooltips: words the teacher marked (highlight, then [+ tooltip]) with a short
// definition. Saved with the lesson (lessons.terms_json), copied into the live room and the run's
// snapshot, and layered OVER the site glossary (src/lib/glossary.ts): a lesson term with the same
// id replaces the site's definition for that lesson. One definition per term per lesson. Pure
// functions, shared by the server, the room and the screens.

import type { GlossaryEntry } from '../glossary.ts';

export const TERMS = { max: 40, term: 60, def: 300, also: 5 } as const;

const clean = (s: unknown, max: number) =>
  typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** The id a term gets: its words, lower case, joined by dashes. Two terms with the same id are the same term. */
export function termId(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TERMS.term);
}

/** "plural, another form" -> forms the term also matches (cleaned, no repeats of the term itself). */
export function cleanAlso(v: unknown, term = ''): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const out: string[] = [];
  for (const item of raw) {
    const form = clean(item, TERMS.term);
    if (form && form.toLowerCase() !== term.toLowerCase() && !out.some((o) => o.toLowerCase() === form.toLowerCase())) out.push(form);
    if (out.length >= TERMS.also) break;
  }
  return out;
}

/** Terms from a teacher (or storage), cleaned: ids come from the words, never from the client. */
export function cleanTerms(v: unknown): GlossaryEntry[] {
  if (!Array.isArray(v)) return [];
  const out: GlossaryEntry[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    const term = clean((item as any)?.term, TERMS.term);
    const def = clean((item as any)?.def, TERMS.def);
    const id = termId(term);
    if (!term || !def || !id || seen.has(id)) continue;
    seen.add(id);
    const also = cleanAlso((item as any)?.also, term);
    out.push(also.length ? { id, term, also, def } : { id, term, def });
    if (out.length >= TERMS.max) break;
  }
  return out;
}

/** A stored value (JSON text, or missing before migration 0015) as terms. */
export function parseTerms(json: unknown): GlossaryEntry[] {
  if (typeof json !== 'string' || !json) return [];
  try {
    return cleanTerms(JSON.parse(json));
  } catch {
    return [];
  }
}

/** The list with this term added, or its definition replaced if the term is already there. */
export function upsertTerm(list: readonly GlossaryEntry[], term: string, def: string, also?: unknown): GlossaryEntry[] {
  const next = [...list.filter((e) => e.id !== termId(clean(term, TERMS.term)))];
  next.push({ id: '', term, def, ...(also !== undefined ? { also: also as string[] } : {}) });
  return cleanTerms(next.map((e) => ({ ...e })));
}

/** True if the text a teacher selected is worth offering a tooltip for: a word or short phrase on one line. */
export function selectableTerm(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > TERMS.term || /[\n$]/.test(text.trim())) return null;
  return /[\p{L}\p{N}]/u.test(t) ? t : null;
}
