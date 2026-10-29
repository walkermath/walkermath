<!-- src/components/teach/ModuleSettings.svelte -->
<!-- The settings panel under the tile chain for the open module: timing, then its type's content. -->
<script lang="ts">
  import {
    LIMITS,
    MODULE_TYPES,
    newQuestion,
    type LessonModule,
    type Link,
    type Question,
    type QuestionKind
  } from '../../lib/lesson/modules.ts';
  import { floorOf, capOf } from '../../lib/lesson/pacing.ts';
  import { mmss } from '../../lib/lesson/time.ts';
  import MmssInput from './MmssInput.svelte';
  import { btn, btnDanger, field, heading, label, panel } from './ui.ts';

  type Note = { id: string; title: string; subject: string | null; unitTitle: string | null };

  // config is `any` here so the template can bind straight into it (Svelte can't bind through a
  // $derived alias); cleanModule() on the server is what enforces each type's shape.
  type EditableModule = Omit<LessonModule, 'config'> & { config: any };

  let {
    module = $bindable(),
    notes = [],
    index,
    count,
    onmove,
    onremove
  }: {
    module: EditableModule;
    notes?: Note[];
    index: number;
    count: number;
    onmove: (to: number) => void;
    onremove: () => void;
  } = $props();

  const info = $derived(MODULE_TYPES[module.type]);

  function setPacing(p: 'flex' | 'locked') {
    module.pacing = p;
    if (p === 'locked') module.minSec = null;
  }

  /* prompt questions */
  function addQuestion(kind: QuestionKind) {
    module.config.questions.push(newQuestion(kind));
  }
  function setKind(qi: number, kind: QuestionKind) {
    const q: Question = module.config.questions[qi];
    q.kind = kind;
    q.answer = '';
    if (kind === 'choice' && q.choices.length < 2) q.choices = ['', ''];
  }
  function moveQuestion(qi: number, to: number) {
    const qs: Question[] = module.config.questions;
    if (to < 0 || to >= qs.length) return;
    const [q] = qs.splice(qi, 1);
    qs.splice(to, 0, q);
  }
  function removeChoice(qi: number, ci: number) {
    const q: Question = module.config.questions[qi];
    q.choices.splice(ci, 1);
    const a = Number(q.answer);
    if (q.answer !== '' && a === ci) q.answer = '';
    else if (q.answer !== '' && a > ci) q.answer = String(a - 1);
  }

  /* links (activity + independent) */
  const addLink = () => module.config.links.push({ label: '', url: '' } as Link);
  const removeLink = (i: number) => module.config.links.splice(i, 1);

  const noteGroups = $derived.by(() => {
    const groups = new Map<string, Note[]>();
    for (const n of notes) {
      const g = n.unitTitle || n.subject || 'Notes';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(n);
    }
    return [...groups];
  });
</script>

<section class="{panel} space-y-5 text-xs">
  <div class="flex flex-wrap justify-between items-start gap-3">
    <div>
      <div class={heading}>// module {index + 1} · {info.label}</div>
      <div class="{label} mt-1">{info.hint}</div>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" class={btn} onclick={() => onmove(index - 1)} disabled={index === 0} title="Alt + left arrow on the tile">[&lt;- move]</button>
      <button type="button" class={btn} onclick={() => onmove(index + 1)} disabled={index === count - 1} title="Alt + right arrow on the tile">[move -&gt;]</button>
      <button type="button" class={btnDanger} onclick={onremove}>[remove]</button>
    </div>
  </div>

  <!-- timing -->
  <div class="grid gap-3 sm:grid-cols-[1fr_7rem]">
    <label class="block space-y-1">
      <span class={label}>title (students see this)</span>
      <input class={field} bind:value={module.title} maxlength={LIMITS.moduleTitle} required />
    </label>
    <label class="block space-y-1">
      <span class={label}>planned time</span>
      <MmssInput class={field} bind:value={module.plannedSec} />
    </label>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <fieldset class="space-y-2">
      <legend class="{label} mb-1">when the schedule has to re-fit</legend>
      <label class="flex items-start gap-2 cursor-pointer">
        <input type="radio" name="pacing-{module.id}" checked={module.pacing === 'flex'} onchange={() => setPacing('flex')} />
        <span>
          <b>flex</b>: shares overruns and spare time with the other flex modules
          <span class="block {label}">
            between {mmss(floorOf(module))} and {mmss(capOf(module))}
          </span>
        </span>
      </label>
      {#if module.pacing === 'flex'}
        <label class="flex items-center gap-2 pl-6">
          <span class={label}>never shorter than</span>
          <MmssInput
            class="{field} w-20 p-1"
            bind:value={module.minSec}
            allowEmpty
            max={module.plannedSec}
            placeholder={mmss(floorOf({ ...module, minSec: null }))}
          />
          <span class={label}>(blank = half)</span>
        </label>
      {/if}
      <label class="flex items-start gap-2 cursor-pointer">
        <input type="radio" name="pacing-{module.id}" checked={module.pacing === 'locked'} onchange={() => setPacing('locked')} />
        <span><b>locked</b>: always gets its planned time (good for an exit ticket)</span>
      </label>
    </fieldset>

    <fieldset class="space-y-2">
      <legend class="{label} mb-1">when time runs out</legend>
      <label class="flex items-start gap-2 cursor-pointer">
        <input type="radio" name="tu-{module.id}" checked={module.onTimeUp === 'auto'} onchange={() => (module.onTimeUp = 'auto')} />
        <span><b>move on</b>: collect answers and go to the next module</span>
      </label>
      <label class="flex items-start gap-2 cursor-pointer">
        <input type="radio" name="tu-{module.id}" checked={module.onTimeUp === 'hold'} onchange={() => (module.onTimeUp = 'hold')} />
        <span><b>hold</b>: collect answers, show "time's up", wait for you</span>
      </label>
    </fieldset>
  </div>

  <hr class="border-[var(--border-color)]" />

  <!-- content -->
  {#if module.type === 'prompt'}
    <div class="space-y-3">
      <div class={heading}>// questions ({module.config.questions.length})</div>
      {#if module.config.questions.length === 0}
        <p class={label}>no questions yet.</p>
      {/if}
      {#each module.config.questions as q, qi (q.id)}
        <div class="p-3 rounded border border-[var(--border-color)] space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-bold">Q{qi + 1}</span>
            <select class="{field} w-40 p-1" value={q.kind} onchange={(e) => setKind(qi, (e.currentTarget as HTMLSelectElement).value as QuestionKind)}>
              <option value="text">short text</option>
              <option value="number">number</option>
              <option value="choice">multiple choice</option>
            </select>
            <span class="flex-1"></span>
            <button type="button" class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-40" onclick={() => moveQuestion(qi, qi - 1)} disabled={qi === 0} aria-label="Move up">[up]</button>
            <button type="button" class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-40" onclick={() => moveQuestion(qi, qi + 1)} disabled={qi === module.config.questions.length - 1} aria-label="Move down">[down]</button>
            <button type="button" class="hover:text-[var(--bad)] cursor-pointer" onclick={() => module.config.questions.splice(qi, 1)}>[x]</button>
          </div>
          <textarea class={field} rows="2" bind:value={q.text} maxlength={LIMITS.text} placeholder="Question (use $...$ for math)"></textarea>

          {#if q.kind === 'choice'}
            <div class="space-y-1">
              {#each q.choices as _, ci}
                <div class="flex items-center gap-2">
                  <input
                    type="radio"
                    name="key-{q.id}"
                    checked={q.answer === String(ci)}
                    onchange={() => (q.answer = String(ci))}
                    title="Correct answer"
                    aria-label="Mark choice {ci + 1} correct"
                  />
                  <input class="{field} p-1" bind:value={q.choices[ci]} maxlength={LIMITS.choice} placeholder="Choice {String.fromCharCode(65 + ci)}" />
                  {#if q.choices.length > 2}
                    <button type="button" class="hover:text-[var(--bad)] cursor-pointer" onclick={() => removeChoice(qi, ci)} aria-label="Remove choice">[x]</button>
                  {/if}
                </div>
              {/each}
              <div class="flex gap-3 pl-6">
                {#if q.choices.length < LIMITS.choices}
                  <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={() => q.choices.push('')}>[+ choice]</button>
                {/if}
                {#if q.answer !== ''}
                  <button type="button" class="hover:text-[var(--accent)] cursor-pointer {label}" onclick={() => (q.answer = '')}>[no answer key]</button>
                {/if}
              </div>
            </div>
          {:else}
            <label class="flex items-center gap-2">
              <span class="{label} whitespace-nowrap">answer key (optional, students never see it)</span>
              <input class="{field} p-1" bind:value={q.answer} maxlength={LIMITS.answer} inputmode={q.kind === 'number' ? 'decimal' : 'text'} />
            </label>
          {/if}
        </div>
      {/each}
      {#if module.config.questions.length < LIMITS.questions}
        <div class="flex flex-wrap gap-2">
          <button type="button" class={btn} onclick={() => addQuestion('text')}>[+ short text]</button>
          <button type="button" class={btn} onclick={() => addQuestion('number')}>[+ number]</button>
          <button type="button" class={btn} onclick={() => addQuestion('choice')}>[+ multiple choice]</button>
        </div>
      {/if}
    </div>
  {:else if module.type === 'notes'}
    <div class="space-y-3">
      <div class="flex flex-wrap gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="src-{module.id}" checked={module.config.source === 'note'} onchange={() => (module.config.source = 'note')} />
          a page from /notes
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="src-{module.id}" checked={module.config.source === 'markdown'} onchange={() => (module.config.source = 'markdown')} />
          my own notes (Markdown)
        </label>
      </div>
      {#if module.config.source === 'note'}
        <div class="flex flex-wrap items-center gap-3">
          <select class="{field} sm:w-96" bind:value={module.config.noteId}>
            <option value="">pick a note...</option>
            {#each noteGroups as [group, list]}
              <optgroup label={group}>
                {#each list as n}<option value={n.id}>{n.title}</option>{/each}
              </optgroup>
            {/each}
          </select>
          {#if module.config.noteId}
            <a class="underline hover:text-[var(--accent)]" href="/notes/{module.config.noteId}" target="_blank" rel="noopener">[open note]</a>
          {/if}
        </div>
        {#if notes.length === 0}
          <p class={label}>// the notes list didn't load (it's built with the site: run npm run build).</p>
        {/if}
      {:else}
        <textarea class="{field} font-mono" rows="10" bind:value={module.config.markdown} maxlength={LIMITS.markdown} placeholder={'## Example\n\nSolve $2x + 3 = 11$ ...'}></textarea>
      {/if}
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" bind:checked={module.config.revealSections} />
        reveal one section (## heading) at a time during the lesson
      </label>
    </div>
  {:else}
    <!-- activity and independent work share instructions + links -->
    <div class="space-y-3">
      <label class="block space-y-1">
        <span class={label}>instructions</span>
        <textarea class={field} rows="4" bind:value={module.config.instructions} maxlength={LIMITS.text} placeholder="What students do (use $...$ for math)"></textarea>
      </label>

      <div class="space-y-1">
        <span class={label}>links</span>
        {#each module.config.links as link, li}
          <div class="flex gap-2 items-center">
            <input class="{field} p-1 w-40" bind:value={link.label} maxlength={LIMITS.linkLabel} placeholder="label" />
            <input class="{field} p-1" bind:value={link.url} maxlength={LIMITS.url} placeholder="https://..." type="url" />
            <button type="button" class="hover:text-[var(--bad)] cursor-pointer" onclick={() => removeLink(li)} aria-label="Remove link">[x]</button>
          </div>
        {/each}
        {#if module.config.links.length < LIMITS.links}
          <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={addLink}>[+ link]</button>
        {/if}
      </div>

      {#if module.type === 'activity'}
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" bind:checked={module.config.doneTap} />
          students tap "done" when finished
        </label>
      {:else}
        <label class="flex items-center gap-2">
          <span class={label}>students hand in</span>
          <select class="{field} w-56 p-1" bind:value={module.config.response}>
            <option value="none">nothing</option>
            <option value="done">a "done" tap</option>
            <option value="short">a short answer (collected at the end)</option>
          </select>
        </label>
      {/if}
    </div>
  {/if}
</section>
