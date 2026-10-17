<!-- src/components/coliseum/SimplifyFractionsRacer.svelte -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import LeaderboardPrompt from './LeaderboardPrompt.svelte';

  let gameState: 'menu' | 'playing' | 'gameover' = 'menu';
  let mode: '60s' | 'streak' = '60s';

  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let startTime = 0;
  let durationMs = 0;

  // Fraction State
  let rawNum = 0;
  let rawDen = 0;
  let targetNum = 0;
  let targetDen = 0;

  let userNum = '';
  let userDen = '';
  let feedback = '';

  let numInputEl: HTMLInputElement;

  let timeLeft = 60;
  let maxTime = 60;
  let timerInterval: any = null;

  let streakCount = 0;
  let currentMaxCap = 20;

  function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
  }

  function startGame(selectedMode: '60s' | 'streak') {
    mode = selectedMode;
    gameState = 'playing';
    score = 0;
    correctCount = 0;
    wrongCount = 0;
    streakCount = 0;
    userNum = '';
    userDen = '';
    feedback = '';
    startTime = Date.now();

    if (mode === '60s') {
      timeLeft = 60;
      maxTime = 60;
    } else {
      currentMaxCap = 20;
      timeLeft = 20;
      maxTime = 20;
    }

    nextQuestion();
    startTimer();
  }

  function nextQuestion() {
    userNum = '';
    userDen = '';

    let a = Math.floor(Math.random() * 9) + 1;
    let b = Math.floor(Math.random() * 11) + 2;
    while (a >= b || gcd(a, b) !== 1) {
      a = Math.floor(Math.random() * 9) + 1;
      b = Math.floor(Math.random() * 11) + 2;
    }

    targetNum = a;
    targetDen = b;

    const factorChoices = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    const k = factorChoices[Math.floor(Math.random() * factorChoices.length)];

    rawNum = targetNum * k;
    rawDen = targetDen * k;

    setTimeout(() => {
      if (numInputEl) numInputEl.focus();
    }, 10);
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

  function handleAnswerSubmit(e: Event) {
    e.preventDefault();
    if (gameState !== 'playing') return;

    const parsedNum = parseInt(userNum, 10);
    const parsedDen = parseInt(userDen, 10);

    if (parsedNum === targetNum && parsedDen === targetDen) {
      correctCount++;
      score += 4;
      feedback = 'correct';

      if (mode === 'streak') {
        streakCount++;
        if (streakCount <= 3) {
          currentMaxCap = 20;
        } else {
          currentMaxCap = Math.max(3.0, currentMaxCap - 0.75);
        }
        maxTime = currentMaxCap;
        timeLeft = maxTime;
      }
    } else {
      wrongCount++;
      score -= 5;
      feedback = 'wrong';

      if (mode === 'streak') {
        timeLeft = Math.max(0, timeLeft - 2.5);
      }
    }

    setTimeout(() => { feedback = ''; }, 300);
    nextQuestion();
  }

  function endGame() {
    clearInterval(timerInterval);
    gameState = 'gameover';
    durationMs = Date.now() - startTime;
  }

  onDestroy(() => {
    clearInterval(timerInterval);
  });

  $: percentage = Math.max(0, Math.min(100, (timeLeft / maxTime) * 100));
</script>

<div class="p-6 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-6 font-mono max-w-xl mx-auto">
  
  <!-- MENU STATE -->
  {#if gameState === 'menu'}
    <div class="space-y-6">
      <div class="space-y-2">
        <h2 class="text-xl font-bold">// simplifyFractionsRacer</h2>
        <p class="text-xs text-[var(--text-muted)]">
          correct: +4 pts | incorrect: -5 pts | reduce to lowest terms
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button 
          on:click={() => startGame('60s')}
          class="p-4 border border-[var(--border-color)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
        >
          <div class="font-bold text-sm">[sprint]</div>
          <div class="text-xs text-[var(--text-muted)] mt-1">60 seconds on the clock.</div>
        </button>

        <button 
          on:click={() => startGame('streak')}
          class="p-4 border border-[var(--border-color)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
        >
          <div class="font-bold text-sm">[streak]</div>
          <div class="text-xs text-[var(--text-muted)] mt-1">slow and steady loses this race.</div>
        </button>
      </div>
    </div>

  <!-- PLAYING STATE -->
  {:else if gameState === 'playing'}
    <div class="space-y-6">
      <div class="flex justify-between items-center text-xs text-[var(--text-muted)] border-b border-[var(--border-color)] pb-3">
        <span>// MODE: {mode.toUpperCase()}</span>
        <span>SCORE: <strong class="text-[var(--accent)]">{score}</strong></span>
      </div>

      <div class="space-y-1">
        <div class="flex justify-between text-xs text-[var(--text-muted)]">
          <span>// TIME_REMAINING</span>
          <span>{timeLeft.toFixed(2)}s</span>
        </div>
        <div class="w-full h-4 border border-[var(--border-color)] bg-black/40 p-0.5 rounded-sm">
          <div 
            class="h-full bg-[var(--accent)] transition-all duration-75 rounded-2xs"
            style="width: {percentage}%"
          ></div>
        </div>
      </div>

      <form on:submit={handleAnswerSubmit} class="p-8 border border-[var(--border-color)] bg-black/20 rounded text-center space-y-6">
        
        <div class="flex items-center justify-center gap-6 py-2">
          <div class="inline-flex flex-col items-center justify-center text-3xl font-bold">
            <span class="px-2 pb-1">{rawNum}</span>
            <div class="w-full h-0.5 bg-white"></div>
            <span class="px-2 pt-1">{rawDen}</span>
          </div>

          <div class="text-3xl font-bold tracking-wider">=</div>

          <div class="inline-flex flex-col items-center justify-center gap-1">
            <input 
              bind:this={numInputEl}
              type="number" 
              bind:value={userNum} 
              required
              placeholder="n"
              class="w-20 px-2 py-1 text-center text-xl rounded border border-[var(--border-color)] bg-black text-white focus:outline-none focus:border-[var(--accent)] font-bold"
            />
            <div class="w-20 h-0.5 bg-[var(--border-color)]"></div>
            <input 
              type="number" 
              bind:value={userDen} 
              required
              placeholder="d"
              class="w-20 px-2 py-1 text-center text-xl rounded border border-[var(--border-color)] bg-black text-white focus:outline-none focus:border-[var(--accent)] font-bold"
            />
          </div>

          <button 
            type="submit"
            class="px-5 py-4 rounded border border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-surface)] font-bold hover:bg-[var(--accent)] hover:text-black transition-colors cursor-pointer text-sm"
          >
            [enter]
          </button>
        </div>

        {#if feedback === 'correct'}
          <div class="text-xs text-emerald-400 font-bold">// CORRECT (+4)</div>
        {:else if feedback === 'wrong'}
          <div class="text-xs text-red-400 font-bold">// INCORRECT (-5)</div>
        {:else}
          <div class="text-xs text-[var(--text-muted)]">// reduce fully, tab between numerator and denominator</div>
        {/if}
      </form>

      <div class="flex justify-between text-xs text-[var(--text-muted)]">
        <span>correct: {correctCount}</span>
        <span>wrong: {wrongCount}</span>
      </div>
    </div>

  <!-- GAME OVER STATE -->
  {:else if gameState === 'gameover'}
    <LeaderboardPrompt
      challengeId={mode === '60s' ? 'simplify-fractions-60s' : 'simplify-fractions-streak'}
      {score}
      {durationMs}
      headerTitle="// TIME UP"
      headerSubtitle="final score recorded for [{mode.toUpperCase()}]"
      stats={[`correct: ${correctCount} | wrong: ${wrongCount}`]}
      on:retry={() => { gameState = 'menu'; }}
    />
  {/if}

</div>