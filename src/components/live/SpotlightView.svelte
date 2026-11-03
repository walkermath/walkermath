<!-- src/components/live/SpotlightView.svelte -->
<!-- What the teacher put on the projector from the answers box: a poll's results as bars, or one -->
<!-- student's answer, large. Never a name. -->
<script lang="ts">
  import katex from 'katex';
  import 'katex/dist/katex.min.css';
  import { readMath } from '../../lib/lesson/mathcheck.ts';
  import type { Spotlight } from '../../lib/lesson/room.ts';

  let { spot }: { spot: Spotlight } = $props();

  const total = $derived(spot.kind === 'tally' ? spot.bars.reduce((n, b) => n + b.count, 0) : 0);
  const most = $derived(spot.kind === 'tally' ? Math.max(1, ...spot.bars.map((b) => b.count)) : 1);
  const typeset = $derived.by(() => {
    if (spot.kind !== 'answer' || !spot.math) return '';
    const read = readMath(spot.text);
    if (!read.ok) return '';
    try {
      return katex.renderToString(read.latex, { throwOnError: false, displayMode: true });
    } catch {
      return '';
    }
  });
</script>

<div class="w-full max-w-4xl space-y-6 font-mono">
  {#if spot.title}<div class="text-xl font-bold text-[var(--text-muted)]">{spot.title}</div>{/if}
  {#if spot.kind === 'tally'}
    <ul class="space-y-3">
      {#each spot.bars as b}
        <li class="grid grid-cols-[minmax(6rem,16rem)_minmax(0,1fr)_5rem] items-center gap-4 text-2xl">
          <span class="truncate" title={b.label}>{b.label}</span>
          <span class="h-9 rounded bg-[var(--line)] overflow-hidden">
            <span class="block h-full bg-[var(--accent)] transition-all" style="width: {(b.count / most) * 100}%"></span>
          </span>
          <span class="tabular-nums text-right">{b.count}</span>
        </li>
      {/each}
    </ul>
    <div class="text-base text-[var(--text-muted)]">{total} {total === 1 ? 'answer' : 'answers'}</div>
  {:else}
    <div class="p-8 rounded-lg border-2 border-[var(--accent)] bg-[var(--bg-surface)] text-4xl leading-snug break-words whitespace-pre-wrap">
      {#if typeset}{@html typeset}{:else}{spot.text}{/if}
    </div>
  {/if}
</div>
