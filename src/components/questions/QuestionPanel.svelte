<!-- src/components/questions/QuestionPanel.svelte -->
<!-- The question editor: a side panel that slides in from the right (full screen when narrow), with
     the lesson still visible beside it.
       1. A new question starts with the kind picker (tiles from the registry).
       2. Then the kind's editor, next to the student's view of it and a "try an answer" check that
          runs the real grader on the teacher's own key, in this browser only.
     Save checks it the way the server will (cleanQuestion), so a broken question never goes in.
     Closing with unsaved changes asks first; switching kind warns before it drops a key. -->
<script lang="ts">
  import {
    KEYLESS_KINDS,
    QUESTION_KINDS,
    QUESTION_KIND_LIST,
    cleanQuestion,
    gradeAnswer,
    keyText,
    newQuestion,
    questionTags,
    type Question,
    type QuestionKind
  } from '../../lib/questions/index.ts';
  import type { Answers } from '../../lib/lesson/answers.ts';
  import { parseList } from '../../lib/lesson/grid.ts';
  import { QUESTION_LIMITS } from '../../lib/questions/index.ts';
  import LiveModule from '../live/LiveModule.svelte';
  import { btn, btnMain, field, heading, label } from '../teach/ui.ts';
  import { EDITORS } from './registry.ts';

  let {
    question,
    number,
    keyless = false,
    onsave,
    onclose
  }: {
    /** The question to edit, or null for a new one (starts at the kind picker). */
    question: Question | null;
    /** Its number in the module (1-based), for the heading and messages. */
    number: number;
    /** Active Feedback: keyless kinds only, no key. */
    keyless?: boolean;
    onsave: (q: Question) => void;
    onclose: () => void;
  } = $props();

  const kinds = $derived(keyless ? KEYLESS_KINDS : QUESTION_KIND_LIST);
  // svelte-ignore state_referenced_locally
  let draft = $state<Question | null>(question ? structuredClone($state.snapshot(question)) : null);
  // svelte-ignore state_referenced_locally
  const startJson = question ? JSON.stringify(question) : '';
  let error = $state('');
  let tries = $state<Answers>({});

  const dirty = $derived(draft ? JSON.stringify(draft) !== startJson : false);

  function pick(kind: QuestionKind) {
    draft = newQuestion(kind);
    tries = {};
  }

  /** A key worth warning about: typed text, or at least one filled-in blank / placed card. */
  const hasKey = (q: Question) => (q.answer.trim().startsWith('[') ? parseList(q.answer).some((k) => k.trim()) : q.answer.trim() !== '');
  function switchKind(kind: QuestionKind) {
    if (!draft || kind === draft.kind) return;
    if (hasKey(draft) && !confirm(`Switching to ${QUESTION_KINDS[kind].label} clears this question's answer key. Switch anyway?`)) {
      // put the select back
      draft = { ...draft };
      return;
    }
    const fresh = newQuestion(kind);
    draft = { ...fresh, id: draft.id, text: draft.text };
    tries = {};
  }

  function close() {
    if ((dirty || (!question && draft && (draft.text.trim() || hasKey(draft)))) && !confirm('Close without saving this question?')) return;
    onclose();
  }

  function save() {
    if (!draft) return;
    const clean = cleanQuestion($state.snapshot(draft), 'Not saved', number, keyless, kinds);
    if (typeof clean === 'string') {
      error = clean.replace(`Not saved: question ${number} is empty.`, 'Not saved: type the question first.');
      return;
    }
    error = '';
    onsave(clean);
  }

  /* The preview: how students see it, through the real student view. Keys are stripped, as for students. */
  const preview = $derived.by(() => {
    if (!draft) return null;
    const { answer: _a, ...pub } = $state.snapshot(draft) as Question;
    // Shown as a question set either way: prompts and Active Feedback draw questions the same way.
    return { id: 'preview', type: 'prompt', title: '', plannedSec: 0, pacing: 'flex', collects: true, config: { category: 'other', questions: [pub] } } as any;
  });
  /** The grade a tried answer would get, from the teacher's own key (nothing leaves this browser). */
  const tried = $derived.by(() => {
    if (!draft) return null;
    const a = tries[draft.id];
    if (a === undefined || a.trim() === '') return null;
    const clean = cleanQuestion($state.snapshot(draft), '', number, keyless, kinds);
    return gradeAnswer(typeof clean === 'string' ? (draft as Question) : clean, a);
  });
  const marks = $derived(draft && tried ? { [draft.id]: tried.status === 'right' ? true : tried.status === 'wrong' || tried.status === 'partial' ? false : null } : undefined);

  const Editor = $derived(draft ? EDITORS[draft.kind] : null);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<!-- The lesson stays visible on wide screens; the backdrop only catches taps outside the panel. -->
<div class="fixed inset-0 z-40 bg-black/20" role="presentation" onclick={close}></div>
<aside
  class="fixed z-40 inset-y-0 right-0 w-full md:w-[44rem] max-w-full bg-[var(--bg-surface)] border-l border-[var(--line)] shadow-2xl overflow-y-auto text-xs"
  role="dialog"
  aria-modal="true"
  aria-label={question ? `Edit question ${number}` : 'New question'}
>
  <div class="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b border-[var(--line)] bg-[var(--bg-surface)]">
    <div class="{heading} flex-1">// {question ? `question ${number}` : 'new question'}{draft ? ` · ${QUESTION_KINDS[draft.kind].label}` : ''}</div>
    {#if draft}<button type="button" class={btnMain} onclick={save}>[save]</button>{/if}
    <button type="button" class={btn} onclick={close}>[close]</button>
  </div>

  <div class="p-4 space-y-4">
    {#if !draft}
      <!-- Step 1: what kind of question. -->
      <p class={label}>what kind of question?</p>
      <div class="grid gap-2 sm:grid-cols-2">
        {#each kinds as k}
          <button
            type="button"
            class="text-left p-3 rounded border border-[var(--line)] hover:border-[var(--accent)] cursor-pointer space-y-1"
            onclick={() => pick(k)}
          >
            <div class="font-bold text-sm">{QUESTION_KINDS[k].label}</div>
            <div class={label}>{QUESTION_KINDS[k].hint}</div>
          </button>
        {/each}
      </div>
      {#if keyless}<p class="{label} help-text">// active feedback has no answer keys: you mark each answer yourself, so grids and card sorts aren't offered.</p>{/if}
    {:else}
      <!-- Step 2: the question, its key, and how students see it. -->
      <div class="grid gap-4 xl:grid-cols-2 items-start">
        <div class="space-y-3 min-w-0">
          <label class="flex items-center gap-2">
            <span class={label}>kind</span>
            <select class="{field} w-48 p-1" value={draft.kind} onchange={(e) => switchKind(e.currentTarget.value as QuestionKind)}>
              {#each kinds as k}<option value={k}>{QUESTION_KINDS[k].label}</option>{/each}
            </select>
          </label>
          <textarea class={field} rows="3" data-terms bind:value={draft.text} maxlength={QUESTION_LIMITS.text} placeholder="Question (use $...$ for math)"></textarea>
          {#if Editor}<Editor bind:q={draft} {keyless} />{/if}
          {#if error}<p class="text-[var(--bad)]" role="alert">// {error}</p>{/if}
        </div>

        <div class="space-y-2 min-w-0">
          <div class={heading}>// what students see</div>
          <div class="p-2 rounded border border-dashed border-[var(--line)]">
            {#if preview}
              {#key draft.kind}
                <LiveModule module={preview} answers={tries} editable={true} quiet {marks} onanswer={(a) => (tries = a)} />
              {/key}
            {/if}
          </div>
          {#if !keyless}
            <p class={label} aria-live="polite">
              {#if !draft.answer}
                // try an answer above. add a key to see whether it's marked right.
              {:else if !tried}
                // try an answer above to check your key{keyText(draft) ? ` (${keyText(draft)})` : ''}. nothing is sent.
              {:else if tried.status === 'right'}
                <span class="text-[var(--ok)] font-bold">✓ marked right</span>
              {:else if tried.status === 'wrong'}
                <span class="text-[var(--bad)] font-bold">✗ marked not right</span>
              {:else}
                // nothing to mark yet.
              {/if}
            </p>
            {#if questionTags(draft).length}<p class={label}>// {questionTags(draft).join(' · ')}</p>{/if}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</aside>
