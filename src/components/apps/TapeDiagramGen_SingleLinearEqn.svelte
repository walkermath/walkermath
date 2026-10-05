<script lang="ts">
  import { parseEquation } from '../../lib/tapeParser';
  import TapeBlockUI from './TapeBlockUI.svelte'; // Ensure this matches your component path

  // State rune for user input
  let equationText = $state("3x + 5 = 2x + 12");
  
  // State for the negative swapping mode
  let isNegativeMode = $state(false);

  // Instantiates the EquationModel class
  let equation = $derived(parseEquation(equationText));
  
  // Asks the model to generate the view data
  let layout = $derived(equation.isValid ? equation.getLayoutData(isNegativeMode) : null);
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
    
    <!-- Error State Display -->
    {#if !equation.isValid && equation.error}
      <p class="text-red-500 text-sm font-mono mt-2">Error: {equation.error}</p>
    {/if}
  </div>

  {#if layout}
    <!-- Top Strip (Left Side of Equation) -->
    <div class="space-y-1">
      <span class="text-xs text-[var(--text-muted)] font-mono">// Left Expression</span>
      <div class="min-h-[52px] border border-[var(--border-color)] bg-[var(--bg-primary)] p-1.5 rounded flex -space-x-px w-full">
        {#if layout.leftSide.length === 0}
          <span class="text-xs text-[var(--text-muted)] px-2 font-mono italic">[ empty expression ]</span>
        {:else}
          {#each layout.leftSide as blockData}
            <TapeBlockUI {blockData} maxFlex={layout.maxTotalFlex} />
          {/each}
        {/if}
      </div>
    </div>

    <!-- Bottom Strip (Right Side of Equation) -->
    <div class="space-y-1">
      <div class="min-h-[52px] border border-[var(--border-color)] bg-[var(--bg-primary)] p-1.5 rounded flex -space-x-px w-full">
        {#if layout.rightSide.length === 0}
          <span class="text-xs text-[var(--text-muted)] px-2 font-mono italic">[ awaiting '=' or term ]</span>
        {:else}
          {#each layout.rightSide as blockData}
            <TapeBlockUI {blockData} maxFlex={layout.maxTotalFlex} />
          {/each}
        {/if}
      </div>
      <span class="text-xs text-[var(--text-muted)] font-mono">// Right Expression</span>
    </div>
  {/if}

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
      <span
        class={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--bg-primary)] transition-transform ${
          isNegativeMode ? 'translate-x-4' : 'translate-x-1'
        }`}
      ></span>
    </button>
  </div>
</div>