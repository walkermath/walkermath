<!-- src/components/live/SortQuestion.svelte -->
<!-- A card sort as students do it: drag a card into a group, or tap a card and then tap a group -->
<!-- (tapping works on touchscreens, where dragging doesn't). Tap a placed card to move it, or put -->
<!-- it back with "cards". The answer is each card's group, in card order (see sort.ts). -->
<script lang="ts">
  import { joinList, parseList } from '../../lib/lesson/grid.ts';
  import { renderMarkdown } from '../../lib/lesson/markdown.ts';
  import type { SortSpec } from '../../lib/lesson/sort.ts';

  let {
    spec,
    value = '',
    student = false,
    editable = false,
    label: labelText = 'card sort',
    onchange
  }: {
    spec: SortSpec;
    value?: string;
    student?: boolean;
    editable?: boolean;
    label?: string;
    onchange?: (json: string) => void;
  } = $props();

  const placed = $derived.by(() => {
    const list = parseList(value);
    return spec.cards.map((_, i) => list[i] ?? '');
  });
  let picked = $state<number | null>(null);
  const live = $derived(student && editable);

  function place(card: number, group: string) {
    if (!live) return;
    const next = [...placed];
    next[card] = group;
    picked = null;
    onchange?.(joinList(next));
  }
  function tapCard(i: number) {
    if (!live) return;
    picked = picked === i ? null : i;
  }
  function tapArea(group: string) {
    if (picked !== null) place(picked, group);
  }

  /* mouse dragging (Chromebooks with a trackpad, laptops) */
  function dragStart(e: DragEvent, i: number) {
    if (!live) return;
    e.dataTransfer?.setData('text/plain', String(i));
    picked = i;
  }
  function drop(e: DragEvent, group: string) {
    e.preventDefault();
    const i = Number(e.dataTransfer?.getData('text/plain'));
    if (Number.isInteger(i) && i >= 0 && i < spec.cards.length) place(i, group);
  }

  const muted = 'text-[var(--text-muted)]';
  const cardCls = (i: number) =>
    `inline-flex items-center px-3 py-2 rounded border-2 bg-[var(--bg-surface)] text-sm ${
      picked === i ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/40' : 'border-[var(--line)]'
    } ${live ? 'cursor-grab hover:border-[var(--accent)]' : ''}`;
</script>

{#snippet card(i: number)}
  <button
    type="button"
    class={cardCls(i)}
    draggable={live}
    disabled={!live}
    aria-pressed={picked === i}
    aria-label="Card {i + 1}{placed[i] ? `, in ${spec.groups[Number(placed[i])]}` : ', not placed'}"
    ondragstart={(e) => dragStart(e, i)}
    onclick={(e) => {
      e.stopPropagation();
      tapCard(i);
    }}
  >
    <span class="sort-card">{@html renderMarkdown(spec.cards[i])}</span>
  </button>
{/snippet}

<div class="space-y-3" role="group" aria-label={labelText}>
  <!-- the cards not placed yet -->
  <div
    class="p-2 rounded border border-dashed border-[var(--line)] min-h-14 {live && picked !== null && placed[picked] ? 'cursor-pointer' : ''}"
    role="list"
    ondragover={(e) => live && e.preventDefault()}
    ondrop={(e) => drop(e, '')}
    onclick={() => tapArea('')}
  >
    <div class="text-xs {muted} mb-1">// cards{live ? ' (tap one, then tap a group, or drag it)' : ''}</div>
    <div class="flex flex-wrap gap-2">
      {#each spec.cards as _, i}
        {#if !placed[i]}<span role="listitem">{@render card(i)}</span>{/if}
      {/each}
      {#if placed.every(Boolean)}<span class="text-xs {muted}">all placed</span>{/if}
    </div>
  </div>

  <!-- the groups -->
  <div class="grid gap-2" style="grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr))">
    {#each spec.groups as g, gi}
      <div
        class="p-2 rounded border-2 min-h-24 {live && picked !== null ? 'border-[var(--accent)]/60 cursor-pointer' : 'border-[var(--line)]'}"
        role="list"
        aria-label={g}
        ondragover={(e) => live && e.preventDefault()}
        ondrop={(e) => drop(e, String(gi))}
        onclick={() => tapArea(String(gi))}
      >
        <div class="font-bold text-sm mb-2 sort-card">{@html renderMarkdown(g)}</div>
        <div class="flex flex-wrap gap-2">
          {#each spec.cards as _, i}
            {#if placed[i] === String(gi)}<span role="listitem">{@render card(i)}</span>{/if}
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .sort-card :global(p) {
    margin: 0;
  }
</style>
