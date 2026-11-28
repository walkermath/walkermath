<!-- src/components/questions/editors/MathEditor.svelte -->
<!-- Math (algebra) questions: an optional key, read back as the checker sees it, and how to match. -->
<script lang="ts">
  import { readMath } from '../../../lib/lesson/mathcheck.ts';
  import { QUESTION_LIMITS, type Question } from '../../../lib/questions/index.ts';
  import { field, label } from '../../teach/ui.ts';

  let { q = $bindable(), keyless }: { q: Question; keyless: boolean } = $props();
</script>

{#if keyless}
  <p class="text-xs {label} help-text">// students type ^ for powers, sqrt() for roots and i for the imaginary unit.</p>
{:else}
  <div class="space-y-1">
    <label class="flex items-center gap-2">
      <span class="{label} whitespace-nowrap">answer key (optional, students never see it)</span>
      <input class="{field} p-1" bind:value={q.answer} maxlength={QUESTION_LIMITS.answer} autocomplete="off" spellcheck="false" placeholder="(x+5)(x+2)   or   x=±3" />
    </label>
    {#if q.answer.trim()}
      {@const read = readMath(q.answer)}
      <p class="text-xs {read.ok ? label : 'text-[var(--bad)]'}">{read.ok ? `read as: ${read.text}` : read.error}</p>
    {/if}
    <label class="flex flex-wrap items-center gap-2">
      <span class={label}>count as correct</span>
      <select class="{field} w-64 p-1" bind:value={q.match}>
        <option value="form">same form, any order</option>
        <option value="any">any equivalent form</option>
      </select>
    </label>
    <p class="text-xs {label} help-text">
      // same form: (x+2)(x+5) matches (x+5)(x+2) but not x²+7x+10, and 2(x+3) does not match 2x+6. any equivalent form accepts all of
      those. an equation must match both sides (x+5=12 is not x=7). "x=3 or x=-3" and "x=±3" are the same answer. students type ^ for
      powers, sqrt() for roots and i for the imaginary unit.
    </p>
  </div>
{/if}
