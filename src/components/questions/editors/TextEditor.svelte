<!-- src/components/questions/editors/TextEditor.svelte -->
<!-- Short text and number questions: an optional key. Short text can accept other answers too;
     a number can require a percent and a number of decimal places. -->
<script lang="ts">
  import { QUESTION_LIMITS, numberRule, type Question } from '../../../lib/questions/index.ts';
  import { field, label } from '../../teach/ui.ts';

  let { q = $bindable(), keyless }: { q: Question; keyless: boolean } = $props();

  const setFormat = (v: string) => (v === 'percent' ? (q.format = 'percent') : delete q.format);
  const setDecimals = (v: string) => (v === '' ? delete q.decimals : (q.decimals = Number(v)));
</script>

{#if q.kind === 'number'}
  <div class="flex flex-wrap items-center gap-3">
    <label class="flex items-center gap-1">
      <span class={label}>answer as</span>
      <select class="{field} w-auto p-1" value={q.format ?? 'number'} onchange={(e) => setFormat(e.currentTarget.value)}>
        <option value="number">a number / proportion</option>
        <option value="percent">a percent</option>
      </select>
    </label>
    <label class="flex items-center gap-1">
      <span class={label}>rounding</span>
      <select class="{field} w-auto p-1" value={q.decimals === undefined ? '' : String(q.decimals)} onchange={(e) => setDecimals(e.currentTarget.value)}>
        <option value="">exact</option>
        {#each Array.from({ length: QUESTION_LIMITS.decimals + 1 }, (_, i) => i) as n}
          <option value={String(n)}>{n === 0 ? 'whole number' : `${n} decimal place${n === 1 ? '' : 's'}`}</option>
        {/each}
      </select>
    </label>
  </div>
  {#if numberRule(q)}
    <p class="text-xs {label}">// students see: "answer as {numberRule(q)}". only that form is accepted{q.format === 'percent' ? ' (84.13 or 84.13%, not 0.8413)' : ''}.</p>
  {/if}
{/if}

{#if !keyless}
  <label class="flex items-center gap-2">
    <span class="{label} whitespace-nowrap">answer key (optional, students never see it)</span>
    <input
      class="{field} p-1"
      bind:value={q.answer}
      maxlength={QUESTION_LIMITS.answer}
      inputmode={q.kind === 'number' ? 'decimal' : 'text'}
      placeholder={q.kind === 'number' && q.format === 'percent' ? 'e.g. 84.13 (the percent)' : ''}
    />
  </label>
  {#if q.kind === 'number'}
    <p class="text-xs {label} help-text">
      {#if q.decimals !== undefined}
        // type the key as exact as you like: it's rounded to {q.decimals} place{q.decimals === 1 ? '' : 's'} for marking. students must write exactly {q.decimals} place{q.decimals === 1 ? '' : 's'}.
      {:else if q.format === 'percent'}
        // type the key as a percent: 84.13 for 84.13%.
      {:else}
        // 3/4, 0.75 and .75 all match a key of 0.75. commas are fine: 1,000.
      {/if}
    </p>
  {:else}
    <div class="space-y-1">
      <span class={label}>also accept <span class="help-text">(other answers that count as right)</span></span>
      {#each q.alts ?? [] as _, ai}
        <div class="flex items-center gap-2">
          <input class="{field} p-1" bind:value={q.alts![ai]} maxlength={QUESTION_LIMITS.answer} placeholder="another accepted answer" />
          <button
            type="button"
            class="hover:text-[var(--bad)] cursor-pointer"
            aria-label="Remove accepted answer"
            onclick={() => {
              q.alts!.splice(ai, 1);
              if (!q.alts!.length) delete q.alts;
            }}>[x]</button>
        </div>
      {/each}
      {#if (q.alts?.length ?? 0) < QUESTION_LIMITS.alts && q.answer.trim()}
        <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={() => (q.alts = [...(q.alts ?? []), ''])}>[+ accepted answer]</button>
      {/if}
      <p class="text-xs {label} help-text">// matched ignoring capitals and extra spaces.</p>
    </div>
  {/if}
{:else}
  <p class="text-xs {label} help-text">// you mark these yourself as answers come in.</p>
{/if}
