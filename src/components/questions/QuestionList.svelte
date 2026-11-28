<!-- src/components/questions/QuestionList.svelte -->
<!-- A module's questions as compact cards: number, kind, the question, its key and tags. Tap a card
     to edit it in the question panel; [+ question] (between cards and at the end) adds one where it
     was tapped. Cards can be dragged to reorder (or moved with [up] / [down]), duplicated or deleted.
     The same list is used wherever questions go: prompts (Bellwork, Check-in, Exit ticket) and
     Active Feedback (`keyless`). -->
<script lang="ts">
  import { QUESTION_KINDS, keyText, questionTags, type Question } from '../../lib/questions/index.ts';
  import { label } from '../teach/ui.ts';
  import QuestionPanel from './QuestionPanel.svelte';

  let { questions = $bindable(), keyless = false, max }: { questions: Question[]; keyless?: boolean; max: number } = $props();

  /** The panel: editing question `index`, or adding a new one at `index`. */
  let open = $state<{ index: number; isNew: boolean } | null>(null);
  let dragFrom = $state<number | null>(null);
  let dropAt = $state<number | null>(null);

  const full = $derived(questions.length >= max);
  const plain = (s: string) => s.replace(/\$+/g, '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  function save(q: Question) {
    if (!open) return;
    if (open.isNew) questions.splice(open.index, 0, q);
    else questions[open.index] = q;
    open = null;
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= questions.length || from === to) return;
    const [q] = questions.splice(from, 1);
    questions.splice(to, 0, q);
  }
  function duplicate(i: number) {
    if (full) return;
    const copy = structuredClone($state.snapshot(questions[i])) as Question;
    copy.id = crypto.randomUUID();
    questions.splice(i + 1, 0, copy);
  }
  function remove(i: number) {
    const q = questions[i];
    if ((q.text.trim() || q.answer) && !confirm(`Delete question ${i + 1}?`)) return;
    questions.splice(i, 1);
  }
  function drop(to: number) {
    if (dragFrom !== null) move(dragFrom, to > dragFrom ? to - 1 : to);
    dragFrom = null;
    dropAt = null;
  }
</script>

{#snippet adder(at: number, end: boolean)}
  {#if !full}
    <div
      class="flex items-center gap-2 {end ? 'pt-1' : 'h-3 -my-1 opacity-0 hover:opacity-100 focus-within:opacity-100'} {dropAt === at ? 'opacity-100' : ''}"
      role="presentation"
      ondragover={(e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        dropAt = at;
      }}
      ondrop={(e) => {
        e.preventDefault();
        drop(at);
      }}
    >
      {#if dropAt === at}<div class="flex-1 h-0.5 bg-[var(--accent)]"></div>{/if}
      <button
        type="button"
        class="{end ? 'px-3 py-1.5 rounded border border-[var(--line)]' : 'text-[10px]'} hover:text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap"
        onclick={() => (open = { index: at, isNew: true })}
        aria-label={end ? 'Add a question' : `Add a question before question ${at + 1}`}
      >[+ question]</button>
    </div>
  {/if}
{/snippet}

<div class="space-y-2" role="list" aria-label="Questions">
  {#if questions.length === 0}<p class={label}>no questions yet.</p>{/if}
  {#each questions as q, qi (q.id)}
    {#if qi > 0}{@render adder(qi, false)}{/if}
    <div
      class="group flex gap-2 items-start p-2 rounded border bg-[var(--bg-surface)] {dragFrom === qi ? 'opacity-50' : ''} border-[var(--line)] hover:border-[var(--accent)]"
      draggable="true"
      role="listitem"
      ondragstart={(e) => {
        dragFrom = qi;
        e.dataTransfer?.setData('text/plain', String(qi));
      }}
      ondragend={() => {
        dragFrom = null;
        dropAt = null;
      }}
      ondragover={(e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        dropAt = e.offsetY < (e.currentTarget as HTMLElement).offsetHeight / 2 ? qi : qi + 1;
      }}
      ondrop={(e) => {
        e.preventDefault();
        drop(dropAt ?? qi);
      }}
    >
      <span class="cursor-grab {label} select-none pt-0.5" aria-hidden="true" title="Drag to reorder">⠿</span>
      <button type="button" class="flex-1 min-w-0 text-left cursor-pointer space-y-0.5" onclick={() => (open = { index: qi, isNew: false })} aria-label="Edit question {qi + 1}">
        <div class="flex flex-wrap items-baseline gap-x-2">
          <span class="font-bold">Q{qi + 1}</span>
          <span class={label}>{QUESTION_KINDS[q.kind]?.label ?? q.kind}</span>
          {#each questionTags(q) as t}<span class="{label} border border-[var(--line)] rounded px-1">{t}</span>{/each}
        </div>
        <div class="truncate">{clip(plain(q.text), 140) || '(no question text yet)'}</div>
        {#if !keyless}
          <div class="truncate {q.answer ? 'text-[var(--ok)]' : label}">{q.answer ? `key: ${clip(keyText(q), 100)}` : 'no key: not marked'}</div>
        {/if}
      </button>
      <div class="flex flex-col items-end gap-0.5 shrink-0">
        <div class="flex gap-1">
          <button type="button" class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-40" onclick={() => move(qi, qi - 1)} disabled={qi === 0} aria-label="Move question {qi + 1} up">[up]</button>
          <button type="button" class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-40" onclick={() => move(qi, qi + 1)} disabled={qi === questions.length - 1} aria-label="Move question {qi + 1} down">[down]</button>
        </div>
        <div class="flex gap-1">
          <button type="button" class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-40" onclick={() => duplicate(qi)} disabled={full} aria-label="Duplicate question {qi + 1}">[copy]</button>
          <button type="button" class="hover:text-[var(--bad)] cursor-pointer" onclick={() => remove(qi)} aria-label="Delete question {qi + 1}">[x]</button>
        </div>
      </div>
    </div>
  {/each}
  {@render adder(questions.length, true)}
</div>

{#if open}
  <QuestionPanel
    question={open.isNew ? null : questions[open.index]}
    number={open.index + 1}
    {keyless}
    onsave={save}
    onclose={() => (open = null)}
  />
{/if}
