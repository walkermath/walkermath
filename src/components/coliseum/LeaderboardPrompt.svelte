<!-- src/components/coliseum/LeaderboardPrompt.svelte -->
<!-- A game's end screen: the score, and saving it. Saving needs the student's class sign-in, both
     inside a lesson (the game is embedded at /embed/coliseum/<id>) and on the public /coliseum
     pages. The score is kept for the teacher; it posts to the public leaderboard only when the
     class allows, under the student's leaderboard name (handed out by the server, never their class
     alias). Anyone can play signed out; they just can't post. -->
<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';

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

  let isSubmitting = false;
  let errorMsg = '';

  /** Inside a live lesson (the embed) rather than on the public /coliseum page. */
  let lesson = false;
  /** Not signed in to a class on this device: playing is fine, saving isn't possible. */
  let signedOut = false;
  let board: { posting: boolean; name: string | null; fixed: boolean } | null = null;
  let done: { posted: boolean; name: string | null } | null = null;
  let note = '';

  async function loadBoard() {
    errorMsg = '';
    const res = await fetch('/api/class/board-name');
    if (res.status === 401) {
      signedOut = true;
      return;
    }
    signedOut = false;
    if (!res.ok) throw new Error();
    board = await res.json();
    // Nothing to choose (not posting, or the name is already set): save straight away.
    if (board && (!board.posting || board.fixed)) await saveScore();
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

  /** Inside a live lesson the embed's URL names the run and module (?run=&module=), so the teacher sees the score there. */
  function lessonTarget() {
    if (!lesson) return {};
    const q = new URLSearchParams(location.search);
    const runId = q.get('run');
    const moduleId = q.get('module');
    return runId && moduleId ? { runId, moduleId } : {};
  }

  async function saveScore(post = true) {
    errorMsg = '';
    isSubmitting = true;
    try {
      const res = await fetch('/api/class/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_id: challengeId, score, duration_ms: durationMs, level, variant, tags, post, ...lessonTarget() })
      });
      const data = await res.json();
      if (res.status === 401) {
        signedOut = true;
        return;
      }
      if (!res.ok) throw new Error(data.error);
      done = { posted: !!data.posted, name: data.name ?? null };
      if (!data.kept) note = "you've played a lot today: this one wasn't saved.";
    } catch (e) {
      errorMsg = (e as Error).message || 'Network error while saving your score.';
    } finally {
      isSubmitting = false;
    }
  }

  function retrySignIn() {
    loadBoard().catch(() => (errorMsg = 'Network error while checking your class sign-in.'));
  }

  /** A score the student chose not to post is still kept for the teacher. */
  async function playAgain() {
    if (!done && !note && board && !signedOut) await saveScore(false);
    dispatch('retry');
  }

  onMount(() => {
    lesson = location.pathname.startsWith('/embed/coliseum/');
    retrySignIn();
  });
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

  <div class="p-4 border border-[var(--border-color)] bg-[var(--well)] rounded space-y-3 text-xs text-left">
    {#if errorMsg}
      <div class="p-2 border border-[var(--bad)] bg-[var(--bad-bg)] text-[var(--bad)] rounded">[!] {errorMsg}</div>
    {/if}
    {#if signedOut}
      {#if lesson}
        <div class="text-[var(--text-muted)]">// you're not signed in to your class here, so this score can't be saved.</div>
      {:else}
        <div class="text-[var(--text-muted)]">// to save this score or post it to the leaderboard, sign in to your class on this device.</div>
        <div class="flex gap-2">
          <a
            href="/class"
            target="_blank"
            rel="noopener"
            class="flex-1 text-center py-2 rounded border border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-surface)] font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-surface)] transition-colors"
          >
            [sign in to your class]
          </a>
          <button
            type="button"
            on:click={retrySignIn}
            class="flex-1 py-2 rounded border border-[var(--border-color)] bg-[var(--bg-surface)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          >
            [i've signed in]
          </button>
        </div>
        <div class="text-[var(--text-muted)]">sign-in opens in a new tab, so this score waits here.</div>
      {/if}
    {:else if note}
      <div class="text-[var(--text-muted)]">// {note}</div>
    {:else if done}
      <div class="font-bold text-[var(--ok)]">saved for your teacher.</div>
      {#if done.posted}
        <div>posted to the leaderboard as <span class="font-bold text-[var(--accent)]">{done.name}</span>.</div>
      {:else if board && !board.posting}
        <div class="text-[var(--text-muted)]">your class doesn't post to the public leaderboard.</div>
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
        on:click={() => saveScore()}
        disabled={isSubmitting || !board.name}
        class="w-full py-3 rounded border border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-surface)] font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-surface)] transition-colors cursor-pointer text-xs disabled:opacity-50"
      >
        {isSubmitting ? '[posting...]' : '[post score]'}
      </button>
    {:else}
      <div class="text-[var(--text-muted)]">{isSubmitting ? 'saving...' : 'loading...'}</div>
    {/if}
  </div>

  <div>
    <button
      on:click={playAgain}
      class="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] underline cursor-pointer"
    >
      &lt;- {done || note || signedOut ? '[play again]' : '[play again without posting]'}
    </button>
  </div>
</div>
