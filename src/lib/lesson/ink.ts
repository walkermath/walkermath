// src/lib/lesson/ink.ts
// Ink on a page (Phase 4c): the teacher's pen strokes over a blackboard or a slide. Pure functions,
// shared by the presenter screen (drawing), every screen that shows a page (drawing it), the live
// room (checking and storing) and the tests.
//
// A stroke is a polyline in page coordinates: the same 960 x 540 page every slide is laid out on,
// so ink lines up on every screen size. Colors are palette slots, not colors: each theme draws a
// slot in its own shade (--ink-0 ... in global.css), so "chalk" is white on a dark board and black
// on a light one, and everyone sees the same marks.

export const PAGE_W = 960;
export const PAGE_H = 540;

/** Palette slots, in toolbar order. The shades live in global.css (--ink-N, light and dark). */
export const INK_COLORS = ['chalk', 'yellow', 'blue', 'red', 'green'] as const;
/** Pen widths in page pixels, in toolbar order. */
export const INK_WIDTHS = [3, 6, 12] as const;
/** The eraser's reach, in page pixels: a stroke it touches is removed whole. */
export const ERASER_RADIUS = 14;

export const INK_LIMITS = {
  /** Points in one finished stroke (after simplifying). */
  points: 600,
  /** Strokes on one page. */
  strokes: 1000,
  /** Strokes erased (or restored) in one message. */
  batch: 300,
  /** Points in one live update (a few frames of a stroke being drawn). */
  livePoints: 120
} as const;

/** One stroke: id (time-sortable, so storage order is drawing order), color slot, width slot, points [x0, y0, x1, y1, ...]. */
export interface Stroke {
  id: string;
  c: number;
  w: number;
  p: number[];
}

export type InkOp =
  | { op: 'add'; page: string; strokes: Stroke[] }
  | { op: 'erase'; page: string; ids: string[] }
  | { op: 'clear'; page: string }
  /** A stroke still being drawn: points so far are sent a few at a time; never stored. */
  | { op: 'live'; page: string; id: string; c: number; w: number; p: number[] };

export const STROKE_ID = /^[A-Za-z0-9_-]{6,32}$/;
/** A page id: a slide's uuid or a blackboard id (b-...). */
export const PAGE_ID = /^[A-Za-z0-9_-]{4,64}$/;

/** A new stroke id: base-36 time, then randomness. Sorting ids sorts strokes by when they were drawn. */
export function newStrokeId(now = Date.now()): string {
  const t = now.toString(36).padStart(9, '0');
  const r = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(36).padStart(2, '0')).join('');
  return `${t}${r}`;
}

const slot = (v: unknown, n: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : -1);

/** Points as whole page pixels, kept a little inside the page's edges. Null if not a list of numbers. */
function cleanPoints(p: unknown, max: number): number[] | null {
  if (!Array.isArray(p) || p.length < 2 || p.length % 2 !== 0 || p.length > max * 2) return null;
  const out = new Array<number>(p.length);
  for (let i = 0; i < p.length; i++) {
    const v = p[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    const lim = i % 2 === 0 ? PAGE_W : PAGE_H;
    out[i] = Math.round(Math.min(lim + 20, Math.max(-20, v)));
  }
  return out;
}

/** Checks a stroke from the network; null if it isn't one. */
export function cleanStroke(v: any): Stroke | null {
  if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !STROKE_ID.test(v.id)) return null;
  const c = slot(v.c, INK_COLORS.length);
  const w = slot(v.w, INK_WIDTHS.length);
  const p = cleanPoints(v.p, INK_LIMITS.points);
  return c < 0 || w < 0 || !p ? null : { id: v.id, c, w, p };
}

/** Checks an ink message from the network; null for anything malformed. */
export function parseInkOp(v: any): InkOp | null {
  if (!v || typeof v !== 'object' || typeof v.page !== 'string' || !PAGE_ID.test(v.page)) return null;
  switch (v.op) {
    case 'add': {
      if (!Array.isArray(v.strokes) || v.strokes.length === 0 || v.strokes.length > INK_LIMITS.batch) return null;
      const strokes = v.strokes.map(cleanStroke);
      return strokes.every(Boolean) ? { op: 'add', page: v.page, strokes: strokes as Stroke[] } : null;
    }
    case 'erase': {
      if (!Array.isArray(v.ids) || v.ids.length === 0 || v.ids.length > INK_LIMITS.batch) return null;
      return v.ids.every((id: unknown) => typeof id === 'string' && STROKE_ID.test(id)) ? { op: 'erase', page: v.page, ids: v.ids } : null;
    }
    case 'clear':
      return { op: 'clear', page: v.page };
    case 'live': {
      if (typeof v.id !== 'string' || !STROKE_ID.test(v.id)) return null;
      const c = slot(v.c, INK_COLORS.length);
      const w = slot(v.w, INK_WIDTHS.length);
      const p = cleanPoints(v.p, INK_LIMITS.livePoints);
      return c < 0 || w < 0 || !p ? null : { op: 'live', page: v.page, id: v.id, c, w, p };
    }
    default:
      return null;
  }
}

/**
 * Fewer points, same line (Ramer-Douglas-Peucker): drops points within `tolerance` page pixels of
 * the line through their neighbours, then keeps at most INK_LIMITS.points.
 */
export function simplify(p: number[], tolerance = 0.75): number[] {
  const n = p.length / 2;
  if (n <= 2) return p.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const t2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = p[a * 2], ay = p[a * 2 + 1], bx = p[b * 2], by = p[b * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let far = -1, farD = t2;
    for (let i = a + 1; i < b; i++) {
      const px = p[i * 2], py = p[i * 2 + 1];
      let d: number;
      if (len2 === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d > farD) (far = i), (farD = d);
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  let out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  // Still too long (a very long scribble): keep every k-th point, and the last.
  const max = INK_LIMITS.points;
  if (out.length / 2 > max) {
    const k = Math.ceil(out.length / 2 / max);
    const thin: number[] = [];
    for (let i = 0; i < out.length / 2; i += k) thin.push(out[i * 2], out[i * 2 + 1]);
    thin.splice(thin.length - 2, 2, out[out.length - 2], out[out.length - 1]);
    out = thin.length / 2 > max ? thin.slice(0, max * 2) : thin;
  }
  return out;
}

/** An SVG path through the points, smoothed (quadratic curves through the midpoints). A dot for a tap. */
export function pathD(p: number[]): string {
  const n = p.length / 2;
  if (n === 0) return '';
  if (n === 1) return `M${p[0]} ${p[1]}l0.01 0`;
  if (n === 2) return `M${p[0]} ${p[1]}L${p[2]} ${p[3]}`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 1; i < n - 1; i++) {
    const x = p[i * 2], y = p[i * 2 + 1];
    const mx = (x + p[i * 2 + 2]) / 2, my = (y + p[i * 2 + 3]) / 2;
    d += `Q${x} ${y} ${mx} ${my}`;
  }
  return d + `L${p[(n - 1) * 2]} ${p[(n - 1) * 2 + 1]}`;
}

/** Does the eraser at (x, y) touch the stroke? (Within the eraser's reach plus half the line's width.) */
export function touches(s: Stroke, x: number, y: number, r = ERASER_RADIUS): boolean {
  const reach = r + (INK_WIDTHS[s.w] ?? 3) / 2;
  const r2 = reach * reach;
  const p = s.p;
  if (p.length === 2) return (p[0] - x) ** 2 + (p[1] - y) ** 2 <= r2;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    if ((ax + t * dx - x) ** 2 + (ay + t * dy - y) ** 2 <= r2) return true;
  }
  return false;
}

/** Applies a stored op to a page's strokes (in drawing order); returns the new list. 'live' changes nothing here. */
export function applyInk(strokes: Stroke[], op: InkOp): Stroke[] {
  switch (op.op) {
    case 'add': {
      const have = new Set(strokes.map((s) => s.id));
      const added = op.strokes.filter((s) => !have.has(s.id));
      if (!added.length) return strokes;
      return [...strokes, ...added].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }
    case 'erase': {
      const gone = new Set(op.ids);
      return strokes.some((s) => gone.has(s.id)) ? strokes.filter((s) => !gone.has(s.id)) : strokes;
    }
    case 'clear':
      return strokes.length ? [] : strokes;
    default:
      return strokes;
  }
}
