// src/lib/lesson/inkStore.svelte.ts
// The ink a screen knows about, by page: finished strokes (from the room) and strokes still being
// drawn. Every live screen makes one and wires it to its connection (connectLive): pages are asked
// for when they're first shown, kept up to date by the room's ink messages, and fetched again after
// a reconnect, or (slow mode) when a page's counter moves.

import { applyInk, type InkOp, type Stroke } from './ink.ts';

export interface LiveStroke {
  id: string;
  c: number;
  w: number;
  p: number[];
  at: number;
}

/** A stroke still being drawn with no news for this long was abandoned (the teacher's device dropped). */
const LIVE_STALE_MS = 8000;

export class InkStore {
  /** Finished strokes by page, in drawing order. */
  pages = $state<Record<string, Stroke[]>>({});
  /** Strokes being drawn right now, by page and stroke id. */
  live = $state<Record<string, Record<string, LiveStroke>>>({});
  /** How to ask for pages (set when the connection is made). */
  fetcher: ((ids: string[]) => void) | null = null;

  private rev: Record<string, number> = {};
  private wanted = new Set<string>();
  private asked = new Set<string>();
  private queued = new Set<string>();
  private flushing = false;

  /** This page is on screen: fetch its ink once (and keep it current from then on). */
  want(id: string) {
    if (!id) return;
    this.wanted.add(id);
    if (this.asked.has(id)) return;
    this.asked.add(id);
    this.ask([id]);
  }

  private ask(ids: string[]) {
    for (const id of ids) this.queued.add(id);
    if (this.flushing) return;
    this.flushing = true;
    setTimeout(() => {
      this.flushing = false;
      const batch = [...this.queued];
      this.queued.clear();
      if (batch.length) this.fetcher?.(batch);
    }, 0);
  }

  /** Pages the room sent. */
  loaded(pages: Record<string, Stroke[]>, rev: Record<string, number>) {
    for (const [id, strokes] of Object.entries(pages)) {
      this.pages[id] = strokes;
      this.rev[id] = rev[id] ?? 0;
    }
  }

  /** A change (someone else's, or this device's own before it is sent). */
  apply(op: InkOp, rev?: number) {
    const now = Date.now();
    if (op.op === 'live') {
      const page = (this.live[op.page] ??= {});
      const s = page[op.id];
      if (s) {
        s.p.push(...op.p);
        s.at = now;
      } else page[op.id] = { id: op.id, c: op.c, w: op.w, p: [...op.p], at: now };
      this.sweep(now);
      return;
    }
    this.pages[op.page] = applyInk(this.pages[op.page] ?? [], op);
    if (op.op === 'add' && this.live[op.page]) for (const s of op.strokes) delete this.live[op.page][s.id];
    if (op.op === 'clear') this.live[op.page] = {};
    if (rev !== undefined) this.rev[op.page] = rev;
  }

  private sweep(now: number) {
    for (const page of Object.values(this.live)) {
      for (const [id, s] of Object.entries(page)) if (now - s.at > LIVE_STALE_MS) delete page[id];
    }
  }

  /** Slow mode: fetch pages on screen whose counter moved. */
  checkRev(rev: Record<string, number>) {
    const stale = [...this.wanted].filter((id) => (rev[id] ?? 0) !== (this.rev[id] ?? 0));
    if (stale.length) this.ask(stale);
  }

  /** After a reconnect: fetch every page on screen again (changes may have been missed). */
  resync() {
    this.live = {};
    this.asked = new Set(this.wanted);
    if (this.wanted.size) this.ask([...this.wanted]);
  }

  strokes(id: string): Stroke[] {
    return this.pages[id] ?? [];
  }

  drawing(id: string): LiveStroke[] {
    const page = this.live[id];
    return page ? Object.values(page) : [];
  }
}

/** Wires an ink store to a connection's handlers (spread into connectLive's handlers). */
export function inkHandlers(ink: InkStore) {
  return {
    onInk: (op: InkOp, rev?: number) => ink.apply(op, rev),
    onInkPages: (pages: Record<string, Stroke[]>, rev: Record<string, number>) => ink.loaded(pages, rev),
    onInkRev: (rev: Record<string, number>) => ink.checkRev(rev)
  };
}
