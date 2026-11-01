<!-- src/components/teach/SlideView.svelte -->
<!-- One page, drawn the same everywhere: a 16:9 page laid out at a fixed 960 x 540 and scaled to -->
<!-- fit, so the teacher's preview, the projector and every Chromebook show the same lines. A blank -->
<!-- page is a blackboard. Ink (children: InkLayer, the presenter's pen) sits on the same 960 x 540 -->
<!-- page, so it lines up with the slide underneath on every screen. -->
<!-- A slide never scrolls (ink has to stay where it was written): text that doesn't fit is shrunk -->
<!-- to fit, down to MIN_FIT; onfit reports how much. Slide typography is .slide in global.css. -->
<script module lang="ts">
  export const SLIDE_W = 960;
  export const SLIDE_H = 540;
  /** Shrinking stops here; past it the slide is cut off (the builder warns). */
  export const MIN_FIT = 0.55;
  /** The .slide font size in global.css. */
  const BASE_PX = 22;
</script>

<script lang="ts">
  import 'katex/dist/katex.min.css';
  import type { Snippet } from 'svelte';
  import { renderMarkdown } from '../../lib/lesson/markdown.ts';

  let {
    markdown,
    onoverflow,
    onfit,
    framed = true,
    children
  }: {
    markdown: string;
    /** Told whether the content is still taller than the page after shrinking as far as it goes. */
    onoverflow?: (over: boolean) => void;
    /** Told how far the text was shrunk to fit (1 = not at all). */
    onfit?: (fit: number) => void;
    /** A border and rounded corners (off for the full-screen presenter). */
    framed?: boolean;
    /** Drawn over the page, in page coordinates (960 x 540). */
    children?: Snippet;
  } = $props();

  let width = $state(0);
  let content = $state<HTMLDivElement | null>(null);
  const html = $derived(renderMarkdown(markdown));
  const scale = $derived(width > 0 ? width / SLIDE_W : 0);

  /** Shrinks the text until it fits (a few rounds of halving the gap), then reports. */
  function measure() {
    const el = content;
    if (!el) return;
    const fits = () => el.scrollHeight <= SLIDE_H + 2;
    el.style.fontSize = '';
    let fit = 1;
    if (!fits()) {
      let lo = MIN_FIT;
      let hi = 1;
      for (let k = 0; k < 7; k++) {
        const mid = (lo + hi) / 2;
        el.style.fontSize = `${BASE_PX * mid}px`;
        if (fits()) lo = mid;
        else hi = mid;
      }
      fit = lo;
      el.style.fontSize = `${BASE_PX * fit}px`;
    }
    onfit?.(fit);
    onoverflow?.(!fits());
  }

  $effect(() => {
    void html; // the DOM is updated by now
    measure();
  });
  $effect(() => {
    // Math fonts can arrive after the first layout: measure again once they have.
    document.fonts?.ready.then(() => measure()).catch(() => {});
  });
</script>

<div
  class="relative w-full aspect-video overflow-hidden bg-[var(--bg-surface)] {framed ? 'rounded border border-[var(--line)]' : ''}"
  bind:clientWidth={width}
>
  <div
    class="absolute top-0 left-0 origin-top-left"
    style="width: {SLIDE_W}px; height: {SLIDE_H}px; transform: scale({scale}); visibility: {scale ? 'visible' : 'hidden'}"
  >
    <div bind:this={content} class="slide absolute inset-0 px-12 py-9 overflow-hidden">
      {@html html}
    </div>
    {#if children}
      <div class="absolute inset-0">{@render children()}</div>
    {/if}
  </div>
</div>
