<!-- src/components/live/InkLayer.svelte -->
<!-- The teacher's ink on a page: finished strokes and strokes still being drawn, on the 960 x 540 -->
<!-- page. Colors are palette slots (--ink-N in global.css), so each theme draws them in its own shade. -->
<script lang="ts">
  import { INK_WIDTHS, PAGE_H, PAGE_W, pathD, type Stroke } from '../../lib/lesson/ink.ts';

  let { strokes = [], drawing = [] }: { strokes?: Stroke[]; drawing?: { id: string; c: number; w: number; p: number[] }[] } = $props();
</script>

<svg
  class="absolute inset-0 w-full h-full pointer-events-none"
  viewBox="0 0 {PAGE_W} {PAGE_H}"
  aria-hidden="true"
  fill="none"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#each strokes as s (s.id)}
    <path d={pathD(s.p)} stroke="var(--ink-{s.c})" stroke-width={INK_WIDTHS[s.w] ?? 3} />
  {/each}
  {#each drawing as s (s.id)}
    <path d={pathD(s.p)} stroke="var(--ink-{s.c})" stroke-width={INK_WIDTHS[s.w] ?? 3} />
  {/each}
</svg>
