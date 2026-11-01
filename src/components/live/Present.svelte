<!-- src/components/live/Present.svelte -->
<!-- /teach/present?run=  The presenter screen: the projector view, and where the teacher writes. -->
<!-- The current page fills the screen with the pen toolbar below it; no answers, no aliases. In a -->
<!-- Notes module: [< page] [next page >] (on the last page: on to the next module) and -->
<!-- [+ blackboard] (a blank page right after this one, for this delivery). In any other module: -->
<!-- [board] opens a scratch blackboard, kept with that module. Clicker keys turn pages; the screen -->
<!-- stays awake. The control panel can stay open on another device; both stay in step. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { api, ApiError } from '../../lib/api.ts';
  import { MODULE_TYPES } from '../../lib/lesson/modules.ts';
  import { livePage, moduleLeftMs, pagesOf, type Command, type RoomState } from '../../lib/lesson/room.ts';
  import { INK_COLORS, INK_LIMITS, INK_WIDTHS, type InkOp, type Stroke } from '../../lib/lesson/ink.ts';
  import { InkStore, inkHandlers } from '../../lib/lesson/inkStore.svelte.ts';
  import { connectLive, countdown, type LiveConnection, type LiveLesson, type Transport } from '../../lib/lesson/liveClient.ts';
  import Board from './Board.svelte';
  import LiveModule from './LiveModule.svelte';

  type Run = { id: string; lessonTitle: string; className: string; period: string; status: 'scheduled' | 'live' | 'ended' };
  /** One undo step on this device: strokes it added (undo removes them), or removed (undo puts them back). */
  type Step = { page: string; kind: 'added' | 'removed'; strokes: Stroke[] };

  let run = $state<Run | null>(null);
  let lesson = $state<LiveLesson | null>(null);
  let rs = $state<RoomState | null>(null);
  let transport = $state<Transport>('connecting');
  let error = $state('');
  let flash = $state('');
  let now = $state(Date.now());
  const ink = new InkStore();
  let conn: LiveConnection | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  // The pen: color and width slots (palette in global.css), eraser, and this device's undo steps.
  let color = $state(0);
  let width = $state(1);
  let eraser = $state(false);
  let undoSteps = $state<Step[]>([]);
  const MAX_UNDO = 100;

  let dark = $state(true);
  let fullscreen = $state(false);
  let wakeLock: any = null;

  onMount(async () => {
    dark = document.documentElement.classList.contains('dark');
    const id = new URLSearchParams(location.search).get('run');
    if (!id) {
      error = 'No delivery picked. Open the presenter from the control panel.';
      return;
    }
    try {
      run = (await api<{ run: Run }>(`/api/teach/runs/${id}`)).run;
    } catch (e) {
      error = e instanceof ApiError && e.status === 401 ? 'Sign in at /teach first, then open this page again.' : (e as Error).message;
      return;
    }
    if (run.status !== 'live') return;
    conn = connectLive(run.id, {
      onLesson: (l) => (lesson = l),
      onState: (s) => (rs = s),
      onTransport: (t) => {
        if (t === 'socket' && transport !== 'socket') ink.resync(); // changes may have been missed
        transport = t;
      },
      onGone: (_s, message) => (error = message),
      ...inkHandlers(ink)
    });
    ink.fetcher = (ids) => conn?.inkGet(ids);
    timer = setInterval(() => (now = conn?.now() ?? Date.now()), 250);
    keepAwake();
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('fullscreenchange', onFullscreen);
  });
  onDestroy(() => {
    conn?.close();
    if (timer) clearInterval(timer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('fullscreenchange', onFullscreen);
    }
    wakeLock?.release?.().catch?.(() => {});
  });

  /* ---------------- screen ---------------- */

  async function keepAwake() {
    try {
      wakeLock = await (navigator as any).wakeLock?.request('screen');
    } catch {
      // not allowed (battery saver, older browser): the screen may dim as usual
    }
  }
  const onVisible = () => document.visibilityState === 'visible' && keepAwake();
  const onFullscreen = () => (fullscreen = !!document.fullscreenElement);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // not available here
    }
  }
  function toggleTheme() {
    dark = !dark;
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      // fine
    }
  }

  /* ---------------- the lesson ---------------- */

  const modules = $derived(lesson?.modules ?? []);
  const current = $derived(rs ? modules[rs.index] : null);
  const notes = $derived(current?.type === 'notes');
  const pages = $derived(rs ? pagesOf(rs, modules, rs.index) : []);
  const page = $derived(livePage(rs, modules));
  const isLast = $derived(!!rs && rs.index >= modules.length - 1);
  const nextModule = $derived(rs && !isLast ? modules[rs.index + 1] : null);
  const modLeft = $derived(rs ? moduleLeftMs(rs, now) : 0);
  const soon = $derived(!!rs && !rs.holding && !rs.pausedAt && modLeft > 0 && modLeft <= 30_000);

  async function send(cmd: Command) {
    try {
      await conn?.send(cmd);
    } catch (e) {
      showFlash((e as Error).message);
    }
  }
  function showFlash(msg: string) {
    flash = msg;
    setTimeout(() => flash === msg && (flash = ''), 4000);
  }

  /** Forward: the next page if there is one, otherwise on to the next module. */
  function forward() {
    if (!rs) return;
    if (page && rs.page < pages.length - 1) send({ type: 'page', page: rs.page + 1 });
    else if (!isLast) send({ type: 'next' });
  }
  function backward() {
    if (rs && page && rs.page > 0) send({ type: 'page', page: rs.page - 1 });
  }
  const newBoardId = () => `b-${Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => (b % 36).toString(36)).join('')}`;
  const addBoard = () => send({ type: 'addBoard', id: newBoardId() });
  function openBoard() {
    if (!rs) return;
    if (pages.length) send({ type: 'page', page: Math.min(rs.page, pages.length - 1) });
    else addBoard();
  }

  /* ---------------- ink ---------------- */

  function sendInk(op: InkOp) {
    conn?.sendInk(op).catch(() => showFlash("// that stroke didn't reach the room. check the connection."));
  }
  /** Sends many strokes in messages the room accepts. */
  function sendStrokes(pageId: string, strokes: Stroke[]) {
    for (let i = 0; i < strokes.length; i += INK_LIMITS.batch) sendInk({ op: 'add', page: pageId, strokes: strokes.slice(i, i + INK_LIMITS.batch) });
  }
  function sendErase(pageId: string, ids: string[]) {
    for (let i = 0; i < ids.length; i += INK_LIMITS.batch) sendInk({ op: 'erase', page: pageId, ids: ids.slice(i, i + INK_LIMITS.batch) });
  }
  function remember(step: Step) {
    undoSteps = [...undoSteps.slice(-(MAX_UNDO - 1)), step];
  }

  function added(stroke: Stroke) {
    if (!page) return;
    ink.apply({ op: 'add', page: page.id, strokes: [stroke] });
    sendStrokes(page.id, [stroke]);
    remember({ page: page.id, kind: 'added', strokes: [stroke] });
  }
  function erased(strokes: Stroke[]) {
    if (!page) return;
    sendErase(page.id, strokes.map((s) => s.id));
    remember({ page: page.id, kind: 'removed', strokes });
  }
  function clearPage() {
    if (!page) return;
    const strokes = ink.strokes(page.id);
    if (!strokes.length) return;
    ink.apply({ op: 'clear', page: page.id });
    sendInk({ op: 'clear', page: page.id });
    remember({ page: page.id, kind: 'removed', strokes });
  }
  function undo() {
    const step = undoSteps.at(-1);
    if (!step) return;
    undoSteps = undoSteps.slice(0, -1);
    if (step.kind === 'added') {
      const ids = step.strokes.map((s) => s.id);
      ink.apply({ op: 'erase', page: step.page, ids });
      sendErase(step.page, ids);
    } else {
      ink.apply({ op: 'add', page: step.page, strokes: step.strokes });
      sendStrokes(step.page, step.strokes);
    }
  }

  /* ---------------- keys (clickers send Page Up / Page Down) ---------------- */

  function keys(e: KeyboardEvent) {
    if (!rs || rs.status !== 'live' || (e.target as HTMLElement)?.closest('input, textarea, select')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault();
      forward();
    } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      backward();
    }
  }

  const label = 'text-[var(--text-muted)]';
  const tool =
    'min-w-11 h-11 px-2 inline-flex items-center justify-center rounded border-2 cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed';
  const toolOff = 'border-[var(--line)] hover:border-[var(--accent)]';
  const toolOn = 'border-[var(--accent)] text-[var(--accent)] font-bold';
</script>

<svelte:window onkeydown={keys} />

<div class="fixed inset-0 flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono text-xs">
  {#if error || !run || run.status !== 'live' || !lesson || !rs || !current}
    <div class="m-auto max-w-md p-6 space-y-3 text-sm text-center">
      {#if error}
        <p class="text-[var(--bad)]">{error}</p>
      {:else if run && run.status === 'scheduled'}
        <p>// this lesson hasn't started. start it from the control panel, then come back here.</p>
      {:else if run && run.status === 'ended'}
        <p>// this delivery has ended.</p>
      {:else}
        <p class={label}>connecting to the room...</p>
      {/if}
      <a class="underline hover:text-[var(--accent)]" href={run ? `/teach/live?run=${run.id}` : '/teach'}>[control panel]</a>
    </div>
  {:else if rs.status === 'ended'}
    <div class="m-auto max-w-md p-6 space-y-3 text-sm text-center">
      <p>// the lesson has ended.</p>
      <a class="underline hover:text-[var(--accent)]" href="/teach">[lessons]</a>
    </div>
  {:else}
    <!-- top bar: where we are, the clock, the screen -->
    <header class="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--line)]">
      <button type="button" class="{tool} {toolOff}" onclick={() => send({ type: 'back' })} disabled={rs.index === 0} title="Previous module">&lt;-</button>
      <div class="min-w-0">
        <div class="font-bold text-sm truncate">{current.title}</div>
        <div class="{label} truncate">
          {MODULE_TYPES[current.type].label.toLowerCase()}{page ? ` · page ${rs.page + 1} of ${pages.length}` : ''} · {lesson.title}
        </div>
      </div>
      <span class="flex-1"></span>
      {#if flash}<span class="text-[var(--warn)] truncate">{flash}</span>{/if}
      {#if rs.pausedAt}
        <span class="text-[var(--warn)] font-bold">paused</span>
      {:else if rs.holding}
        <span class="text-[var(--accent)] font-bold">time's up</span>
      {:else if soon}
        <span class="px-2 py-0.5 rounded bg-[var(--warn)] text-[var(--bg-surface)] font-bold">{countdown(modLeft)} left</span>
      {/if}
      <span class="text-xl font-bold tabular-nums {soon ? 'text-[var(--warn)]' : ''}">{countdown(Math.max(modLeft, 0))}</span>
      <span
        class={transport === 'socket' ? 'text-[var(--ok)]' : transport === 'offline' ? 'text-[var(--warn)]' : label}
        title={transport === 'socket' ? 'Live' : transport === 'polling' ? 'Slow mode: ink reaches students every few seconds' : 'Reconnecting'}
      >●</span>
      <button type="button" class="{tool} {toolOff}" onclick={toggleTheme} title="Light or dark board (this screen only)">{dark ? 'light' : 'dark'}</button>
      <button type="button" class="{tool} {toolOff}" onclick={toggleFullscreen} title="Full screen">{fullscreen ? 'exit full' : 'full screen'}</button>
      <a class="{tool} {toolOff}" href="/teach/live?run={run.id}" target="_blank" rel="noopener" title="The control panel, in a new tab">panel ↗</a>
    </header>

    <!-- the page (or the module, when no board is up) -->
    <main class="flex-1 min-h-0 flex items-center justify-center p-2 overflow-hidden">
      {#if page}
        <div style="width: min(100%, calc((100vh - 8.5rem) * 16 / 9))">
          {#key page.id}
            <Board
              {page}
              {ink}
              {color}
              {width}
              {eraser}
              onlive={sendInk}
              onadd={added}
              onerase={erased}
            />
          {/key}
        </div>
      {:else}
        <div class="w-full max-w-4xl max-h-full overflow-auto text-base space-y-3 p-4">
          <LiveModule module={current} pages={pages} livePage={rs.page} follow={false} />
        </div>
      {/if}
    </main>

    <!-- bottom bar: the pen, then the pages -->
    <footer class="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-[var(--line)]">
      {#if page}
        <div class="flex items-center gap-1" role="radiogroup" aria-label="Pen color">
          {#each INK_COLORS as name, k}
            <button
              type="button"
              role="radio"
              aria-checked={!eraser && color === k}
              aria-label={name}
              title={name}
              class="{tool} {!eraser && color === k ? 'border-[var(--accent)]' : 'border-transparent'}"
              onclick={() => ((color = k), (eraser = false))}
            >
              <span class="block w-6 h-6 rounded-full border border-[var(--line)]" style="background: var(--ink-{k})"></span>
            </button>
          {/each}
        </div>
        <div class="flex items-center gap-1" role="radiogroup" aria-label="Pen width">
          {#each INK_WIDTHS as px, k}
            <button
              type="button"
              role="radio"
              aria-checked={!eraser && width === k}
              aria-label="{['thin', 'medium', 'thick'][k]} pen"
              title="{['thin', 'medium', 'thick'][k]} pen"
              class="{tool} {!eraser && width === k ? toolOn : toolOff}"
              onclick={() => ((width = k), (eraser = false))}
            >
              <span class="block rounded-full" style="width: {px + 4}px; height: {px + 4}px; background: var(--ink-{color})"></span>
            </button>
          {/each}
        </div>
        <button type="button" class="{tool} {eraser ? toolOn : toolOff}" aria-pressed={eraser} onclick={() => (eraser = !eraser)} title="Eraser: touch a stroke to remove it">eraser</button>
        <button type="button" class="{tool} {toolOff}" onclick={undo} disabled={!undoSteps.length} title="Undo (Ctrl+Z)">undo</button>
        <button type="button" class="{tool} {toolOff}" onclick={clearPage} title="Clear this page (undo brings it back)">clear</button>
      {/if}

      <span class="flex-1"></span>

      {#if page}
        <button type="button" class="{tool} {toolOff}" onclick={backward} disabled={rs.page === 0} title="Previous page (Page Up)">&lt; page</button>
        <button type="button" class="{tool} {toolOff}" onclick={addBoard} title="A blank blackboard right after this page">+ blackboard</button>
        {#if !notes}
          <button type="button" class="{tool} {toolOff}" onclick={() => send({ type: 'board', on: false })} title="Show the {MODULE_TYPES[current.type].label.toLowerCase()} again">
            back to {current.title}
          </button>
        {/if}
      {:else}
        <button type="button" class="{tool} {toolOn}" onclick={openBoard} title="A scratch blackboard for this module">{pages.length ? 'board' : '+ board'}</button>
      {/if}
      {#if page && rs.page < pages.length - 1}
        <button type="button" class="{tool} {toolOn}" onclick={forward} title="Next page (Page Down)">next page &gt;</button>
      {:else if nextModule}
        <button type="button" class="{tool} {toolOn}" onclick={forward} title="On to the next module (Page Down)">next: {nextModule.title} -&gt;</button>
      {:else}
        <span class={label}>// last module: end the lesson from the control panel</span>
      {/if}
    </footer>
  {/if}
</div>
