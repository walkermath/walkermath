<script lang="ts">
  import { onMount } from 'svelte';

  export let lockChallenge: boolean = false;

  let challenges: string[] = [];
  let activeChallengeId: string = '';
  let timeframe: 'all' | 'weekly' | 'daily' = 'all';
  let entries: Array<{
    display_name: string;
    score: number;
    duration_ms: number;
    class_period: string;
    created_at: string;
  }> = [];
  let loading = false;
  let error = '';

  export async function fetchStandings() {
    if (!activeChallengeId) return;
    loading = true;
    error = '';
    try {
      const res = await fetch(
        `/api/leaderboard?challenge_id=${encodeURIComponent(activeChallengeId)}&timeframe=${timeframe}`
      );
      if (!res.ok) throw new Error('Failed to load standings');
      entries = await res.json();
    } catch (e) {
      error = '[!] Unable to reach leaderboard API.';
      entries = [];
    } finally {
      loading = false;
    }
  }

  async function loadChallenges() {
    try {
      const res = await fetch('/api/leaderboard?list=true');
      if (res.ok) {
        challenges = await res.json();
        if (challenges.length > 0 && !activeChallengeId) {
          activeChallengeId = challenges[0];
          fetchStandings();
        }
      }
    } catch (e) {
      error = '[!] Failed to load challenge list.';
    }
  }

  function formatDuration(ms: number) {
    return (ms / 1000).toFixed(2) + 's';
  }

  onMount(() => {
    loadChallenges();
  });
</script>

<div class="p-6 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-5 font-mono">
  <!-- Top Controls Row -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-4">
    <div class="flex items-center gap-3">
      <span class="text-xs text-[var(--text-muted)]">// challenge:</span>
      {#if !lockChallenge && challenges.length > 0}
        <select
            bind:value={activeChallengeId}
            on:change={fetchStandings}
            class="px-2.5 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs text-[var(--text-main)] hover:bg-black/40 focus:outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
            >
            {#each challenges as c}
                <option value={c} class="bg-[var(--bg-surface)] text-white">{c}</option>
            {/each}
        </select>
      {:else}
        <span class="text-xs font-bold">{activeChallengeId || 'None'}</span>
      {/if}
    </div>

    <!-- Timeframe Filter + Refresh -->
    <div class="flex items-center gap-2 text-xs">
      {#each ['daily', 'weekly', 'all'] as tf}
        <button
          on:click={() => { timeframe = tf; fetchStandings(); }}
          class="px-2.5 py-1 rounded border transition-colors cursor-pointer {timeframe === tf ? 'border-[var(--accent)] text-[var(--accent)] font-bold' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--accent)]'}"
        >
          [{tf}]
        </button>
      {/each}

      <button
        on:click={fetchStandings}
        class="ml-2 px-2.5 py-1 rounded border border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
        title="Refresh standings"
      >
        [↻]
      </button>
    </div>
  </div>

  <!-- Standings Table / States -->
  {#if challenges.length === 0 && !loading}
    <p class="text-xs text-[var(--text-muted)]">[!] No challenges registered yet.</p>
  {:else if loading}
    <p class="text-xs text-[var(--text-muted)] animate-pulse">// Querying D1 database...</p>
  {:else if error}
    <p class="text-xs text-[var(--text-muted)]">{error}</p>
  {:else if entries.length === 0}
    <p class="text-xs text-[var(--text-muted)]">[!] No records logged for [{activeChallengeId}] in [{timeframe}] window.</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="border-b border-[var(--border-color)] text-[var(--text-muted)]">
            <th class="py-2 px-3 w-12">rank</th>
            <th class="py-2 px-3">user</th>
            <th class="py-2 px-3">group</th>
            <th class="py-2 px-3 text-right">score</th>
            <th class="py-2 px-3 text-right">time</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--border-color)]">
          {#each entries as row, i}
            <tr class="hover:bg-black/40 transition-colors">
              <td class="py-2.5 px-3 font-bold {i === 0 ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}">
                #{i + 1}
              </td>
              <td class="py-2.5 px-3 font-bold">
                {row.display_name}
              </td>
              <td class="py-2.5 px-3 text-[var(--text-muted)]">
                {row.class_period || 'open'}
              </td>
              <td class="py-2.5 px-3 text-right font-bold text-[var(--accent)]">
                {row.score}

              </td>
              <td class="py-2.5 px-3 text-right text-[var(--text-muted)]">
                {formatDuration(row.duration_ms)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>