<!-- src/components/questions/editors/SortEditor.svelte -->
<!-- Card sort / matching: groups, cards, and the group each card belongs in (the key). -->
<script lang="ts">
  import { joinList, parseList } from '../../../lib/lesson/grid.ts';
  import { SORT_LIMITS } from '../../../lib/lesson/sort.ts';
  import type { Question } from '../../../lib/questions/index.ts';
  import { field, label } from '../../teach/ui.ts';

  let { q = $bindable(), keyless: _keyless }: { q: Question; keyless: boolean } = $props();

  /* the key is each card's group number, in card order (see sort.ts) */
  const sortKeys = (q: Question) => {
    const keys = parseList(q.answer);
    while (keys.length < q.sort!.cards.length) keys.push('');
    return keys.slice(0, q.sort!.cards.length);
  };
  function setSortKey(q: Question, card: number, group: string) {
    const keys = sortKeys(q);
    keys[card] = group;
    q.answer = joinList(keys);
  }
  function addCard(q: Question) {
    const keys = sortKeys(q);
    q.sort!.cards.push('');
    q.answer = joinList([...keys, '']);
  }
  function removeCard(q: Question, card: number) {
    const keys = sortKeys(q);
    q.sort!.cards.splice(card, 1);
    keys.splice(card, 1);
    q.answer = joinList(keys);
  }
  function removeGroup(q: Question, group: number) {
    // Cards keyed to this group lose their key; later groups move up one.
    const keys = sortKeys(q).map((k) => (k === '' || Number(k) === group ? '' : Number(k) > group ? String(Number(k) - 1) : k));
    q.sort!.groups.splice(group, 1);
    q.answer = joinList(keys);
  }
</script>

{#if q.sort}
  {@const keys = sortKeys(q)}
  <div class="space-y-3">
    <div class="space-y-1">
      <div class={label}>groups <span class="help-text">(students put each card in one)</span></div>
      {#each q.sort.groups as _, gi}
        <div class="flex items-center gap-2">
          <input class="{field} p-1" bind:value={q.sort.groups[gi]} maxlength={SORT_LIMITS.group} placeholder="Group {gi + 1}" />
          {#if q.sort.groups.length > 2}
            <button type="button" class="hover:text-[var(--bad)] cursor-pointer" onclick={() => removeGroup(q, gi)} aria-label="Remove group">[x]</button>
          {/if}
        </div>
      {/each}
      {#if q.sort.groups.length < SORT_LIMITS.groups}
        <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={() => q.sort!.groups.push('')}>[+ group]</button>
      {/if}
    </div>
    <div class="space-y-1">
      <div class={label}>cards, and the group each belongs in (the key; students never see it)</div>
      {#each q.sort.cards as _, ci}
        <div class="flex flex-wrap items-center gap-2">
          <input class="{field} p-1 flex-1 min-w-40" bind:value={q.sort.cards[ci]} maxlength={SORT_LIMITS.card} placeholder="Card {ci + 1} (use $...$ for math)" />
          <select
            class="{field} w-44 p-1"
            value={keys[ci]}
            onchange={(e) => setSortKey(q, ci, (e.currentTarget as HTMLSelectElement).value)}
            aria-label="Group for card {ci + 1}"
          >
            <option value="">no key</option>
            {#each q.sort.groups as g, gi}
              <option value={String(gi)}>{g || `Group ${gi + 1}`}</option>
            {/each}
          </select>
          {#if q.sort.cards.length > 2}
            <button type="button" class="hover:text-[var(--bad)] cursor-pointer" onclick={() => removeCard(q, ci)} aria-label="Remove card">[x]</button>
          {/if}
        </div>
      {/each}
      {#if q.sort.cards.length < SORT_LIMITS.cards}
        <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={() => addCard(q)}>[+ card]</button>
      {/if}
    </div>
    <p class="text-xs {label}">
      // students drag each card into a group, or tap a card and then a group. for matching, make one group per answer and one card for each.
      the question is right when every keyed card is in its group.
    </p>
  </div>
  <label class="flex items-center gap-2 pt-1">
    <input type="checkbox" checked={!!q.partial} onchange={(e) => (e.currentTarget.checked ? (q.partial = true) : delete q.partial)} />
    <span>partial credit</span>
    <span class="{label} help-text">// on: a student gets the share they got right (3 of 4 right = 75%). off: right only when all of it is.</span>
  </label>
{/if}
