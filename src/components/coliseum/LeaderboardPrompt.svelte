<!-- src/components/coliseum/LeaderboardPrompt.svelte -->
<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { getSavedProfile, saveProfile } from '../../lib/playerStorage';

  export let challengeId: string;
  export let score: number;
  export let durationMs: number;
  export let headerTitle: string = '// TIME UP';
  export let headerSubtitle: string = 'final score recorded.';
  export let stats: string[] = [];

  const dispatch = createEventDispatcher();

  let playerName = '';
  let teacherName = '';
  let classPeriod = '';
  let isSubmitting = false;
  let errorMsg = '';

  // Helper to strictly enforce alpha-only (A-Z) and max 6 characters
  function sanitizeAlpha6(val: string): string {
    if (!val) return '';
    return val.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6);
  }

  onMount(() => {
    const saved = getSavedProfile();
    playerName = sanitizeAlpha6(saved.tag || '');
    teacherName = sanitizeAlpha6(saved.teacher || '');
    classPeriod = saved.class_period || '';
  });

  function handleNameInput(e: Event) {
    const target = e.target as HTMLInputElement;
    playerName = sanitizeAlpha6(target.value);
    target.value = playerName;
  }

  function handleTeacherInput(e: Event) {
    const target = e.target as HTMLInputElement;
    teacherName = sanitizeAlpha6(target.value);
    target.value = teacherName;
  }

  async function submitScore() {
    errorMsg = '';
    const cleanName = sanitizeAlpha6(playerName);
    const cleanTeacher = sanitizeAlpha6(teacherName);

    if (!cleanName) {
      errorMsg = 'Please enter a display name (1-6 letters).';
      return;
    }
    if (!classPeriod) {
      errorMsg = 'Please select a class period (0-9).';
      return;
    }
    if (!cleanTeacher) {
      errorMsg = 'Please enter a teacher name (1-6 letters).';
      return;
    }

    isSubmitting = true;
    saveProfile({ tag: cleanName, teacher: cleanTeacher, class_period: classPeriod });

    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: challengeId,
          display_name: cleanName,
          class_period: classPeriod,
          teacher: cleanTeacher,
          score,
          duration_ms: durationMs
        })
      });

      const data = await res.json();
      if (res.ok) {
        window.location.href = '/coliseum#leaderboards';
      } else {
        errorMsg = data.error || 'Failed to save score.';
        isSubmitting = false;
      }
    } catch (err) {
      errorMsg = 'Network error while submitting score.';
      isSubmitting = false;
    }
  }
</script>

<div class="space-y-6 text-center py-4">
  <div class="space-y-2">
    <h2 class="text-2xl font-bold">{headerTitle}</h2>
    <p class="text-xs text-[var(--text-muted)]">{headerSubtitle}</p>
  </div>

  <div class="p-6 border border-[var(--border-color)] bg-black/20 rounded space-y-3">
    <div class="text-3xl font-bold text-[var(--accent)]">{score}</div>
    <div class="text-xs text-[var(--text-muted)] space-y-1">
      {#each stats as statLine}
        <div>{statLine}</div>
      {/each}
      <div>time elapsed: {(durationMs / 1000).toFixed(2)}s</div>
    </div>
  </div>

  <!-- Credential Inputs Entry -->
  <div class="p-4 border border-[var(--border-color)] bg-black/20 rounded space-y-4 text-xs text-left">
    <div class="text-[var(--text-muted)]">// enter credentials to log score (A-Z only, max 6 chars):</div>
    
    {#if errorMsg}
      <div class="p-2 border border-red-500/50 bg-red-950/30 text-red-400 rounded text-xs">
        [!] {errorMsg}
      </div>
    {/if}

    <div class="space-y-1">
      <span class="text-[var(--text-muted)]">display name / tag (max 6 letters):</span>
      <input 
        type="text" 
        value={playerName}
        on:input={handleNameInput}
        maxlength="6" 
        placeholder="MATH"
        class="w-full px-3 py-1.5 rounded border border-[var(--border-color)] bg-black text-white text-sm uppercase tracking-widest focus:outline-none focus:border-[var(--accent)]"
      />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div class="space-y-1">
        <span class="text-[var(--text-muted)]">class period:</span>
        <select 
          bind:value={classPeriod} 
          class="w-full px-3 py-1.5 rounded border border-[var(--border-color)] bg-black text-white text-sm uppercase tracking-widest focus:outline-none focus:border-[var(--accent)] cursor-pointer"
        >
          <option value="" disabled selected>select</option>
          {#each ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as p}
            <option value="P{p}">period {p}</option>
          {/each}
        </select>
      </div>

      <div class="space-y-1">
        <span class="text-[var(--text-muted)]">teacher (max 6 letters):</span>
        <input 
          type="text" 
          value={teacherName}
          on:input={handleTeacherInput}
          maxlength="6" 
          placeholder="WALKER"
          class="w-full px-3 py-1.5 rounded border border-[var(--border-color)] bg-black text-white text-sm uppercase tracking-widest focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
    </div>
  </div>

  <div class="space-y-3">
    <button 
      on:click={submitScore}
      disabled={isSubmitting}
      class="w-full py-3 rounded border border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-surface)] font-bold hover:bg-[var(--accent)] hover:text-black transition-colors cursor-pointer text-xs disabled:opacity-50"
    >
      {isSubmitting ? '[submitting...]' : '[post score to leaderboard]'}
    </button>
  </div>

  <div>
    <button 
      on:click={() => dispatch('retry')}
      class="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] underline cursor-pointer"
    >
      &lt;- [try again without saving]
    </button>
  </div>
</div>