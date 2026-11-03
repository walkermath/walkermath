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
//
// Two ways to mark a grid:
//   'keys' (default)  each blank against its own key. Blanks given the same group letter (A, B...)
//                     can be filled in any order: "-8x" and "-5x" in either middle cell.
//   'area'            an area model: one key, the expression the model multiplies out to (in
//                     `answer` as a one-item list). Right when every cell is its row header times
//                     its column header, every filled cell is one simplified term, and the headers
//                     multiply to the key. Any correct arrangement passes: (x - 8) across the top or
//                     down the side, 2x before -3 or after.

import { checkMath, isTerm, readMath, type MathMatch } from './mathcheck.ts';

export interface GridCell {
  text: string;
  blank: boolean;
  /** 'keys' grids: blanks sharing a letter can be filled in any order. */
  group?: string;
}

export interface Grid {
  rows: number;
  cols: number;
  /** Shade the first row / first column as headers (an area model's factors). */
  headerRow: boolean;
  headerCol: boolean;
  cells: GridCell[][];
  /** How it is marked (see above); missing = 'keys'. */
  check?: 'keys' | 'area';
}

export const GRID_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

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
  const area = raw?.check === 'area';
  const cells: GridCell[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const cell = raw?.cells?.[r]?.[c];
      const blank = cell?.blank === true;
      const group = !area && blank && GRID_GROUPS.includes(cell?.group) ? (cell.group as string) : '';
      return { blank, text: blank ? '' : clean(cell?.text, GRID_TEXT_MAX), ...(group ? { group } : {}) };
    })
  );
  const grid: Grid = {
    rows,
    cols,
    headerRow: area || raw?.headerRow === true,
    headerCol: area || raw?.headerCol === true,
    cells,
    ...(area ? { check: 'area' as const } : {})
  };
  const n = blankPositions(grid).length;
  if (n === 0) return 'a grid needs at least one blank cell for students to fill in.';
  if (area) {
    if (rows < 2 || cols < 2) return 'an area model needs at least 2 rows and 2 columns.';
    if (cells[0][0].blank) return "an area model's corner cell can't be a blank.";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((r === 0 && c === 0) || cells[r][c].blank) continue;
        const t = plainText(cells[r][c].text);
        if (!t) return `row ${r + 1}, column ${c + 1} needs a value or a blank.`;
        if (!readMath(t).ok) return `row ${r + 1}, column ${c + 1} can't be read as math.`;
      }
    }
    const target = clean(parseList(answer)[0], GRID_BLANK_MAX);
    if (!target) return 'an area model needs a key: what the whole model multiplies out to, like x^2 - 13x + 40.';
    const read = readMath(target);
    if (!read.ok) return `the area model's key can't be read (${read.error})`;
    return { grid, answer: JSON.stringify([target]) };
  }
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

/** A given cell's text as math: "$+5$" -> "+5". */
const plainText = (t: string) => t.replace(/\$/g, '').trim();

/** Each blank's group letter ('' = none), in blank order. */
const groupsOf = (g: Grid | undefined, n: number): string[] => {
  if (!g || g.check === 'area') return Array(n).fill('');
  const pos = blankPositions(g);
  return Array.from({ length: n }, (_, i) => (pos[i] ? (g.cells[pos[i][0]]?.[pos[i][1]]?.group ?? '') : ''));
};

/** Can every key be paired with a different answer it matches? (small lists: plain backtracking) */
function pairs(keys: string[], vals: string[], match: MathMatch): boolean {
  if (vals.some((v) => !v.trim())) return false;
  const used = new Array(vals.length).fill(false);
  const go = (k: number): boolean => {
    if (k === keys.length) return true;
    for (let j = 0; j < vals.length; j++) {
      if (used[j] || !checkMath(keys[k], vals[j], match)) continue;
      used[j] = true;
      if (go(k + 1)) return true;
      used[j] = false;
    }
    return false;
  };
  return go(0);
}

/** An area model's headers and cells, with the student's answers in the blanks. */
function areaParts(g: Grid, vals: string[]) {
  const at = new Map(blankPositions(g).map(([r, c], i) => [`${r},${c}`, i]));
  const val = (r: number, c: number) => {
    const i = at.get(`${r},${c}`);
    return i === undefined ? plainText(g.cells[r]?.[c]?.text ?? '') : (vals[i] ?? '').trim();
  };
  const rows = Array.from({ length: g.rows - 1 }, (_, i) => val(i + 1, 0));
  const cols = Array.from({ length: g.cols - 1 }, (_, i) => val(0, i + 1));
  return { at, val, rows, cols };
}

/** Is cell (r, c) of an area model its row header times its column header? */
const areaCellRight = (row: string, col: string, cell: string) => !!row && !!col && !!cell && checkMath(`(${row})*(${col})`, cell, 'any');

function areaCorrect(g: Grid, keysJson: string, answerJson: string | undefined): boolean | null {
  const target = (parseList(keysJson)[0] ?? '').trim();
  if (!target) return null;
  const vals = parseList(answerJson ?? '');
  if (!vals.some((v) => v.trim())) return null;
  const n = blankPositions(g).length;
  for (let i = 0; i < n; i++) if (!isTerm((vals[i] ?? '').trim())) return false; // every blank filled, one simplified term
  const { val, rows, cols } = areaParts(g, vals);
  if ([...rows, ...cols].some((h) => !h)) return false;
  for (let r = 1; r < g.rows; r++) for (let c = 1; c < g.cols; c++) if (!areaCellRight(rows[r - 1], cols[c - 1], val(r, c))) return false;
  const sum = (xs: string[]) => xs.map((x) => `(${x})`).join('+');
  return checkMath(target, `(${sum(rows)})*(${sum(cols)})`, 'any');
}

/**
 * Each blank: right, not right, or not marked (no key, or left empty). A grouped blank is right when
 * it matches any key in its group; an area model's cell when it's its row header times its column
 * header (its headers aren't marked one by one).
 */
export function gridMarks(keysJson: string, answerJson: string | undefined, match: MathMatch = 'form', grid?: Grid): (boolean | null)[] {
  const vals = parseList(answerJson ?? '');
  if (grid?.check === 'area') {
    const { val, rows, cols } = areaParts(grid, vals);
    return blankPositions(grid).map(([r, c], i) => {
      const v = (vals[i] ?? '').trim();
      if (!v) return null;
      if (!isTerm(v)) return false;
      return r === 0 || c === 0 ? null : areaCellRight(rows[r - 1], cols[c - 1], val(r, c));
    });
  }
  const keys = parseList(keysJson);
  const groups = groupsOf(grid, keys.length);
  return keys.map((k, i) => {
    const v = (vals[i] ?? '').trim();
    if (!k.trim() || !v) return null;
    if (!groups[i]) return checkMath(k, v, match);
    return keys.some((k2, j) => groups[j] === groups[i] && k2.trim() && checkMath(k2, v, match));
  });
}

/** The whole question: right only when every keyed blank is right (an empty keyed blank is wrong). */
export function gridCorrect(keysJson: string, answerJson: string | undefined, match: MathMatch = 'form', grid?: Grid): boolean | null {
  if (grid?.check === 'area') return areaCorrect(grid, keysJson, answerJson);
  const keys = parseList(keysJson);
  if (!keys.some((k) => k.trim())) return null;
  const vals = parseList(answerJson ?? '');
  if (!vals.some((v) => v.trim())) return null;
  const groups = groupsOf(grid, keys.length);
  const v = (i: number) => (vals[i] ?? '').trim();
  // Blanks on their own: each against its key.
  if (!keys.every((k, i) => groups[i] || !k.trim() || (v(i) !== '' && checkMath(k, v(i), match)))) return false;
  // Each group: its keys and its answers pair up, in any order.
  for (const letter of new Set(groups.filter(Boolean))) {
    const idx = keys.map((k, i) => i).filter((i) => groups[i] === letter && keys[i].trim());
    if (!pairs(idx.map((i) => keys[i]), idx.map(v), match)) return false;
  }
  return true;
}

/** A grid answer for a spreadsheet or the answers table: "x² | 5x | 2x | 10". */
export function gridText(json: string | undefined): string {
  return parseList(json ?? '')
    .map((v) => v.trim() || '_')
    .join(' | ');
}
