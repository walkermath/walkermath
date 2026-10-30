<!-- src/components/live/TeachLive.svelte -->
<!-- /teach/live?run=  The control panel: the current module large with its countdown and the -->
<!-- controls (-1 / +1 min, pause, back, next, Notes pages), the re-planned rest of the lesson with -->
<!-- clock times, who's connected, and [end]. The room keeps the clock; this screen only asks it. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { api } from '../../lib/api.ts';
  import { MODULE_TYPES, type LessonModule } from '../../lib/lesson/modules.ts';
  import { lessonLeftMs, moduleEndsAt, moduleLeftMs, moduleStarts, type Command, type RoomState } from '../../lib/lesson/room.ts';
  import { mmss } from '../../lib/lesson/time.ts';
  import {
    clockAt,
    connectLive,
    countdown,
    type LiveConnection,
    type LiveLesson,
    type RosterRow,
    type Transport
  } from '../../lib/lesson/liveClient.ts';
  import { btn, btnDanger, btnMain, heading, label, panel } from '../teach/ui.ts';
  import LiveModule from './LiveModule.svelte';

  type Run = {
    id: string;
    lessonId: string;
    lessonTitle: string;
    className: string;
    period: string;
    status: 'scheduled' | 'live' | 'ended';
    scheduledStart: number;
    scheduledEnd: number;
  };

  let run = $state<Run | null>(null);
  /** The lesson as you wrote it (for your private notes and answer keys); the room only has the public part. */
  let mine = $state<LessonModule[]>([]);
  let lesson = $state<LiveLesson | null>(null);
  let rs = $state<RoomState | null>(null);
  let students = $state<RosterRow[]>([]);
  let transport = $state<Transport>('connecting');
  let error = $state('');
  let busy = $state(false);
  let now = $state(Date.now());
  let conn: LiveConnection | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    const id = new URLSearchParams(location.search).get('run');
    if (!id) {
      error = 'No delivery picked. Start one from [lessons].';
      return;
    }
    try {
      run = (await api<{ run: Run }>(`/api/teach/runs/${id}`)).run;
      api<{ lesson: { modules: LessonModule[] } }>(`/api/teach/lessons/${run.lessonId}`)
        .then((r) => (mine = r.lesson.modules))
        .catch(() => {}); // the panel works without your notes
      if (run.status === 'live') connect();
    } catch (e) {
      error = (e as Error).message;
    }
    timer = setInterval(() => (now = conn?.now() ?? Date.now()), 250);
  });
  onDestroy(() => {
    conn?.close();
    if (timer) clearInterval(timer);
  });

  function connect() {
    if (!run) return;
    conn?.close();
    conn = connectLive(run.id, {
      onLesson: (l) => (lesson = l),
      onState: (s) => {
        rs = s;
        if (s.status === 'ended' && run) run.status = 'ended';
      },
      onRoster: (r) => (students = r),
      onTransport: (t) => (transport = t),
      onGone: (_status, message) => (error = message)
    });
  }

  async function start() {
    if (!run) return;
    busy = true;
    error = '';
    try {
      await api(`/api/teach/runs/${run.id}/start`, { body: {} });
      run.status = 'live';
      connect();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  async function send(cmd: Command) {
    error = '';
    try {
      await conn?.send(cmd);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function end() {
    if (!run || !confirm('End the lesson for everyone?')) return;
    busy = true;
    try {
      await api(`/api/teach/runs/${run.id}/end`, { body: {} });
      run.status = 'ended';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  const current = $derived(lesson && rs ? lesson.modules[rs.index] : null);
  const mineCurrent = $derived(current ? mine.find((m) => m.id === current.id) : undefined);
  const isLast = $derived(!!lesson && !!rs && rs.index === lesson.modules.length - 1);
  const modLeft = $derived(rs ? moduleLeftMs(rs, now) : 0);
  const starts = $derived(rs ? moduleStarts(rs, now) : []);
  const plannedEnd = $derived(rs && lesson ? (starts[lesson.modules.length - 1] ?? 0) + (rs.plan.at(-1) ?? 0) * 1000 : 0);
  const pageCount = $derived(current?.type === 'notes' ? (current.config.slides ?? []).length : 0);

  // Keyboard: right / left arrow = next / back (ignored while typing anywhere).
  function keys(e: KeyboardEvent) {
    if (!rs || rs.status !== 'live' || (e.target as HTMLElement)?.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight' && e.shiftKey) send({ type: 'next' });
    else if (e.key === 'ArrowLeft' && e.shiftKey) send({ type: 'back' });
    else if (e.key === 'ArrowRight' && current?.type === 'notes' && rs.page < pageCount - 1) send({ type: 'page', page: rs.page + 1 });
    else if (e.key === 'ArrowLeft' && current?.type === 'notes' && rs.page > 0) send({ type: 'page', page: rs.page - 1 });
  }
</script>

<svelte:window onkeydown={keys} />

<div class="space-y-4 text-xs">
  {#if error}
    <p class="p-3 rounded border border-[var(--bad)] text-[var(--bad)]">{error}</p>
  {/if}

  {#if !run}
    {#if !error}<p class={label}>loading...</p>{/if}
  {:else if run.status === 'scheduled'}
    <section class="{panel} max-w-xl space-y-3">
      <div class={heading}>// ready to start</div>
      <div class="text-lg font-bold">{run.lessonTitle}</div>
      <div>{run.period} · {run.className}</div>
      <div class={label}>
        scheduled {clockAt(run.scheduledStart)} - {clockAt(run.scheduledEnd)} (the bell). starting now fits the lesson to the time left
        before the bell.
      </div>
      <button type="button" class={btnMain} onclick={start} disabled={busy}>[start lesson now]</button>
    </section>
  {:else if run.status === 'ended' && !lesson}
    <section class="{panel} max-w-xl space-y-2">
      <div class="text-lg font-bold">{run.lessonTitle}</div>
      <p>// this delivery has ended.</p>
      <a class="underline hover:text-[var(--accent)]" href="/teach">&lt;- [lessons]</a>
    </section>
  {:else if !lesson || !rs}
    <p class={label}>connecting to the room...</p>
  {:else}
    <div class="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <div class="text-lg font-bold">{lesson.title}</div>
        <div class={label}>
          {run.period} · {run.className} · bell {clockAt(rs.endsAt)} ({countdown(Math.max(lessonLeftMs(rs, now), 0))} left)
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class={transport === 'socket' ? 'text-[var(--ok)]' : transport === 'offline' ? 'text-[var(--warn)]' : label}>
          ● {transport === 'socket' ? 'live' : transport === 'polling' ? 'live (slow mode)' : transport}
        </span>
        {#if rs.status === 'live'}
          <button type="button" class={btnDanger} onclick={end} disabled={busy}>[end lesson]</button>
        {/if}
      </div>
    </div>

    {#if rs.status === 'ended'}
      <section class="{panel} space-y-2">
        <p class="text-sm">// the lesson has ended. students see "the lesson is over".</p>
        <a class="underline hover:text-[var(--accent)]" href="/teach">&lt;- [lessons]</a>
      </section>
    {:else}
      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] items-start">
        <div class="space-y-4 min-w-0">
          <!-- the current module -->
          {#if current}
            <section class="{panel} space-y-4">
              <div class="flex flex-wrap justify-between items-start gap-3">
                <div>
                  <div class={heading}>// module {rs.index + 1} of {lesson.modules.length} · {MODULE_TYPES[current.type].label}</div>
                  <div class="text-xl font-bold mt-1">{current.title}</div>
                </div>
                <div class="text-right">
                  <div class="text-5xl font-bold tabular-nums leading-none {modLeft < 0 ? 'text-[var(--bad)]' : ''}">{countdown(modLeft)}</div>
                  <div class="mt-1 {rs.pausedAt ? 'text-[var(--warn)]' : rs.holding ? 'text-[var(--accent)]' : label}">
                    {rs.pausedAt
                      ? 'paused'
                      : rs.holding
                        ? isLast
                          ? "last module: [end lesson] when you're done"
                          : "time's up: waiting for you"
                        : `ends ${clockAt(moduleEndsAt(rs))}${current.onTimeUp === 'hold' ? ', then waits' : ', then moves on'}`}
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <button type="button" class={btn} onclick={() => send({ type: 'back' })} disabled={rs.index === 0} title="Shift + left arrow">[&lt;- back]</button>
                <button type="button" class={btn} onclick={() => send({ type: 'adjust', seconds: -60 })}>[-1 min]</button>
                <button type="button" class={btn} onclick={() => send({ type: 'adjust', seconds: 60 })}>[+1 min]</button>
                {#if rs.pausedAt}
                  <button type="button" class={btnMain} onclick={() => send({ type: 'resume' })}>[resume]</button>
                {:else}
                  <button type="button" class={btn} onclick={() => send({ type: 'pause' })} disabled={rs.holding}>[pause]</button>
                {/if}
                {#if isLast}
                  <button type="button" class={btnMain} onclick={end} disabled={busy}>[end lesson]</button>
                {:else}
                  <button type="button" class={btnMain} onclick={() => send({ type: 'next' })} title="Shift + right arrow">[next: {lesson.modules[rs.index + 1].title} -&gt;]</button>
                {/if}
              </div>

              {#if current.type === 'notes' && pageCount > 0}
                <div class="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--line)]">
                  <button type="button" class={btn} onclick={() => send({ type: 'page', page: (rs?.page ?? 0) - 1 })} disabled={rs.page === 0}>[&lt; page]</button>
                  <span>page {rs.page + 1} of {pageCount}</span>
                  <button type="button" class={btn} onclick={() => send({ type: 'page', page: (rs?.page ?? 0) + 1 })} disabled={rs.page >= pageCount - 1}>[page &gt;]</button>
                  <span class={label}>// left / right arrow keys turn pages</span>
                </div>
              {/if}
            </section>

            {#if mineCurrent?.teacherNotes}
              <section class="{panel} space-y-1">
                <div class={heading}>// your notes</div>
                <p class="whitespace-pre-wrap text-sm">{mineCurrent.teacherNotes}</p>
              </section>
            {/if}
            {#if mineCurrent?.type === 'prompt' && (mineCurrent.config as any).questions.some((q: any) => q.answer)}
              <section class="{panel} space-y-1">
                <div class={heading}>// answer key</div>
                <ol class="list-decimal pl-5 space-y-0.5 text-sm">
                  {#each (mineCurrent.config as any).questions as q}
                    <li>{q.kind === 'choice' && q.answer !== '' ? `${String.fromCharCode(65 + Number(q.answer))}. ${q.choices[Number(q.answer)] ?? ''}` : q.answer || '-'}</li>
                  {/each}
                </ol>
              </section>
            {/if}

            <section class="{panel} space-y-2">
              <div class={heading}>// what students see</div>
              <LiveModule module={current} livePage={rs.page} follow={false} />
            </section>
          {/if}
        </div>

        <!-- the rest of the lesson, and who's here -->
        <aside class="space-y-4">
          <section class="{panel} space-y-2">
            <div class={heading}>// the lesson</div>
            <ol class="space-y-1">
              {#each lesson.modules as m, i (m.id)}
                <li class="flex items-center gap-2 px-2 py-1 rounded {i === rs.index ? 'border border-[var(--accent)]' : ''} {i < rs.index ? label : ''}">
                  <span class="w-14 tabular-nums {label}">{clockAt(starts[i])}</span>
                  <span class="flex-1 truncate">{m.title}</span>
                  <span class="tabular-nums {i > rs.index && rs.plan[i] !== m.plannedSec ? 'text-[var(--accent)]' : ''}" title={i > rs.index ? `planned ${mmss(m.plannedSec)}` : ''}>
                    {mmss(rs.plan[i])}
                  </span>
                  {#if m.pacing === 'locked'}<span class={label} title="Locked: keeps its time">L</span>{/if}
                  {#if i > rs.index}
                    <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={() => confirm(`Jump to "${m.title}" now?`) && send({ type: 'jump', index: i })} title="Jump here">[go]</button>
                  {/if}
                </li>
              {/each}
            </ol>
            <div class="pt-2 border-t border-[var(--line)] space-y-1">
              <div class={label}>finishes {clockAt(plannedEnd)} · bell {clockAt(rs.endsAt)}</div>
              {#if rs.overSec > 0}
                <div class="text-[var(--warn)]">// {mmss(rs.overSec)} over: skip a module ([go]) or shorten one.</div>
              {:else if rs.spareSec > 0}
                <div class="text-[var(--accent)]">// {mmss(rs.spareSec)} spare: +1 min where you want it.</div>
              {/if}
            </div>
          </section>

          <section class="{panel} space-y-2">
            <div class={heading}>// here now ({students.length})</div>
            {#if students.length === 0}
              <p class={label}>no students connected yet. they join from /class.</p>
            {:else}
              <ul class="flex flex-wrap gap-1">
                {#each students as s (s.aliasId)}
                  <li class="px-1.5 py-0.5 rounded border border-[var(--line)]" title="{s.devices} device{s.devices === 1 ? '' : 's'}">
                    <span class="text-[var(--ok)]">●</span> {s.alias}
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        </aside>
      </div>
    {/if}
  {/if}
</div>
