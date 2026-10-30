<!-- src/components/teach/NotesEditor.svelte -->
<!-- A Notes module's content: an ordered list of pages. A page with Markdown is a pre-written slide; -->
<!-- a page with none is a blank blackboard. In class the teacher can write on any page and add a blank -->
<!-- board after the current one. Markdown has $...$ math; a line of --- splits a slide; a walkerMath -->
<!-- note can be imported as a copy, cut into slides at its headings. The finished module is a -->
<!-- slideshow students can reopen, including pages the teacher skipped. -->
<script lang="ts">
  import { LIMITS, newSlide } from '../../lib/lesson/modules.ts';
  import { noteToSlides, splitSlides } from '../../lib/lesson/slides.ts';
  import SlideView from './SlideView.svelte';
  import { btn, field, heading, label } from './ui.ts';

  type Note = { id: string; title: string; subject: string | null; unitTitle: string | null };
  type EditableSlide = { id: string; kind: 'markdown'; markdown: string };

  let {
    config = $bindable(),
    notes = []
  }: {
    config: { slides: EditableSlide[] };
    notes?: Note[];
  } = $props();

  let current = $state(0);
  let importId = $state('');
  let importing = $state(false);
  let message = $state('');
  let error = $state('');
  /** Slide ids whose content is taller than the page. */
  let tall = $state<Record<string, boolean>>({});

  /** The open slide's position (clamped, since slides can be deleted or split around it). */
  const si = $derived(Math.max(0, Math.min(current, config.slides.length - 1)));
  const slide = $derived(config.slides[si]);
  const total = $derived(config.slides.reduce((n, s) => n + s.markdown.length, 0));
  const full = $derived(config.slides.length >= LIMITS.slides);

  const noteGroups = $derived.by(() => {
    const groups = new Map<string, Note[]>();
    for (const n of notes) {
      const g = n.unitTitle || n.subject || 'Notes';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(n);
    }
    return [...groups];
  });

  /** Adds a blank page after the open one. Left blank it's a blackboard; type into it and it's a slide. */
  function addPage() {
    if (full) return;
    config.slides.splice(si + 1, 0, newSlide());
    current = si + 1;
  }

  function removeSlide(i: number) {
    const s = config.slides[i];
    if (s.markdown.trim() && !confirm(`Delete page ${i + 1}?`)) return;
    config.slides.splice(i, 1);
    if (config.slides.length === 0) config.slides.push(newSlide()); // a module is never empty: one blank board
    if (current >= config.slides.length) current = Math.max(0, config.slides.length - 1);
  }

  function moveSlide(from: number, to: number) {
    if (to < 0 || to >= config.slides.length) return;
    const [s] = config.slides.splice(from, 1);
    config.slides.splice(to, 0, s);
    current = to;
  }

  /** A line of --- typed into a slide splits it, once the teacher leaves the box. */
  function splitCurrent() {
    const i = si;
    if (!slide) return;
    const parts = splitSlides(slide.markdown);
    if (parts.length < 2) return;
    const room = LIMITS.slides - config.slides.length + 1;
    const keep = parts.slice(0, room);
    config.slides[i].markdown = keep[0];
    config.slides.splice(i + 1, 0, ...keep.slice(1).map((md) => newSlide(md)));
    message = `split into ${keep.length} slides.`;
    if (keep.length < parts.length) error = `Only ${LIMITS.slides} pages fit in one module; the rest was left out.`;
  }

  async function importNote() {
    if (!importId) return;
    error = '';
    message = '';
    importing = true;
    try {
      const r = await fetch(`/notes/source/${importId}.json`);
      if (!r.ok) throw new Error("That note couldn't be loaded. (Notes are built with the site: run npm run build.)");
      const note: { title: string; body: string } = await r.json();
      let parts = noteToSlides(note.body);
      if (parts.length === 0) throw new Error('That note is empty.');
      // Replace a lone blank slide; otherwise add after the current one.
      const replaceBlank = config.slides.length === 1 && !config.slides[0].markdown.trim();
      const room = LIMITS.slides - (replaceBlank ? 0 : config.slides.length);
      const cut = parts.length > room;
      parts = parts.slice(0, Math.max(0, room));
      const added = parts.map((md) => newSlide(md.slice(0, LIMITS.slide)));
      if (replaceBlank) {
        config.slides.splice(0, 1, ...added);
        current = 0;
      } else {
        config.slides.splice(current + 1, 0, ...added);
        current += 1;
      }
      message = `added ${added.length} slide${added.length === 1 ? '' : 's'} from "${note.title}". it's your copy: edit freely.`;
      if (cut) error = `Only ${LIMITS.slides} pages fit in one module; the rest of the note was left out.`;
      importId = '';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      importing = false;
    }
  }

  const firstLine = (md: string) =>
    md
      .split('\n')
      .find((l) => l.trim())
      ?.replace(/^#+\s*/, '')
      .replace(/[*_`]/g, '')
      .slice(0, 40) || 'blackboard';
</script>

<div class="space-y-4">
  <p class="{label} leading-relaxed">
    // every Notes module starts as one blank blackboard: in class you write on it with a pen (color, thickness, eraser) and
    students watch live. add slides if you want some of it prepared. you can write on slides too, and add a blackboard
    after any page. students keep every page afterwards, including ones you skipped.
  </p>
    {#if error}<p class="p-2 rounded border border-[var(--bad)] text-[var(--bad)]">{error}</p>{/if}
    {#if message}<p class="text-[var(--ok)]">{message}</p>{/if}

    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class={btn} onclick={addPage} disabled={full} title="Blank = a blackboard. Type into it to make it a slide.">[+ page]</button>
      <span class={label}>or import</span>
      <select class="{field} w-auto max-w-xs p-1" bind:value={importId} disabled={full || importing}>
        <option value="">a walkerMath note...</option>
        {#each noteGroups as [group, list]}
          <optgroup label={group}>
            {#each list as n}<option value={n.id}>{n.title}</option>{/each}
          </optgroup>
        {/each}
      </select>
      <button type="button" class={btn} onclick={importNote} disabled={!importId || importing || full}>{importing ? '[importing...]' : '[import]'}</button>
      <span class="flex-1"></span>
      <span class={label}>{config.slides.length}/{LIMITS.slides} pages · {Math.round(total / 1000)}k/{LIMITS.markdown / 1000}k</span>
    </div>
    {#if notes.length === 0}
      <p class={label}>// the notes list didn't load (it's built with the site: run npm run build).</p>
    {/if}

    {#if slide}
      <div class="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)] items-start">
        <!-- slide strip -->
        <ol class="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible lg:max-h-[42rem] lg:overflow-y-auto pb-1" aria-label="Pages">
          {#each config.slides as s, i (s.id)}
            <li class="shrink-0 w-40">
              <button
                type="button"
                class="block w-full text-left rounded p-1 border-2 cursor-pointer {i === si
                  ? 'border-[var(--accent)]'
                  : 'border-transparent hover:border-[var(--line)]'}"
                onclick={() => (current = i)}
                aria-label="Page {i + 1}: {firstLine(s.markdown)}"
              >
                <div class="pointer-events-none"><SlideView markdown={s.markdown} onoverflow={(o) => (tall[s.id] = o)} /></div>
                <div class="flex justify-between {label} mt-1">
                  <span class="truncate">{i + 1} · {firstLine(s.markdown)}</span>
                  {#if tall[s.id]}<span class="text-[var(--warn)]" title="Too tall for one page">!</span>{/if}
                </div>
              </button>
            </li>
          {/each}
        </ol>

        <!-- the open slide -->
        <div class="space-y-2 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class={heading}>// page {si + 1}{slide && !slide.markdown.trim() ? ' · blackboard' : ''}</span>
            <span class="flex-1"></span>
            <button type="button" class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-40" onclick={() => moveSlide(si, si - 1)} disabled={si === 0}>[up]</button>
            <button type="button" class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-40" onclick={() => moveSlide(si, si + 1)} disabled={si === config.slides.length - 1}>[down]</button>
            <button type="button" class="hover:text-[var(--bad)] cursor-pointer" onclick={() => removeSlide(si)}>[delete]</button>
          </div>
          <div class="grid gap-3 xl:grid-cols-2 items-start">
            <textarea
              class="{field} font-mono min-h-[16rem]"
              rows="14"
              bind:value={config.slides[si].markdown}
              onblur={splitCurrent}
              maxlength={LIMITS.slide}
              placeholder={'## Two-step equations\n\nSolve $2x + 3 = 11$:\n\n$$2x = 8$$\n\n---\n(a line of --- starts the next slide)'}
            ></textarea>
            <div class="space-y-1">
              <SlideView markdown={slide.markdown} />
              {#if tall[slide.id]}
                <p class="text-[var(--warn)]">// too tall for one page: it won't fit when you write on it. split it with a line of ---.</p>
              {:else}
                <p class={label}>// {slide && !slide.markdown.trim() ? 'blank: a blackboard to write on in class. type to make it a slide.' : 'what students see, and what you write over in class.'} a line of --- starts a new page.</p>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/if}
</div>
