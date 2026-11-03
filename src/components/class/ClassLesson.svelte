<!-- src/components/class/ClassLesson.svelte -->
<!-- /class/lesson?run=: a student looks back at a finished lesson. Every module in order, with its -->
<!-- pages and the teacher's ink (boards added in class too), and only this student's own answers -->
<!-- and marks. Nothing can be changed here. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../lib/api.ts';
  import type { Answers } from '../../lib/lesson/answers.ts';
  import { answerSpec, isAnswered } from '../../lib/lesson/answers.ts';
  import type { InkStore } from '../../lib/lesson/inkStore.svelte.ts';
  import type { Page, RoomModule } from '../../lib/lesson/room.ts';
  import LiveModule from '../live/LiveModule.svelte';
  import PersonalNote from '../live/PersonalNote.svelte';
  import { niceDate } from '../teach/ui.ts';

  type Lesson = {
    run: { id: string; title: string; date: string; startTime: string };
    resources: { label: string; url: string }[];
    modules: { module: RoomModule; pages: Page[] }[];
    ink: Record<string, any[]>;
    answers: Record<string, Answers>;
    marks: Record<string, Record<string, boolean | null>>;
    scores: Record<string, { best: number; plays: number }>;
    notes: Record<string, string>;
  };

  let lesson = $state<Lesson | null>(null);
  let error = $state('');
  let open = $state(0);
  let browsing = $state<string | null>(null);

  onMount(async () => {
    const runId = new URLSearchParams(location.search).get('run') ?? '';
    if (!runId) {
      error = 'No lesson picked.';
      return;
    }
    try {
      lesson = (await api<{ lesson: Lesson }>(`/api/class/lessons/${encodeURIComponent(runId)}`)).lesson;
    } catch (e) {
      const msg = (e as Error).message;
      error = /sign in/i.test(msg)
        ? 'Sign in to your class first.'
        : "That lesson isn't available. If it just ended, wait a moment and reload.";
    }
  });

  /* The saved ink, shaped like the live ink store that PageView reads. */
  const ink = $derived(
    lesson
      ? ({ want() {}, strokes: (id: string) => lesson!.ink[id] ?? [], drawing: () => [] } as unknown as InkStore)
      : null
  );

  const label = 'text-[var(--text-muted)]';
  const time = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };

  /** What the tab shows: ✓ handed in, a score, or nothing. */
  function badge(m: RoomModule): string {
    const score = lesson?.scores[m.id];
    if (score) return `best ${score.best}`;
    const spec = answerSpec(m);
    if (!spec) return lesson?.notes[m.id]?.trim() ? '✎' : '';
    return isAnswered(spec, lesson?.answers[m.id]) ? '✓' : '–';
  }

  function go(i: number) {
    if (!lesson || i < 0 || i >= lesson.modules.length) return;
    open = i;
    browsing = null;
    window.scrollTo({ top: 0 });
  }

  const current = $derived(lesson?.modules[open] ?? null);
</script>

{#if error}
  <div class="max-w-xl mx-auto p-6 rounded border border-[var(--line)] bg-[var(--bg-surface)] space-y-3 text-sm font-mono">
    <p>{error}</p>
    <a class="underline hover:text-[var(--accent)]" href="/class">&lt;- [class]</a>
  </div>
{:else if !lesson}
  <p class="{label} font-mono">loading the lesson...</p>
{:else}
  <div class="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] items-start font-mono">
    <aside class="space-y-4 lg:sticky lg:top-4">
      <a class="text-xs underline hover:text-[var(--accent)]" href="/class">&lt;- [my lessons]</a>
      <div>
        <h1 class="text-xl font-bold leading-tight">{lesson.run.title}</h1>
        <p class="text-xs {label}">{niceDate(lesson.run.date)} · {time(lesson.run.startTime)}</p>
      </div>
      <nav class="rounded-md border border-[var(--line)] bg-[var(--bg-surface)] p-2" aria-label="Parts of the lesson">
        <ol class="space-y-1 text-sm">
          {#each lesson.modules as { module }, i (module.id)}
            <li>
              <button
                type="button"
                class="w-full flex items-center gap-2 text-left px-2 py-1 rounded cursor-pointer {i === open
                  ? 'bg-[var(--accent)]/10 font-bold text-[var(--accent)]'
                  : 'hover:text-[var(--accent)]'}"
                aria-current={i === open ? 'step' : undefined}
                onclick={() => go(i)}
              >
                <span class="{label} w-5 text-right">{i + 1}.</span>
                <span class="flex-1 truncate">{module.title}</span>
                <span class="text-xs {badge(module) === '✓' ? 'text-[var(--ok)]' : label}">{badge(module)}</span>
              </button>
            </li>
          {/each}
        </ol>
      </nav>
      {#if lesson.resources.length}
        <section class="space-y-1 text-sm">
          <div class="text-xs font-bold uppercase tracking-wider {label}">// resources</div>
          <ul class="space-y-1">
            {#each lesson.resources as r}
              <li><a class="underline hover:text-[var(--accent)]" href={r.url} target="_blank" rel="noopener noreferrer">{r.label} ↗</a></li>
            {/each}
          </ul>
        </section>
      {/if}
    </aside>

    {#if current}
      <section class="space-y-4 min-w-0">
        <header class="flex flex-wrap items-baseline gap-3">
          <h2 class="text-lg font-bold">{current.module.title}</h2>
          {#if lesson.scores[current.module.id]}
            {@const s = lesson.scores[current.module.id]}
            <span class="text-sm {label}">// your best in class: {s.best} ({s.plays} {s.plays === 1 ? 'game' : 'games'})</span>
          {/if}
        </header>
        {#key current.module.id}
          <LiveModule
            module={current.module}
            pages={current.pages}
            livePage={0}
            isLive={false}
            follow={true}
            bind:browsing
            {ink}
            answers={lesson.answers[current.module.id] ?? {}}
            editable={false}
            marks={lesson.marks[current.module.id]}
          />
          <PersonalNote
            runId={lesson.run.id}
            moduleId={current.module.id}
            bind:text={() => lesson!.notes[current!.module.id] ?? '', (v) => (lesson!.notes[current!.module.id] = v)}
          />
        {/key}
        <div class="flex justify-between text-sm pt-2">
          <button type="button" class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-40" disabled={open === 0} onclick={() => go(open - 1)}>[&lt; back]</button>
          <button
            type="button"
            class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-40"
            disabled={open >= lesson.modules.length - 1}
            onclick={() => go(open + 1)}>[next &gt;]</button>
        </div>
      </section>
    {/if}
  </div>
{/if}
