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
  <div class="font-bold {mode === 'block' ? 'text-lg' : 'text-sm text-[var(--warn)]'}">
    {mode === 'block' ? 'before we start:' : `get ready (${left} left)`}
  </div>
  <ul class="space-y-1 {mode === 'block' ? 'text-base' : 'text-xs'}">
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
  /* Flashes until it's done, but stops for anyone who asks their device for less motion. */
  .ready-nudge {
    animation: ready-flash 1.6s ease-in-out infinite;
  }
  @keyframes ready-flash {
    50% {
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--warn) 35%, transparent);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ready-nudge {
      animation: none;
    }
  }
</style>
