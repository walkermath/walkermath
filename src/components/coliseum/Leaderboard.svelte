<!-- src/components/coliseum/LeaderboardPrompt.svelte -->
<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { getSavedProfile, saveProfile } from '../../lib/playerStorage';
  import { getAlias, rerollAlias } from '../../lib/pseudonym';
  import { TEACHERS } from '../../lib/teachers';

  export let challengeId: string;
  export let score: number;
  export let durationMs: number;
  /** difficulty level the run was played on (0 = none) */
  export let level: number = 0;
  /** filterable variant that gets its own stratum, e.g. 'typed' */
  export let variant: string = '';
  /** non-stratifying info about the run, e.g. 'lin-rt' (which equation types were on) */
  export let tags: string = '';
  export let headerTitle: string = '// TIME UP';
  export let headerSubtitle: string = 'final score recorded.';
  export let stats: string[] = [];

  const dispatch = createEventDispatcher();

  // The alias is generated for the device; students never type a name.
  let alias = '';
  let teacherName = '';
  let classPeriod = '';
  let isSubmitting = false;
  let errorMsg = '';

  onMount(() => {
    const saved = getSavedProfile();
    alias = getAlias();
    teacherName = TEACHERS.includes(saved.teacher) ? saved.teacher : TEACHERS.length === 1 ? TEACHERS[0] : '';
    classPeriod = saved.class_period || '';
  });

  function reroll() {
    alias = rerollAlias();
    errorMsg = '';
  }

  async function submitScore() {
    errorMsg = '';

    if (!alias) {
      errorMsg = 'Could not create an alias on this device. Reload the page and try again.';
      return;
    }
    if (!classPeriod) {
      errorMsg = 'Please select a class period (0-9).';
      return;
    }
    if (!teacherName) {
      errorMsg = 'Please select a teacher.';
      return;
    }

    isSubmitting = true;
    saveProfile({ teacher: teacherName, class_period: classPeriod });

    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: challengeId,
          display_name: alias,
          class_period: classPeriod,
          teacher: teacherName,
          score,
          duration_ms: durationMs,
          level,
          variant,
          tags
        })
      });

      const data = await res.json();
      if (res.ok) {
        window.location.href = '/coliseum#leaderboards';
      } else {
        if (data.code === 'alias_rejected') {
          // rare: the random alias tripped the filter. Roll a new one; the student just resubmits.
          alias = rerollAlias();
          errorMsg = 'That alias was not accepted, so we picked a new one. Press post again.';
        } else {
          errorMsg = data.error || 'Failed to save score.';
        }
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

  <div class="p-6 border border-[var(--border-color)] bg-[var(--well)] rounded space-y-3">
    <div class="text-3xl font-bold text-[var(--accent)]">{score}</div>
    <div class="text-xs text-[var(--text-muted)] space-y-1">
      {#each stats as statLine}
        <div>{statLine}</div>
      {/each}
      <div>time elapsed: {(durationMs / 1000).toFixed(2)}s</div>
    </div>
  </div>

  <!-- Credential Inputs Entry -->
  <div class="p-4 border border-[var(--border-color)] bg-[var(--well)] rounded space-y-4 text-xs text-left">
    <div class="text-[var(--text-muted)]">// your scores post under an auto-generated alias. no names are collected.</div>

    {#if errorMsg}
      <div class="p-2 border border-[var(--bad)] bg-[var(--bad-bg)] text-[var(--bad)] rounded text-xs">
        [!] {errorMsg}
      </div>
    {/if}

    <div class="space-y-1">
      <span class="text-[var(--text-muted)]">your alias:</span>
      <div class="flex items-center gap-2">
        <div
          aria-label="your alias"
          class="flex-1 px-3 py-1.5 rounded border-2 border-[var(--edge)] bg-[var(--tile)] text-[var(--accent)] text-sm font-bold tracking-wide select-all"
        >
          {alias || '...'}
        </div>
        <button
          type="button"
          on:click={reroll}
          title="Reroll alias"
          class="px-3 py-1.5 rounded border-2 border-[var(--edge)] bg-[var(--tile)] text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
        >
          <span aria-hidden="true">&#127922;</span> reroll
        </button>
      </div>
      <div class="text-[var(--text-muted)]">a new alias starts a fresh record: earlier scores stay under the old one.</div>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div class="space-y-1">
        <span class="text-[var(--text-muted)]">class period:</span>
        <select
          bind:value={classPeriod}
          class="w-full px-3 py-1.5 rounded border-2 border-[var(--edge)] bg-[var(--tile)] text-[var(--text-primary)] text-sm uppercase tracking-widest focus:outline-none focus:border-[var(--accent)] cursor-pointer"
        >
          <option value="" disabled selected>select</option>
          {#each ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as p}
            <option value="P{p}">period {p}</option>
          {/each}
        </select>
      </div>

      <div class="space-y-1">
        <span class="text-[var(--text-muted)]">teacher:</span>
        <select
          bind:value={teacherName}
          class="w-full px-3 py-1.5 rounded border-2 border-[var(--edge)] bg-[var(--tile)] text-[var(--text-primary)] text-sm uppercase tracking-widest focus:outline-none focus:border-[var(--accent)] cursor-pointer"
        >
          <option value="" disabled>select</option>
          {#each TEACHERS as t}
            <option value={t}>{t}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  <div class="space-y-3">
    <button 
      on:click={submitScore}
      disabled={isSubmitting}
      class="w-full py-3 rounded border border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-surface)] font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-surface)] transition-colors cursor-pointer text-xs disabled:opacity-50"
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