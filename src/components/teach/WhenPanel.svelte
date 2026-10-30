<!-- src/components/teach/WhenPanel.svelte -->
<!-- The lesson tile's panel: which classes get this lesson, and when (the sketch's "Repeats?" rows). -->
<!-- Each row is saved on its own, so scheduling never waits for the lesson's [save]. -->
<script module lang="ts">
  export type Run = {
    id: string;
    classId: string;
    className: string;
    period: string;
    date: string;
    startTime: string;
    endTime: string;
    status: 'scheduled' | 'live' | 'ended';
    scheduledEnd: number;
  };
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../lib/api.ts';
  import { clock12, clockMinutes, mmss } from '../../lib/lesson/time.ts';
  import { btn, btnDanger, btnMain, field, heading, label, niceDate, panel, todayIso } from './ui.ts';

  type Cls = { id: string; name: string; period: string; bellStart: string | null; bellEnd: string | null; archived: boolean };
  type Draft = { classId: string; date: string; startTime: string; endTime: string };

  let {
    lessonId,
    durationSec,
    archived,
    runs = $bindable()
  }: { lessonId: string; durationSec: number; archived: boolean; runs: Run[] } = $props();

  let classes = $state<Cls[]>([]);
  let error = $state('');
  let busy = $state(false);
  let editing = $state<string | null>(null); // run id, or 'new'
  let draft = $state<Draft>({ classId: '', date: todayIso(), startTime: '', endTime: '' });

  const openClasses = $derived(classes.filter((c) => !c.archived));
  const upcoming = $derived(runs.filter((r) => r.status !== 'ended'));
  const past = $derived(runs.filter((r) => r.status === 'ended'));

  onMount(async () => {
    try {
      classes = (await api<{ classes: Cls[] }>('/api/teach/classes')).classes;
    } catch (e) {
      error = (e as Error).message;
    }
  });

  function startNew() {
    const last = upcoming.at(-1);
    // Next class after the last one scheduled, same day: the usual "teach it again next period".
    const used = new Set(upcoming.filter((r) => r.date === (last?.date ?? todayIso())).map((r) => r.classId));
    const next = openClasses.find((c) => !used.has(c.id)) ?? openClasses[0];
    draft = { classId: '', date: last?.date ?? todayIso(), startTime: '', endTime: '' };
    if (next) pickClass(next.id);
    editing = 'new';
  }

  function startEdit(r: Run) {
    draft = { classId: r.classId, date: r.date, startTime: r.startTime, endTime: r.endTime };
    editing = r.id;
  }

  function pickClass(id: string) {
    draft.classId = id;
    const c = classes.find((x) => x.id === id);
    if (c?.bellStart) draft.startTime = c.bellStart;
    if (c?.bellEnd) draft.endTime = c.bellEnd;
  }

  /** True when a delivery's times differ from its class's usual bell times (assembly, early release...). */
  const isSpecial = (r: { classId: string; startTime: string; endTime: string }) => {
    const c = classes.find((x) => x.id === r.classId);
    return !!c && !!c.bellStart && !!c.bellEnd && (c.bellStart !== r.startTime || c.bellEnd !== r.endTime);
  };

  const windowSec = (d: { startTime: string; endTime: string }) =>
    d.startTime && d.endTime ? (clockMinutes(d.endTime) - clockMinutes(d.startTime)) * 60 : 0;

  async function saveDraft() {
    error = '';
    busy = true;
    try {
      const res =
        editing === 'new'
          ? await api<{ runs: Run[] }>(`/api/teach/lessons/${lessonId}/runs`, { body: draft })
          : await api<{ runs: Run[] }>(`/api/teach/lessons/${lessonId}/runs/${editing}`, { method: 'PATCH', body: draft });
      runs = res.runs;
      editing = null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  async function remove(r: Run) {
    if (!confirm(`Take this lesson off ${r.period} on ${niceDate(r.date)}?`)) return;
    error = '';
    busy = true;
    try {
      runs = (await api<{ runs: Run[] }>(`/api/teach/lessons/${lessonId}/runs/${r.id}`, { method: 'DELETE' })).runs;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<section class="{panel} space-y-4 text-xs">
  <div class="flex flex-wrap justify-between items-center gap-3">
    <div>
      <div class={heading}>// when</div>
      <div class="{label} mt-1">each class period that gets this lesson. picking a class fills in its bell times.</div>
    </div>
    {#if !archived && editing === null}
      <button type="button" class={btnMain} onclick={startNew} disabled={busy || openClasses.length === 0}>[+ add a class]</button>
    {/if}
  </div>

  {#if error}
    <p class="p-2 rounded border border-[var(--bad)] text-[var(--bad)]">{error}</p>
  {/if}
  {#if classes.length > 0 && openClasses.length === 0}
    <p class={label}>all your classes are archived. restore one under [classes].</p>
  {:else if classes.length === 0}
    <p class={label}>no classes yet: make one under <a class="underline" href="/teach/classes">[classes]</a> first.</p>
  {/if}

  {#snippet editor()}
    <form
      class="grid gap-2 sm:grid-cols-[1fr_9rem_7rem_7rem_auto] items-end p-3 rounded border border-[var(--accent)]"
      onsubmit={(e) => {
        e.preventDefault();
        saveDraft();
      }}
    >
      <label class="block space-y-1">
        <span class={label}>class</span>
        <select class={field} value={draft.classId} onchange={(e) => pickClass((e.currentTarget as HTMLSelectElement).value)} required>
          <option value="" disabled>pick a class</option>
          {#each openClasses as c}<option value={c.id}>{c.period} · {c.name}</option>{/each}
        </select>
      </label>
      <label class="block space-y-1">
        <span class={label}>date</span>
        <input class={field} type="date" bind:value={draft.date} required />
      </label>
      <label class="block space-y-1">
        <span class={label}>start</span>
        <input class={field} type="time" bind:value={draft.startTime} required />
      </label>
      <label class="block space-y-1">
        <span class={label}>end (bell)</span>
        <input class={field} type="time" bind:value={draft.endTime} required />
      </label>
      <div class="flex gap-2">
        <button type="submit" class={btnMain} disabled={busy}>[save]</button>
        <button type="button" class={btn} onclick={() => (editing = null)}>[cancel]</button>
      </div>
      {#if isSpecial(draft)}
        {@const c = classes.find((x) => x.id === draft.classId)}
        <p class="sm:col-span-5 {label}">
          // usual bell for this class: {c?.bellStart && clock12(c.bellStart)} - {c?.bellEnd && clock12(c.bellEnd)}.
          this day only: the class's own times don't change.
          <button type="button" class="underline hover:text-[var(--accent)] cursor-pointer" onclick={() => pickClass(draft.classId)}>[reset to usual]</button>
        </p>
      {/if}
      {#if windowSec(draft) > 0 && windowSec(draft) < durationSec}
        <p class="sm:col-span-5 text-[var(--warn)]">
          // {mmss(windowSec(draft))} between start and bell, but the lesson is {mmss(durationSec)}: the flex modules will be squeezed.
        </p>
      {/if}
    </form>
  {/snippet}

  {#if upcoming.length === 0 && editing !== 'new'}
    <p class={label}>not scheduled yet.</p>
  {/if}

  <ul class="space-y-2">
    {#each upcoming as r (r.id)}
      <li>
        {#if editing === r.id}
          {@render editor()}
        {:else}
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 p-2 rounded border border-[var(--border-color)]">
            <span class="font-bold text-sm w-40">{r.period} · {r.className}</span>
            <span class="w-28">{niceDate(r.date)}</span>
            <span class={label}>{clock12(r.startTime)} - {clock12(r.endTime)}</span>
            {#if isSpecial(r)}
              <span class="text-[var(--accent)]" title="Different from this class's usual bell times">special schedule</span>
            {/if}
            {#if windowSec(r) < durationSec}
              <span class="text-[var(--warn)]" title="Shorter than the lesson's planned duration">short window</span>
            {/if}
            {#if r.scheduledEnd < Date.now()}<span class={label}>(passed)</span>{/if}
            <span class="flex-1"></span>
            {#if r.status === 'scheduled' && editing === null}
              <button type="button" class={btn} onclick={() => startEdit(r)} disabled={busy}>[edit]</button>
              <button type="button" class={btnDanger} onclick={() => remove(r)} disabled={busy}>[remove]</button>
            {:else if r.status === 'live'}
              <span class="text-[var(--ok)] font-bold">LIVE</span>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
    {#if editing === 'new'}
      <li>{@render editor()}</li>
    {/if}
  </ul>

  {#if past.length}
    <details>
      <summary class="cursor-pointer {label}">taught ({past.length})</summary>
      <ul class="mt-2 space-y-1">
        {#each past as r (r.id)}
          <li class={label}>{niceDate(r.date)} · {r.period} · {r.className}</li>
        {/each}
      </ul>
    </details>
  {/if}
</section>
