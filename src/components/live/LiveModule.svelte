<!-- src/components/live/LiveModule.svelte -->
<!-- A module's content in a live lesson, as students see it (the control panel shows the same -->
<!-- thing, read-only, as its preview). Students answer here: questions, a short answer, or a -->
<!-- "done" tap. ClassLive owns the answers and saving; this only draws the form and reports edits. -->
<script module lang="ts">
  export type SaveState = '' | 'pending' | 'saving' | 'saved' | 'error' | 'closed';
</script>

<script lang="ts">
  import 'katex/dist/katex.min.css';
  import type { RoomModule } from '../../lib/lesson/room.ts';
  import { ANSWER_LIMITS, answerSpec, isAnswered, type Answers } from '../../lib/lesson/answers.ts';
  import { renderMarkdown } from '../../lib/lesson/markdown.ts';
  import SlideView from '../teach/SlideView.svelte';

  let {
    module,
    livePage = 0,
    follow = true,
    runId = '',
    answers,
    editable = false,
    saveState = '',
    onanswer
  }: {
    module: RoomModule;
    /** The page the teacher is showing (Notes). */
    livePage?: number;
    /** Students can flip through Notes pages; false keeps them on the live page (teacher preview). */
    follow?: boolean;
    /** The live run, so a Coliseum score made here is filed under this lesson. */
    runId?: string;
    /** The student's answers to this module. Undefined = not a student (the control panel's preview). */
    answers?: Answers;
    /** The module is open: the student can change their answers. */
    editable?: boolean;
    saveState?: SaveState;
    /** A change to the answers; `flush` = save now (a choice picked, a field left) rather than after a pause in typing. */
    onanswer?: (answers: Answers, flush: boolean) => void;
  } = $props();

  const label = 'text-[var(--text-muted)]';
  const c = $derived(module.config ?? {});
  const student = $derived(answers !== undefined);
  const spec = $derived(answerSpec(module));
  const mine = $derived(answers ?? {});
  const answered = $derived(!!spec && isAnswered(spec, answers));

  const set = (key: string, value: string, flush: boolean) => {
    if (!editable) return;
    onanswer?.({ ...mine, [key]: value }, flush);
  };

  /* Notes: students follow the live page until they flip away; [back to live] returns. */
  let browsing = $state<number | null>(null);
  const pages = $derived<{ id: string; markdown: string }[]>(module.type === 'notes' ? (c.slides ?? []) : []);
  const shown = $derived(Math.min(browsing ?? livePage, Math.max(0, pages.length - 1)));
  $effect(() => {
    void module.id; // a new module starts on its live page
    browsing = null;
  });
  const flip = (to: number) => {
    if (to < 0 || to >= pages.length) return;
    browsing = to === livePage ? null : to;
  };

  const coliseumSrc = $derived(
    `/embed/coliseum/${encodeURIComponent(c.coliseumId ?? '')}${runId ? `?run=${encodeURIComponent(runId)}&module=${encodeURIComponent(module.id)}` : ''}`
  );

  const field =
    'w-full p-2 rounded border border-[var(--line)] bg-[var(--bg)] text-sm focus:outline-none focus:border-[var(--accent)] disabled:opacity-80 disabled:cursor-not-allowed';
</script>

{#snippet status()}
  {#if student && spec}
    <p class="text-xs {saveState === 'error' ? 'text-[var(--warn)]' : label}" aria-live="polite">
      {#if editable}
        {saveState === 'saving' || saveState === 'pending'
          ? '// saving...'
          : saveState === 'error'
            ? "// not saved yet: check your connection. it'll keep trying."
            : saveState === 'saved'
              ? '// saved. you can change it until time runs out.'
              : '// your answers save as you go.'}
      {:else if saveState === 'closed'}
        // this closed before your last change saved. what's shown is what was handed in.
      {:else if answered}
        // handed in. this one is closed.
      {:else}
        // closed. nothing was handed in for this one.
      {/if}
    </p>
  {/if}
{/snippet}

{#snippet doneTap()}
  {#if student}
    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="px-3 py-1.5 rounded border-2 text-sm font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 {mine.done === '1'
          ? 'border-[var(--ok)] text-[var(--ok)]'
          : 'border-[var(--accent)] text-[var(--accent)]'}"
        disabled={!editable}
        aria-pressed={mine.done === '1'}
        onclick={() => set('done', mine.done === '1' ? '' : '1', true)}
      >
        {mine.done === '1' ? "[✓ done]" : "[I'm done]"}
      </button>
      {#if editable && mine.done === '1'}<span class="text-xs {label}">// tap again to undo</span>{/if}
    </div>
    {@render status()}
  {/if}
{/snippet}

<div class="space-y-4">
  {#if module.type === 'notes'}
    {#if pages.length}
      <SlideView markdown={pages[shown]?.markdown ?? ''} scroll />
      {#if !follow || pages.length > 1}
        <div class="flex flex-wrap items-center gap-3 text-xs">
          {#if follow}
            <button type="button" class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-40" onclick={() => flip(shown - 1)} disabled={shown === 0}>[&lt; page]</button>
            <span class={label}>page {shown + 1} of {pages.length}</span>
            <button type="button" class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-40" onclick={() => flip(shown + 1)} disabled={shown >= pages.length - 1}>[page &gt;]</button>
            {#if browsing !== null && browsing !== livePage}
              <button type="button" class="ml-auto font-bold text-[var(--accent)] cursor-pointer" onclick={() => (browsing = null)}>[back to live: page {livePage + 1}]</button>
            {/if}
          {:else}
            <span class={label}>page {shown + 1} of {pages.length}</span>
          {/if}
        </div>
      {/if}
    {/if}
  {:else if module.type === 'prompt'}
    <ol class="space-y-3">
      {#each c.questions ?? [] as q, i (q.id)}
        <li class="p-4 rounded border border-[var(--line)] bg-[var(--bg-surface)] space-y-2">
          <div class="font-bold">Q{i + 1}</div>
          <div class="slide-text">{@html renderMarkdown(q.text)}</div>
          {#if q.kind === 'choice'}
            <ul class="space-y-1" role={student ? 'radiogroup' : undefined}>
              {#each q.choices as choice, ci}
                <li>
                  {#if student}
                    <label
                      class="flex gap-2 items-start p-2 rounded border {mine[q.id] === String(ci)
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                        : 'border-[var(--line)]'} {editable ? 'cursor-pointer hover:border-[var(--accent)]' : 'cursor-default'}"
                    >
                      <input
                        type="radio"
                        class="mt-1"
                        name="q-{q.id}"
                        value={String(ci)}
                        checked={mine[q.id] === String(ci)}
                        disabled={!editable}
                        onchange={() => set(q.id, String(ci), true)}
                      />
                      <span class={label}>{String.fromCharCode(65 + ci)}.</span>
                      <span>{@html renderMarkdown(choice)}</span>
                    </label>
                  {:else}
                    <div class="flex gap-2"><span class={label}>{String.fromCharCode(65 + ci)}.</span><span>{@html renderMarkdown(choice)}</span></div>
                  {/if}
                </li>
              {/each}
            </ul>
          {:else if student}
            {#if q.kind === 'number'}
              <input
                type="text"
                inputmode="decimal"
                autocomplete="off"
                class={field}
                aria-label="Answer to question {i + 1}"
                placeholder={editable ? 'a number (3/4 and -2.5 work)' : ''}
                maxlength={ANSWER_LIMITS.number}
                value={mine[q.id] ?? ''}
                disabled={!editable}
                oninput={(e) => set(q.id, e.currentTarget.value, false)}
                onchange={(e) => set(q.id, e.currentTarget.value, true)}
              />
            {:else}
              <textarea
                rows="2"
                class={field}
                aria-label="Answer to question {i + 1}"
                placeholder={editable ? 'your answer' : ''}
                maxlength={ANSWER_LIMITS.text}
                value={mine[q.id] ?? ''}
                disabled={!editable}
                oninput={(e) => set(q.id, e.currentTarget.value, false)}
                onchange={(e) => set(q.id, e.currentTarget.value, true)}
              ></textarea>
            {/if}
          {/if}
        </li>
      {/each}
    </ol>
    {#if !(c.questions ?? []).length}<p class={label}>// no questions in this module.</p>{/if}
    {@render status()}
  {:else}
    {#if c.instructions}
      <div class="p-4 rounded border border-[var(--line)] bg-[var(--bg-surface)] slide-text">{@html renderMarkdown(c.instructions)}</div>
    {/if}
    {#if module.type === 'activity' && c.category === 'coliseum' && c.coliseumId}
      <iframe
        title={module.title}
        src={coliseumSrc}
        class="w-full h-[75vh] min-h-[32rem] rounded border border-[var(--line)] bg-[var(--bg-surface)]"
      ></iframe>
    {/if}
    {#if (c.links ?? []).length}
      <ul class="space-y-1 text-sm">
        {#each c.links as link}
          <li><a class="underline hover:text-[var(--accent)]" href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a></li>
        {/each}
      </ul>
    {/if}
    {#if spec?.kind === 'short'}
      {#if student}
        <label class="block space-y-1">
          <span class="text-sm font-bold">your answer</span>
          <textarea
            rows="4"
            class={field}
            maxlength={ANSWER_LIMITS.short}
            value={mine.short ?? ''}
            disabled={!editable}
            oninput={(e) => set('short', e.currentTarget.value, false)}
            onchange={(e) => set('short', e.currentTarget.value, true)}
          ></textarea>
        </label>
        {@render status()}
      {:else}
        <p class={label}>// students type a short answer here.</p>
      {/if}
    {:else if spec?.kind === 'tap'}
      {#if student}
        {@render doneTap()}
      {:else}
        <p class={label}>// students tap [I'm done] here.</p>
      {/if}
    {/if}
  {/if}
</div>
