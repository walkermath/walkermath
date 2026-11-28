<script lang="ts">
  // src/components/live/ReadyChecklist.svelte
  // The readiness checklist on a student's screen (src/lib/lesson/checklist.ts).
  //   mode 'block': before the lesson, front and center (the first module waits until it's done)
  //   mode 'nudge': once the lesson runs, small on the side, flashing until done; never blocks work
  // Ticks are kept on this device; finishing it (or un-ticking after) tells the room, so the
  // teacher's "ready" count moves and the student's other devices follow.

  interface Props {
    items: string[];
    /** The room says this student has finished it. */
    done: boolean;
    mode: 'block' | 'nudge';
    onready: (on: boolean) => Promise<void> | void;
  }
  let { items, done, mode, onready }: Props = $props();

  let ticks = $state<boolean[]>([]);
  let busy = $state(false);
  let error = $state('');

  // Finished elsewhere (another device, or before a reload): show every item ticked.
  $effect(() => {
    if (done) ticks = items.map(() => true);
    else if (ticks.length !== items.length) ticks = items.map((_, i) => ticks[i] ?? false);
  });

  async function toggle(i: number) {
    const next = items.map((_, j) => (j === i ? !ticks[j] : !!ticks[j]));
    ticks = next;
    const all = next.every(Boolean);
    if (all === done) return;
    busy = true;
    error = '';
    try {
      await onready(all);
    } catch {
      error = "couldn't reach your teacher's lesson. tap again in a moment.";
      ticks = items.map((_, j) => (j === i ? !next[j] : next[j]));
    } finally {
      busy = false;
    }
  }

  const left = $derived(items.length - ticks.filter(Boolean).length);
</script>

<section
  class="rounded-md border-2 bg-[var(--bg-surface)] {mode === 'block' ? 'p-5 border-[var(--accent)] space-y-3' : 'p-3 border-[var(--warn)] space-y-2 ready-nudge'}"
  aria-label="Get ready"
>
  <div class="font-bold {mode === 'block' ? 'text-lg' : 'text-base text-[var(--warn)]'}">
    {mode === 'block' ? 'before we start:' : `⚠ do the checklist (${left} left)`}
  </div>
  <ul class="space-y-1 {mode === 'block' ? 'text-base' : 'text-sm'}">
    {#each items as item, i (item)}
      <li>
        <label class="flex items-start gap-2 cursor-pointer select-none">
          <input type="checkbox" class="mt-1 {mode === 'block' ? 'w-5 h-5' : ''}" checked={!!ticks[i]} disabled={busy} onchange={() => toggle(i)} />
          <span class={ticks[i] ? 'line-through text-[var(--text-muted)]' : ''}>{item}</span>
        </label>
      </li>
    {/each}
  </ul>
  {#if error}<p class="text-xs text-[var(--warn)]">// {error}</p>{/if}
</section>

<style>
  /* Pulses until it's done: a wide glow and a warm tint, so it's hard to miss. Reduced-motion
     devices get no movement, but keep the thick border and tint so it still stands out. */
  .ready-nudge {
    border-width: 3px;
    background-color: color-mix(in srgb, var(--warn) 10%, var(--bg-surface));
    animation: ready-pulse 1.2s ease-in-out infinite;
  }
  @keyframes ready-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--warn) 70%, transparent);
      background-color: color-mix(in srgb, var(--warn) 10%, var(--bg-surface));
    }
    50% {
      box-shadow: 0 0 0 10px color-mix(in srgb, var(--warn) 0%, transparent), 0 0 18px 4px color-mix(in srgb, var(--warn) 55%, transparent);
      background-color: color-mix(in srgb, var(--warn) 28%, var(--bg-surface));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ready-nudge {
      animation: none;
    }
  }
</style>
