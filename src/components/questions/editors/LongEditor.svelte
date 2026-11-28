<!-- src/components/questions/editors/LongEditor.svelte -->
<!-- Long answer: no key. An optional rubric (what full credit needs) for grading after class;
     students never see it. -->
<script lang="ts">
  import { QUESTION_LIMITS, type Question } from '../../../lib/questions/index.ts';
  import { field, label } from '../../teach/ui.ts';

  let { q = $bindable(), keyless }: { q: Question; keyless: boolean } = $props();
</script>

{#if keyless}
  <p class="text-xs {label} help-text">// you mark these yourself as answers come in.</p>
{:else}
  <label class="block space-y-1">
    <span class={label}>rubric (optional, students never see it)</span>
    <textarea
      class={field}
      rows="3"
      maxlength={QUESTION_LIMITS.rubric}
      value={q.rubric ?? ''}
      oninput={(e) => (e.currentTarget.value.trim() ? (q.rubric = e.currentTarget.value) : delete q.rubric)}
      placeholder="What a full-credit answer has, e.g. uses the discriminant and says it's negative"
    ></textarea>
  </label>
  <p class="text-xs {label} help-text">// you grade these after class from the to-grade list, with points and a comment. students see them when you release scores.</p>
{/if}
