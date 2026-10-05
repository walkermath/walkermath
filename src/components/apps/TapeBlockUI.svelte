<!-- components/TapeBlockUI.svelte -->
<script lang="ts">
  import type { TapeBlock } from '../../lib/models/TapeBlock';
  
  let { blockData, maxFlex } = $props<{ 
    blockData: { block: TapeBlock, flex: number, isFirstConstant: boolean }, 
    maxFlex: number 
  }>();
</script>

<div
  style="width: {(blockData.flex / maxFlex) * 100}%;"
  class={`h-10 px-1 shrink-0 flex items-center justify-center font-bold text-sm transition-all truncate border relative ${
    blockData.block.type === 'variable'
      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] z-10'
      : 'border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] z-0'
  } ${blockData.isFirstConstant ? 'ml-auto' : ''}`}
>
  {blockData.block.label}
</div>