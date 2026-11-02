<!-- src/components/live/Board.svelte -->
<!-- The presenter's pen: a page (PageView) the teacher writes on with a finger, stylus or mouse. -->
<!-- One finger at a time (a resting hand or a second finger is ignored); the page doesn't scroll or -->
<!-- zoom under the pen. A stroke is sent a few points at a time while it's drawn (students watch it -->
<!-- appear), then once more, simplified, when the finger lifts. The eraser removes whole strokes. -->
<script lang="ts">
  import type { Page } from '../../lib/lesson/room.ts';
  import type { InkStore } from '../../lib/lesson/inkStore.svelte.ts';
  import {
    INK_LIMITS,
    INK_WIDTHS,
    PAGE_H,
    PAGE_W,
    newStrokeId,
    pathD,
    simplify,
    touches,
    type InkOp,
    type Stroke
  } from '../../lib/lesson/ink.ts';
  import PageView from './PageView.svelte';

  let {
    page,
    ink,
    color,
    width,
    eraser,
    onlive,
    onadd,
    onerase
  }: {
    page: Page;
    ink: InkStore;
    color: number;
    width: number;
    eraser: boolean;
    /** Points of the stroke being drawn (send them on). */
    onlive: (op: InkOp) => void;
    /** A finished stroke (already drawn here). */
    onadd: (stroke: Stroke) => void;
    /** Strokes the eraser removed in one sweep (already removed here). */
    onerase: (strokes: Stroke[]) => void;
  } = $props();

  /** How often a stroke being drawn is sent on. */
  const LIVE_EVERY_MS = 50;

  let surface = $state<HTMLDivElement | null>(null);
  let active: number | null = null;
  let current = $state<{ id: string; c: number; w: number; p: number[] } | null>(null);
  let sentUpTo = 0;
  let lastSent = 0;
  let erased: Stroke[] = [];
  let erasedIds = new Set<string>();
  /** Where the eraser is (page coordinates), to show its reach. */
  let eraserAt = $state<[number, number] | null>(null);

  function pos(e: PointerEvent): [number, number] {
    const r = surface!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) * PAGE_W) / r.width), Math.round(((e.clientY - r.top) * PAGE_H) / r.height)];
  }

  function sendLive(force = false) {
    if (!current) return;
    const now = performance.now();
    if (!force && now - lastSent < LIVE_EVERY_MS) return;
    let from = sentUpTo;
    while (from < current.p.length) {
      const pts = current.p.slice(from, from + INK_LIMITS.livePoints * 2);
      onlive({ op: 'live', page: page.id, id: current.id, c: current.c, w: current.w, p: pts });
      from += pts.length;
    }
    sentUpTo = current.p.length;
    lastSent = now;
  }

  function eraseAt(x: number, y: number) {
    const hit = ink.strokes(page.id).filter((s) => !erasedIds.has(s.id) && touches(s, x, y));
    if (!hit.length) return;
    for (const s of hit) {
      erasedIds.add(s.id);
      erased.push(s);
    }
    ink.apply({ op: 'erase', page: page.id, ids: hit.map((s) => s.id) });
  }

  function down(e: PointerEvent) {
    if (active !== null || !surface) return; // one finger at a time
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    active = e.pointerId;
    surface.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    if (eraser) {
      erased = [];
      erasedIds = new Set();
      eraserAt = [x, y];
      eraseAt(x, y);
    } else {
      current = { id: newStrokeId(), c: color, w: width, p: [x, y] };
      sentUpTo = 0;
      lastSent = 0;
      sendLive(true);
    }
  }

  function move(e: PointerEvent) {
    if (eraser && active === null && e.pointerType !== 'touch') {
      eraserAt = pos(e); // show the eraser's reach while hovering
      return;
    }
    if (e.pointerId !== active) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) {
      const [x, y] = pos(ev);
      if (eraser) {
        eraserAt = [x, y];
        eraseAt(x, y);
      } else if (current) {
        const n = current.p.length;
        if (Math.abs(current.p[n - 2] - x) + Math.abs(current.p[n - 1] - y) >= 2) current.p.push(x, y);
      }
    }
    if (current) sendLive();
  }

  function up(e: PointerEvent) {
    if (e.pointerId !== active) return;
    active = null;
    if (eraser) {
      if (e.pointerType === 'touch') eraserAt = null;
      if (erased.length) onerase(erased);
      erased = [];
      return;
    }
    if (!current) return;
    sendLive(true);
    const stroke: Stroke = { id: current.id, c: current.c, w: current.w, p: simplify(current.p) };
    current = null;
    onadd(stroke);
  }
</script>

<PageView {page} {ink} framed={false}>
  <div
    bind:this={surface}
    class="absolute inset-0 select-none {eraser ? 'cursor-cell' : 'cursor-crosshair'}"
    style="touch-action: none"
    role="application"
    aria-label={eraser ? 'Eraser: touch a stroke to remove it' : 'Board: write here'}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onpointerleave={() => active === null && (eraserAt = null)}
    oncontextmenu={(e) => e.preventDefault()}
  >
    <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 {PAGE_W} {PAGE_H}" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {#if current}
        <path d={pathD(current.p)} stroke="var(--ink-{current.c})" stroke-width={INK_WIDTHS[current.w] ?? 3} />
      {/if}
      {#if eraser && eraserAt}
        <circle cx={eraserAt[0]} cy={eraserAt[1]} r="14" stroke="var(--text-muted)" stroke-width="1.5" stroke-dasharray="4 3" />
      {/if}
    </svg>
  </div>
</PageView>
