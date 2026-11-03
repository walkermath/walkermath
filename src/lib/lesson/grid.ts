// src/lib/lesson/grid.ts
// Grid questions: a table the teacher fills in partly (an area model, a table of values, a box
// method, a T-chart) with blank cells for students to complete. Pure functions, used by the
// editor, the student view, marking and reports.
//
// Where things live, so keys never reach students:
//   question.grid    the table: sizes, header shading, each cell's given text ('' for a blank)
//   question.answer  the keys: a JSON list, one per blank in reading order (left to right, top to
//                    bottom); '' for a blank with no key. Private, like every other answer key.
//   a student's answer: a JSON list in the same order ('' = left empty); '' when all are empty.
// Each blank is marked by the math checker with the question's match setting.

import { checkMath, readMath, type MathMatch } from './mathcheck.ts';

export interface GridCell {
  text: string;
  blank: boolean;
}

export interface Grid {
  rows: number;
  cols: number;
  /** Shade the first row / first column as headers (an area model's factors). */
  headerRow: boolean;
  headerCol: boolean;
  cells: GridCell[][];
}

export const GRID_MAX = 8;
export const GRID_TEXT_MAX = 80;
export const GRID_BLANK_MAX = 100;

/** A 2 x 2 area model for x² + 7x + 10 with headers given and the four areas blank. */
export function newGrid(): Grid {
  const g = (text: string): GridCell => ({ text, blank: false });
  const b: GridCell = { text: '', blank: true };
  return {
    rows: 3,
    cols: 3,
    headerRow: true,
    headerCol: true,
    cells: [
      [g('×'), g('$x$'), g('$+5$')],
      [g('$x$'), { ...b }, { ...b }],
      [g('$+2$'), { ...b }, { ...b }]
    ]
  };
}

/** Blank cells in reading order, as [row, col]. */
export function blankPositions(g: Grid): [number, number][] {
  const out: [number, number][] = [];
  g.cells.forEach((row, r) => row.forEach((cell, c) => cell.blank && out.push([r, c])));
  return out;
}

/** A JSON list of strings, or [] (anything else). */
export function parseList(s: unknown): string[] {
  if (typeof s !== 'string' || !s.trim().startsWith('[')) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : '')) : [];
  } catch {
    return [];
  }
}

/** Keys (or answers) as a JSON list, or '' when every entry is empty. */
export function joinList(list: string[]): string {
  return list.some((v) => v.trim() !== '') ? JSON.stringify(list) : '';
}

/**
 * Re-shapes the grid (new size, or a cell made blank / given) and carries each blank's key with
 * its cell, so changing the table never moves a key to another blank.
 */
export function reshape(g: Grid, keys: string[], change: { rows?: number; cols?: number; toggle?: [number, number] }): { grid: Grid; keys: string[] } {
  const keyAt = new Map<string, string>();
  blankPositions(g).forEach(([r, c], i) => keyAt.set(`${r},${c}`, keys[i] ?? ''));
  const rows = Math.min(GRID_MAX, Math.max(1, change.rows ?? g.rows));
  const cols = Math.min(GRID_MAX, Math.max(1, change.cols ?? g.cols));
  const cells: GridCell[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({ ...(g.cells[r]?.[c] ?? { text: '', blank: false }) }))
  );
  if (change.toggle) {
    const [r, c] = change.toggle;
    const cell = cells[r]?.[c];
    if (cell) {
      cell.blank = !cell.blank;
      if (cell.blank) {
        keyAt.set(`${r},${c}`, cell.text.replace(/\$/g, '').trim()); // a given value becomes the key
        cell.text = '';
      } else {
        cell.text = keyAt.get(`${r},${c}`) ?? '';
        keyAt.delete(`${r},${c}`);
      }
    }
  }
  const grid = { ...g, rows, cols, cells };
  return { grid, keys: blankPositions(grid).map(([r, c]) => keyAt.get(`${r},${c}`) ?? '') };
}

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** The grid and its keys as saved, or an error message. */
export function cleanGrid(raw: any, answer: unknown): { grid: Grid; answer: string } | string {
  const rows = Number(raw?.rows);
  const cols = Number(raw?.cols);
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > GRID_MAX || cols > GRID_MAX) {
    return `a grid is 1 to ${GRID_MAX} rows and columns.`;
  }
  const cells: GridCell[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const cell = raw?.cells?.[r]?.[c];
      const blank = cell?.blank === true;
      return { blank, text: blank ? '' : clean(cell?.text, GRID_TEXT_MAX) };
    })
  );
  const grid: Grid = { rows, cols, headerRow: raw?.headerRow === true, headerCol: raw?.headerCol === true, cells };
  const n = blankPositions(grid).length;
  if (n === 0) return 'a grid needs at least one blank cell for students to fill in.';
  const keys = parseList(answer).slice(0, n).map((k) => clean(k, GRID_BLANK_MAX));
  while (keys.length < n) keys.push('');
  for (const [i, k] of keys.entries()) {
    if (!k) continue;
    const read = readMath(k);
    if (!read.ok) return `blank ${i + 1}'s answer can't be read (${read.error})`;
  }
  return { grid, answer: joinList(keys) };
}

/** A student's grid answer, checked: a JSON list of at most `blanks` short strings (or ''). */
export function cleanGridAnswer(v: string, blanks: number): string | null {
  if (v === '') return '';
  let list: unknown;
  try {
    list = JSON.parse(v);
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.length > blanks) return null;
  if (!list.every((x) => typeof x === 'string' && x.length <= GRID_BLANK_MAX)) return null;
  return joinList(list as string[]);
}

/** Each blank: right, not right, or not marked (no key, or left empty). */
export function gridMarks(keysJson: string, answerJson: string | undefined, match: MathMatch = 'form'): (boolean | null)[] {
  const keys = parseList(keysJson);
  const vals = parseList(answerJson ?? '');
  return keys.map((k, i) => (!k.trim() || !(vals[i] ?? '').trim() ? null : checkMath(k, vals[i], match)));
}

/** The whole question: right only when every keyed blank is right (an empty keyed blank is wrong). */
export function gridCorrect(keysJson: string, answerJson: string | undefined, match: MathMatch = 'form'): boolean | null {
  const keys = parseList(keysJson);
  if (!keys.some((k) => k.trim())) return null;
  const vals = parseList(answerJson ?? '');
  if (!vals.some((v) => v.trim())) return null;
  return keys.every((k, i) => !k.trim() || ((vals[i] ?? '').trim() !== '' && checkMath(k, vals[i], match)));
}

/** A grid answer for a spreadsheet or the answers table: "x² | 5x | 2x | 10". */
export function gridText(json: string | undefined): string {
  return parseList(json ?? '')
    .map((v) => v.trim() || '_')
    .join(' | ');
}
