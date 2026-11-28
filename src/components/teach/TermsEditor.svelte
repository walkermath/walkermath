<!-- src/components/teach/TermsEditor.svelte -->
<!-- A lesson's own tooltips (src/lib/lesson/terms.ts). Two parts in one place:
       1. The adder: select a word or short phrase in any text box marked data-terms (question text,
          activity instructions, slide text), and a small [+ tooltip] button appears under that box.
          It asks for a definition and adds the term to the lesson. Works with touch selection too.
       2. The Terms list: every defined term, to edit or delete, or to add one without selecting.
     Students see each term underlined (first use on a screen) with the definition in a popover. -->
<script lang="ts">
  import type { GlossaryEntry } from '../../lib/glossary.ts';
  import { TERMS, cleanAlso, selectableTerm, termId, upsertTerm } from '../../lib/lesson/terms.ts';
  import { btn, btnMain, field, label } from './ui.ts';

  let { terms = $bindable() }: { terms: GlossaryEntry[] } = $props();

  /* ---------------- the adder ---------------- */
  let target = $state<HTMLTextAreaElement | null>(null);
  let box = $state<HTMLDivElement | null>(null);
  let offered = $state(''); // the selected words, while the [+ tooltip] button shows
  let open = $state(false); // the little form is showing
  let word = $state('');
  let def = $state('');
  let error = $state('');
  let at = $state({ top: 0, left: 0 });
  /** The form shown in the list ("[+ tooltip]" there) instead of floating under a text box. */
  let inline = $state(false);

  const existing = $derived(terms.find((t) => t.id === termId(word)));

  function place() {
    if (!target) return;
    const r = target.getBoundingClientRect();
    const width = open ? 320 : 110;
    at = {
      top: Math.min(Math.max(r.bottom + 4, 4), window.innerHeight - (open ? 190 : 40)),
      left: Math.min(Math.max(r.right - width, 4), Math.max(4, window.innerWidth - width - 4))
    };
  }

  function hide() {
    offered = '';
    open = false;
    error = '';
    target = null;
  }

  function onSelection() {
    if (open) return; // typing the definition moves focus away from the text box: leave the form alone
    const ta = document.activeElement;
    if (!(ta instanceof HTMLTextAreaElement) || !ta.hasAttribute('data-terms')) return;
    const picked = selectableTerm(ta.value.slice(ta.selectionStart ?? 0, ta.selectionEnd ?? 0));
    if (!picked) return hide();
    target = ta;
    offered = picked;
    place();
  }

  function onPointerDown(e: PointerEvent) {
    const t = e.target as Node | null;
    if (inline || (!offered && !open)) return;
    if (box && t && box.contains(t)) return;
    if (t instanceof HTMLTextAreaElement && t.hasAttribute('data-terms')) return; // moving the cursor: selectionchange decides
    hide();
  }

  function begin() {
    word = offered;
    def = terms.find((t) => t.id === termId(offered))?.def ?? '';
    error = '';
    open = true;
    place();
  }

  function add() {
    const w = word.trim();
    if (!w || !termId(w)) return (error = 'Type the word or phrase.');
    if (!def.trim()) return (error = 'Type a short definition.');
    if (!existing && terms.length >= TERMS.max) return (error = `At most ${TERMS.max} tooltips per lesson.`);
    terms = upsertTerm(terms, w, def, existing?.also);
    hide();
  }

  /* ---------------- the list ---------------- */
  const retitle = (t: GlossaryEntry) => {
    t.id = termId(t.term) || t.id;
  };
  const setAlso = (t: GlossaryEntry, text: string) => {
    const also = cleanAlso(text, t.term);
    if (also.length) t.also = also;
    else delete t.also;
  };
  function addBlank() {
    if (terms.length >= TERMS.max) return;
    // Left blank on purpose: it's only kept once it has a word and a definition.
    word = '';
    def = '';
    error = '';
    target = null;
    offered = '';
    open = true;
    at = { top: 0, left: 0 };
    inline = true;
  }
  function closeInline() {
    inline = false;
    hide();
  }
  function addInline() {
    const w = word.trim();
    if (!w || !termId(w)) return (error = 'Type the word or phrase.');
    if (!def.trim()) return (error = 'Type a short definition.');
    if (!terms.find((t) => t.id === termId(w)) && terms.length >= TERMS.max) return (error = `At most ${TERMS.max} tooltips per lesson.`);
    terms = upsertTerm(terms, w, def, terms.find((t) => t.id === termId(w))?.also);
    closeInline();
  }
</script>

<!-- Browsers differ on when a text box reports a changed selection, so every way of changing it checks. -->
<svelte:document
  onselectionchange={onSelection}
  onselect={onSelection}
  onkeyup={onSelection}
  onmouseup={() => setTimeout(onSelection, 0)}
  ontouchend={() => setTimeout(onSelection, 50)}
  onpointerdown={onPointerDown}
/>
<svelte:window onscroll={() => (offered || open) && !inline && place()} onresize={() => (offered || open) && !inline && place()} />

<div class="space-y-1">
  <span class={label}>
    tooltips <span class="help-text">(highlight a word in a question, instructions or slide, then tap [+ tooltip]; students see it underlined)</span>
  </span>

  {#each terms as t, ti (t.id + ':' + ti)}
    <div class="flex flex-wrap gap-2 items-center">
      <input class="{field} p-1 w-40" bind:value={t.term} maxlength={TERMS.term} aria-label="Word" onchange={() => retitle(t)} />
      <input
        class="{field} p-1 w-40"
        value={(t.also ?? []).join(', ')}
        placeholder="also: plural, ..."
        aria-label="Other forms of the word"
        maxlength={TERMS.also * 20}
        onchange={(e) => setAlso(t, e.currentTarget.value)}
      />
      <input class="{field} p-1 flex-1 min-w-[12rem]" bind:value={t.def} maxlength={TERMS.def} aria-label="Definition" placeholder="definition" />
      <button type="button" class="hover:text-[var(--bad)] cursor-pointer" onclick={() => terms.splice(ti, 1)} aria-label="Remove tooltip">[x]</button>
    </div>
  {/each}

  {#if inline}
    <div class="space-y-2 p-2 border border-[var(--line)] rounded bg-[var(--bg-primary)]">
      <input class="{field} p-1" bind:value={word} maxlength={TERMS.term} placeholder="word or phrase" aria-label="Word" />
      <input class="{field} p-1" bind:value={def} maxlength={TERMS.def} placeholder="definition students see" aria-label="Definition" />
      {#if error}<p class="text-xs text-[var(--bad)]">// {error}</p>{/if}
      <div class="flex gap-2">
        <button type="button" class={btnMain} onclick={addInline}>[add]</button>
        <button type="button" class={btn} onclick={closeInline}>[cancel]</button>
      </div>
    </div>
  {:else if terms.length < TERMS.max}
    <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={addBlank}>[+ tooltip]</button>
  {/if}
</div>

{#if (offered || open) && !inline}
  <div
    bind:this={box}
    class="fixed z-50"
    style="top: {at.top}px; left: {at.left}px"
    role={open ? 'dialog' : undefined}
    aria-label={open ? 'Add a tooltip' : undefined}
  >
    {#if !open}
      <button
        type="button"
        class="{btnMain} bg-[var(--bg-surface)] shadow-lg"
        onmousedown={(e) => e.preventDefault()}
        onclick={begin}
      >[+ tooltip]</button>
    {:else}
      <div class="w-80 max-w-[calc(100vw-1rem)] p-3 space-y-2 border border-[var(--accent)] rounded-md bg-[var(--bg-surface)] shadow-lg text-xs">
        <input class="{field} p-1" bind:value={word} maxlength={TERMS.term} aria-label="Word" />
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="{field} p-1"
          bind:value={def}
          maxlength={TERMS.def}
          placeholder="definition students see"
          aria-label="Definition"
          autofocus
          onkeydown={(e) => e.key === 'Enter' && add()}
        />
        {#if existing}<p class="text-[var(--text-muted)]">// this word already has a tooltip: saving replaces its definition.</p>{/if}
        {#if error}<p class="text-[var(--bad)]">// {error}</p>{/if}
        <div class="flex gap-2">
          <button type="button" class={btnMain} onclick={add}>[{existing ? 'replace' : 'add'}]</button>
          <button type="button" class={btn} onclick={hide}>[cancel]</button>
        </div>
      </div>
    {/if}
  </div>
{/if}
