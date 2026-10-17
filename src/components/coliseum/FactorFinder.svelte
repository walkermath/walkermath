<!-- src/components/coliseum/FactorFinder.svelte -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import LeaderboardPrompt from './LeaderboardPrompt.svelte';

  let gameState: 'menu' | 'playing' | 'gameover' = 'menu';

  let score = 0;
  let roundsCleared = 0;
  let startTime = 0;
  let durationMs = 0;

  // Board State
  let targetNumber = 0;
  interface OptionButton {
    value: number;
    isFactor: boolean;
    status: 'unselected' | 'correct' | 'wrong';
  }
  let options: OptionButton[] = [];
  let remainingFactorsCount = 0;

  let timeLeft = 20;
  let maxCap = 25;
  let timerInterval: any = null;

  function startGame() {
    gameState = 'playing';
    score = 0;
    roundsCleared = 0;
    timeLeft = 20;
    maxCap = 25;
    startTime = Date.now();

    nextRound();
    startTimer();
  }

  function getAllFactors(n: number): number[] {
    const factors: number[] = [];
    for (let i = 2; i <= n; i++) {
      if (n % i === 0) factors.push(i);
    }
    return factors;
  }

  function nextRound() {
    var multi = 1;
    if (roundsCleared < 11) {
      multi = 1;
    } else if (roundsCleared < 14) {
      multi = 2;
    } else if (roundsCleared < 16) {
      multi = 3;
    } else if (roundsCleared < 18) {
      multi = 4;
    } else if (roundsCleared < 20) {
      multi = 5;
    } else if (roundsCleared < 25) {
      multi = 6;
    } else {
      multi = 10;
    }
    
    let num = 48;
    let factors: number[] = [];
    do {
      num = Math.floor(Math.random() * multi * 61) + 12;
      factors = getAllFactors(num);
    } while (factors.length < 4);

    targetNumber = num;

    const shuffledFactors = [...factors].sort(() => 0.5 - Math.random());
    const trueCount = Math.min(shuffledFactors.length, Math.floor(Math.random() * 2) + 3);
    const chosenTrueFactors = shuffledFactors.slice(0, trueCount);
    remainingFactorsCount = chosenTrueFactors.length;

    const maxTrue = Math.max(...chosenTrueFactors);
    const distractorCeiling = Math.min(num - 1, Math.max(25, maxTrue + 5));

    const distractors: number[] = [];
    while (distractors.length < (8 - trueCount)) {
      const candidate = Math.floor(Math.random() * (distractorCeiling - 2)) + 2;
      if (num % candidate !== 0 && !distractors.includes(candidate) && candidate !== num) {
        distractors.push(candidate);
      }
    }

    const pool: OptionButton[] = [
      ...chosenTrueFactors.map(val => ({ value: val, isFactor: true, status: 'unselected' as const })),
      ...distractors.map(val => ({ value: val, isFactor: false, status: 'unselected' as const }))
    ];

    options = pool.sort(() => 0.5 - Math.random());
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

  function handleSelect(index: number) {
    if (gameState !== 'playing') return;
    const item = options[index];
    if (item.status !== 'unselected') return;

    if (item.isFactor) {
      item.status = 'correct';
      score += 2;
      remainingFactorsCount--;

      const bonus = Math.max(0.6, 2.2 - (roundsCleared * 0.07));
      timeLeft = Math.min(maxCap, timeLeft + bonus);

      if (remainingFactorsCount === 0) {
        roundsCleared++;
        score += 5;
        setTimeout(nextRound, 200);
      }
    } else {
      item.status = 'wrong';
      score = Math.max(0, score - 3);
      timeLeft = Math.max(0, timeLeft - 3.0);
    }

    options = [...options];
  }

  function endGame() {
    clearInterval(timerInterval);
    gameState = 'gameover';
    durationMs = Date.now() - startTime;
  }

  onDestroy(() => {
    clearInterval(timerInterval);
  });

  $: percentage = Math.max(0, Math.min(100, (timeLeft / maxCap) * 100));
</script>

<div class="p-6 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-6 font-mono max-w-xl mx-auto">
  
  <!-- MENU STATE -->
  {#if gameState === 'menu'}
    <div class="space-y-6">
      <div class="space-y-2">
        <h2 class="text-xl font-bold">// factorFinder</h2>
        <p class="text-xs text-[var(--text-muted)]">
          extract all active factors before the buffer drains.
        </p>
      </div>

      <div class="p-4 border border-[var(--border-color)] bg-black/20 rounded space-y-2 text-xs text-[var(--text-muted)]">
        <div>// SYSTEM_RULES:</div>
        <div>* identify and click every button that divides the number evenly.</div>
        <div>* correct factor: +time bonus | wrong factor: -3.0s penalty.</div>
        <div>* clears yield bonus score. time returns diminish as rounds climb.</div>
      </div>

      <button 
        on:click={startGame}
        class="w-full p-4 border border-[var(--border-color)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
      >
        <div class="font-bold text-sm">[engage division protocol]</div>
        <div class="text-xs text-[var(--text-muted)] mt-1">don't miss.</div>
      </button>
    </div>

  <!-- PLAYING STATE -->
  {:else if gameState === 'playing'}
    <div class="space-y-6">
      <div class="flex justify-between items-center text-xs text-[var(--text-muted)] border-b border-[var(--border-color)] pb-3">
        <span>CLEARED: <strong class="text-white">{roundsCleared}</strong></span>
        <span>SCORE: <strong class="text-[var(--accent)]">{score}</strong></span>
      </div>

      <div class="space-y-1">
        <div class="flex justify-between text-xs text-[var(--text-muted)]">
          <span>// BUFFER_REMAINING</span>
          <span class={timeLeft <= 5 ? 'text-red-400 animate-pulse font-bold' : ''}>
            {timeLeft.toFixed(2)}s
          </span>
        </div>
        <div class="w-full h-4 border border-[var(--border-color)] bg-black/40 p-0.5 rounded-sm">
          <div 
            class="h-full bg-[var(--accent)] transition-all duration-75 rounded-2xs"
            style="width: {percentage}%"
          ></div>
        </div>
      </div>

      <div class="p-6 border border-[var(--border-color)] bg-black/20 rounded text-center space-y-6">
        <div>
          <span class="text-xs text-[var(--text-muted)] uppercase tracking-widest">// TARGET NUMBER</span>
          <div class="text-5xl font-black tracking-widest py-1 text-white">
            {targetNumber}
          </div>
          <div class="text-xs text-[var(--text-muted)] mt-1">
            remaining factors to find: <strong class="text-[var(--accent)]">{remainingFactorsCount}</strong>
          </div>
        </div>

        <!-- 8-Button Matrix -->
        <div class="grid grid-cols-4 gap-3 max-w-sm mx-auto">
          {#each options as opt, i}
            <button 
              on:click={() => handleSelect(i)}
              disabled={opt.status !== 'unselected'}
              class="h-14 rounded border text-lg font-bold transition-all cursor-pointer select-none
                {opt.status === 'unselected' ? 'border-[var(--border-color)] bg-black/60 text-white hover:border-[var(--accent)] hover:text-[var(--accent)]' : ''}
                {opt.status === 'correct' ? 'border-emerald-500 bg-emerald-950/40 text-emerald-400 opacity-60 cursor-default' : ''}
                {opt.status === 'wrong' ? 'border-red-500 bg-red-950/40 text-red-400 opacity-60 cursor-default' : ''}
              "
            >
              {opt.value}
            </button>
          {/each}
        </div>
      </div>

      <div class="text-center text-xs text-[var(--text-muted)]">
        // clear all factors on the board to unlock the next number
      </div>
    </div>

  <!-- GAME OVER STATE -->
  {:else if gameState === 'gameover'}
    <LeaderboardPrompt
      challengeId="factor-finder-endurance"
      {score}
      {durationMs}
      headerTitle="// BUFFER COLLAPSED"
      headerSubtitle="run completed. endurance recorded."
      stats={[`targets cleared: ${roundsCleared}`]}
      on:retry={() => { gameState = 'menu'; }}
    />
  {/if}

</div>