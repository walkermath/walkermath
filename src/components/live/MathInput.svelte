<!-- src/components/live/MathInput.svelte -->
<!-- A math answer box: symbol buttons that type at the cursor (x², √, fractions, ±, ≤ ...), and a -->
<!-- typeset preview of how the answer was read, so a student sees a real fraction and exponent -->
<!-- before they move on. What is saved is the plain text in the box. -->
<script lang="ts">
  import katex from 'katex';
  import { readMath } from '../../lib/lesson/mathcheck.ts';

  let {
    value = '',
    disabled = false,
    maxlength = 200,
    ariaLabel = 'Answer',
    placeholder = '',
    compact = false,
    oninput,
    onchange
  }: {
    value?: string;
    disabled?: boolean;
    maxlength?: number;
    ariaLabel?: string;
    placeholder?: string;
    /** A small box (a grid cell): the buttons and preview show only while it has focus. */
    compact?: boolean;
    oninput?: (v: string) => void;
    onchange?: (v: string) => void;
  } = $props();

  let box = $state<HTMLInputElement | null>(null);
  let focused = $state(false);

  /** [label, text to insert, where the cursor goes within it (default: the end)] */
  const KEYS: [string, string, number?][] = [
    ['x²', '^2'],
    ['xⁿ', '^()', 2],
    ['√', 'sqrt()', 5],
    ['a⁄b', '()/()', 1],
    ['( )', '()', 1],
    ['±', '±'],
    ['π', 'pi'],
    ['i', 'i'],
    ['≤', '<='],
    ['≥', '>='],
    ['|x|', 'abs()', 4],
    ['or', ' or ']
  ];

  function insert(text: string, at = text.length) {
    if (disabled || !box) return;
    const start = box.selectionStart ?? value.length;
    const end = box.selectionEnd ?? value.length;
    const next = (value.slice(0, start) + text + value.slice(end)).slice(0, maxlength);
    oninput?.(next);
    const caret = Math.min(start + at, next.length);
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(caret, caret);
    });
  }

  const read = $derived(value.trim() ? readMath(value) : null);
  const typeset = $derived.by(() => {
    if (!read?.ok) return '';
    try {
      return katex.renderToString(read.latex, { throwOnError: false, displayMode: false });
    } catch {
      return '';
    }
  });
  const showTools = $derived(!disabled && (!compact || focused));

  const field =
    'w-full p-2 rounded border border-[var(--line)] bg-[var(--bg)] text-sm font-mono focus:outline-none focus:border-[var(--accent)] disabled:opacity-80 disabled:cursor-not-allowed';
</script>

<div class="space-y-1" onfocusin={() => (focused = true)} onfocusout={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && (focused = false)}>
  <input
    bind:this={box}
    type="text"
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    class={field}
    aria-label={ariaLabel}
    {placeholder}
    {maxlength}
    {value}
    {disabled}
    oninput={(e) => oninput?.(e.currentTarget.value)}
    onchange={(e) => onchange?.(e.currentTarget.value)}
  />
  {#if showTools}
    <div class="flex flex-wrap gap-1" role="toolbar" aria-label="Math symbols">
      {#each KEYS as [label, text, at]}
        <button
          type="button"
          class="min-w-8 px-1.5 py-0.5 rounded border border-[var(--line)] text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
          onpointerdown={(e) => e.preventDefault()}
          onclick={() => insert(text, at)}
          title="type {text.trim()}"
        >{label}</button>
      {/each}
    </div>
  {/if}
  {#if read && (showTools || !compact)}
    {#if read.ok}
      <div class="text-xs text-[var(--text-muted)] flex flex-wrap items-baseline gap-2">
        <span>// we read:</span>
        <span class="text-base text-[var(--text-primary)]">{@html typeset || read.text}</span>
      </div>
    {:else}
      <p class="text-xs text-[var(--bad)]">{read.error}</p>
    {/if}
  {/if}
</div>
