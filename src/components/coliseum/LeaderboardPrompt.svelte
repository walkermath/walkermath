<!-- src/components/coliseum/LeaderboardPrompt.svelte -->
<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { getSavedProfile, saveProfile } from '../../lib/playerStorage.ts';
  import { getAlias, rerollAlias } from '../../lib/pseudonym.ts';
  import { TEACHERS } from '../../lib/teachers.ts';

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

  /* ---- inside a lesson (the game is embedded at /embed/coliseum/<id>) ----
     Who's playing comes from the student's class sign-in, so there's nothing to pick. The score is
     always kept for the teacher; it posts to the public leaderboard only when the class allows,
     under the student's generated leaderboard name (never their lesson alias). */
  let lesson = false;
  let board: { posting: boolean; name: string | null; fixed: boolean } | null = null;
  let lessonDone: { posted: boolean; name: string | null } | null = null;
  let lessonMsg = '';

  async function loadBoard() {
    const res = await fetch('/api/class/board-name');
    if (res.status === 401) {
      lessonMsg = "you're not signed in to your class here, so this score can't be saved.";
      return;
    }
    if (!res.ok) throw new Error();
    board = await res.json();
    // Nothing to choose (not posting, or the name is already set): save straight away.
    if (board && (!board.posting || board.fixed)) await saveLessonScore();
  }

  async function rerollBoardName() {
    errorMsg = '';
    try {
      const res = await fetch('/api/class/board-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reroll: true })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      board = data;
    } catch (e) {
      errorMsg = (e as Error).message || 'Could not get a new name.';
    }
  }

  async function saveLessonScore(post = true) {
    errorMsg = '';
    isSubmitting = true;
    try {
      const res = await fetch('/api/class/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_id: challengeId, score, duration_ms: durationMs, level, variant, tags, post })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      lessonDone = { posted: !!data.posted, name: data.name ?? null };
      if (!data.kept) lessonMsg = "you've played a lot today: this one wasn't saved.";
    } catch (e) {
      errorMsg = (e as Error).message || 'Network error while saving your score.';
    } finally {
      isSubmitting = false;
    }
  }

  /** In a lesson, a score the student chose not to post is still kept for the teacher. */
  async function playAgain() {
    if (lesson && !lessonDone && !lessonMsg && board) await saveLessonScore(false);
    dispatch('retry');
  }

  onMount(() => {
    lesson = location.pathname.startsWith('/embed/coliseum/');
    if (lesson) {
      loadBoard().catch(() => (errorMsg = 'Network error while loading your leaderboard name.'));
      return;
    }
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

  {#if lesson}
    <div class="p-4 border border-[var(--border-color)] bg-[var(--well)] rounded space-y-3 text-xs text-left">
      {#if errorMsg}
        <div class="p-2 border border-[var(--bad)] bg-[var(--bad-bg)] text-[var(--bad)] rounded">[!] {errorMsg}</div>
      {/if}
      {#if lessonMsg}
        <div class="text-[var(--text-muted)]">// {lessonMsg}</div>
      {:else if lessonDone}
        <div class="font-bold text-[var(--ok)]">saved for your teacher.</div>
        {#if lessonDone.posted}
          <div>posted to the leaderboard as <span class="font-bold text-[var(--accent)]">{lessonDone.name}</span>.</div>
        {/if}
      {:else if board?.posting && !board.fixed}
        <div class="text-[var(--text-muted)]">// your class posts to the public leaderboard. this is your leaderboard name, used for every game. it isn't your class alias.</div>
        <div class="flex items-center gap-2">
          <div class="flex-1 px-3 py-1.5 rounded border-2 border-[var(--edge)] bg-[var(--tile)] text-[var(--accent)] text-sm font-bold tracking-wide">
            {board.name ?? '...'}
          </div>
          <button
            type="button"
            on:click={rerollBoardName}
            disabled={isSubmitting}
            class="px-3 py-1.5 rounded border-2 border-[var(--edge)] bg-[var(--tile)] text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          >
            <span aria-hidden="true">&#127922;</span> reroll
          </button>
        </div>
        <div class="text-[var(--text-muted)]">you can reroll it until your first post. after that it stays.</div>
        <button
          on:click={() => saveLessonScore()}
          disabled={isSubmitting || !board.name}
          class="w-full py-3 rounded border border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-surface)] font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-surface)] transition-colors cursor-pointer text-xs disabled:opacity-50"
        >
          {isSubmitting ? '[posting...]' : '[post score]'}
        </button>
      {:else}
        <div class="text-[var(--text-muted)]">{isSubmitting ? 'saving...' : 'loading...'}</div>
      {/if}
    </div>
  {:else}
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
  {/if}

  <div>
    <button 
      on:click={playAgain}
      class="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] underline cursor-pointer"
    >
      &lt;- {lesson ? (lessonDone || lessonMsg ? '[play again]' : '[play again without posting]') : '[try again without saving]'}
    </button>
  </div>
</div>