<script lang="ts">
  import type { TapeDiagramData } from '../../lib/tapeParser'; // adjust import path
  import { parseEquation, type TapeBlock } from '../../lib/tapeParser';

  // State rune for user input
  let equationText = $state("3x + 5 = 2x + 12");

  // Dynamically re-computes the diagram on text change
  let diagram = $derived(parseEquation(equationText));

  // State for the new negative swapping mode
  let isNegativeMode = $state(false);

  // Helpers to identify and flip negative blocks
  function isNegative(b: TapeBlock): boolean {
    return (b.type === 'constant' && (b.value || 0) < 0) || (b.type === 'variable' && b.label.startsWith('-'));
  }

  function flipBlock(b: TapeBlock): TapeBlock {
    if (b.type === 'constant') {
      const newVal = Math.abs(b.value || 0);
      return { ...b, value: newVal, label: `${newVal}` };
    }
    return { ...b, label: b.label.replace('-', '') };
  }

// Re-calculate left side: keep left positives, pull in right negatives
  let processedLeft = $derived.by(() => {
    let baseLeft = diagram?.left ?? [];
    let baseRight = diagram?.right ?? [];

    if (isNegativeMode) {
      const leftPositives = baseLeft.filter((b) => !isNegative(b));
      const rightNegatives = baseRight.filter((b) => isNegative(b)).map(flipBlock);
      baseLeft = [...leftPositives, ...rightNegatives];
    }

    baseLeft.sort((a, b) => {
      if (a.type === b.type) return 0;
      return a.type === 'variable' ? -1 : 1;
    });

    return baseLeft.map((b, i, arr) => ({
      ...b,
      flex: b.type === 'variable' ? Math.abs(diagram?.solutionValue || 1) : Math.abs(b.value ?? 1),
      // Flag the first constant to push it to the right edge
      isFirstConstant: b.type === 'constant' && (i === 0 || arr[i - 1].type === 'variable')
    }));
  });

  // Re-calculate right side: keep right positives, pull in left negatives
  let processedRight = $derived.by(() => {
    let baseLeft = diagram?.left ?? [];
    let baseRight = diagram?.right ?? [];

    if (isNegativeMode) {
      const rightPositives = baseRight.filter((b) => !isNegative(b));
      const leftNegatives = baseLeft.filter((b) => isNegative(b)).map(flipBlock);
      baseRight = [...rightPositives, ...leftNegatives];
    }

    baseRight.sort((a, b) => {
      if (a.type === b.type) return 0;
      return a.type === 'variable' ? -1 : 1;
    });

    return baseRight.map((b, i, arr) => ({
      ...b,
      flex: b.type === 'variable' ? Math.abs(diagram?.solutionValue || 1) : Math.abs(b.value ?? 1),
      // Flag the first constant to push it to the right edge
      isFirstConstant: b.type === 'constant' && (i === 0 || arr[i - 1].type === 'variable')
    }));
  });

  let totalLeftFlex = $derived(processedLeft.reduce((sum, b) => sum + b.flex, 0));
  let totalRightFlex = $derived(processedRight.reduce((sum, b) => sum + b.flex, 0));
  let maxTotalFlex = $derived(Math.max(totalLeftFlex, totalRightFlex) || 1);

  // Calculates dynamic pixel or flex width for tape blocks based on solution / constant values
  function getBlockStyle(block: TapeBlock): string {
    const BASE_PIXELS_PER_UNIT = 16; 
    const MIN_WIDTH = 44; 
    const MAX_WIDTH = 280; 

    if (block.type === 'variable' && diagram.solutionValue) {
      const calculatedWidth = Math.min(
        Math.max(diagram.solutionValue * BASE_PIXELS_PER_UNIT, MIN_WIDTH),
        MAX_WIDTH
      );
      return `width: ${calculatedWidth}px;`;
    }

    if (block.type === 'constant' && block.value) {
      const calculatedWidth = Math.min(
        Math.max(Math.abs(block.value) * BASE_PIXELS_PER_UNIT, MIN_WIDTH),
        MAX_WIDTH
      );
      return `width: ${calculatedWidth}px;`;
    }

    return 'min-width: 44px;';
  }
</script>

<div class="space-y-6 max-w-3xl mx-auto">

    <!-- Input Section -->
  <div class="p-6 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-3">
    <label for="eq-input" class="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
      // Enter Single-Variable Equation
    </label>
    <div class="flex items-center gap-2">
      <span class="text-[var(--accent)] font-bold text-lg">&gt;</span>
      <input
        id="eq-input"
        type="text"
        bind:value={equationText}
        placeholder="e.g. 3x + 5 = 2x + 12"
        class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] px-4 py-2.5 rounded font-mono text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
      />
    </div>
  </div>

  <!-- Top Strip (Left Side of Equation) -->
  <div class="space-y-1">
    <span class="text-xs text-[var(--text-muted)] font-mono">// Left Expression</span>
    <div class="min-h-[52px] border border-[var(--border-color)] bg-[var(--bg-primary)] p-1.5 rounded flex -space-x-px w-full">
      {#if diagram.left.length === 0}
        <span class="text-xs text-[var(--text-muted)] px-2 font-mono italic">[ empty expression ]</span>
      {:else}
        {#each processedLeft as block}
          <div
            style="width: {(block.flex / maxTotalFlex) * 100}%;"
            class={`h-10 px-1 shrink-0 flex items-center justify-center font-bold text-sm transition-all truncate border relative ${
              block.type === 'variable'
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] z-10'
                : 'border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] z-0'
            } ${block.isFirstConstant ? 'ml-auto' : ''}`}
          >
            {block.label}
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Bottom Strip (Right Side of Equation) -->
  <div class="space-y-1">
    <div class="min-h-[52px] border border-[var(--border-color)] bg-[var(--bg-primary)] p-1.5 rounded flex -space-x-px w-full">
      {#if diagram.right.length === 0}
        <span class="text-xs text-[var(--text-muted)] px-2 font-mono italic">[ awaiting '=' or term ]</span>
      {:else}
        {#each processedRight as block}
          <div
            style="width: {(block.flex / maxTotalFlex) * 100}%;"
            class={`h-10 px-1 shrink-0 flex items-center justify-center font-bold text-sm transition-all truncate border relative ${
              block.type === 'variable'
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] z-10'
                : 'border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] z-0'
            } ${block.isFirstConstant ? 'ml-auto' : ''}`}
          >
            {block.label}
          </div>
        {/each}
      {/if}
    </div>
    <span class="text-xs text-[var(--text-muted)] font-mono">// Right Expression</span>
  </div>

  <!-- Toggle Section -->
  <div class="flex items-center justify-end gap-2 px-1">
    <label for="negative-toggle" class="text-xs font-mono text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)] transition-colors">
      // Shift negatives to opposite side
    </label>
    <button
      id="negative-toggle"
      role="switch"
      aria-checked={isNegativeMode}
      aria-label="Shift negatives to opposite side"
      onclick={() => (isNegativeMode = !isNegativeMode)}
      class={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
        isNegativeMode ? 'bg-[var(--accent)]' : 'bg-[var(--border-color)]'
      }`}
    >
      <!-- svelte-ignore element_invalid_self_closing_tag -->
      <span
        class={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--bg-primary)] transition-transform ${
          isNegativeMode ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
</div>