<!-- src/components/coliseum/Leaderboard.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  export let lockChallenge: boolean = false;

  let challenges: string[] = [];
  let activeChallengeId: string = '';
  let timeframe: 'all' | 'weekly' | 'daily' = 'all';
  
  // Filter States
  let selectedTeacher: string = 'ALL';
  let selectedPeriod: string = 'ALL';

  let entries: Array<{
    display_name: string;
    score: number;
    duration_ms: number;
    class_period: string;
    teacher?: string;
    created_at: string;
  }> = [];
  
  let loading = false;
  let error = '';

  export async function fetchStandings() {
    if (!activeChallengeId) return;
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams({
        challenge_id: activeChallengeId,
        timeframe
      });
      if (selectedTeacher !== 'ALL') params.set('teacher', selectedTeacher);
      if (selectedPeriod !== 'ALL') params.set('class_period', selectedPeriod);

      const res = await fetch(`/api/leaderboard?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load standings');
      entries = await res.json();
    } catch (e) {
      error = '[!] Unable to reach leaderboard API.';
      entries = [];
    } finally {
      loading = false;
    }
  }

  // Keep a master list of teachers & periods seen in this challenge so dropdowns stay populated
  let availableTeachers: string[] = [];
  let availablePeriods: string[] = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'];

  $: {
    const teachersFromEntries = entries
      .map(e => (e.teacher || '').trim().toUpperCase())
      .filter(Boolean);
    availableTeachers = Array.from(new Set([...availableTeachers, ...teachersFromEntries])).sort();
  }

  // Client-side reactive filtering (instantaneous even if backend returns all rows)
  $: filteredEntries = entries.filter(row => {
    const rowTeacher = (row.teacher || 'GENERA').trim().toUpperCase();
    const rowPeriod = (row.class_period || '').trim().toUpperCase();
    const matchTeacher = selectedTeacher === 'ALL' || rowTeacher === selectedTeacher;
    const matchPeriod = selectedPeriod === 'ALL' || rowPeriod === selectedPeriod;
    return matchTeacher && matchPeriod;
  });

  function handleChallengeChange() {
    // Reset sub-filters when switching challenges so you don't get stuck on an empty view
    selectedTeacher = 'ALL';
    selectedPeriod = 'ALL';
    availableTeachers = [];
    fetchStandings();
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
  <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-4">
    
    <!-- Dropdown Filters Group -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- Challenge Filter -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-[var(--text-muted)]">// challenge:</span>
        {#if !lockChallenge && challenges.length > 0}
          <select
            bind:value={activeChallengeId}
            on:change={handleChallengeChange}
            class="px-2.5 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs text-[var(--text-main)] hover:border-[var(--accent)] focus:outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
          >
            {#each challenges as c}
              <option value={c} class="bg-[var(--bg-surface)] text-[var(--text-main)">{c}</option>
            {/each}
          </select>
        {:else}
          <span class="text-xs font-bold">{activeChallengeId || 'None'}</span>
        {/if}
      </div>

      <!-- Teacher Filter -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-[var(--text-muted)]">teacher:</span>
        <select
          bind:value={selectedTeacher}
          on:change={fetchStandings}
          class="px-2.5 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs text-[var(--text-main)] hover:border-[var(--accent)] focus:outline-none focus:border-[var(--accent)] transition-colors cursor-pointer uppercase"
        >
          <option value="ALL" class="bg-[var(--bg-surface)] text-[var(--text-main)">ALL</option>
          {#each availableTeachers as t}
            <option value={t} class="bg-[var(--bg-surface)] text-[var(--text-main)">{t}</option>
          {/each}
        </select>
      </div>

      <!-- Period Filter -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-[var(--text-muted)]">period:</span>
        <select
          bind:value={selectedPeriod}
          on:change={fetchStandings}  
          class="px-2.5 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs text-[var(--text-main)] hover:border-[var(--accent)] focus:outline-none focus:border-[var(--accent)] transition-colors cursor-pointer uppercase"
        >
          <option value="ALL" class="bg-[var(--bg-surface)] text-[var(--text-main)">ALL</option>
          {#each availablePeriods as p}
            <option value={p} class="bg-[var(--bg-surface)] text-[var(--text-main)">{p}</option>
          {/each}
        </select>
      </div>
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
  {:else if filteredEntries.length === 0}
    <p class="text-xs text-[var(--text-muted)]">
      [!] No records logged for [{activeChallengeId}] 
      {selectedTeacher !== 'ALL' ? `| teacher: ${selectedTeacher} ` : ''}
      {selectedPeriod !== 'ALL' ? `| period: ${selectedPeriod} ` : ''}
      in [{timeframe}] window.
    </p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="border-b border-[var(--border-color)] text-[var(--text-muted)]">
            <th class="py-2 px-3 w-12">rank</th>
            <th class="py-2 px-3">user</th>
            <th class="py-2 px-3">period</th>
            <th class="py-2 px-3">teacher</th>
            <th class="py-2 px-3 text-right">score</th>
            <th class="py-2 px-3 text-right">time</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--border-color)]">
          {#each filteredEntries as row, i}
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
              <td class="py-2.5 px-3 text-[var(--text-muted)]">
                {row.teacher || '—'}
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