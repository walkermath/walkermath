<!-- src/components/teach/LibraryView.svelte -->
<!-- /teach/library: lessons other teachers shared. Look inside one, then copy it into your own -->
<!-- lessons (answer keys and teacher notes come with it). Students never see the library. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../lib/api.ts';
  import { gridText } from '../../lib/lesson/grid.ts';
  import { sortText } from '../../lib/lesson/sort.ts';
  import { MODULE_TYPES } from '../../lib/lesson/modules.ts';
  import { mmss } from '../../lib/lesson/time.ts';
  import { btn, btnMain, field, heading, label, panel } from './ui.ts';

  type Entry = {
    id: string;
    lessonId: string | null;
    title: string;
    topic: string;
    standards: string;
    moduleCount: number;
    durationSec: number;
    author: string;
    mine: boolean;
    copies: number;
    updatedAt: number;
  };

  let entries = $state<Entry[]>([]);
  let loaded = $state(false);
  let error = $state('');
  let search = $state('');
  let opened = $state<string | null>(null);
  let preview = $state<Record<string, any>>({});
  let busy = $state(false);

  onMount(async () => {
    try {
      entries = (await api<{ entries: Entry[] }>('/api/teach/library')).entries;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loaded = true;
    }
  });

  const shown = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => `${e.title} ${e.topic} ${e.standards} ${e.author}`.toLowerCase().includes(q));
  });

  async function toggle(e: Entry) {
    opened = opened === e.id ? null : e.id;
    if (opened && !preview[e.id]) {
      try {
        preview[e.id] = (await api<{ lesson: any }>(`/api/teach/library/${e.id}`)).lesson;
      } catch (err) {
        error = (err as Error).message;
      }
    }
  }

  async function copy(e: Entry) {
    busy = true;
    error = '';
    try {
      const { lesson } = await api<{ lesson: { id: string } }>(`/api/teach/library/${e.id}/copy`, { body: {} });
      location.href = `/teach/lesson?id=${lesson.id}`;
    } catch (err) {
      error = (err as Error).message;
      busy = false;
    }
  }

  const day = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const keyOf = (q: any) =>
    !q.answer ? '' : q.kind === 'choice' ? String.fromCharCode(65 + Number(q.answer)) : q.kind === 'grid' ? gridText(q.answer) : q.kind === 'sort' ? sortText(q.sort, q.answer) : q.answer;
</script>

<div class="space-y-4 text-xs">
  <section class="{panel} space-y-2">
    <div class={heading}>// lesson library</div>
    <p class={label}>
      lessons teachers on walkerMath have shared. copy one to make it yours: it lands in your lessons with its questions, answer keys and
      teacher notes, ready to change and schedule. to share one of yours, open it and use [share to library].
    </p>
    <input class="{field} max-w-md" bind:value={search} placeholder="search by title, topic, standard or teacher" aria-label="Search the library" />
  </section>

  {#if error}
    <p class="p-3 rounded border border-[var(--bad)] text-[var(--bad)]">{error}</p>
  {/if}

  {#if !loaded}
    <p class={label}>loading...</p>
  {:else if entries.length === 0}
    <p class={label}>nothing shared yet. open one of your lessons and use [share to library] to be the first.</p>
  {:else if shown.length === 0}
    <p class={label}>nothing matches "{search}".</p>
  {:else}
    <ul class="space-y-3">
      {#each shown as e (e.id)}
        <li class="{panel} space-y-2">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="text-sm font-bold">{e.title}</span>
            {#if e.topic}<span class={label}>{e.topic}</span>{/if}
            <span class="flex-1"></span>
            <span class={label}>{e.mine ? 'shared by you' : `shared by ${e.author}`} · {day(e.updatedAt)}</span>
          </div>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 {label}">
            <span>{e.moduleCount} modules · {Math.round(e.durationSec / 60)} min</span>
            {#if e.standards}<span>{e.standards}</span>{/if}
            <span>{e.copies} {e.copies === 1 ? 'copy' : 'copies'}</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class={btn} onclick={() => toggle(e)}>{opened === e.id ? '[hide]' : '[look inside]'}</button>
            <button type="button" class={btnMain} onclick={() => copy(e)} disabled={busy}>[copy to my lessons]</button>
            {#if e.mine && e.lessonId}<a class={btn} href="/teach/lesson?id={e.lessonId}">[open yours]</a>{/if}
          </div>
          {#if opened === e.id}
            {@const l = preview[e.id]}
            {#if !l}
              <p class={label}>loading...</p>
            {:else}
              <div class="border-t border-[var(--line)] pt-2 space-y-2">
                {#if l.objective}<p><span class={label}>objective:</span> {l.objective}</p>{/if}
                <ol class="space-y-2">
                  {#each l.modules as m, i}
                    <li>
                      <div>
                        <span class="font-bold">{i + 1}. {m.title}</span>
                        <span class={label}>· {MODULE_TYPES[m.type as keyof typeof MODULE_TYPES]?.label ?? m.type} · {mmss(m.plannedSec)}</span>
                      </div>
                      {#if m.type === 'prompt' || (m.type === 'activity' && m.config?.category === 'feedback')}
                        {#if m.type === 'activity' && m.config?.instructions}<p class="pl-4 {label} line-clamp-2">{m.config.instructions}</p>{/if}
                        <ul class="pl-4 space-y-0.5">
                          {#each m.config.questions ?? [] as q, qi}
                            <li>Q{qi + 1}. {q.text} {#if keyOf(q)}<span class={label}>· key: {keyOf(q)}</span>{/if}</li>
                          {/each}
                        </ul>
                      {:else if m.type === 'notes'}
                        <p class="pl-4 {label}">{(m.config.slides ?? []).length} pages</p>
                      {:else if m.config?.instructions}
                        <p class="pl-4 {label} line-clamp-2">{m.config.instructions}</p>
                      {/if}
                    </li>
                  {/each}
                </ol>
              </div>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
