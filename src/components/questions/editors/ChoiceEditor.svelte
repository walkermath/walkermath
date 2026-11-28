<!-- src/components/questions/editors/ChoiceEditor.svelte -->
<!-- Multiple choice: 2 to 6 choices; the radio button marks the right one (the key). -->
<script lang="ts">
  import { QUESTION_LIMITS, type Question } from '../../../lib/questions/index.ts';
  import { field, label } from '../../teach/ui.ts';

  let { q = $bindable(), keyless }: { q: Question; keyless: boolean } = $props();

  function removeChoice(ci: number) {
    q.choices.splice(ci, 1);
    const a = Number(q.answer);
    if (q.answer !== '' && a === ci) q.answer = '';
    else if (q.answer !== '' && a > ci) q.answer = String(a - 1);
  }
</script>

<div class="space-y-1">
  {#each q.choices as _, ci}
    <div class="flex items-center gap-2">
      {#if keyless}
        <span class="{label} w-4 text-center">{String.fromCharCode(65 + ci)}</span>
      {:else}
        <input
          type="radio"
          name="key-{q.id}"
          checked={q.answer === String(ci)}
          onchange={() => (q.answer = String(ci))}
          title="Correct answer"
          aria-label="Mark choice {ci + 1} correct"
        />
      {/if}
      <input class="{field} p-1" bind:value={q.choices[ci]} maxlength={QUESTION_LIMITS.choice} placeholder="Choice {String.fromCharCode(65 + ci)}" />
      {#if q.choices.length > 2}
        <button type="button" class="hover:text-[var(--bad)] cursor-pointer" onclick={() => removeChoice(ci)} aria-label="Remove choice">[x]</button>
      {/if}
    </div>
  {/each}
  <div class="flex gap-3 pl-6">
    {#if q.choices.length < QUESTION_LIMITS.choices}
      <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={() => q.choices.push('')}>[+ choice]</button>
    {/if}
    {#if !keyless && q.answer !== ''}
      <button type="button" class="hover:text-[var(--accent)] cursor-pointer {label}" onclick={() => (q.answer = '')}>[no answer key]</button>
    {/if}
  </div>
  {#if !keyless}<p class="text-xs {label} help-text">// pick the right choice with its circle. blank choices are dropped when you save.</p>{/if}
</div>
