<!-- src/components/teach/FixNotes.svelte -->
<!-- Corrects a typo in the notes of a lesson already taught. Each delivery keeps its own copy of the -->
<!-- lesson (that's what students see under "past lessons"), so editing the lesson afterwards doesn't -->
<!-- reach it. This edits the text of that copy: the pages, not the questions, keys, or what was marked. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../lib/api.ts';
  import { LIMITS } from '../../lib/lesson/modules.ts';
  import SlideView from './SlideView.svelte';
  import { btn, btnMain, field, label } from './ui.ts';

  type Page = { moduleId: string; slideId: string; where: string; original: string; text: string };

  let { runId, onclose }: { runId: string; onclose: () => void } = $props();

  let pages = $state<Page[]>([]);
  let at = $state(0);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state('');
  let done = $state('');
  let alsoLesson = $state(true);

  const page = $derived(pages[at]);
  const changed = $derived(pages.filter((p) => p.text !== p.original));

  onMount(async () => {
    try {
      const r = await api<{ modules: { id: string; title: string; slides: { id: string; markdown: string }[] }[] }>(`/api/teach/runs/${runId}/text`);
      pages = r.modules.flatMap((m) =>
        m.slides.map((s, i) => ({ moduleId: m.id, slideId: s.id, where: `${m.title} · page ${i + 1}`, original: s.markdown, text: s.markdown }))
      );
      // Start on the first page that has text.
      const first = pages.findIndex((p) => p.original.trim());
      at = first < 0 ? 0 : first;
    } catch (e: any) {
      error = e.message || 'Could not load the notes.';
    } finally {
      loading = false;
    }
  });

  async function save() {
    if (!changed.length || busy) return;
    busy = true;
    error = '';
    done = '';
    try {
      const r = await api<{ changed: number; lessonFixed: number; lessonSkipped: number }>(`/api/teach/runs/${runId}/text`, {
        method: 'POST',
        body: { edits: changed.map((p) => ({ moduleId: p.moduleId, slideId: p.slideId, markdown: p.text })), alsoLesson }
      });
      for (const p of pages) p.original = p.text;
      done =
        `Saved ${r.changed} page${r.changed === 1 ? '' : 's'}: students now see the corrected notes under past lessons.` +
        (alsoLesson
          ? r.lessonFixed
            ? ` Fixed in your lesson too (${r.lessonFixed}).`
            : ' Your lesson was not changed.'
          : '') +
        (r.lessonSkipped ? ` ${r.lessonSkipped} page${r.lessonSkipped === 1 ? '' : 's'} in your lesson had already been changed, so they were left alone.` : '');
    } catch (e: any) {
      error = e.message || 'Could not save.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="mt-2 mb-3 p-3 border border-[var(--line)] rounded-md space-y-3 {label}">
  {#if loading}
    <p>loading the notes...</p>
  {:else if !pages.length}
    <p>// this lesson has no Notes pages to correct.</p>
    <button type="button" class={btn} onclick={onclose}>[close]</button>
  {:else}
    <p>// fix a typo in the notes as taught. Only the text changes; questions, keys and marks stay as they were.</p>
    <div class="flex flex-wrap items-center gap-2">
      <select class="{field} w-auto max-w-xs p-1" bind:value={at}>
        {#each pages as p, i (p.slideId)}
          <option value={i}>{p.where}{p.text !== p.original ? ' *' : ''}{p.original.trim() ? '' : ' (blackboard)'}</option>
        {/each}
      </select>
      {#if page && page.text !== page.original}
        <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={() => (page.text = page.original)}>[undo this page]</button>
      {/if}
    </div>
    {#if page}
      <div class="grid gap-3 xl:grid-cols-2 items-start">
        <textarea class="{field} font-mono min-h-[16rem]" rows="14" bind:value={page.text} maxlength={LIMITS.slide} disabled={busy}></textarea>
        <SlideView markdown={page.text} />
      </div>
    {/if}
    <label class="flex items-center gap-2">
      <input type="checkbox" bind:checked={alsoLesson} disabled={busy} />
      <span>also fix it in my lesson, so the next delivery doesn't repeat it (only pages I haven't changed since)</span>
    </label>
    {#if error}<p class="text-[var(--bad)]">{error}</p>{/if}
    {#if done}<p class="text-[var(--ok)]">{done}</p>{/if}
    <div class="flex gap-3">
      <button type="button" class={btnMain} onclick={save} disabled={busy || !changed.length}>{busy ? '[saving...]' : `[save ${changed.length || ''} changed page${changed.length === 1 ? '' : 's'}]`}</button>
      <button type="button" class={btn} onclick={onclose}>[close]</button>
    </div>
  {/if}
</div>
