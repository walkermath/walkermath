<!-- src/components/live/ClassLive.svelte -->
<!-- /class/live?run=  The student's lesson view (sketch 1): a sidebar with the module list and -->
<!-- both countdowns, Resources below it, and the current module beside it. The room keeps the -->
<!-- clock; students follow the teacher's module but can open any module the class has reached. -->
<!-- Answers save as the student types (a pause, a choice picked, a field left), and once more the -->
<!-- moment the module closes; the server refuses changes after that (a few seconds' grace). -->
<!-- The teacher's ink shows on every page; a student reading anything other than the teacher's -->
<!-- page (or board) gets a small live view of it in the corner, which takes them back. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { MODULE_TYPES } from '../../lib/lesson/modules.ts';
  import { ANSWER_GRACE_MS, lessonLeftMs, livePage, moduleLeftMs, pagesOf, type RoomState } from '../../lib/lesson/room.ts';
  import { InkStore, inkHandlers } from '../../lib/lesson/inkStore.svelte.ts';
  import { answerSpec, isAnswered, type Answers } from '../../lib/lesson/answers.ts';
  import { clockAt, connectLive, countdown, type LiveConnection, type LiveLesson, type Transport } from '../../lib/lesson/liveClient.ts';
  import LiveModule, { type SaveState } from './LiveModule.svelte';
  import PageView from './PageView.svelte';
  import PersonalNote from './PersonalNote.svelte';

  let runId = $state('');
  let lesson = $state<LiveLesson | null>(null);
  let rs = $state<RoomState | null>(null);
  let transport = $state<Transport>('connecting');
  let gone = $state<string | null>(null);
  let now = $state(Date.now());
  let showList = $state(true);
  let conn: LiveConnection | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const ink = new InkStore();

  onMount(() => {
    runId = new URLSearchParams(location.search).get('run') ?? '';
    if (!runId) {
      gone = 'No lesson picked. Go back to your class page and join from there.';
      return;
    }
    conn = connectLive(runId, {
      onLesson: (l) => (lesson = l),
      onState: (s) => (rs = s),
      onTransport: (t) => {
        if (t === 'socket' && transport !== 'socket') ink.resync(); // changes may have been missed
        transport = t;
      },
      onHand: (on) => (hand = on),
      onGone: (status, message) =>
        (gone = status === 404 ? "This lesson isn't running for your class right now." : message),
      ...inkHandlers(ink)
    });
    ink.fetcher = (ids) => conn?.inkGet(ids);
    timer = setInterval(() => (now = conn?.now() ?? Date.now()), 250);
    loadMine();
    loadNotes();
    addEventListener('beforeunload', warnUnsaved);
    document.addEventListener('visibilitychange', flushIfHidden);
  });
  onDestroy(() => {
    conn?.close();
    if (timer) clearInterval(timer);
    for (const t of timers.values()) clearTimeout(t);
    if (typeof window !== 'undefined') {
      removeEventListener('beforeunload', warnUnsaved);
      document.removeEventListener('visibilitychange', flushIfHidden);
    }
  });

  /* ---------------- "I'm stuck" ---------------- */

  let hand = $state(false);
  let handBusy = $state(false);
  async function toggleHand() {
    handBusy = true;
    try {
      await conn?.hand(!hand);
    } catch {
      // the button stays as it was; they can tap again
    } finally {
      handBusy = false;
    }
  }

  /* ---------------- personal notes ---------------- */

  let notes = $state<Record<string, string>>({});
  async function loadNotes() {
    try {
      const res = await fetch(`/api/class/notes?run=${encodeURIComponent(runId)}`, { credentials: 'same-origin', cache: 'no-store' });
      if (res.ok) notes = (await res.json()).notes ?? {};
    } catch {
      // notes are a convenience; the lesson goes on without them
    }
  }

  /* ---------------- answers ---------------- */

  /** The student's answers, by module id (what's on screen; may be ahead of what's saved). */
  let mine = $state<Record<string, Answers>>({});
  /** Right / wrong per question for modules that have closed (sent by the server only after they close). */
  let marks = $state<Record<string, Record<string, boolean | null>>>({});
  let saves = $state<Record<string, SaveState>>({});
  const dirty = new Set<string>(); // changed since the last save started
  const inflight = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const TYPING_PAUSE_MS = 2000;
  const RETRY_MS = 4000;

  async function loadMine() {
    try {
      const res = await fetch(`/api/class/answers?run=${encodeURIComponent(runId)}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const next = { ...mine };
      for (const [id, v] of Object.entries<any>(data.answers ?? {})) if (!dirty.has(id) && !inflight.has(id)) next[id] = v.answers ?? {};
      mine = next;
      marks = data.marks ?? {};
    } catch {
      // offline: what's on screen stays; saving retries
    }
  }

  function edit(moduleId: string, answers: Answers, flush: boolean) {
    mine[moduleId] = answers;
    dirty.add(moduleId);
    saves[moduleId] = 'pending';
    schedule(moduleId, flush ? 0 : TYPING_PAUSE_MS);
  }

  function schedule(id: string, ms: number) {
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => save(id), ms));
  }

  async function save(id: string) {
    timers.delete(id);
    if (!dirty.has(id)) return;
    if (inflight.has(id)) return schedule(id, 400); // one save at a time per module, in order
    dirty.delete(id);
    inflight.add(id);
    saves[id] = 'saving';
    try {
      const res = await fetch('/api/class/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true, // finishes even if the page is closing
        body: JSON.stringify({ runId, moduleId: id, answers: $state.snapshot(mine[id] ?? {}) })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        saves[id] = dirty.has(id) ? 'pending' : 'saved';
      } else if (data.closed) {
        // Too late: show what was actually handed in.
        dirty.delete(id);
        saves[id] = 'closed';
        inflight.delete(id);
        await loadMine();
      } else if (res.status >= 500 || res.status === 429) {
        dirty.add(id);
        saves[id] = 'error';
        schedule(id, RETRY_MS);
      } else {
        saves[id] = 'error'; // refused (too long, signed out...): keep it on screen, don't loop
      }
    } catch {
      dirty.add(id);
      saves[id] = 'error';
      schedule(id, RETRY_MS);
    } finally {
      inflight.delete(id);
    }
  }

  const flushAll = () => {
    for (const id of [...dirty]) schedule(id, 0);
  };
  const flushIfHidden = () => document.visibilityState === 'hidden' && flushAll();
  const warnUnsaved = (e: BeforeUnloadEvent) => {
    if (dirty.size || inflight.size) {
      flushAll();
      e.preventDefault();
    }
  };

  // The moment the teacher moves on (or time runs out), send whatever is still waiting. Coming back
  // to a module that still has time reopens it.
  let lastKey = '';
  $effect(() => {
    const key = rs ? `${rs.index}:${rs.holding}:${rs.status}` : '';
    if (key === lastKey) return;
    lastKey = key;
    flushAll();
    // Once a module closes (and the last keystrokes have landed), fetch how the answers were marked.
    setTimeout(loadMine, ANSWER_GRACE_MS + 500);
    const liveId = rs && lesson?.modules[rs.index]?.id;
    if (liveId && rs && !rs.holding && saves[liveId] === 'closed') saves[liveId] = '';
  });

  /* Students aren't dragged along: the teacher's module is highlighted ("live"), but a student can open
     any module the class has reached and read it, then return with [go to live]. null = following. */
  let viewing = $state<number | null>(null);
  const live = $derived(lesson && rs ? lesson.modules[rs.index] : null);
  const shownIndex = $derived(rs ? (viewing ?? rs.index) : 0);
  const onLive = $derived(!!rs && shownIndex === rs.index);
  const current = $derived(lesson ? lesson.modules[shownIndex] : null);
  /** Modules the class has reached (including ones left or skipped past); later ones stay closed. */
  const reachable = (i: number) => !!rs && (i <= rs.index || !!rs.done?.[i] || (rs.took?.[i] ?? 0) > 0);
  const open = (i: number) => {
    if (!rs || !reachable(i)) return;
    viewing = i === rs.index ? null : i;
  };
  // When the teacher moves to the module a student is already reading, they're back on live.
  $effect(() => {
    if (rs && viewing === rs.index) viewing = null;
  });

  /* Pages: the page (or board) a student flipped to, by id; null = the teacher's page (Notes) or the module itself. */
  let browsing = $state<string | null>(null);
  let browsingIn = -1;
  $effect(() => {
    // Opening another module starts on its own page.
    if (shownIndex !== browsingIn) {
      browsingIn = shownIndex;
      browsing = null;
    }
  });
  const shownPages = $derived(lesson && rs ? pagesOf(rs, lesson.modules, shownIndex) : []);
  /** The teacher's page right now (a Notes page, or another module's board), or null. */
  const teacherPage = $derived(lesson && rs ? livePage(rs, lesson.modules) : null);
  /** The student is looking at something other than the teacher's page: show it small in the corner. */
  const pip = $derived.by(() => {
    if (!teacherPage || !rs || !lesson) return null;
    if (!onLive) return teacherPage;
    const notes = lesson.modules[rs.index]?.type === 'notes';
    const onIt = notes ? browsing === null || browsing === teacherPage.id : browsing === teacherPage.id;
    return onIt ? null : teacherPage;
  });
  function goLive() {
    if (!rs || !lesson || !teacherPage) return;
    viewing = null;
    browsingIn = rs.index;
    browsing = lesson.modules[rs.index]?.type === 'notes' ? null : teacherPage.id;
  }
  /** The student can change their answers to module i: it's the live module and its time hasn't run out. */
  const editable = (i: number) => !!rs && rs.status === 'live' && i === rs.index && !rs.holding;

  /** The module has been running and has closed (moved on from, or its time ran out). Skipped ones never ran. */
  const closed = (i: number) =>
    !!rs && (i === rs.index ? rs.holding : (rs.took?.[i] ?? 0) > 0 || !!rs.done?.[i]);

  /** The sidebar mark: > live, ✓ handed in (or done), ✗ closed with nothing handed in. */
  function mark(i: number): { sym: string; cls: string; title: string } {
    if (!rs || !lesson) return { sym: '', cls: '', title: '' };
    const m = lesson.modules[i];
    const spec = answerSpec(m);
    if (i === rs.index && !rs.holding) return { sym: '>', cls: '', title: 'Your class is here' };
    if (spec) {
      const handed = isAnswered(spec, mine[m.id]);
      if (handed) return { sym: '✓', cls: 'text-[var(--ok)]', title: spec.kind === 'tap' ? 'You tapped done' : 'Handed in' };
      if (spec.kind !== 'tap' && closed(i)) return { sym: '✗', cls: 'text-[var(--bad)]', title: 'Closed before you answered' };
    }
    if (i === rs.index) return { sym: '>', cls: '', title: 'Your class is here' };
    if (closed(i)) return { sym: '✓', cls: '', title: 'Finished' };
    return { sym: '', cls: '', title: '' };
  }

  const modLeft = $derived(rs ? moduleLeftMs(rs, now) : 0);
  const lessonLeft = $derived(rs ? lessonLeftMs(rs, now) : 0);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const label = 'text-[var(--text-muted)]';
</script>

{#if gone && !(rs?.status === 'ended')}
  <div class="max-w-xl mx-auto p-6 rounded border border-[var(--line)] bg-[var(--bg-surface)] space-y-3 text-sm">
    <p>{gone}</p>
    <a class="underline hover:text-[var(--accent)]" href="/class">&lt;- [class]</a>
  </div>
{:else if !lesson || !rs}
  <p class={label}>joining the lesson...</p>
{:else if rs.status === 'ended'}
  <div class="max-w-xl mx-auto p-6 rounded border border-[var(--line)] bg-[var(--bg-surface)] space-y-3 text-sm">
    <div class="text-lg font-bold">{lesson.title}</div>
    <p>// the lesson is over. nice work.</p>
    <p>
      <a class="underline hover:text-[var(--accent)]" href="/class/lesson?run={encodeURIComponent(runId)}">[look back at this lesson]</a>
      <span class={label}>// the notes, the boards and your answers (ready a moment after it ends)</span>
    </p>
    <a class="underline hover:text-[var(--accent)]" href="/class">&lt;- [class]</a>
  </div>
{:else}
  <div class="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] items-start">
    <!-- sidebar -->
    <aside class="space-y-4 lg:sticky lg:top-4">
      <section class="rounded-md border border-[var(--line)] bg-[var(--bg-surface)]">
        <button
          type="button"
          class="w-full flex justify-between items-start gap-2 p-3 text-left cursor-pointer"
          onclick={() => (showList = !showList)}
          aria-expanded={showList}
        >
          <span>
            <span class="block font-bold text-sm leading-tight">{lesson.title}</span>
            <span class="text-xs {label}">{today}</span>
          </span>
          <span class={label} aria-hidden="true">{showList ? 'v' : '>'}</span>
        </button>

        {#if showList}
          <ol class="px-3 pb-3 space-y-1 text-xs">
            {#each lesson.modules as m, i (m.id)}
              {@const mk = mark(i)}
              <li>
                <button
                  type="button"
                  class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left {i === rs.index
                    ? 'border-2 border-dashed border-[var(--accent)]'
                    : i === shownIndex
                      ? 'border-2 border-solid border-[var(--line)] bg-[var(--bg-hover,transparent)]'
                      : 'border-2 border-transparent'} {reachable(i) ? 'cursor-pointer hover:text-[var(--accent)]' : 'cursor-default opacity-60'} {rs.done?.[i] && i !== rs.index ? label : ''}"
                  disabled={!reachable(i)}
                  aria-current={i === shownIndex ? 'true' : undefined}
                  title={reachable(i) ? (i === rs.index ? 'Your class is here' : 'Open this module') : 'Not reached yet'}
                  onclick={() => open(i)}
                >
                  <span class="w-4 text-center {mk.cls}" title={mk.title} aria-label={mk.title || undefined}>{mk.sym}</span>
                  <span class="flex-1 truncate {i === rs.index ? 'font-bold' : ''}">{m.title}</span>
                  {#if i === rs.index}
                    <span class="tabular-nums font-bold {modLeft < 0 ? 'text-[var(--bad)]' : ''}">{countdown(Math.max(modLeft, 0))}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ol>
        {:else if live}
          <!-- collapsed: where the teacher is, lit up when the student is reading something else; click to go there -->
          <div class="px-3 pb-3">
            <button
              type="button"
              class="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs text-left cursor-pointer {onLive
                ? 'border-2 border-dashed border-[var(--accent)]'
                : 'border-2 border-solid border-[var(--accent)] bg-[var(--accent)]/10 font-bold'}"
              title={onLive ? 'Your class is here' : 'Go to where your class is'}
              onclick={() => open(rs.index)}
            >
              <span class="truncate">{onLive ? '>' : '↩'} {live.title}</span>
              <span class="tabular-nums font-bold {modLeft < 0 ? 'text-[var(--bad)]' : ''}">{countdown(Math.max(modLeft, 0))}</span>
            </button>
          </div>
        {/if}

        <div class="flex justify-between px-3 py-2 border-t border-[var(--line)] text-xs">
          <span class={label}>lesson ends {clockAt(rs.endsAt)}</span>
          <span class="tabular-nums">{countdown(Math.max(lessonLeft, 0))} left</span>
        </div>
      </section>

      <button
        type="button"
        class="w-full px-3 py-2 rounded-md border-2 text-sm font-bold cursor-pointer disabled:opacity-60 {hand
          ? 'border-[var(--warn)] text-[var(--warn)] bg-[var(--warn)]/10'
          : 'border-[var(--line)] hover:border-[var(--accent)] hover:text-[var(--accent)]'}"
        aria-pressed={hand}
        disabled={handBusy}
        onclick={toggleHand}
      >
        {hand ? "✋ your teacher knows you're stuck · tap to put it down" : "[✋ I'm stuck]"}
      </button>

      {#if lesson.resources.length}
        <details class="rounded-md border border-[var(--line)] bg-[var(--bg-surface)] text-xs">
          <summary class="p-3 cursor-pointer font-bold">resources / extra</summary>
          <ul class="px-3 pb-3 space-y-1">
            {#each lesson.resources as link}
              <li><a class="underline hover:text-[var(--accent)]" href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a></li>
            {/each}
          </ul>
        </details>
      {/if}

      {#if transport !== 'socket'}
        <p class="text-xs {transport === 'offline' ? 'text-[var(--warn)]' : label}">
          {transport === 'offline' ? '// reconnecting...' : transport === 'polling' ? '// connected (slow mode)' : '// connecting...'}
        </p>
      {/if}
    </aside>

    <!-- the module being read (the teacher's, unless the student opened another) -->
    {#if current}
      <main class="space-y-4 min-w-0">
        {#if !onLive && live}
          <div class="flex flex-wrap items-center justify-between gap-2 p-3 rounded border border-[var(--accent)] text-sm">
            <span>// your class is on <b>{live.title}</b>. you're reading something else.</span>
            <button type="button" class="font-bold text-[var(--accent)] cursor-pointer" onclick={() => (viewing = null)}>[go to live]</button>
          </div>
        {/if}

        <header class="flex flex-wrap justify-between items-end gap-3 pb-3 border-b border-[var(--line)]">
          <div>
            <h1 class="text-xl font-bold">{current.title}</h1>
            <div class="text-xs {label}">// {MODULE_TYPES[current.type].hint}</div>
          </div>
          {#if onLive}
            <div class="text-2xl font-bold tabular-nums {modLeft < 0 ? 'text-[var(--bad)]' : ''}">{countdown(Math.max(modLeft, 0))}</div>
          {:else}
            <div class="text-xs {label}">{rs.done?.[shownIndex] ? 'time ran out' : 'not live'}</div>
          {/if}
        </header>

        {#if onLive}
          {#if rs.pausedAt}
            <p class="p-3 rounded border border-[var(--warn)] text-[var(--warn)] text-sm">// paused by your teacher.</p>
          {:else if rs.holding}
            <p class="p-3 rounded border border-[var(--accent)] text-[var(--accent)] text-sm">// time's up. wait for your teacher.</p>
          {/if}
        {/if}

        {#key current.id}
          <LiveModule
            module={current}
            pages={shownPages}
            livePage={onLive ? rs.page : (rs.pages?.[shownIndex] ?? 0)}
            isLive={onLive}
            boardUp={onLive && rs.onBoard}
            bind:browsing
            {ink}
            {runId}
            answers={mine[current.id] ?? {}}
            marks={editable(shownIndex) ? undefined : marks[current.id]}
            editable={editable(shownIndex)}
            saveState={saves[current.id] ?? ''}
            onanswer={(a, flush) => current && edit(current.id, a, flush)}
          />
          <PersonalNote {runId} moduleId={current.id} bind:text={() => notes[current!.id] ?? '', (v) => (notes[current!.id] = v)} />
        {/key}
      </main>
    {/if}
  </div>

  {#if pip}
    <!-- The teacher's board, live, while the student reads something else. Tap to go there. -->
    <button
      type="button"
      class="fixed bottom-4 right-4 z-20 w-56 sm:w-64 p-1.5 rounded-md border-2 border-[var(--accent)] bg-[var(--bg-surface)] shadow-lg text-left cursor-pointer"
      onclick={goLive}
      title="Go to your teacher's board"
    >
      <div class="pointer-events-none"><PageView page={pip} {ink} /></div>
      <div class="mt-1 text-xs font-bold text-[var(--accent)]">● live board · tap to go there</div>
    </button>
  {/if}
{/if}
