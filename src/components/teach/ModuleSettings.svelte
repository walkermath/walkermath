<!-- src/components/teach/ModuleSettings.svelte -->
<!-- The settings panel under the tile chain for the open module: timing, then its type's content. -->
<script lang="ts">
  import {
    ACTIVITY_CATEGORIES,
    MIDDLE_PROMPT_CATEGORIES,
    PROMPT_CATEGORIES,
    pinOf,
    LIMITS,
    MODULE_TYPES,
    activityCategory,
    promptCategory,
    toFeedback,
    type ActivityCategory,
    type PromptCategory,
    type LessonModule,
    type Link
  } from '../../lib/lesson/modules.ts';
  import { floorOf, capOf } from '../../lib/lesson/pacing.ts';
  import QuestionList from '../questions/QuestionList.svelte';
  import { mmss } from '../../lib/lesson/time.ts';
  import MmssInput from './MmssInput.svelte';
  import NotesEditor from './NotesEditor.svelte';
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
    canLeft = index > 0,
    canRight = index < count - 1,
    onmove,
    onremove
  }: {
    module: EditableModule;
    notes?: Note[];
    index: number;
    count: number;
    /** Whether the module can move left / right (bellwork and exit ticket stay at the ends). */
    canLeft?: boolean;
    canRight?: boolean;
    onmove: (to: number) => void;
    onremove: () => void;
  } = $props();

  const info = $derived(MODULE_TYPES[module.type]);

  /* The explanations under flex / locked / move on / hold are help-text: the site-wide [?] (top
     left, HelpTools.astro) shows them. */
  /* Coliseum Practice: the challenges to pick from (built with the site, like the notes list). */
  type Challenge = { id: string; title: string; description: string; topic: string };
  let challenges = $state<Challenge[] | null>(null);
  async function loadChallenges() {
    if (challenges) return;
    try {
      const r = await fetch('/coliseum/index.json');
      challenges = r.ok ? ((await r.json()).challenges ?? []) : [];
    } catch {
      challenges = [];
    }
  }
  $effect(() => {
    if (module.type === 'activity' && module.config.category === 'coliseum') loadChallenges();
  });
  const challengeGroups = $derived.by(() => {
    const groups = new Map<string, Challenge[]>();
    for (const c of challenges ?? []) {
      if (!groups.has(c.topic)) groups.set(c.topic, []);
      groups.get(c.topic)!.push(c);
    }
    return [...groups];
  });

  /** Picking an activity category renames the module only while it still has a stock title. */
  const STOCK_TITLES = new Set(ACTIVITY_CATEGORIES.map((c) => c.title as string));
  function setCategory(id: ActivityCategory) {
    const was = module.config.category;
    module.config.category = id;
    if (!module.title.trim() || STOCK_TITLES.has(module.title)) module.title = activityCategory(id).title;
    // Active Feedback takes questions instead of a "done" tap and holds at time up (you can change that).
    if (id === 'feedback' && was !== 'feedback') toFeedback(module);
    else if (id !== 'feedback' && was === 'feedback') module.config.doneTap = true;
  }

  /** Same for question sets: the category renames the module only while it has a stock title. */
  const STOCK_PROMPT_TITLES = new Set([...PROMPT_CATEGORIES.map((c) => c.title as string)]);
  function setPromptCategory(id: PromptCategory) {
    module.config.category = id;
    if (!module.title.trim() || STOCK_PROMPT_TITLES.has(module.title)) module.title = promptCategory(id).title;
  }

  function setPacing(p: 'flex' | 'locked') {
    module.pacing = p;
    if (p === 'locked') module.minSec = null;
  }

  /* links (activity + independent) */
  const addLink = () => module.config.links.push({ label: '', url: '' } as Link);
  const removeLink = (i: number) => module.config.links.splice(i, 1);

</script>

{#snippet questionsEditor(keyless: boolean)}
  <!-- keyless: an Active Feedback activity (no answer keys; no grids or card sorts) -->
  <div class={heading}>// questions ({module.config.questions.length})</div>
  <QuestionList bind:questions={module.config.questions} {keyless} max={LIMITS.questions} />
{/snippet}

<section class="{panel} space-y-5 text-xs">
  <div class="flex flex-wrap justify-between items-start gap-3">
    <div>
      <div class={heading}>
        // module {index + 1} · {info.label}{module.type === 'activity' ? ` · ${activityCategory(module.config.category).label}` : module.type === 'prompt' && module.config.category !== 'other' ? ` · ${promptCategory(module.config.category).label}` : ''}
      </div>
      <div class="{label} mt-1">{info.hint}</div>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" class={btn} onclick={() => onmove(index - 1)} disabled={!canLeft} title="Alt + left arrow on the tile">[&lt;- move]</button>
      <button type="button" class={btn} onclick={() => onmove(index + 1)} disabled={!canRight} title="Alt + right arrow on the tile">[move -&gt;]</button>
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

  <div class={heading}>// timing</div>

  <div class="grid gap-4 sm:grid-cols-2">
    <fieldset class="space-y-2">
      <legend class="{label} mb-1">if the schedule has to re-fit</legend>
      <label class="flex items-start gap-2 cursor-pointer">
        <input type="radio" name="pacing-{module.id}" checked={module.pacing === 'flex'} onchange={() => setPacing('flex')} />
        <span>
          <b>flex</b> <span class={label}>({mmss(floorOf(module))} to {mmss(capOf(module))})</span>
          <span class="block {label} help-text">shares overruns and spare time with the other flex modules</span>
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
          <span class="{label} help-text">(blank = half)</span>
        </label>
      {/if}
      <label class="flex items-start gap-2 cursor-pointer">
        <input type="radio" name="pacing-{module.id}" checked={module.pacing === 'locked'} onchange={() => setPacing('locked')} />
        <span>
          <b>locked</b>
          <span class="block {label} help-text">always gets its planned time (good for an exit ticket)</span>
        </span>
      </label>
    </fieldset>

    <fieldset class="space-y-2">
      <legend class="{label} mb-1">when time runs out</legend>
      <label class="flex items-start gap-2 cursor-pointer">
        <input type="radio" name="tu-{module.id}" checked={module.onTimeUp === 'auto'} onchange={() => (module.onTimeUp = 'auto')} />
        <span>
          <b>move on</b>
          <span class="block {label} help-text">collect answers and go to the next module</span>
        </span>
      </label>
      <label class="flex items-start gap-2 cursor-pointer">
        <input type="radio" name="tu-{module.id}" checked={module.onTimeUp === 'hold'} onchange={() => (module.onTimeUp = 'hold')} />
        <span>
          <b>hold</b>
          <span class="block {label} help-text">collect answers, show "time's up", wait for you</span>
        </span>
      </label>
    </fieldset>
  </div>

  <hr class="border-[var(--line)]" />

  <!-- content -->
  {#if module.type === 'prompt'}
    <div class="space-y-3">
      {#if pinOf(module)}
        <p class={label}>// always {pinOf(module) === 'first' ? 'the first module of the lesson' : 'the last module of the lesson'}.</p>
      {:else}
        <label class="flex items-center gap-2">
          <span class={label}>category</span>
          <select
            class="{field} w-56 p-1"
            value={module.config.category}
            onchange={(e) => setPromptCategory((e.currentTarget as HTMLSelectElement).value as PromptCategory)}
          >
            {#each MIDDLE_PROMPT_CATEGORIES as c}<option value={c.id}>{c.label}</option>{/each}
          </select>
        </label>
      {/if}
      {@render questionsEditor(false)}
    </div>
  {:else if module.type === 'notes'}
    <NotesEditor bind:config={module.config} {notes} />
  {:else}
    <!-- activity and independent work share instructions + links -->
    <div class="space-y-3">
      {#if module.type === 'activity'}
        <label class="flex items-center gap-2">
          <span class={label}>category</span>
          <select
            class="{field} w-56 p-1"
            value={module.config.category}
            onchange={(e) => setCategory((e.currentTarget as HTMLSelectElement).value as ActivityCategory)}
          >
            {#each ACTIVITY_CATEGORIES as c}<option value={c.id}>{c.label}</option>{/each}
          </select>
        </label>
        {#if module.config.category === 'coliseum'}
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-3">
              <label class="flex items-center gap-2">
                <span class={label}>challenge</span>
                <select class="{field} w-auto sm:w-80 p-1" bind:value={module.config.coliseumId}>
                  <option value="">pick a challenge...</option>
                  {#each challengeGroups as [topic, list]}
                    <optgroup label={topic}>
                      {#each list as c}<option value={c.id}>{c.title}</option>{/each}
                    </optgroup>
                  {/each}
                </select>
              </label>
              {#if module.config.coliseumId}
                <a class="underline hover:text-[var(--accent)]" href="/embed/coliseum/{module.config.coliseumId}" target="_blank" rel="noopener">[try it]</a>
              {/if}
            </div>
            {#if challenges && challenges.length === 0}
              <p class={label}>// the challenge list didn't load (it's built with the site: run npm run build).</p>
            {:else}
              <p class={label}>
                // students play it inside the lesson. scores are kept for you; they post to the public leaderboard only
                if the class has posting on (under [classes]).
              </p>
            {/if}
          </div>
        {/if}
      {/if}
      <label class="block space-y-1">
        <span class={label}>instructions</span>
        <textarea class={field} rows="4" data-terms bind:value={module.config.instructions} maxlength={LIMITS.text} placeholder="What students do (use $...$ for math)"></textarea>
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

      {#if module.type === 'activity' && module.config.category === 'feedback'}
        <div class="space-y-3">
          <p class={label}>
            // no answer keys: during the lesson you read each answer and mark it yourself. put the tool students
            should open under links, and ask about it here.
          </p>
          {@render questionsEditor(true)}
        </div>
      {:else if module.type === 'activity'}
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

  <hr class="border-[var(--line)]" />

  <label class="block space-y-1">
    <span class={label}>// your notes (private: students never see these)</span>
    <textarea
      class={field}
      rows="3"
      bind:value={module.teacherNotes}
      maxlength={LIMITS.notes}
      placeholder="Reminders for yourself: common mistakes, who to check on, what to say..."
    ></textarea>
  </label>
</section>
