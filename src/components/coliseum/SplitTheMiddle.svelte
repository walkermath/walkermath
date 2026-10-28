<!-- src/components/coliseum/SplitTheMiddle.svelte -->
<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import LeaderboardPrompt from './LeaderboardPrompt.svelte';
  import { LEVELS, LEVEL_IDS, generateRound, type Level } from '../../lib/splitTheMiddleGen';

  let gameState: 'menu' | 'playing' | 'gameover' = 'menu';
  let mode: '60s' | 'endurance' = '60s';
  const TYPED_MULTIPLIER = 2; // typing the answers (no tiles to hint at them) doubles the points
  let typedMode = false;
  let difficulty: Level = 1; // 1 = A is 1, 2 = A from 2 to 9 with capped A·C, 3 = no limits (see splitTheMiddleGen.ts)

  let score = 0;
  let roundsCleared = 0;
  let wrongClicks = 0;
  let startTime = 0;
  let durationMs = 0;

  // Quadratic State: Ax^2 + Bx + C
  let coeffA = 1;
  let coeffB = 1;
  let coeffC = 1;
  let b1 = 1;
  let b2 = 1;
  let isCurrentDOTS = false;
  let foundTerms: number[] = [];

  interface OptionButton {
    value: number;
    status: 'unselected' | 'selected' | 'correct' | 'wrong';
  }
  let options: OptionButton[] = [];
  let remainingCount = 2;

  // Typed-answer state (used when typedMode is on)
  let typedA = '';
  let typedB = '';
  let typedError = '';
  let firstInput: HTMLInputElement | null = null;
  let secondInput: HTMLInputElement | null = null;

  // Lockout State (2 second penalty per spec)
  let isLockedOut = false;
  let lockoutTimeLeft = 0;
  let lockoutInterval: any = null;

  // Game Timer State
  let timeLeft = 60;
  let maxCap = 60;
  let timerInterval: any = null;

  function formatQuadratic(A: number, B: number, C: number): string {
    const aStr = A === 1 ? 'x²' : A === -1 ? '-x²' : `${A}x²`;
    const bStr = B === 0 ? '' : B > 0 ? ` + ${B === 1 ? '' : B}x` : ` - ${Math.abs(B) === 1 ? '' : Math.abs(B)}x`;
    const cStr = C === 0 ? '' : C > 0 ? ` + ${C}` : ` - ${Math.abs(C)}`;
    return `${aStr}${bStr}${cStr}`;
  }

  function formatXTerm(val: number): string {
    if (val === 1) return 'x';
    if (val === -1) return '-x';
    return `${val}x`;
  }

  function startGame(selectedMode: '60s' | 'endurance') {
    mode = selectedMode;
    gameState = 'playing';
    score = 0;
    roundsCleared = 0;
    wrongClicks = 0;
    isLockedOut = false;
    startTime = Date.now();

    if (mode === '60s') {
      timeLeft = 60;
      maxCap = 60;
    } else {
      timeLeft = 25;
      maxCap = 30;
    }

    nextRound();
    startTimer();
  }

  function nextRound() {
    foundTerms = [];
    remainingCount = 2;

    const round = generateRound(difficulty);
    coeffA = round.coeffA;
    coeffB = round.coeffB;
    coeffC = round.coeffC;
    b1 = round.b1;
    b2 = round.b2;
    isCurrentDOTS = round.isDOTS;
    options = round.options.map(value => ({ value, status: 'unselected' as const }));
    typedA = '';
    typedB = '';
    typedError = '';
    focusFirstInput();
  }

  function focusFirstInput() {
    if (!typedMode) return;
    tick().then(() => firstInput?.focus());
  }

  function triggerLockout() {
    isLockedOut = true;
    lockoutTimeLeft = 2.0;
    clearInterval(lockoutInterval);
    lockoutInterval = setInterval(() => {
      lockoutTimeLeft -= 0.05;
      if (lockoutTimeLeft <= 0) {
        lockoutTimeLeft = 0;
        isLockedOut = false;
        clearInterval(lockoutInterval);
        focusFirstInput();
      }
    }, 50);
  }

  function registerCorrect(value: number) {
    foundTerms = [...foundTerms, value];
    score += Math.round(2 * pointMult);
    remainingCount--;

    if (mode === 'endurance') {
      const timeBonus = Math.max(0.6, 1.8 - roundsCleared * 0.05);
      timeLeft = Math.min(maxCap, timeLeft + timeBonus);
    }

    if (remainingCount === 0) {
      roundsCleared++;
      score += Math.round(4 * pointMult);
      if (mode === 'endurance') {
        const clearBonus = Math.max(0.8, 1.5 - roundsCleared * 0.04);
        timeLeft = Math.min(maxCap, timeLeft + clearBonus);
      }
      setTimeout(nextRound, 220);
    }
  }

  function registerWrong() {
    wrongClicks++;
    score = Math.max(0, score - 3);
    triggerLockout();

    if (mode === 'endurance') {
      timeLeft = Math.max(0, timeLeft - 2.5);
      if (timeLeft <= 0) endGame();
    }
  }

  function handleSelect(index: number) {
    if (gameState !== 'playing' || isLockedOut) return;
    const item = options[index];
    if (item.status !== 'unselected') return;

    if (item.value === b1 || item.value === b2) {
      item.status = 'correct';
      registerCorrect(item.value);
    } else {
      item.status = 'wrong';
      registerWrong();
    }

    options = [...options];
  }

  // "-27x", "8x", "8", "-x", "+3x"  ->  number  (null when it isn't a term)
  function parseTerm(raw: string): number | null {
    const t = raw.replace(/\s+/g, '').replace(/\u2212/g, '-').toLowerCase();
    const m = t.match(/^([+-]?)(\d*)x?$/);
    if (!m) return null;
    const digits = m[2];
    if (digits === '' && !t.endsWith('x')) return null;
    const n = digits === '' ? 1 : parseInt(digits, 10);
    return m[1] === '-' ? -n : n;
  }

  function submitTyped() {
    if (gameState !== 'playing' || isLockedOut || remainingCount === 0) return;
    const x = parseTerm(typedA);
    const y = parseTerm(typedB);
    if (x === null || y === null) {
      // not a real attempt: no penalty
      typedError = '// write each term like -27x or 8x';
      return;
    }
    typedError = '';
    if ((x === b1 && y === b2) || (x === b2 && y === b1)) {
      registerCorrect(x);
      registerCorrect(y);
    } else {
      registerWrong();
      typedA = '';
      typedB = '';
    }
  }

  function onFirstKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (typedB.trim() === '') secondInput?.focus();
    else submitTyped();
  }

  function onSecondKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (typedA.trim() === '') firstInput?.focus();
    else submitTyped();
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

  function endGame() {
    clearInterval(timerInterval);
    clearInterval(lockoutInterval);
    isLockedOut = false;
    gameState = 'gameover';
    durationMs = Date.now() - startTime;
  }

  onDestroy(() => {
    clearInterval(timerInterval);
    clearInterval(lockoutInterval);
  });

  $: multiplier = LEVELS[difficulty].multiplier;
  $: pointMult = multiplier * (typedMode ? TYPED_MULTIPLIER : 1);
  $: percentage = Math.max(0, Math.min(100, (timeLeft / maxCap) * 100));
</script>

<div class="p-6 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-6 font-mono max-w-xl mx-auto">
  <!-- MENU STATE -->
  {#if gameState === 'menu'}
    <div class="space-y-6">
      <div class="space-y-2">
        <h2 class="text-xl font-bold">// splitTheMiddle</h2>
        <p class="text-xs text-[var(--text-muted)]">
          decompose Bx into (b₁)x and (b₂)x such that b₁·b₂ = A·C and b₁ + b₂ = B.
        </p>
      </div>

      <div class="p-4 border border-[var(--border-color)] bg-[var(--well)] rounded space-y-2 text-xs text-[var(--text-muted)]">
        <div>// SYSTEM_RULES:</div>
        <div>* find the two middle x-terms that multiply to A·C and add to B, from 12 candidates or by typing them.</div>
        <div>* wrong selection triggers a <strong>2.0s system lockout</strong> and -3 pts.</div>
        <div>* each correct term scores 2 pts and finishing a pair adds 4, both times the difficulty multiplier. penalties are not scaled.</div>
      </div>

      <!-- DIFFICULTY -->
      <div class="p-4 border border-[var(--border-color)] bg-[var(--well)] rounded space-y-3 text-xs">
        <div class="text-[var(--text-muted)]">// difficulty</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {#each LEVEL_IDS as lvl}
            <button
              type="button"
              aria-pressed={difficulty === lvl}
              on:click={() => { difficulty = lvl; }}
              class="p-3 rounded border-2 text-left transition-colors cursor-pointer
                {difficulty === lvl ? 'border-[var(--accent)] bg-[var(--tile)]' : 'border-[var(--edge)] hover:border-[var(--accent)]'}"
            >
              <div class="font-bold text-sm {difficulty === lvl ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}">
                [{lvl}] {LEVELS[lvl].name}
              </div>
              <div class="text-[var(--text-muted)] mt-1 leading-relaxed">{LEVELS[lvl].blurb}</div>
              <div class="mt-2 text-[var(--text-primary)]">e.g. {LEVELS[lvl].example}</div>
              <div class="mt-2 font-bold text-[var(--accent)]">{LEVELS[lvl].multiplier.toFixed(1)}&times; points</div>
            </button>
          {/each}
        </div>
      </div>

      <!-- TYPED ANSWERS -->
      <div class="p-4 border border-[var(--border-color)] bg-[var(--well)] rounded space-y-2 text-xs">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" bind:checked={typedMode} class="accent-[var(--accent)]" />
          <span class="font-bold text-[var(--text-primary)]">type the answers instead of picking tiles [{TYPED_MULTIPLIER}&times; points]</span>
        </label>
        <p class="text-[var(--text-muted)] pl-6 text-[11px] leading-relaxed">
          no tiles to hint at the answer. type both terms, like -27x and 8x, in either order. scores on its own leaderboard.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          on:click={() => startGame('60s')}
          class="p-4 border border-[var(--border-color)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
        >
          <div class="font-bold text-sm">[sprint_60s]</div>
          <div class="text-xs text-[var(--text-muted)] mt-1">30 seconds, twice.</div>
          <div class="text-xs font-bold text-[var(--accent)] mt-3 text-right">[start] -&gt;</div>
        </button>

        <button
          on:click={() => startGame('endurance')}
          class="p-4 border border-[var(--border-color)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
        >
          <div class="font-bold text-sm">[endurance_buffer]</div>
          <div class="text-xs text-[var(--text-muted)] mt-1">keep the buffer full.</div>
          <div class="text-xs font-bold text-[var(--accent)] mt-3 text-right">[start] -&gt;</div>
        </button>
      </div>
    </div>

  <!-- PLAYING STATE -->
  {:else if gameState === 'playing'}
    <div class="space-y-6">
      <div class="flex justify-between items-center text-xs text-[var(--text-muted)] border-b border-[var(--border-color)] pb-3">
        <span>
          // MODE: <strong class="text-[var(--text-primary)]">{mode.toUpperCase()}</strong>
          <span class="text-[var(--accent)] font-bold ml-1">[LVL {difficulty}]</span>
          {#if typedMode}
            <span class="text-[var(--accent)] font-bold ml-1">[TYPED]</span>
          {/if}
          | CLEARED: <strong class="text-[var(--text-primary)]">{roundsCleared}</strong>
        </span>
        <span>SCORE: <strong class="text-[var(--accent)]">{score}</strong></span>
      </div>

      <div class="space-y-1">
        <div class="flex justify-between text-xs text-[var(--text-muted)]">
          <span>// {mode === 'endurance' ? 'BUFFER_REMAINING' : 'TIME_REMAINING'}</span>
          <span class={timeLeft <= 5 ? 'text-[var(--bad)] animate-pulse font-bold' : ''}>
            {timeLeft.toFixed(2)}s
          </span>
        </div>
        <div class="w-full h-4 border border-[var(--border-color)] bg-[var(--well-strong)] p-0.5 rounded-sm">
          <div
            class="h-full bg-[var(--accent)] transition-all duration-75 rounded-2xs"
            style="width: {percentage}%"
          ></div>
        </div>
      </div>

      <!-- QUADRATIC TARGET & SPLIT VISUALIZER -->
      <div class="relative p-6 border border-[var(--border-color)] bg-[var(--well)] rounded text-center space-y-6 overflow-hidden">
        {#if isLockedOut}
          <div class="absolute inset-0 bg-red-950/85 backdrop-blur-xs z-20 flex flex-col items-center justify-center space-y-2">
            <div class="text-red-400 font-bold text-sm tracking-widest uppercase">// SYSTEM LOCKOUT //</div>
            <div class="text-3xl font-black text-white">{lockoutTimeLeft.toFixed(1)}s</div>
            <div class="text-xs text-red-300">invalid factor split</div>
          </div>
        {/if}

        <div class="space-y-1">
          <div class="text-xs text-[var(--text-muted)] uppercase tracking-widest">
            // EXPANDED QUADRATIC {isCurrentDOTS ? '[DIFFERENCE OF SQUARES]' : ''}
          </div>
          <div class="text-3xl sm:text-4xl font-black tracking-wider text-[var(--text-primary)] py-2">
            {formatQuadratic(coeffA, coeffB, coeffC)}
          </div>
          <div class="flex justify-center gap-6 text-sm text-[var(--text-muted)]">
            <span>A·C = <strong class="text-base text-[var(--accent)]">{coeffA * coeffC}</strong></span>
            <span>B = <strong class="text-base text-[var(--accent)]">{coeffB}</strong></span>
          </div>
        </div>

        <!-- Split Decomposition Slots -->
        <div class="flex items-center justify-center gap-2 text-base sm:text-lg font-bold py-3 px-3 bg-[var(--well-strong)] border-2 border-[var(--edge)] rounded max-w-md mx-auto">
          <span class="text-[var(--text-primary)]">{coeffA === 1 ? 'x²' : coeffA === -1 ? '-x²' : `${coeffA}x²`} + (</span>
          {#if typedMode}
            <input
              type="text"
              bind:this={firstInput}
              bind:value={typedA}
              on:keydown={onFirstKey}
              disabled={isLockedOut || remainingCount === 0}
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              maxlength="8"
              placeholder="?x"
              aria-label="first term"
              class="w-20 px-1 py-0.5 text-center text-base sm:text-lg font-bold rounded border-2 focus:outline-none {remainingCount === 0 ? 'border-[var(--ok)] text-[var(--ok)] bg-[var(--ok-bg)]' : 'border-dashed border-[var(--accent)] text-[var(--accent)] bg-[var(--tile)] focus:border-solid'}"
            />
            <span class="text-[var(--text-primary)]">+</span>
            <input
              type="text"
              bind:this={secondInput}
              bind:value={typedB}
              on:keydown={onSecondKey}
              disabled={isLockedOut || remainingCount === 0}
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              maxlength="8"
              placeholder="?x"
              aria-label="second term"
              class="w-20 px-1 py-0.5 text-center text-base sm:text-lg font-bold rounded border-2 focus:outline-none {remainingCount === 0 ? 'border-[var(--ok)] text-[var(--ok)] bg-[var(--ok-bg)]' : 'border-dashed border-[var(--accent)] text-[var(--accent)] bg-[var(--tile)] focus:border-solid'}"
            />
          {:else}
            <span class="min-w-[3.5rem] px-2 py-0.5 rounded border-2 {foundTerms.length >= 1 ? 'border-[var(--ok)] text-[var(--ok)] bg-[var(--ok-bg)]' : 'border-dashed border-[var(--accent)] text-[var(--accent)] bg-[var(--tile)]'}">
              {foundTerms.length >= 1 ? formatXTerm(foundTerms[0]) : '?x'}
            </span>
            <span class="text-[var(--text-primary)]">+</span>
            <span class="min-w-[3.5rem] px-2 py-0.5 rounded border-2 {foundTerms.length >= 2 ? 'border-[var(--ok)] text-[var(--ok)] bg-[var(--ok-bg)]' : 'border-dashed border-[var(--accent)] text-[var(--accent)] bg-[var(--tile)]'}">
              {foundTerms.length >= 2 ? formatXTerm(foundTerms[1]) : '?x'}
            </span>
          {/if}
          <span class="text-[var(--text-primary)]">) {coeffC > 0 ? `+ ${coeffC}` : `- ${Math.abs(coeffC)}`}</span>
        </div>

        <!-- What to do -->
        <div class="text-sm text-[var(--text-primary)] leading-relaxed">
          pick the two terms that multiply to
          <strong class="text-[var(--accent)]">{coeffA * coeffC}x²</strong>
          and add to
          <strong class="text-[var(--accent)]">{coeffB}x</strong>
        </div>

        {#if typedMode}
          <!-- Typed answers: the two dashed slots above are the inputs -->
          <div class="space-y-2">
            <button
              type="button"
              on:click={submitTyped}
              disabled={isLockedOut || remainingCount === 0}
              class="px-6 py-3 rounded border-2 border-[var(--accent)] text-[var(--accent)] bg-[var(--tile)] font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-surface)] transition-colors cursor-pointer"
            >
              [check]
            </button>
            <div class="text-xs text-[var(--text-muted)]">press Enter to check. write each term like -27x or 8x, in either order.</div>
            {#if typedError}
              <div class="text-xs font-bold text-[var(--bad)]">{typedError}</div>
            {/if}
          </div>
        {:else}
          <!-- Answer tiles (12) -->
          <div class="grid grid-cols-4 gap-3 max-w-sm mx-auto">
            {#each options as opt, i}
              <button
                on:click={() => handleSelect(i)}
                disabled={opt.status !== 'unselected' || isLockedOut}
                class="h-14 rounded border-2 text-base sm:text-lg font-bold transition-all cursor-pointer select-none
                  {opt.status === 'unselected' ? 'border-[var(--edge)] bg-[var(--tile)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]' : ''}
                  {opt.status === 'correct' ? 'border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok)] opacity-70 cursor-default' : ''}
                  {opt.status === 'wrong' ? 'border-[var(--bad)] bg-[var(--bad-bg)] text-[var(--bad)] opacity-70 cursor-default' : ''}
                "
              >
                {formatXTerm(opt.value)}
              </button>
            {/each}
          </div>

        {/if}
      </div>

    </div>

  <!-- GAME OVER STATE -->
  {:else if gameState === 'gameover'}
    <LeaderboardPrompt
      challengeId={mode === '60s' ? 'split-the-middle-60s' : 'split-the-middle-endurance'}
      level={difficulty}
      variant={typedMode ? 'typed' : ''}
      {score}
      {durationMs}
      headerTitle={mode === 'endurance' ? '// BUFFER COLLAPSED' : '// TIME UP'}
      headerSubtitle="final score recorded for [{mode.toUpperCase()}] at difficulty {difficulty} ({LEVELS[difficulty].name})"
      stats={[`quadratics split: ${roundsCleared} | lockouts: ${wrongClicks}`, `difficulty: ${difficulty} (${LEVELS[difficulty].name}) | ${typedMode ? 'typed answers' : 'tiles'} | ${pointMult.toFixed(1)}x points`]}
      on:retry={() => { gameState = 'menu'; }}
    />
  {/if}
</div>