<!-- src/components/teach/TeachHome.svelte -->
<!-- /teach: upcoming deliveries and the lesson library. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../lib/api.ts';
  import { clock12, mmss } from '../../lib/lesson/time.ts';
  import { btn, btnMain, heading, label, niceDate, panel, todayIso } from './ui.ts';

  type Summary = {
    id: string;
    title: string;
    topic: string;
    durationSec: number;
    archived: boolean;
    updatedAt: number;
    moduleCount: number;
    plannedSec: number;
    nextRunAt: number | null;
    archivePrompt: boolean;
  };
  type Run = {
    id: string;
    lessonId: string;
    lessonTitle: string;
    className: string;
    period: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
  };

  let lessons = $state<Summary[]>([]);
  let runs = $state<Run[]>([]);
  let loaded = $state(false);
  let error = $state('');
  let busy = $state(false);
  /** The lesson whose "archive?" prompt is open. */
  let prompting = $state<string | null>(null);

  const active = $derived(lessons.filter((l) => !l.archived));
  const archived = $derived(lessons.filter((l) => l.archived));

  onMount(async () => {
    try {
      const [l, r] = await Promise.all([
        api<{ lessons: Summary[] }>('/api/teach/lessons'),
        api<{ runs: Run[] }>('/api/teach/runs')
      ]);
      lessons = l.lessons;
      runs = r.runs;
      loaded = true;
    } catch (e) {
      error = (e as Error).message;
    }
  });

  async function newLesson() {
    error = '';
    busy = true;
    try {
      const { lesson } = await api<{ lesson: { id: string } }>('/api/teach/lessons', { body: {} });
      location.href = `/teach/lesson?id=${lesson.id}`;
    } catch (e) {
      error = (e as Error).message;
      busy = false;
    }
  }

  async function archive(l: Summary) {
    error = '';
    try {
      await api(`/api/teach/lessons/${l.id}`, { method: 'PATCH', body: { archived: true } });
      l.archived = true;
      l.archivePrompt = false;
      prompting = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function dismiss(l: Summary) {
    error = '';
    try {
      await api(`/api/teach/lessons/${l.id}`, { method: 'PATCH', body: { dismissArchivePrompt: true } });
      l.archivePrompt = false;
      prompting = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const edited = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
</script>

<div class="space-y-6 text-xs">
  {#if error}
    <p class="p-3 rounded border border-[var(--bad)] text-[var(--bad)]">{error}</p>
  {/if}

  <section class="{panel} space-y-3">
    <div class={heading}>// coming up</div>
    {#if !loaded}
      <p class={label}>loading...</p>
    {:else if runs.length === 0}
      <p class={label}>nothing scheduled. open a lesson and add a class under "when".</p>
    {:else}
      <ul class="divide-y divide-[var(--border-color)]">
        {#each runs as r (r.id)}
          <li class="py-2 flex flex-wrap gap-x-4 gap-y-1 items-baseline">
            <span class="w-28 shrink-0">{niceDate(r.date)}</span>
            <span class="w-36 shrink-0 {label}">{clock12(r.startTime)} - {clock12(r.endTime)}</span>
            <span class="w-40 shrink-0">{r.period} · {r.className}</span>
            <a href="/teach/lesson?id={r.lessonId}" class="font-bold text-sm hover:text-[var(--accent)]">{r.lessonTitle}</a>
            <span class="flex-1"></span>
            {#if r.status === 'live'}
              <a href="/teach/live?run={r.id}" class="{btnMain}">[LIVE: open control panel]</a>
            {:else if r.date === todayIso()}
              <a href="/teach/live?run={r.id}" class="{btnMain}">[start]</a>
            {:else}
              <a href="/teach/live?run={r.id}" class="hover:text-[var(--accent)] {label}">[start early]</a>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="space-y-3">
    <div class="flex justify-between items-center">
      <h2 class={heading}>// lessons</h2>
      <button type="button" class={btnMain} onclick={newLesson} disabled={busy}>[+ new lesson]</button>
    </div>

    {#if loaded && lessons.length === 0}
      <p class={label}>no lessons yet. start with [+ new lesson].</p>
    {/if}

    <ul class="grid gap-3 sm:grid-cols-2">
      {#each active as l (l.id)}
        <li class="relative">
          {#if l.archivePrompt}
            <!-- Outside the link (a button can't sit inside one), laid over the card's corner. -->
            <button
              type="button"
              class="absolute top-4 left-4 z-10 font-bold text-sm leading-tight text-[var(--warn)] hover:underline cursor-pointer"
              title="Every delivery of this lesson is over"
              aria-expanded={prompting === l.id}
              onclick={() => (prompting = prompting === l.id ? null : l.id)}
            >/!\</button>
          {/if}
          <a
            href="/teach/lesson?id={l.id}"
            class="block p-4 rounded-md border bg-[var(--bg-surface)] hover:border-[var(--accent)] transition-colors {prompting === l.id
              ? 'border-[var(--warn)] rounded-b-none'
              : 'border-[var(--line)]'}"
          >
            <div class="text-sm font-bold {l.archivePrompt ? 'pl-8' : ''}">{l.title}</div>
            {#if l.topic}<div>{l.topic}</div>{/if}
            <div class={label}>
              {l.moduleCount} module{l.moduleCount === 1 ? '' : 's'} · {mmss(l.plannedSec)} of {mmss(l.durationSec)} planned
            </div>
            <div class={label}>
              {l.nextRunAt
                ? `next: ${new Date(l.nextRunAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : `edited ${edited(l.updatedAt)}`}
            </div>
          </a>
          {#if prompting === l.id}
            <div class="p-3 space-y-2 rounded-b-md border border-t-0 border-[var(--warn)] bg-[var(--bg-surface)]">
              <p>// every scheduled delivery of this lesson is over. archive it? (you can restore it any time.)</p>
              <div class="flex gap-2">
                <button type="button" class={btnMain} onclick={() => archive(l)}>[archive]</button>
                <button type="button" class={btn} onclick={() => dismiss(l)}>[dismiss]</button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    {#if archived.length}
      <details>
        <summary class="cursor-pointer {label}">archived ({archived.length})</summary>
        <ul class="mt-2 space-y-1">
          {#each archived as l (l.id)}
            <li><a class="hover:text-[var(--accent)]" href="/teach/lesson?id={l.id}">{l.title}</a></li>
          {/each}
        </ul>
      </details>
    {/if}
  </section>

  <p class={label}>
    // rosters, class codes and alias cards are under <a class="underline hover:text-[var(--accent)]" href="/teach/classes">[classes]</a>.
  </p>
</div>
