<script lang="ts">
  import { parseSystemEquation } from '../../lib/systemParser';
  import SystemTapeUI from './SystemTapeUI.svelte';

  // Default array of raw string inputs
  let equationInputs = $state([
    "3x + 2y = 24",
    "x + y = 10"
  ]);

  // Solution map reserved for later proportional scaling functionality
  let solutionMap = $state({ x: 1, y: 1, z: 1 });

  function addEquation() {
    if (equationInputs.length < 4) {
      equationInputs.push("");
    }
  }

  function removeEquation(index: number) {
    if (equationInputs.length > 2) {
      equationInputs.splice(index, 1);
    }
  }
</script>

<div class="space-y-8 max-w-3xl mx-auto p-6 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md">
  <div class="space-y-4">
    <div class="flex justify-between items-center border-b border-[var(--border-color)] pb-2">
      <h2 class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
        // System of Equations
      </h2>
      <button 
        onclick={addEquation}
        disabled={equationInputs.length >= 4}
        class="text-xs font-mono text-[var(--accent)] disabled:opacity-50 hover:underline"
      >
        [+ add equation]
      </button>
    </div>

    <!-- Inputs and Corresponding Visualizations -->
    <div class="space-y-8">
      {#each equationInputs as eq, i}
        <div class="space-y-4 bg-[var(--bg-primary)] p-4 border border-[var(--border-color)] rounded">
          
          <!-- Input Row -->
          <div class="flex items-center gap-3">
            <span class="text-[var(--text-muted)] font-mono font-bold text-sm">EQ_{i+1}</span>
            <input
              type="text"
              bind:value={equationInputs[i]}
              placeholder="e.g. 2x + 3y = 12"
              class="flex-1 bg-transparent border-b border-[var(--border-color)] px-2 py-1 font-mono text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            <button 
              onclick={() => removeEquation(i)}
              disabled={equationInputs.length <= 2}
              class="text-xs text-red-500/70 font-mono text-[var(--accent)] hover:text-red-500 disabled:opacity-20 font-bold px-2 text-xl hover:underline"
              aria-label="Remove equation"
            >
              [- remove]
            </button>
          </div>

          <!-- Parsed Tape Diagram -->
          <div class="pt-2 px-2">
            <SystemTapeUI 
              equation={parseSystemEquation(eq)} 
              {solutionMap} 
            />
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>