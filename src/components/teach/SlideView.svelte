<!-- src/components/teach/SlideView.svelte -->
<!-- One pre-written slide, drawn the same everywhere: a 16:9 page laid out at a fixed 960 x 540 and -->
<!-- scaled to fit, so the teacher's preview, the projector and every Chromebook show the same lines. -->
<!-- Freeform blackboards (Phase 4) use the same 16:9 page, so slides and boards line up. -->
<!-- Slide typography is the .slide block in src/styles/global.css. -->
<script module lang="ts">
  export const SLIDE_W = 960;
  export const SLIDE_H = 540;
</script>

<script lang="ts">
  import 'katex/dist/katex.min.css';
  import { renderMarkdown } from '../../lib/lesson/markdown.ts';

  let {
    markdown,
    scroll = false,
    onoverflow
  }: {
    markdown: string;
    /** Let tall slides scroll (students) instead of cutting them off (builder thumbnails). */
    scroll?: boolean;
    /** Told whether the slide's content is taller than the page. */
    onoverflow?: (over: boolean) => void;
  } = $props();

  let width = $state(0);
  let page = $state<HTMLDivElement | null>(null);
  const html = $derived(renderMarkdown(markdown));
  const scale = $derived(width > 0 ? width / SLIDE_W : 0);

  $effect(() => {
    void html; // re-measure whenever the content changes (the DOM is updated by now)
    if (page && onoverflow) onoverflow(page.scrollHeight > page.clientHeight + 2);
  });
</script>

<div class="relative w-full aspect-video overflow-hidden rounded border border-[var(--line)] bg-[var(--bg-surface)]" bind:clientWidth={width}>
  <div
    bind:this={page}
    class="slide absolute top-0 left-0 origin-top-left px-12 py-9 {scroll ? 'overflow-y-auto' : 'overflow-hidden'}"
    style="width: {SLIDE_W}px; height: {SLIDE_H}px; transform: scale({scale}); visibility: {scale ? 'visible' : 'hidden'}"
  >
    {@html html}
  </div>
</div>

