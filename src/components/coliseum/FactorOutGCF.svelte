<!-- src/components/coliseum/FactorOutGCF.svelte -->
<!-- factorOutTheGCF: type the polynomial with its greatest common factor pulled out, 3x^2 + 6x -> 3x(x + 2). -->
<!-- Any order counts. A wrong answer says why (not the greatest factor, doesn't multiply back) and shows -->
<!-- the right one; an answer that can't be read isn't counted. Problems and checking: src/lib/gcfGen.ts. -->
<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import katex from 'katex';
  import LeaderboardPrompt from './LeaderboardPrompt.svelte';
  import { GCF_LEVELS, GCF_LEVEL_IDS, checkGcf, generateProblem, type GcfLevel, type GcfProblem } from '../../lib/gcfGen';
  import { readMath } from '../../lib/lesson/mathcheck';

  const WRONG_POINTS = 3;
  const STREAK_START = 30; // seconds per problem in streak mode, shrinking after the first few
  const STREAK_MIN = 8;
  const STREAK_WRONG_SEC = 5;

  let gameState: 'menu' | 'playing' | 'gameover' = 'menu';
  let mode: '60s' | 'streak' = '60s';
  let level: GcfLevel = 2;

  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let startTime = 0;
  let durationMs = 0;

  let problem: GcfProblem = generateProblem(2);
  let userAnswer = '';
  let input: HTMLInputElement | null = null;
  /** what happened to the last answer */
  let feedback: { kind: 'correct' | 'wrong' | 'unreadable'; message: string; answerLatex?: string } | null = null;
  let feedbackTimer: any = null;

  let timeLeft = 60;
  let maxTime = 60;
  let timerInterval: any = null;
  let streakCount = 0;

  const tex = (latex: string) => {
    try {
      return katex.renderToString(latex, { throwOnError: false });
    } catch {
      return latex;
    }
  };

  function startGame(selectedMode: '60s' | 'streak') {
    mode = selectedMode;
    gameState = 'playing';
    score = 0;
    correctCount = 0;
    wrongCount = 0;
    streakCount = 0;
    feedback = null;
    startTime = Date.now();
    maxTime = timeLeft = mode === '60s' ? 60 : STREAK_START;
    nextProblem();
    startTimer();
  }

  async function nextProblem() {
    let p = generateProblem(level);
    for (let i = 0; i < 5 && p.text === problem.text; i++) p = generateProblem(level); // not the same one twice
    problem = p;
    userAnswer = '';
    await tick();
    input?.focus();
  }

  function startTimer() {
    clearInterval(timerInterval);
    const tickMs = 50;
    timerInterval = setInterval(() => {
      timeLeft -= tickMs / 1000;
      if (timeLeft <= 0) {
        timeLeft = 0;
        endGame();
      }
    }, tickMs);
  }

  function show(f: typeof feedback, ms: number) {
    feedback = f;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => (feedback = null), ms);
  }

  function submit(e: Event) {
    e.preventDefault();
    if (gameState !== 'playing') return;
    const verdict = checkGcf(problem, userAnswer);
    if (verdict.ok) {
      correctCount++;
      score += GCF_LEVELS[level].points;
      show({ kind: 'correct', message: `CORRECT (+${GCF_LEVELS[level].points})` }, 700);
      if (mode === 'streak') {
        streakCount++;
        maxTime = streakCount <= 3 ? STREAK_START : Math.max(STREAK_MIN, maxTime - 1.5);
        timeLeft = maxTime;
      }
      nextProblem();
    } else if (verdict.why === 'unreadable') {
      // Not counted: fix it and try again.
      show({ kind: 'unreadable', message: verdict.message }, 2500);
      input?.focus();
    } else {
      wrongCount++;
      score -= WRONG_POINTS;
      show({ kind: 'wrong', message: `${verdict.message} (-${WRONG_POINTS})`, answerLatex: problem.answerLatex }, 3500);
      if (mode === 'streak') timeLeft = Math.max(0, timeLeft - STREAK_WRONG_SEC);
      nextProblem();
    }
  }

  /** Symbol buttons type at the cursor (Chromebook keyboards make ^ and ( ) slow). */
  async function insert(text: string, back = 0) {
    if (!input) return;
    const start = input.selectionStart ?? userAnswer.length;
    const end = input.selectionEnd ?? userAnswer.length;
    userAnswer = userAnswer.slice(0, start) + text + userAnswer.slice(end);
    await tick();
    const caret = start + text.length - back;
    input.focus();
    input.setSelectionRange(caret, caret);
  }
  const KEYS: [string, string, number][] = [
    ['x²', '^2', 0],
    ['x³', '^3', 0],
    ['( )', '()', 1],
    ['y', 'y', 0]
  ];

  function endGame() {
    clearInterval(timerInterval);
    clearTimeout(feedbackTimer);
    gameState = 'gameover';
    durationMs = Date.now() - startTime;
  }

  onDestroy(() => {
    clearInterval(timerInterval);
    clearTimeout(feedbackTimer);
  });

  $: percentage = Math.max(0, Math.min(100, (timeLeft / maxTime) * 100));
  $: read = userAnswer.trim() ? readMath(userAnswer) : null;
</script>

<div class="p-6 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-6 font-mono max-w-xl mx-auto">
  {#if gameState === 'menu'}
    <div class="space-y-6">
      <div class="space-y-2">
        <h2 class="text-xl font-bold">// factorOutTheGCF</h2>
        <p class="text-xs text-[var(--text-muted)]">
          pull out the greatest common factor: 3x^2 + 6x -&gt; 3x(x + 2). correct: +{GCF_LEVELS[level].points} pts | incorrect: -{WRONG_POINTS} pts
        </p>
      </div>

      <div class="space-y-2">
        <div class="text-xs text-[var(--text-muted)]">// level</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {#each GCF_LEVEL_IDS as id}
            <button
              type="button"
              on:click={() => (level = id)}
              class="p-3 border rounded text-left cursor-pointer transition-colors {level === id
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--border-color)] hover:border-[var(--accent)]'}"
            >
              <div class="font-bold text-sm">[{id}] {GCF_LEVELS[id].name}</div>
              <div class="text-xs text-[var(--text-muted)] mt-1">{GCF_LEVELS[id].hint}</div>
            </button>
          {/each}
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          on:click={() => startGame('60s')}
          class="p-4 border border-[var(--border-color)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
        >
          <div class="font-bold text-sm">[sprint]</div>
          <div class="text-xs text-[var(--text-muted)] mt-1">60 seconds. how much can you pull out?</div>
          <div class="text-xs font-bold text-[var(--accent)] mt-3 text-right">[start] -&gt;</div>
        </button>

        <button
          on:click={() => startGame('streak')}
          class="p-4 border border-[var(--border-color)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
        >
          <div class="font-bold text-sm">[streak]</div>
          <div class="text-xs text-[var(--text-muted)] mt-1">{STREAK_START}s each, then less. a miss costs {STREAK_WRONG_SEC}s.</div>
          <div class="text-xs font-bold text-[var(--accent)] mt-3 text-right">[start] -&gt;</div>
        </button>
      </div>
    </div>

  {:else if gameState === 'playing'}
    <div class="space-y-6">
      <div class="flex justify-between items-center text-xs text-[var(--text-muted)] border-b border-[var(--border-color)] pb-3">
        <span>// MODE: {mode.toUpperCase()} | LEVEL {level} ({GCF_LEVELS[level].name})</span>
        <span>SCORE: <strong class="text-[var(--accent)]">{score}</strong></span>
      </div>

      <div class="space-y-1">
        <div class="flex justify-between text-xs text-[var(--text-muted)]">
          <span>// TIME_REMAINING</span>
          <span>{timeLeft.toFixed(2)}s</span>
        </div>
        <div class="w-full h-4 border border-[var(--border-color)] bg-black/40 p-0.5 rounded-sm">
          <div class="h-full bg-[var(--accent)] transition-all duration-75 rounded-2xs" style="width: {percentage}%"></div>
        </div>
      </div>

      <form on:submit={submit} class="p-6 sm:p-8 border border-[var(--border-color)] bg-black/20 rounded text-center space-y-5">
        <div class="text-xs text-[var(--text-muted)]">// factor out the GCF</div>
        <div class="text-2xl sm:text-3xl py-1">{@html tex(problem.latex)}</div>

        <div class="flex justify-center gap-2">
          <input
            bind:this={input}
            bind:value={userAnswer}
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="3x(x+2)"
            aria-label="Your answer"
            maxlength="120"
            class="w-full max-w-xs px-3 py-2 text-center text-lg rounded border border-[var(--border-color)] bg-black text-white focus:outline-none focus:border-[var(--accent)] font-bold"
          />
          <button
            type="submit"
            class="px-4 py-2 rounded border border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-surface)] font-bold hover:bg-[var(--accent)] hover:text-black transition-colors cursor-pointer"
          >
            [submit]
          </button>
        </div>

        <div class="flex justify-center gap-1" role="toolbar" aria-label="Math symbols">
          {#each KEYS as [label, text, back]}
            <button
              type="button"
              class="min-w-9 px-2 py-0.5 rounded border border-[var(--border-color)] text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
              on:pointerdown|preventDefault
              on:click={() => insert(text, back)}>{label}</button
            >
          {/each}
        </div>

        <div class="min-h-6 text-sm">
          {#if read?.ok}
            <span class="text-xs text-[var(--text-muted)]">// we read:</span> {@html tex(read.latex)}
          {/if}
        </div>

        <div class="min-h-10 text-xs font-bold space-y-1" aria-live="polite">
          {#if feedback?.kind === 'correct'}
            <div class="text-emerald-400">// {feedback.message}</div>
          {:else if feedback?.kind === 'wrong'}
            <div class="text-red-400">// {feedback.message}</div>
            {#if feedback.answerLatex}
              <div class="text-[var(--text-muted)] font-normal">it was: <span class="text-base text-white">{@html tex(feedback.answerLatex)}</span></div>
            {/if}
          {:else if feedback?.kind === 'unreadable'}
            <div class="text-amber-400">// {feedback.message} (not counted, try again)</div>
          {/if}
        </div>
      </form>

      <div class="flex justify-between text-xs text-[var(--text-muted)]">
        <span>correct: {correctCount}</span>
        <span>wrong: {wrongCount}</span>
      </div>
    </div>

  {:else if gameState === 'gameover'}
    <LeaderboardPrompt
      challengeId={mode === '60s' ? 'factor-out-gcf-60s' : 'factor-out-gcf-streak'}
      {level}
      {score}
      {durationMs}
      headerTitle="// TIME UP"
      headerSubtitle="final score recorded for [{mode.toUpperCase()}] at level {level} ({GCF_LEVELS[level].name})"
      stats={[`correct: ${correctCount} | wrong: ${wrongCount}`, `level: ${level} (${GCF_LEVELS[level].name}) | ${GCF_LEVELS[level].points} pts each`]}
      on:retry={() => {
        gameState = 'menu';
      }}
    />
  {/if}
</div>
