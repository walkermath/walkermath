<!-- src/components/questions/editors/ChoiceEditor.svelte -->
<!-- Multiple choice: 2 to 6 choices. One right choice (radio buttons), or "pick all that apply"
     (checkboxes: right when exactly the checked ones are picked). -->
<script lang="ts">
  import { QUESTION_LIMITS, type Question } from '../../../lib/questions/index.ts';
  import { field, label } from '../../teach/ui.ts';

  let { q = $bindable(), keyless }: { q: Question; keyless: boolean } = $props();

  const picks = $derived(q.answer === '' ? [] : q.answer.split(',').map(Number));

  function removeChoice(ci: number) {
    q.choices.splice(ci, 1);
    if (q.answer === '') return;
    // Picks after the removed one move up; the removed one is dropped.
    const next = picks.filter((p) => p !== ci).map((p) => (p > ci ? p - 1 : p));
    q.answer = q.multi ? next.join(',') : next.length ? String(next[0]) : '';
  }
  function togglePick(ci: number, on: boolean) {
    const set = new Set(picks);
    if (on) set.add(ci);
    else set.delete(ci);
    q.answer = [...set].sort((a, b) => a - b).join(',');
  }
  function setMulti(on: boolean) {
    if (on) q.multi = true;
    else {
      delete q.multi;
      // One right choice: keep the first one that was checked.
      q.answer = picks.length ? String(picks[0]) : '';
    }
  }
</script>

<div class="space-y-1">
  <label class="flex items-center gap-2 pb-1">
    <input type="checkbox" checked={!!q.multi} onchange={(e) => setMulti(e.currentTarget.checked)} />
    <span>students pick all that apply</span>
  </label>
  {#each q.choices as _, ci}
    <div class="flex items-center gap-2">
      {#if keyless}
        <span class="{label} w-4 text-center">{String.fromCharCode(65 + ci)}</span>
      {:else if q.multi}
        <input
          type="checkbox"
          checked={picks.includes(ci)}
          onchange={(e) => togglePick(ci, e.currentTarget.checked)}
          title="A right choice"
          aria-label="Choice {ci + 1} is one of the right ones"
        />
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
  {#if !keyless}
    <p class="text-xs {label} help-text">
      {q.multi ? '// check every right choice: it counts as right only when a student picks exactly those.' : '// pick the right choice with its circle.'} blank choices are dropped when you save.
    </p>
  {/if}
</div>
