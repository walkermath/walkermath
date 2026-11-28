<!-- src/components/questions/editors/TextEditor.svelte -->
<!-- Short text and number questions: an optional key. -->
<script lang="ts">
  import { QUESTION_LIMITS, type Question } from '../../../lib/questions/index.ts';
  import { field, label } from '../../teach/ui.ts';

  let { q = $bindable(), keyless }: { q: Question; keyless: boolean } = $props();
</script>

{#if !keyless}
  <label class="flex items-center gap-2">
    <span class="{label} whitespace-nowrap">answer key (optional, students never see it)</span>
    <input class="{field} p-1" bind:value={q.answer} maxlength={QUESTION_LIMITS.answer} inputmode={q.kind === 'number' ? 'decimal' : 'text'} />
  </label>
  {#if q.kind === 'number'}
    <p class="text-xs {label} help-text">// 3/4, 0.75 and .75 all match a key of 0.75. commas are fine: 1,000.</p>
  {:else}
    <p class="text-xs {label} help-text">// matched ignoring capitals and extra spaces.</p>
  {/if}
{:else}
  <p class="text-xs {label} help-text">// you mark these yourself as answers come in.</p>
{/if}
