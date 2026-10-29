<!-- src/components/teach/LessonBuilder.svelte -->
<!-- /teach/lesson?id=  The lesson builder (sketch 2): lesson fields, the tile chain, the open tile's -->
<!-- settings, a timeline against the planned duration, and a "what if a module runs long" preview. -->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { api, ApiError } from '../../lib/api.ts';
  import {
    LIMITS,
    MODULE_TYPES,
    MODULE_TYPE_LIST,
    newModule,
    type LessonModule,
    type ModuleType
  } from '../../lib/lesson/modules.ts';
  import { previewOverrun, totalSec } from '../../lib/lesson/pacing.ts';
  import { mmss } from '../../lib/lesson/time.ts';
  import ModuleSettings from './ModuleSettings.svelte';
  import WhenPanel, { type Run } from './WhenPanel.svelte';
  import { btn, btnDanger, btnMain, field, heading, label, panel } from './ui.ts';

  type Lesson = {
    id: string;
    title: string;
    objective: string;
    successCriteria: string;
    durationSec: number;
    archived: boolean;
    updatedAt: number;
    modules: LessonModule[];
  };
  type Note = { id: string; title: string; subject: string | null; unitTitle: string | null };

  let lesson = $state<Lesson | null>(null);
  let runs = $state<Run[]>([]);
  let notes = $state<Note[]>([]);
  let savedJson = $state('');
  let loadError = $state('');
  let error = $state('');
  let saving = $state(false);
  let savedAt = $state<number | null>(null);

  /** 'lesson' (the main tile) or a module id. */
  let selected = $state<string>('lesson');
  let adding = $state(false);
  let dragFrom = $state<number | null>(null);
  let dropAt = $state<number | null>(null);

  // preview: "if <module> runs <n> min long"
  let previewIndex = $state(1);
  let previewMin = $state(2);

  const editable = (l: Lesson) =>
    JSON.stringify({ t: l.title, o: l.objective, s: l.successCriteria, d: l.durationSec, m: l.modules });
  const dirty = $derived(lesson ? editable(lesson) !== savedJson : false);
  const planned = $derived(lesson ? totalSec(lesson.modules) : 0);
  const selectedIndex = $derived(lesson ? lesson.modules.findIndex((m) => m.id === selected) : -1);

  function loaded(l: Lesson) {
    lesson = l;
    savedJson = editable(l);
  }

  onMount(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) {
      loadError = 'No lesson picked.';
      return;
    }
    api<{ lesson: Lesson; runs: Run[] }>(`/api/teach/lessons/${encodeURIComponent(id)}`)
      .then((d) => {
        loaded(d.lesson);
        runs = d.runs;
        if (d.lesson.modules.length) previewIndex = Math.min(1, d.lesson.modules.length - 1);
      })
      .catch((e) => (loadError = e instanceof ApiError && e.status === 404 ? "That lesson doesn't exist (or isn't yours)." : e.message));
    fetch('/notes/index.json')
      .then((r) => (r.ok ? r.json() : { notes: [] }))
      .then((d) => (notes = d.notes ?? []))
      .catch(() => {});

    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    const keys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    addEventListener('beforeunload', warn);
    addEventListener('keydown', keys);
    return () => {
      removeEventListener('beforeunload', warn);
      removeEventListener('keydown', keys);
    };
  });

  async function save() {
    if (!lesson || saving) return;
    error = '';
    saving = true;
    try {
      const { lesson: fresh } = await api<{ lesson: Lesson }>(`/api/teach/lessons/${lesson.id}`, {
        method: 'PUT',
        body: {
          baseUpdatedAt: lesson.updatedAt,
          title: lesson.title,
          objective: lesson.objective,
          successCriteria: lesson.successCriteria,
          durationSec: lesson.durationSec,
          modules: lesson.modules
        }
      });
      loaded(fresh);
      savedAt = Date.now();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  /* ---------- tiles ---------- */

  function addModule(type: ModuleType) {
    if (!lesson) return;
    const m = newModule(type);
    if (type === 'prompt' && lesson.modules.length > 0) m.title = 'Exit ticket';
    lesson.modules.push(m);
    selected = m.id;
    adding = false;
  }

  function removeModule(i: number) {
    if (!lesson) return;
    const m = lesson.modules[i];
    if (!confirm(`Remove "${m.title}"? (Nothing is lost until you save.)`)) return;
    lesson.modules.splice(i, 1);
    if (selected === m.id) selected = lesson.modules[Math.min(i, lesson.modules.length - 1)]?.id ?? 'lesson';
  }

  function move(from: number, to: number) {
    if (!lesson || to < 0 || to >= lesson.modules.length || from === to) return;
    const [m] = lesson.modules.splice(from, 1);
    lesson.modules.splice(to, 0, m);
  }

  function tileKeys(e: KeyboardEvent, i: number) {
    if (!e.altKey) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const to = i + (e.key === 'ArrowLeft' ? -1 : 1);
      move(i, to);
      // keep focus on the moved tile
      tick().then(() => document.getElementById(`tile-${lesson?.modules[to]?.id}`)?.focus());
    }
  }

  /* ---------- lesson actions ---------- */

  async function duplicate() {
    if (!lesson) return;
    if (dirty && !confirm('Duplicate the last saved version? Your unsaved changes stay here.')) return;
    try {
      const { lesson: copy } = await api<{ lesson: Lesson }>('/api/teach/lessons', { body: { copyFrom: lesson.id } });
      window.open(`/teach/lesson?id=${copy.id}`, '_blank');
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function setArchived(archived: boolean) {
    if (!lesson) return;
    try {
      const { lesson: fresh } = await api<{ lesson: Lesson }>(`/api/teach/lessons/${lesson.id}`, { method: 'PATCH', body: { archived } });
      lesson.archived = fresh.archived;
      lesson.updatedAt = fresh.updatedAt;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function remove() {
    if (!lesson) return;
    if (!confirm(`Delete "${lesson.title}" and its schedule? This can't be undone.`)) return;
    try {
      await api(`/api/teach/lessons/${lesson.id}`, { method: 'DELETE' });
      savedJson = editable(lesson); // don't warn on the way out
      location.href = '/teach';
    } catch (e) {
      error = (e as Error).message;
    }
  }

  /* ---------- timeline + preview ---------- */

  const scale = $derived(Math.max(planned, lesson?.durationSec ?? 0, 1));
  const preview = $derived.by(() => {
    if (!lesson || lesson.modules.length < 2) return null;
    const i = Math.min(Math.max(0, previewIndex), lesson.modules.length - 2);
    return { index: i, result: previewOverrun(lesson.modules, i, Math.round(previewMin * 60), lesson.durationSec) };
  });

  const TYPE_MARK: Record<ModuleType, string> = { prompt: '?', notes: '¶', activity: '*', independent: '~' };
</script>

{#if loadError}
  <p class="p-3 rounded border border-[var(--bad)] text-[var(--bad)] text-xs">
    {loadError} <a class="underline" href="/teach">back to lessons</a>
  </p>
{:else if !lesson}
  <p class="text-xs {label}">loading...</p>
{:else}
  <div class="space-y-6 text-xs">
    <!-- action bar -->
    <div class="flex flex-wrap items-center gap-2 sticky top-0 z-10 py-2 bg-[var(--bg-primary)]">
      <a href="/teach" class="hover:text-[var(--accent)]">&lt;- [lessons]</a>
      <span class="flex-1"></span>
      {#if dirty}
        <span class="text-[var(--warn)]">unsaved changes</span>
      {:else if savedAt}
        <span class={label}>saved</span>
      {/if}
      <button type="button" class={btnMain} onclick={save} disabled={saving || !dirty} title="Ctrl+S">{saving ? '[saving...]' : '[save]'}</button>
      <button type="button" class={btn} onclick={duplicate}>[duplicate]</button>
      {#if lesson.archived}
        <button type="button" class={btn} onclick={() => setArchived(false)}>[restore]</button>
      {:else}
        <button type="button" class={btn} onclick={() => setArchived(true)}>[archive]</button>
      {/if}
      <button type="button" class={btnDanger} onclick={remove}>[delete]</button>
    </div>

    {#if error}
      <p class="p-3 rounded border border-[var(--bad)] text-[var(--bad)]">{error}</p>
    {/if}
    {#if lesson.archived}
      <p class="p-3 rounded border border-[var(--warn)] text-[var(--warn)]">archived: you can still edit it, but it can't be scheduled until you restore it.</p>
    {/if}

    <!-- lesson fields (top of the sketch) -->
    <section class="grid gap-4 sm:grid-cols-2">
      <label class="block space-y-1">
        <span class={label}>lesson title</span>
        <input class="{field} text-base font-bold" bind:value={lesson.title} maxlength={LIMITS.lessonTitle} required />
      </label>
      <label class="block space-y-1">
        <span class={label}>lesson objective</span>
        <textarea class={field} rows="2" bind:value={lesson.objective} maxlength={LIMITS.objective} placeholder="Students will be able to..."></textarea>
      </label>
      <label class="block space-y-1">
        <span class={label}>success criteria</span>
        <textarea class={field} rows="2" bind:value={lesson.successCriteria} maxlength={LIMITS.successCriteria} placeholder="I can..."></textarea>
      </label>
      <label class="block space-y-1">
        <span class={label}>duration (minutes)</span>
        <input
          class="{field} w-28"
          type="number"
          min="5"
          max="240"
          step="1"
          value={lesson.durationSec / 60}
          onchange={(e) => {
            const v = Math.round(Number((e.currentTarget as HTMLInputElement).value));
            if (lesson && v >= 5 && v <= 240) lesson.durationSec = v * 60;
            else (e.currentTarget as HTMLInputElement).value = String((lesson?.durationSec ?? 0) / 60);
          }}
        />
      </label>
    </section>

    <!-- tile chain -->
    <section class="space-y-3">
      <div class={heading}>// modules</div>
      <div class="flex items-stretch overflow-x-auto pb-3 pt-1" role="list" aria-label="Lesson modules in order">
        <button
          type="button"
          onclick={() => (selected = 'lesson')}
          class="shrink-0 w-40 p-3 rounded-md border-2 text-left bg-[var(--bg-surface)] cursor-pointer transition-colors {selected === 'lesson'
            ? 'border-[var(--accent)]'
            : 'border-dashed border-[var(--border-color)] hover:border-[var(--accent)]'}"
        >
          <div class="font-bold text-sm leading-tight line-clamp-2">{lesson.title || 'Untitled lesson'}</div>
          <div class="{label} mt-2">{mmss(lesson.durationSec)} · {runs.filter((r) => r.status !== 'ended').length} scheduled</div>
          <div class="{label} mt-1">lesson + when</div>
        </button>

        {#each lesson.modules as m, i (m.id)}
          <div class="shrink-0 self-center px-1 {label}" aria-hidden="true">-&gt;</div>
          <div
            role="listitem"
            class="shrink-0 relative w-40 rounded-md border-2 bg-[var(--bg-surface)] transition-colors {selected === m.id
              ? 'border-[var(--accent)]'
              : 'border-[var(--border-color)] hover:border-[var(--accent)]'} {dropAt === i && dragFrom !== i ? 'ring-2 ring-[var(--accent)]' : ''} {dragFrom === i ? 'opacity-50' : ''}"
            draggable="true"
            ondragstart={(e) => {
              dragFrom = i;
              e.dataTransfer?.setData('text/plain', String(i));
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            }}
            ondragover={(e) => {
              e.preventDefault();
              dropAt = i;
            }}
            ondragleave={() => (dropAt = dropAt === i ? null : dropAt)}
            ondrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null) move(dragFrom, i);
              dragFrom = null;
              dropAt = null;
            }}
            ondragend={() => {
              dragFrom = null;
              dropAt = null;
            }}
          >
            <button
              id="tile-{m.id}"
              type="button"
              class="w-full h-full p-3 text-left cursor-pointer"
              onclick={() => (selected = m.id)}
              onkeydown={(e) => tileKeys(e, i)}
              aria-label="{i + 1}. {m.title}, {MODULE_TYPES[m.type].label}, {mmss(m.plannedSec)}{m.pacing === 'locked' ? ', locked' : ''}. Alt plus arrow keys to move."
            >
              <div class="{label} flex justify-between pr-5">
                <span>{i + 1} · {MODULE_TYPES[m.type].label}</span>
              </div>
              <div class="font-bold text-sm leading-tight mt-1 line-clamp-2">{m.title}</div>
              <div class="mt-2 flex items-center gap-2">
                <span class="text-sm">{mmss(m.plannedSec)}</span>
                {#if m.pacing === 'locked'}
                  <span class="px-1 rounded border border-[var(--border-color)]" title="Locked: always gets its planned time">locked</span>
                {/if}
                {#if m.onTimeUp === 'hold'}
                  <span class="px-1 rounded border border-[var(--border-color)]" title="Holds when time runs out">hold</span>
                {/if}
              </div>
            </button>
            <button
              type="button"
              class="absolute top-1 right-1 w-6 h-6 rounded hover:text-[var(--bad)] cursor-pointer {label}"
              onclick={() => removeModule(i)}
              aria-label="Remove {m.title}">x</button
            >
          </div>
        {/each}

        <div class="shrink-0 self-center px-1 {label}" aria-hidden="true">-&gt;</div>
        {#if adding}
          <div class="shrink-0 w-48 p-2 rounded-md border-2 border-dashed border-[var(--accent)] space-y-1">
            {#each MODULE_TYPE_LIST as t}
              <button type="button" class="block w-full text-left px-2 py-1 rounded hover:bg-[var(--well-strong)] cursor-pointer" onclick={() => addModule(t)}>
                <span class="font-mono {label} mr-1">{TYPE_MARK[t]}</span>{MODULE_TYPES[t].label}
              </button>
            {/each}
            <button type="button" class="block w-full text-left px-2 py-1 {label} hover:text-[var(--accent)] cursor-pointer" onclick={() => (adding = false)}>cancel</button>
          </div>
        {:else if lesson.modules.length < LIMITS.modules}
          <button
            type="button"
            class="shrink-0 w-16 self-stretch rounded-md border-2 border-dashed border-[var(--border-color)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-2xl cursor-pointer"
            onclick={() => (adding = true)}
            aria-label="Add a module">+</button
          >
        {/if}
      </div>

      <!-- timeline against the duration -->
      <div class="space-y-1">
        <div class="flex h-5 w-full rounded overflow-hidden border border-[var(--border-color)] bg-[var(--well)]">
          {#each lesson.modules as m (m.id)}
            <button
              type="button"
              class="h-full border-r border-[var(--bg-surface)] cursor-pointer {selected === m.id ? 'bg-[var(--accent)]' : 'bg-[var(--edge)] hover:bg-[var(--accent)]'} {m.pacing === 'locked' ? 'opacity-60' : ''}"
              style="width: {(m.plannedSec / scale) * 100}%"
              title="{m.title}: {mmss(m.plannedSec)}"
              aria-label="{m.title}: {mmss(m.plannedSec)}"
              onclick={() => (selected = m.id)}
            ></button>
          {/each}
        </div>
        <div class="flex flex-wrap justify-between gap-2">
          <span>{mmss(planned)} of {mmss(lesson.durationSec)} planned</span>
          {#if planned < lesson.durationSec}
            <span class={label}>{mmss(lesson.durationSec - planned)} unplanned: flex modules will stretch (up to 1.5x)</span>
          {:else if planned > lesson.durationSec}
            <span class="text-[var(--warn)]">{mmss(planned - lesson.durationSec)} over: flex modules will be squeezed to fit</span>
          {:else}
            <span class="text-[var(--ok)]">fits exactly</span>
          {/if}
        </div>
      </div>

      <!-- what-if preview -->
      {#if preview}
        {@const p = preview}
        {@const rest = lesson.modules.slice(p.index + 1)}
        <details class="{panel} space-y-2" open>
          <summary class="cursor-pointer {heading}">// what if a module runs long?</summary>
          <div class="flex flex-wrap items-center gap-2 pt-2">
            <span>if</span>
            <select class="{field} w-56 p-1" bind:value={previewIndex}>
              {#each lesson.modules.slice(0, -1) as m, i (m.id)}<option value={i}>{i + 1}. {m.title}</option>{/each}
            </select>
            <span>runs</span>
            <input class="{field} w-16 p-1" type="number" step="0.5" min="-60" max="60" bind:value={previewMin} />
            <span>min {previewMin < 0 ? 'short (negative)' : 'long'}, the rest become:</span>
          </div>
          <table class="text-left">
            <tbody>
              {#each rest as m, k (m.id)}
                {@const now = p.result.seconds[k]}
                <tr>
                  <td class="pr-4 py-0.5">{p.index + 2 + k}. {m.title}</td>
                  <td class="pr-4 {label}">{mmss(m.plannedSec)}</td>
                  <td class="pr-2">-&gt;</td>
                  <td class="font-bold {now < m.plannedSec ? 'text-[var(--warn)]' : now > m.plannedSec ? 'text-[var(--ok)]' : ''}">{mmss(now)}</td>
                  <td class="pl-3 {label}">{m.pacing === 'locked' ? 'locked' : ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if p.result.overSec > 0}
            <p class="text-[var(--warn)]">// still {mmss(p.result.overSec)} over at the bell: you'd skip a module or shorten a locked one.</p>
          {/if}
          {#if p.result.spareSec > 0}
            <p class={label}>// {mmss(p.result.spareSec)} spare for you to place.</p>
          {/if}
          <p class={label}>// the bell doesn't move: locked modules keep their time and flex modules share the rest.</p>
        </details>
      {/if}
    </section>

    <!-- the open tile's panel -->
    {#if selected === 'lesson' || selectedIndex < 0}
      <WhenPanel lessonId={lesson.id} durationSec={lesson.durationSec} archived={lesson.archived} bind:runs />
      {#if lesson.modules.length === 0}
        <p class={label}>// add modules with the + tile: bellwork, notes, activities, independent work, an exit ticket.</p>
      {/if}
    {:else}
      {#key selected}
        <ModuleSettings
          bind:module={lesson.modules[selectedIndex]}
          {notes}
          index={selectedIndex}
          count={lesson.modules.length}
          onmove={(to) => move(selectedIndex, to)}
          onremove={() => removeModule(selectedIndex)}
        />
      {/key}
    {/if}
  </div>
{/if}
