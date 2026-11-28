// src/lib/lesson/termsContext.ts
// How a lesson's own terms (src/lib/lesson/terms.ts) reach the components that render its text,
// without passing them through every screen: the screen that holds the lesson provides them, and
// SlideView / LiveModule read them. Outside a lesson screen there are none, and the site glossary
// alone is used.

import { getContext, setContext } from 'svelte';
import type { GlossaryEntry } from '../glossary.ts';

const KEY = Symbol('lesson-terms');
type Getter = () => GlossaryEntry[] | undefined;

/** Call during a component's setup, with a getter so later changes (a saved edit) are followed. */
export const provideTerms = (get: Getter) => {
  setContext(KEY, get);
};

/** A getter for the current lesson's terms ([] when there is none). Call during setup. */
export function useTerms(): () => GlossaryEntry[] {
  const get = getContext<Getter | undefined>(KEY);
  return () => get?.() ?? [];
}

/** What renderMarkdown wants for `glossary`: the lesson's terms over the site's, or just the site's. */
export const glossaryFor = (terms: GlossaryEntry[]): true | GlossaryEntry[] => (terms.length ? terms : true);
