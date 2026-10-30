<!-- src/components/live/LiveModule.svelte -->
<!-- The current module's content in a live lesson, as students see it (the control panel shows -->
<!-- the same thing as its preview). Read-only for now: answering questions and "done" taps -->
<!-- arrive with submissions (Phase 4b). -->
<script lang="ts">
  import 'katex/dist/katex.min.css';
  import type { RoomModule } from '../../lib/lesson/room.ts';
  import { renderMarkdown } from '../../lib/lesson/markdown.ts';
  import SlideView from '../teach/SlideView.svelte';

  let {
    module,
    livePage = 0,
    follow = true
  }: {
    module: RoomModule;
    /** The page the teacher is showing (Notes). */
    livePage?: number;
    /** Students can flip through Notes pages; false keeps them on the live page (teacher preview). */
    follow?: boolean;
  } = $props();

  const label = 'text-[var(--text-muted)]';
  const c = $derived(module.config ?? {});

  /* Notes: students follow the live page until they flip away; [back to live] returns. */
  let browsing = $state<number | null>(null);
  const pages = $derived<{ id: string; markdown: string }[]>(module.type === 'notes' ? (c.slides ?? []) : []);
  const shown = $derived(Math.min(browsing ?? livePage, Math.max(0, pages.length - 1)));
  $effect(() => {
    void module.id; // a new module starts on its live page
    browsing = null;
  });
  const flip = (to: number) => {
    if (to < 0 || to >= pages.length) return;
    browsing = to === livePage ? null : to;
  };
</script>

<div class="space-y-4">
  {#if module.type === 'notes'}
    {#if pages.length}
      <SlideView markdown={pages[shown]?.markdown ?? ''} scroll />
      {#if !follow || pages.length > 1}
        <div class="flex flex-wrap items-center gap-3 text-xs">
          {#if follow}
            <button type="button" class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-40" onclick={() => flip(shown - 1)} disabled={shown === 0}>[&lt; page]</button>
            <span class={label}>page {shown + 1} of {pages.length}</span>
            <button type="button" class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-40" onclick={() => flip(shown + 1)} disabled={shown >= pages.length - 1}>[page &gt;]</button>
            {#if browsing !== null && browsing !== livePage}
              <button type="button" class="ml-auto font-bold text-[var(--accent)] cursor-pointer" onclick={() => (browsing = null)}>[back to live: page {livePage + 1}]</button>
            {/if}
          {:else}
            <span class={label}>page {shown + 1} of {pages.length}</span>
          {/if}
        </div>
      {/if}
    {/if}
  {:else if module.type === 'prompt'}
    <ol class="space-y-3">
      {#each c.questions ?? [] as q, i (q.id)}
        <li class="p-4 rounded border border-[var(--line)] bg-[var(--bg-surface)] space-y-2">
          <div class="font-bold">Q{i + 1}</div>
          <div class="slide-text">{@html renderMarkdown(q.text)}</div>
          {#if q.kind === 'choice'}
            <ul class="space-y-1">
              {#each q.choices as choice, ci}
                <li class="flex gap-2"><span class={label}>{String.fromCharCode(65 + ci)}.</span><span>{@html renderMarkdown(choice)}</span></li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ol>
    {#if !(c.questions ?? []).length}<p class={label}>// no questions in this module.</p>{/if}
  {:else}
    {#if c.instructions}
      <div class="p-4 rounded border border-[var(--line)] bg-[var(--bg-surface)] slide-text">{@html renderMarkdown(c.instructions)}</div>
    {/if}
    {#if module.type === 'activity' && c.category === 'coliseum' && c.coliseumId}
      <iframe
        title={module.title}
        src="/embed/coliseum/{c.coliseumId}"
        class="w-full h-[75vh] min-h-[32rem] rounded border border-[var(--line)] bg-[var(--bg-surface)]"
      ></iframe>
    {/if}
    {#if (c.links ?? []).length}
      <ul class="space-y-1 text-sm">
        {#each c.links as link}
          <li><a class="underline hover:text-[var(--accent)]" href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a></li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
