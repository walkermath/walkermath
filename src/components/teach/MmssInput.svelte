<!-- src/components/teach/MmssInput.svelte -->
<!-- A minutes:seconds box bound to a number of seconds. Accepts "10", "5:45"; snaps to 15-second steps. -->
<script lang="ts">
  import { mmss, parseMmss } from '../../lib/lesson/time.ts';
  import { STEP_SEC } from '../../lib/lesson/time.ts';

  let {
    value = $bindable(),
    allowEmpty = false,
    min = STEP_SEC,
    max = 2 * 60 * 60,
    placeholder = '',
    id = undefined,
    class: cls = ''
  }: {
    value: number | null;
    allowEmpty?: boolean;
    min?: number;
    max?: number;
    placeholder?: string;
    id?: string;
    class?: string;
  } = $props();

  let text = $state('');

  // Follow outside changes (another control, a reload).
  $effect(() => {
    text = value == null ? '' : mmss(value);
  });

  function commit() {
    const t = text.trim();
    if (!t && allowEmpty) {
      value = null;
      return;
    }
    const s = parseMmss(t);
    if (s == null) {
      text = value == null ? '' : mmss(value);
      return;
    }
    value = Math.min(max, Math.max(min, Math.round(s / STEP_SEC) * STEP_SEC));
    text = mmss(value);
  }
</script>

<input
  {id}
  class={cls}
  bind:value={text}
  onblur={commit}
  onkeydown={(e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  }}
  inputmode="numeric"
  autocomplete="off"
  {placeholder}
  title="minutes:seconds, e.g. 5:45 (or just minutes)"
/>
