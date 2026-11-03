<!-- src/components/live/PersonalNote.svelte -->
<!-- A student's own note on one module: [+ personal note] opens a box that saves as they type. -->
<!-- Works during the lesson and afterwards; only the student who wrote it ever sees it. -->
<script lang="ts">
  import { onDestroy } from 'svelte';

  let {
    runId,
    moduleId,
    text = $bindable('')
  }: { runId: string; moduleId: string; text?: string } = $props();

  const MAX = 4000;
  let opened = $state(false);
  // Open by itself when there's a note already (it may load after this appears).
  const open = $derived(opened || text.trim() !== '');
  let state = $state<'' | 'saving' | 'saved' | 'error'>('');
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false; // typed since the last save (a note loaded from the server isn't sent back)

  async function save() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    dirty = false;
    const sending = text;
    state = 'saving';
    try {
      const res = await fetch('/api/class/notes', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, moduleId, text: sending })
      });
      if (!res.ok) throw new Error();
      state = dirty ? 'saving' : 'saved';
    } catch {
      dirty = true;
      state = 'error';
      timer = setTimeout(save, 5000);
    }
  }

  function typed(v: string) {
    text = v;
    dirty = true;
    state = 'saving';
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 1200);
  }

  onDestroy(() => {
    if (dirty) save();
  });

  const label = 'text-[var(--text-muted)]';
</script>

<div class="space-y-1">
  {#if !open}
    <button type="button" class="text-xs hover:text-[var(--accent)] cursor-pointer" onclick={() => (opened = true)}>[+ personal note]</button>
  {:else}
    <label class="block space-y-1">
      <span class="text-xs font-bold">// my note <span class="font-normal {label}">(only you can see this)</span></span>
      <textarea
        rows="3"
        maxlength={MAX}
        class="w-full p-2 rounded border border-[var(--line)] bg-[var(--bg)] text-sm focus:outline-none focus:border-[var(--accent)]"
        placeholder="anything you want to remember about this part of the lesson"
        value={text}
        oninput={(e) => typed(e.currentTarget.value)}
        onblur={save}
      ></textarea>
    </label>
    <p class="text-xs {state === 'error' ? 'text-[var(--warn)]' : label}" aria-live="polite">
      {state === 'saving' ? '// saving...' : state === 'saved' ? '// saved' : state === 'error' ? "// not saved yet: it'll keep trying" : '// saves as you type'}
    </p>
  {/if}
</div>
