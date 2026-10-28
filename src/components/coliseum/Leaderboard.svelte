<!-- src/components/coliseum/Leaderboard.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    EVENTS,
    EVENT_ORDER,
    GAMES,
    RACE_LEVEL_FAVOR,
    levelLabel,
    type EventId
  } from '../../lib/coliseumBoards';

  interface BoardInfo {
    game: string;
    event: EventId;
    entries: number;
    players: number;
  }
  interface Row {
    display_name: string;
    class_period: string;
    teacher?: string;
    score: number;
    duration_ms: number;
    created_at: string;
    level: number;
    variant: string;
    tags: string;
    adjusted_ms: number;
  }

  // A board = game + event. Everything else is a filter over the same stored rows.
  let boards: BoardInfo[] = [];
  let game = '';
  let event: EventId | '' = '';

  // Filters
  let band = 'ALL';
  let level = 'ALL';
  let variant = 'all';
  let timeframe: 'all' | 'weekly' | 'daily' = 'all';
  let selectedTeacher = 'ALL';
  let selectedPeriod = 'ALL';

  let entries: Row[] = [];
  let players = 0;
  let rankBy: 'score' | 'time' = 'score';
  let loading = false;
  let loaded = false;
  let error = '';

  // Teachers / periods seen so far, so the dropdowns stay populated
  let availableTeachers: string[] = [];
  const availablePeriods = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'];

  $: games = Array.from(new Set(boards.map(b => b.game))).sort();
  $: gameEvents = boards
    .filter(b => b.game === game)
    .sort((a, b) => EVENT_ORDER.indexOf(a.event) - EVENT_ORDER.indexOf(b.event));
  $: def = GAMES[game];
  $: variantOptions = def?.variants ?? [];
  $: activeBand = def?.bands?.find(b => b.id === band);
  // single-level views have equal weights, so raw time is already the fair comparison
  $: singleLevel = level !== 'ALL' || (!!activeBand && activeBand.lo === activeBand.hi);
  $: showAdjusted = rankBy === 'time' && !!def?.raceWeights && !singleLevel;
  $: hasSettingColumn = !!def?.levels || variantOptions.length > 0;

  $: {
    const fromEntries = entries.map(e => (e.teacher || '').trim().toUpperCase()).filter(Boolean);
    availableTeachers = Array.from(new Set([...availableTeachers, ...fromEntries])).sort();
  }

  function firstEventOf(g: string): EventId {
    return boards
      .filter(b => b.game === g)
      .sort((a, b) => EVENT_ORDER.indexOf(a.event) - EVENT_ORDER.indexOf(b.event))[0].event;
  }

  async function loadBoards() {
    try {
      const res = await fetch('/api/leaderboard?list=true');
      if (!res.ok) throw new Error('list failed');
      boards = await res.json();
      if (boards.length > 0 && !game) {
        game = boards.map(b => b.game).sort()[0];
        event = firstEventOf(game);
        await fetchStandings();
      }
    } catch (e) {
      error = '[!] Failed to load the list of boards.';
    } finally {
      loaded = true;
    }
  }

  export async function fetchStandings() {
    if (!game || !event) return;
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams({ game, event, timeframe });
      if (band !== 'ALL') params.set('band', band);
      if (level !== 'ALL') params.set('level', level);
      if (variant !== 'all') params.set('variant', variant);
      if (selectedTeacher !== 'ALL') params.set('teacher', selectedTeacher);
      if (selectedPeriod !== 'ALL') params.set('class_period', selectedPeriod);

      const res = await fetch(`/api/leaderboard?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load standings');
      const data = await res.json();
      entries = data.entries;
      players = data.players;
      rankBy = data.rankBy;
    } catch (e) {
      error = '[!] Unable to reach leaderboard API.';
      entries = [];
      players = 0;
    } finally {
      loading = false;
    }
  }

  function chooseGame(g: string) {
    game = g;
    event = firstEventOf(g);
    band = 'ALL';
    level = 'ALL';
    variant = 'all';
    selectedTeacher = 'ALL';
    selectedPeriod = 'ALL';
    availableTeachers = [];
    fetchStandings();
  }

  function chooseEvent(e: EventId) {
    event = e;
    fetchStandings();
  }

  function setBand(id: string) {
    band = id;
    level = 'ALL';
    fetchStandings();
  }

  function setLevel(n: string) {
    level = n;
    band = 'ALL';
    fetchStandings();
  }

  function setVariant(v: string) {
    variant = v;
    fetchStandings();
  }

  function setTimeframe(tf: 'all' | 'weekly' | 'daily') {
    timeframe = tf;
    fetchStandings();
  }

  const formatDuration = (ms: number) => (ms / 1000).toFixed(2) + 's';
  const timeframes: ('daily' | 'weekly' | 'all')[] = ['daily', 'weekly', 'all'];
  const eventLabel = (e: string) => EVENTS[e as EventId]?.label ?? e;

  function settingText(row: Row): string {
    const parts: string[] = [];
    const lv = levelLabel(game, row.level);
    if (lv) parts.push(lv);
    const v = variantOptions.find(o => o.id === row.variant);
    if (v) parts.push(v.label);
    return parts.join(' · ') || '—';
  }

  const chip = (active: boolean, ladder = false) =>
    `px-2.5 py-1 rounded border transition-colors cursor-pointer ${
      active
        ? 'border-[var(--accent)] text-[var(--accent)] font-bold bg-[var(--tile)]'
        : ladder
          ? 'border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--well)]'
          : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
    }`;

  onMount(() => {
    loadBoards();
  });
</script>

<div class="p-6 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-5 font-mono">
  {#if !loaded}
    <p class="text-xs text-[var(--text-muted)] animate-pulse">// Querying D1 database...</p>
  {:else if boards.length === 0}
    <p class="text-xs text-[var(--text-muted)]">{error || '[!] No scores logged yet.'}</p>
  {:else}
    <!-- Board picker: game, then event -->
    <div class="space-y-3 border-b border-[var(--border-color)] pb-4">
      <div class="flex flex-wrap items-center gap-3 text-xs">
        <span class="text-[var(--text-muted)]">// game:</span>
        <select
          value={game}
          on:change={(e) => chooseGame(e.currentTarget.value)}
          class="px-2.5 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent)] focus:outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
        >
          {#each games as g}
            <option value={g}>{g}</option>
          {/each}
        </select>

        <div class="flex flex-wrap items-center gap-2">
          {#each gameEvents as b}
            <button on:click={() => chooseEvent(b.event)} class={chip(event === b.event)}>
              [{eventLabel(b.event)}]
              <span class="text-[var(--text-muted)] font-normal">{b.players}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Strata filters: level band / level, and variant. All settings is the default. -->
      {#if def?.bands || def?.levels || variantOptions.length > 0}
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          {#if def?.bands}
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[var(--text-muted)]">// level:</span>
              <button on:click={() => setBand('ALL')} class={chip(band === 'ALL' && level === 'ALL')}>[all]</button>
              {#each def.bands as b}
                <button on:click={() => setBand(b.id)} class={chip(band === b.id, !!b.ladder)}>[{b.label}]</button>
              {/each}
            </div>
          {:else if def?.levels}
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[var(--text-muted)]">// difficulty:</span>
              <button on:click={() => setLevel('ALL')} class={chip(level === 'ALL')}>[all]</button>
              {#each Array.from({ length: def.levels }, (_, i) => i + 1) as n}
                <button on:click={() => setLevel(String(n))} class={chip(level === String(n))}>
                  [{levelLabel(game, n)}]
                </button>
              {/each}
            </div>
          {/if}

          {#if variantOptions.length > 0}
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[var(--text-muted)]">// answers:</span>
              <button on:click={() => setVariant('all')} class={chip(variant === 'all')}>[all]</button>
              <button on:click={() => setVariant('tiles')} class={chip(variant === 'tiles')}>[tiles]</button>
              {#each variantOptions as v}
                <button on:click={() => setVariant(v.id)} class={chip(variant === v.id)}>[{v.label}]</button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Class filters + timeframe -->
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-[var(--text-muted)]">teacher:</span>
          <select
            bind:value={selectedTeacher}
            on:change={fetchStandings}
            class="px-2.5 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent)] focus:outline-none focus:border-[var(--accent)] transition-colors cursor-pointer uppercase"
          >
            <option value="ALL">ALL</option>
            {#each availableTeachers as t}
              <option value={t}>{t}</option>
            {/each}
          </select>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[var(--text-muted)]">period:</span>
          <select
            bind:value={selectedPeriod}
            on:change={fetchStandings}
            class="px-2.5 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent)] focus:outline-none focus:border-[var(--accent)] transition-colors cursor-pointer uppercase"
          >
            <option value="ALL">ALL</option>
            {#each availablePeriods as p}
              <option value={p}>{p}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="flex items-center gap-2">
        {#each timeframes as tf}
          <button on:click={() => setTimeframe(tf)} class={chip(timeframe === tf)}>[{tf}]</button>
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

    <!-- Standings -->
    {#if loading}
      <p class="text-xs text-[var(--text-muted)] animate-pulse">// Querying D1 database...</p>
    {:else if error}
      <p class="text-xs text-[var(--text-muted)]">{error}</p>
    {:else if entries.length === 0}
      <p class="text-xs text-[var(--text-muted)]">
        [!] No records for this view. Try [all] settings, a wider timeframe, or fewer class filters.
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
              {#if hasSettingColumn}
                <th class="py-2 px-3">setting</th>
              {/if}
              {#if rankBy === 'time'}
                {#if showAdjusted}
                  <th class="py-2 px-3 text-right">adj. time</th>
                {/if}
                <th class="py-2 px-3 text-right">time</th>
                <th class="py-2 px-3 text-right">score</th>
              {:else}
                <th class="py-2 px-3 text-right">score</th>
                <th class="py-2 px-3 text-right">time</th>
              {/if}
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--border-color)]">
            {#each entries as row, i}
              <tr class="hover:bg-[var(--well)] transition-colors">
                <td class="py-2.5 px-3 font-bold {i === 0 ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}">
                  #{i + 1}
                </td>
                <td class="py-2.5 px-3 font-bold">{row.display_name}</td>
                <td class="py-2.5 px-3 text-[var(--text-muted)]">{row.class_period || 'open'}</td>
                <td class="py-2.5 px-3 text-[var(--text-muted)]">{row.teacher || '—'}</td>
                {#if hasSettingColumn}
                  <td class="py-2.5 px-3 text-[var(--text-muted)]" title={row.tags ? `types: ${row.tags}` : ''}>
                    {settingText(row)}
                  </td>
                {/if}
                {#if rankBy === 'time'}
                  {#if showAdjusted}
                    <td class="py-2.5 px-3 text-right font-bold text-[var(--accent)]">{formatDuration(row.adjusted_ms)}</td>
                  {/if}
                  <td class="py-2.5 px-3 text-right {showAdjusted ? 'text-[var(--text-muted)]' : 'font-bold text-[var(--accent)]'}">
                    {formatDuration(row.duration_ms)}
                  </td>
                  <td class="py-2.5 px-3 text-right text-[var(--text-muted)]">{row.score}</td>
                {:else}
                  <td class="py-2.5 px-3 text-right font-bold text-[var(--accent)]">{row.score}</td>
                  <td class="py-2.5 px-3 text-right text-[var(--text-muted)]">{formatDuration(row.duration_ms)}</td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="space-y-1 text-xs text-[var(--text-muted)]">
        <div>// {players} {players === 1 ? 'player' : 'players'} on this board. each player shows their best result.</div>
        {#if showAdjusted}
          <div>
            // ranked by adjusted time: time ÷ (level multiplier ^ {RACE_LEVEL_FAVOR}), so higher levels count for more.
            filter to one level to rank by raw time.
          </div>
        {/if}
        {#if players > 0 && players < 5}
          <div>// few players here. [all] settings shows the widest board.</div>
        {/if}
      </div>
    {/if}
  {/if}
</div>