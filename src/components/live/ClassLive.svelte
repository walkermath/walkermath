<!-- src/components/live/ClassLive.svelte -->
<!-- /class/live?run=  The student's lesson view (sketch 1): a sidebar with the module list and -->
<!-- both countdowns, Resources below it, and the current module beside it. Everything follows the -->
<!-- room: the teacher moves the lesson, the clock runs from the room's timestamps. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { MODULE_TYPES } from '../../lib/lesson/modules.ts';
  import { lessonLeftMs, moduleLeftMs, type RoomState } from '../../lib/lesson/room.ts';
  import { clockAt, connectLive, countdown, type LiveConnection, type LiveLesson, type Transport } from '../../lib/lesson/liveClient.ts';
  import LiveModule from './LiveModule.svelte';

  let runId = $state('');
  let lesson = $state<LiveLesson | null>(null);
  let rs = $state<RoomState | null>(null);
  let transport = $state<Transport>('connecting');
  let gone = $state<string | null>(null);
  let now = $state(Date.now());
  let showList = $state(true);
  let conn: LiveConnection | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    runId = new URLSearchParams(location.search).get('run') ?? '';
    if (!runId) {
      gone = 'No lesson picked. Go back to your class page and join from there.';
      return;
    }
    conn = connectLive(runId, {
      onLesson: (l) => (lesson = l),
      onState: (s) => (rs = s),
      onTransport: (t) => (transport = t),
      onGone: (status, message) =>
        (gone = status === 404 ? "This lesson isn't running for your class right now." : message)
    });
    timer = setInterval(() => (now = conn?.now() ?? Date.now()), 250);
  });
  onDestroy(() => {
    conn?.close();
    if (timer) clearInterval(timer);
  });

  const current = $derived(lesson && rs ? lesson.modules[rs.index] : null);
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
              <li
                class="flex items-center gap-2 px-2 py-1.5 rounded {i === rs.index
                  ? 'border-2 border-dashed border-[var(--accent)]'
                  : 'border-2 border-transparent'} {rs.done?.[i] && i !== rs.index ? label : ''}"
              >
                <span class="w-4 text-center" aria-hidden="true">{i === rs.index ? '>' : rs.done?.[i] ? '✓' : ''}</span>
                <span class="flex-1 truncate {i === rs.index ? 'font-bold' : ''}">{m.title}</span>
                {#if i === rs.index}
                  <span class="tabular-nums font-bold {modLeft < 0 ? 'text-[var(--bad)]' : ''}">{countdown(Math.max(modLeft, 0))}</span>
                {/if}
              </li>
            {/each}
          </ol>
        {:else if current}
          <div class="px-3 pb-3 flex justify-between text-xs">
            <span class="truncate font-bold">{current.title}</span>
            <span class="tabular-nums font-bold">{countdown(Math.max(modLeft, 0))}</span>
          </div>
        {/if}

        <div class="flex justify-between px-3 py-2 border-t border-[var(--line)] text-xs">
          <span class={label}>lesson ends {clockAt(rs.endsAt)}</span>
          <span class="tabular-nums">{countdown(Math.max(lessonLeft, 0))} left</span>
        </div>
      </section>

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

    <!-- the current module -->
    {#if current}
      <main class="space-y-4 min-w-0">
        <header class="flex flex-wrap justify-between items-end gap-3 pb-3 border-b border-[var(--line)]">
          <div>
            <h1 class="text-xl font-bold">{current.title}</h1>
            <div class="text-xs {label}">// {MODULE_TYPES[current.type].hint}</div>
          </div>
          <div class="text-2xl font-bold tabular-nums {modLeft < 0 ? 'text-[var(--bad)]' : ''}">{countdown(Math.max(modLeft, 0))}</div>
        </header>

        {#if rs.pausedAt}
          <p class="p-3 rounded border border-[var(--warn)] text-[var(--warn)] text-sm">// paused by your teacher.</p>
        {:else if rs.holding}
          <p class="p-3 rounded border border-[var(--accent)] text-[var(--accent)] text-sm">// time's up. wait for your teacher.</p>
        {/if}

        <LiveModule module={current} livePage={rs.page} />
      </main>
    {/if}
  </div>
{/if}
