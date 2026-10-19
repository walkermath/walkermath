<!-- src/components/coliseum/TrinomialPuzzle.svelte -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import LeaderboardPrompt from './LeaderboardPrompt.svelte';

  let gameState: 'menu' | 'playing' | 'gameover' = 'menu';
  let mode: '60s' | 'endurance' = '60s';

  let score = 0;
  let roundsCleared = 0;
  let wrongClicks = 0;
  let startTime = 0;
  let durationMs = 0;

  // Puzzle State
  let numA = 0;
  let numB = 0;
  let targetProduct = 0;
  let targetSum = 0;
  let foundValues: number[] = [];

  interface OptionButton {
    value: number;
    isAnswer: boolean;
    status: 'unselected' | 'correct' | 'wrong';
  }
  let options: OptionButton[] = [];
  let remainingCount = 2;

  let timeLeft = 60;
  let maxCap = 60;
  let timerInterval: any = null;

  function startGame(selectedMode: '60s' | 'endurance') {
    mode = selectedMode;
    gameState = 'playing';
    score = 0;
    roundsCleared = 0;
    wrongClicks = 0;
    startTime = Date.now();

    if (mode === '60s') {
      timeLeft = 60;
      maxCap = 60;
    } else {
      timeLeft = 20;
      maxCap = 25;
    }

    nextRound();
    startTimer();
  }

  function randomNonZero(min: number, max: number): number {
    let val = 0;
    while (val === 0) {
      val = Math.floor(Math.random() * (max - min + 1)) + min;
    }
    return val;
  }

  function nextRound() {
    foundValues = [];
    remainingCount = 2;

    // Pick two distinct non-zero integers in [-15, 15]
    let a = randomNonZero(-15, 15);
    let b = randomNonZero(-15, 15);
    while (a === b) {
      b = randomNonZero(-15, 15);
    }

    numA = a;
    numB = b;
    targetProduct = a * b;
    targetSum = a + b;

    const used = new Set<number>([a, b]);
    const distractors: number[] = [];

    function addDistractor(val: number) {
      if (
        distractors.length < 6 &&
        val !== 0 &&
        val >= -15 &&
        val <= 15 &&
        !used.has(val)
      ) {
        used.add(val);
        distractors.push(val);
      }
    }

    // 1. Seed opposite-sign traps (-a and -b)
    const signTraps = [-a, -b].sort(() => 0.5 - Math.random());
    for (const trap of signTraps) {
      addDistractor(trap);
    }

    // 2. Seed other factor pairs of |targetProduct| within [-15, 15]
    const absProd = Math.abs(targetProduct);
    const factorCandidates: number[] = [];
    for (let d = 1; d <= Math.min(15, absProd); d++) {
      if (absProd % d === 0) {
        factorCandidates.push(d, -d);
      }
    }
    factorCandidates.sort(() => 0.5 - Math.random());
    for (const fc of factorCandidates) {
      if (distractors.length >= 4) break; // Leave at least 2 slots for variety
      addDistractor(fc);
    }

    // 3. Seed an off-by-one or sum trap if space remains
    addDistractor(targetSum);

    // 4. Fill remaining slots up to 6 with random non-zero values in [-15, 15]
    while (distractors.length < 6) {
      addDistractor(randomNonZero(-15, 15));
    }

    const pool: OptionButton[] = [
      { value: a, isAnswer: true, status: 'unselected' },
      { value: b, isAnswer: true, status: 'unselected' },
      ...distractors.map(val => ({ value: val, isAnswer: false, status: 'unselected' as const }))
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

    if (item.isAnswer) {
      item.status = 'correct';
      foundValues = [...foundValues, item.value];
      score += 2;
      remainingCount--;

      if (mode === 'endurance') {
        // Small time bump per correct factor, decaying as rounds climb
        const bonus = Math.max(0.5, 1.5 - (roundsCleared * 0.04));
        timeLeft = Math.min(maxCap, timeLeft + bonus);
      }

      if (remainingCount === 0) {
        roundsCleared++;
        score += 3; // Pair completion bonus
        if (mode === 'endurance') {
          const clearBonus = Math.max(0.5, 1.2 - (roundsCleared * 0.03));
          timeLeft = Math.min(maxCap, timeLeft + clearBonus);
        }
        setTimeout(nextRound, 220);
      }
    } else {
      item.status = 'wrong';
      wrongClicks++;
      score = Math.max(0, score - 3);
      if (mode === 'endurance') {
        timeLeft = Math.max(0, timeLeft - 3.0);
        if (timeLeft <= 0) {
          endGame();
        }
      }
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
        <h2 class="text-xl font-bold">// trinomialPuzzle</h2>
        <p class="text-xs text-[var(--text-muted)]">
          decode the two hidden integers from their product and sum.
        </p>
      </div>

      <div class="p-4 border border-[var(--border-color)] bg-black/20 rounded space-y-2 text-xs text-[var(--text-muted)]">
        <div>// SYSTEM_RULES:</div>
        <div>* find the 2 numbers in [-15, 15] that multiply to PRODUCT and add to SUM.</div>
        <div>* correct hit: +2 pts (+3 clear bonus) | wrong hit: -3 pts.</div>
        <div>* endurance mode adds time on clears and deducts -3.0s on misses.</div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button 
          on:click={() => startGame('60s')}
          class="p-4 border border-[var(--border-color)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
        >
          <div class="font-bold text-sm">[sprint_60s]</div>
          <div class="text-xs text-[var(--text-muted)] mt-1">the clock is ticking.</div>
          <div class="text-xs font-bold text-[var(--accent)] mt-3 text-right">[start] -&gt;</div>
        </button>

        <button 
          on:click={() => startGame('endurance')}
          class="p-4 border border-[var(--border-color)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
        >
          <div class="font-bold text-sm">[endurance_buffer]</div>
          <div class="text-xs text-[var(--text-muted)] mt-1">stay afloat.</div>
          <div class="text-xs font-bold text-[var(--accent)] mt-3 text-right">[start] -&gt;</div>
        </button>
      </div>
    </div>

  <!-- PLAYING STATE -->
  {:else if gameState === 'playing'}
    <div class="space-y-6">
      <div class="flex justify-between items-center text-xs text-[var(--text-muted)] border-b border-[var(--border-color)] pb-3">
        <span>// MODE: <strong class="text-white">{mode.toUpperCase()}</strong> | CLEARED: <strong class="text-white">{roundsCleared}</strong></span>
        <span>SCORE: <strong class="text-[var(--accent)]">{score}</strong></span>
      </div>

      <div class="space-y-1">
        <div class="flex justify-between text-xs text-[var(--text-muted)]">
          <span>// {mode === 'endurance' ? 'BUFFER_REMAINING' : 'TIME_REMAINING'}</span>
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

      <!-- X-PUZZLE DISPLAY -->
      <div class="p-6 border border-[var(--border-color)] bg-black/20 rounded space-y-6">
        
        <div class="relative max-w-md mx-auto py-1">
          <!-- Top-Left Corner Readout: Emphasized Given -->
          <div class="flex justify-between items-baseline border-b border-[var(--border-color)]/40 pb-2 mb-2">
            <div class="text-sm sm:text-base font-bold tracking-wider text-[var(--text-muted)]">
              PRODUCT: <span class="text-xl sm:text-2xl font-black text-[var(--accent)] ml-1">{targetProduct}</span>
            </div>
            <span class="text-xs text-[var(--text-muted)]">a &times; b = {targetProduct}</span>
          </div>

          <!-- Minimal Hacker X-Diagram -->
          <div class="relative w-64 h-56 mx-auto my-3 flex items-center justify-center select-none">
            <!-- Diagonal X SVG Lines -->
            <svg viewBox="0 0 100 100" class="absolute inset-0 w-full h-full stroke-[var(--border-color)]" stroke-width="2">
              <line x1="6" y1="6" x2="94" y2="94" />
              <line x1="94" y1="6" x2="6" y2="94" />
            </svg>

            <!-- Top Quadrant: Product (Large Given Clue) -->
            <div class="absolute top-1 left-1/2 -translate-x-1/2 text-center leading-none">
              <div class="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1">product</div>
              <div class="text-4xl sm:text-5xl font-black text-white tracking-tight">{targetProduct}</div>
            </div>

            <!-- Bottom Quadrant: Sum (Large Given Clue) -->
            <div class="absolute bottom-1 left-1/2 -translate-x-1/2 text-center leading-none">
              <div class="text-4xl sm:text-5xl font-black text-white tracking-tight">{targetSum}</div>
              <div class="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mt-1">sum</div>
            </div>

            <!-- Left Quadrant: First Answer Slot -->
            <div class="absolute left-2 top-1/2 -translate-y-1/2 text-center w-16">
              {#if foundValues.length >= 1}
                <span class="text-3xl font-black text-emerald-400">{foundValues[0]}</span>
              {:else}
                <span class="text-2xl font-bold text-[var(--text-muted)] opacity-35">?</span>
              {/if}
            </div>

            <!-- Right Quadrant: Second Answer Slot -->
            <div class="absolute right-2 top-1/2 -translate-y-1/2 text-center w-16">
              {#if foundValues.length >= 2}
                <span class="text-3xl font-black text-emerald-400">{foundValues[1]}</span>
              {:else}
                <span class="text-2xl font-bold text-[var(--text-muted)] opacity-35">?</span>
              {/if}
            </div>
          </div>

          <!-- Bottom-Right Corner Readout: Emphasized Given -->
          <div class="flex justify-between items-baseline border-t border-[var(--border-color)]/40 pt-2 mt-2">
            <span class="text-xs text-[var(--text-muted)]">a + b = {targetSum}</span>
            <div class="text-sm sm:text-base font-bold tracking-wider text-[var(--text-muted)]">
              SUM: <span class="text-xl sm:text-2xl font-black text-[var(--accent)] ml-1">{targetSum}</span>
            </div>
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
        // select the two integers that satisfy both top (product) and bottom (sum)
      </div>
    </div>

  <!-- GAME OVER STATE -->
  {:else if gameState === 'gameover'}
    <LeaderboardPrompt
      challengeId={mode === '60s' ? 'trinomial-puzzle-60s' : 'trinomial-puzzle-endurance'}
      {score}
      {durationMs}
      headerTitle={mode === 'endurance' ? '// BUFFER COLLAPSED' : '// TIME UP'}
      headerSubtitle="final score recorded for [{mode.toUpperCase()}]"
      stats={[`puzzles solved: ${roundsCleared} | misses: ${wrongClicks}`]}
      on:retry={() => { gameState = 'menu'; }}
    />
  {/if}

</div>