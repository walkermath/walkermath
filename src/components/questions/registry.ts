// src/components/questions/registry.ts
// The screen side of the question registry: each kind's editor (in the question panel). Kept
// apart from src/lib/questions/ so the server-side grader never loads Svelte code. Adding a kind
// means its file in src/lib/questions/kinds/, an entry here, and its student input in LiveModule.

import type { Component } from 'svelte';
import type { Question, QuestionKind } from '../../lib/questions/index.ts';
import ChoiceEditor from './editors/ChoiceEditor.svelte';
import GridEditor from './editors/GridEditor.svelte';
import MathEditor from './editors/MathEditor.svelte';
import SortEditor from './editors/SortEditor.svelte';
import TextEditor from './editors/TextEditor.svelte';

export type EditorProps = { q: Question; keyless: boolean };

export const EDITORS: Record<QuestionKind, Component<EditorProps, {}, 'q'>> = {
  text: TextEditor,
  number: TextEditor,
  math: MathEditor,
  grid: GridEditor,
  sort: SortEditor,
  choice: ChoiceEditor
};
