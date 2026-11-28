<!-- src/components/questions/editors/GridEditor.svelte -->
<!-- Grid (table / area model): size, given cells and blanks, a key per blank or one area-model key. -->
<script lang="ts">
  import { GRID_BLANK_MAX, GRID_GROUPS, GRID_MAX, GRID_TEXT_MAX, blankPositions, joinList, parseList, reshape } from '../../../lib/lesson/grid.ts';
  import { readMath } from '../../../lib/lesson/mathcheck.ts';
  import type { Question } from '../../../lib/questions/index.ts';
  import { field, label } from '../../teach/ui.ts';

  let { q = $bindable(), keyless: _keyless }: { q: Question; keyless: boolean } = $props();

  /* keys live in q.answer as a list, one per blank (see grid.ts) */
  function setGridKey(q: Question, k: number, v: string) {
    const keys = parseList(q.answer);
    while (keys.length < blankPositions(q.grid!).length) keys.push('');
    keys[k] = v;
    q.answer = joinList(keys);
  }
  function reshapeGrid(q: Question, change: { rows?: number; cols?: number; toggle?: [number, number] }) {
    const area = q.grid!.check === 'area';
    const r = reshape(q.grid!, area ? [] : parseList(q.answer), change);
    q.grid = r.grid;
    if (!area) q.answer = joinList(r.keys); // an area model keeps its one key
  }
  /** Each blank has its own key, or the grid is an area model with one key (what it multiplies out to). */
  function setGridCheck(q: Question, check: 'keys' | 'area') {
    const g = q.grid!;
    if (check === 'area') {
      g.check = 'area';
      g.headerRow = true;
      g.headerCol = true;
      for (const row of g.cells) for (const cell of row) delete cell.group;
      q.answer = '';
    } else {
      delete g.check;
      q.answer = '';
    }
  }
</script>

{#if q.grid}
  {@const keys = parseList(q.answer)}
  {@const blanks = blankPositions(q.grid)}
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-3 text-xs">
      <label class="flex items-center gap-1">
        <span class={label}>rows</span>
        <input class="{field} w-16 p-1" type="number" min="1" max={GRID_MAX} value={q.grid.rows} onchange={(e) => reshapeGrid(q, { rows: Number(e.currentTarget.value) })} />
      </label>
      <label class="flex items-center gap-1">
        <span class={label}>columns</span>
        <input class="{field} w-16 p-1" type="number" min="1" max={GRID_MAX} value={q.grid.cols} onchange={(e) => reshapeGrid(q, { cols: Number(e.currentTarget.value) })} />
      </label>
      <label class="flex items-center gap-1"><input type="checkbox" bind:checked={q.grid.headerRow} disabled={q.grid.check === 'area'} /> first row is a header</label>
      <label class="flex items-center gap-1"><input type="checkbox" bind:checked={q.grid.headerCol} disabled={q.grid.check === 'area'} /> first column is a header</label>
    </div>
    <label class="flex flex-wrap items-center gap-2 text-xs">
      <span class={label}>mark it by</span>
      <select
        class="{field} w-auto p-1"
        value={q.grid.check === 'area' ? 'area' : 'keys'}
        onchange={(e) => setGridCheck(q, e.currentTarget.value as 'keys' | 'area')}
      >
        <option value="keys">a key for each blank</option>
        <option value="area">area model: multiply it out (one key)</option>
      </select>
    </label>
    <div class="overflow-x-auto">
      <table class="border-collapse">
        <tbody>
          {#each q.grid.cells as row, r}
            <tr>
              {#each row as cell, c}
                {@const k = blanks.findIndex(([br, bc]) => br === r && bc === c)}
                <td
                  class="border border-[var(--line)] p-1 align-top {cell.blank
                    ? 'bg-[var(--accent)]/10'
                    : (q.grid.headerRow && r === 0) || (q.grid.headerCol && c === 0)
                      ? 'bg-[var(--well)]'
                      : ''}"
                >
                  {#if cell.blank && q.grid.check === 'area'}
                    <div class="w-28 p-1 text-xs {label}">students fill in</div>
                  {:else if cell.blank}
                    <input
                      class="{field} p-1 w-28"
                      value={keys[k] ?? ''}
                      placeholder="key (optional)"
                      autocomplete="off"
                      spellcheck="false"
                      aria-label="Answer key, row {r + 1}, column {c + 1}"
                      oninput={(e) => setGridKey(q, k, e.currentTarget.value)}
                    />
                    <select
                      class="block mt-1 text-xs bg-transparent {cell.group ? 'text-[var(--accent)]' : label} cursor-pointer"
                      value={cell.group ?? ''}
                      aria-label="Any-order group, row {r + 1}, column {c + 1}"
                      title="blanks with the same letter can be filled in any order"
                      onchange={(e) => {
                        const v = e.currentTarget.value;
                        if (v) cell.group = v;
                        else delete cell.group;
                      }}
                    >
                      <option value="">no group</option>
                      {#each GRID_GROUPS as letter}<option value={letter}>any order: {letter}</option>{/each}
                    </select>
                  {:else}
                    <input
                      class="{field} p-1 w-28"
                      bind:value={cell.text}
                      maxlength={GRID_TEXT_MAX}
                      placeholder="given"
                      aria-label="Given, row {r + 1}, column {c + 1}"
                    />
                  {/if}
                  <button type="button" class="block text-xs {label} hover:text-[var(--accent)] cursor-pointer" onclick={() => reshapeGrid(q, { toggle: [r, c] })}>
                    {cell.blank ? '[make given]' : '[make blank]'}
                  </button>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if q.grid.check === 'area'}
      {@const target = keys[0] ?? ''}
      <label class="flex flex-wrap items-center gap-2">
        <span class="{label} whitespace-nowrap">the model multiplies out to</span>
        <input
          class="{field} p-1 w-64"
          value={target}
          maxlength={GRID_BLANK_MAX}
          placeholder="x^2 - 13x + 40"
          autocomplete="off"
          spellcheck="false"
          oninput={(e) => (q.answer = e.currentTarget.value.trim() ? JSON.stringify([e.currentTarget.value]) : '')}
        />
      </label>
      {#if target.trim() && !readMath(target).ok}
        <p class="text-xs text-[var(--bad)]">{(readMath(target) as { error: string }).error}</p>
      {/if}
      <p class="text-xs {label}">
        // headers are the factors' terms, the other cells their products. right when every cell is its row header times its
        column header, written as one simplified term (-8x, not x·(-8)), and the headers multiply to the key. any correct
        arrangement counts: either factor on top, terms in either order. blank the headers too and students find the factors
        themselves. a key you write factored, like (x-8)(x-5), works the same.
      </p>
    {:else}
      {#each keys as k, ki}
        {#if k.trim() && !readMath(k).ok}
          <p class="text-xs text-[var(--bad)]">blank {ki + 1}: {(readMath(k) as { error: string }).error}</p>
        {/if}
      {/each}
      <label class="flex flex-wrap items-center gap-2">
        <span class={label}>count as correct</span>
        <select class="{field} w-64 p-1" bind:value={q.match}>
          <option value="form">same form, any order</option>
          <option value="any">any equivalent form</option>
        </select>
      </label>
      <p class="text-xs {label}">
        // shaded blanks are what students fill in; type a key in each to have it marked (checked like a math answer, students never
        see it). given cells can use $...$ for math, like $x^2$ or $+5$. blanks with the same "any order" letter can be filled in
        either order: their keys and answers just have to pair up. the question is right when every keyed blank is right.
      </p>
    {/if}
  </div>
{/if}
