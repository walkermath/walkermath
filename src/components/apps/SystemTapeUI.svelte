<script lang="ts">
  import type { SystemEquationModel } from '../../lib/models/SystemEquationModel';
  
  let { equation, solutionMap = {} } = $props<{ 
    equation: SystemEquationModel, 
    solutionMap?: Record<string, number> 
  }>();

  let layout = $derived(equation.isValid ? equation.getLayoutData(solutionMap) : null);
</script>

{#if !equation.isValid && equation.error}
  <p class="text-red-500 text-sm font-mono">{equation.error}</p>
{:else if layout && layout.blocks.length > 0}
  <div class="flex flex-col w-full pb-4">
    <!-- Top Constant Bracket -->
    <div class={`relative w-full h-8 border-t-2 border-x-2 border-red-500/50 rounded-t mb-2 flex items-center justify-center ${
      layout.constant.value < 0 ? 'border-dashed' : 'border-solid'
    }`}>
      <span class="absolute -top-3 bg-[var(--bg-primary)] px-3 text-red-500 font-bold font-mono text-sm tracking-wider">
        {layout.constant.value}
      </span>
    </div>

    <!-- Bottom Variable Tape -->
    <div class="h-10 border border-[var(--border-color)] rounded flex -space-x-px w-full bg-[var(--bg-primary)]">
      {#each layout.blocks as item}
        <div
          style="width: {(item.flex / layout.totalFlex) * 100}%;"
          class={`h-full shrink-0 flex items-center justify-center font-bold text-sm transition-all truncate border relative z-10 ${item.block.colorClass}`}
        >
          {item.block.label}
        </div>
      {/each}
    </div>
  </div>
{:else}
  <span class="text-xs text-[var(--text-muted)] font-mono italic">[ Empty or invalid equation ]</span>
{/if}