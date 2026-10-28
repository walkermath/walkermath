<!-- src/components/coliseum/AlgebraicStepFinder.svelte -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import LeaderboardPrompt from './LeaderboardPrompt.svelte';
  import {
    type Eq,
    type Family,
    type Frac,
    type Operand,
    type OpKind,
    type State,
    type StepQuality,
    MULTIPLIERS,
    STEP_DIST,
    buildOperandBank,
    evaluateStep,
    extraneous,
    feq,
    fmtExponent,
    fmtFrac,
    fmtOperand,
    fmtState,
    generateEquation,
    parseOperand,
    solvedValues,
    stateGroupCount,
    stateHasPower
  } from '../../lib/algebraStepEngine';

  type Mode = '60s' | 'race10';
  type BankOp = 'add' | 'sub' | 'mul' | 'div' | 'pow';
  interface StepRecord {
    label: string;
    after: State;
    awarded: number;
    quality: StepQuality;
  }
  interface Feedback {
    kind: 'optimal' | 'messy' | 'info' | 'error';
    text: string;
  }

  const OPTIMAL_PTS = 3;
  const SOLVE_PTS = 5;
  const MESSY_PENALTY = 2;
  const SPRINT_SECONDS = 60;
  const RACE_TARGET = 10;

  const OP_BUTTONS: { op: BankOp | 'dist'; label: string }[] = [
    { op: 'add', label: '[ADD]' },
    { op: 'sub', label: '[SUBTRACT]' },
    { op: 'mul', label: '[MULTIPLY]' },
    { op: 'div', label: '[DIVIDE]' },
    { op: 'dist', label: '[DISTRIBUTE]' },
    { op: 'pow', label: '[ROOT] / [EXPONENT]' }
  ];

  const OP_PHRASE: Record<BankOp, [string, string]> = {
    add: ['add', 'to both sides'],
    sub: ['subtract', 'from both sides'],
    mul: ['multiply both sides by', ''],
    div: ['divide both sides by', ''],
    pow: ['raise both sides to the power', '']
  };

  // Equation families. Codes feed the leaderboard challenge id.
  const FAMILY_OPTIONS: { id: Family; label: string; example: string; code: string }[] = [
    { id: 'linear', label: 'linear', example: '3(x - 2) + 4 = 2x + 7', code: 'lin' },
    { id: 'roots', label: 'square & cube roots', example: '2√(x + 3) - 1 = 7', code: 'rt' },
    { id: 'intExp', label: 'integer exponents', example: '(x - 2)² + 5 = 54', code: 'ie' },
    { id: 'ratExp', label: 'rational exponents', example: 'x^(2/3) = 16', code: 're' }
  ];

  let gameState: 'menu' | 'playing' | 'gameover' = 'menu';
  let mode: Mode = 'race10';
  let level = 3;
  let enabled: Record<Family, boolean> = { linear: true, roots: false, intExp: false, ratExp: false };

  // Run state
  let score = 0;
  let solvedCount = 0;
  let totalOptimal = 0;
  let totalMessy = 0;
  let activeMs = 0;
  let timeLeft = SPRINT_SECONDS;
  let durationMs = 0;
  let paused = false;
  let timerInterval: any = null;
  let lastTs = 0;
  let runFamilies: Family[] = ['linear'];

  // Equation state (single source of truth: startEq + steps)
  let startEq: Eq = { L: [], R: [] };
  let steps: StepRecord[] = [];

  // Interaction state
  let stage: 'ops' | 'operand' = 'ops';
  let pendingOp: BankOp | null = null;
  let inputMode: 'bank' | 'type' = 'bank';
  // chosen on the menu and locked for the whole run
  let typedMode = false;
  let runTyped = false;
  const TYPED_MULTIPLIER = 1.2;
  let bank: Operand[] = [];
  let typedValue = '';
  let inputError = '';
  let feedback: Feedback | null = null;

  // Intermission state
  let intermission = false;
  let solvedText = '';
  let extraneousText = '';
  let solveBonus = 0;

  $: multiplier = MULTIPLIERS[level - 1];
  // typed runs earn a small bonus on points (race ranks by time, and typed runs have their own board)
  $: pointMult = multiplier * (runTyped ? TYPED_MULTIPLIER : 1);
  $: stepMix = STEP_DIST[level - 1]
    .map((pct, i) => (pct > 0 ? `${i === 4 ? '5+' : i + 1}-step ${pct}%` : ''))
    .filter(Boolean)
    .join(' | ');
  $: selectedFamilies = FAMILY_OPTIONS.filter(f => enabled[f.id]).map(f => f.id);
  $: familyTags = familyTagsOf(runFamilies);

  $: currentState = steps.length ? steps[steps.length - 1].after : [startEq];
  $: lines = [
    { caption: 'solve for x', branches: fmtState([startEq]) },
    ...steps.map(s => ({ caption: s.label, branches: fmtState(s.after) }))
  ];
  $: currentLine = lines[lines.length - 1];
  $: previousLines = lines.slice(0, -1);
  $: canUndo = steps.length > 0 && !intermission && gameState === 'playing';
  $: hasGroups = stateGroupCount(currentState) > 0;
  $: hasPower = stateHasPower(currentState);
  $: stepOptimalCount = steps.filter(s => s.quality === 'optimal').length;
  $: solvedLabel = mode === 'race10' ? solvedCount + ' / ' + RACE_TARGET : String(solvedCount);
  $: finishingRace = mode === 'race10' && solvedCount >= RACE_TARGET;
  $: percentage =
    mode === '60s'
      ? Math.max(0, Math.min(100, (timeLeft / SPRINT_SECONDS) * 100))
      : Math.min(100, solvedCount * (100 / RACE_TARGET));
  $: clockText =
    mode === '60s' ? `${timeLeft.toFixed(2)}s` : `TIME: ${(activeMs / 1000).toFixed(2)}s`;

  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  /** Which equation types were on, e.g. "lin-rt". A tag on the score, not a separate leaderboard. */
  function familyTagsOf(fams: Family[]): string {
    return FAMILY_OPTIONS.filter(f => fams.includes(f.id)).map(f => f.code).join('-');
  }

  function toggleFamily(id: Family) {
    const next = { ...enabled, [id]: !enabled[id] };
    if (!Object.values(next).some(Boolean)) return; // at least one family stays on
    enabled = next;
  }

  const tileText = (op: BankOp | null, o: Operand) => (op === 'pow' ? fmtExponent(o) : fmtOperand(o));
  const listValues = (vals: Frac[]) => vals.map(v => `x = ${fmtFrac(v)}`).join('  or  ');

  /* ---------------- lifecycle ---------------- */

  function startGame(selectedMode: Mode) {
    mode = selectedMode;
    runFamilies = [...selectedFamilies];
    runTyped = typedMode;
    inputMode = runTyped ? 'type' : 'bank';
    gameState = 'playing';
    score = 0;
    solvedCount = 0;
    totalOptimal = 0;
    totalMessy = 0;
    activeMs = 0;
    timeLeft = SPRINT_SECONDS;
    paused = false;
    loadEquation();
    startTimer();
  }

  function loadEquation() {
    startEq = generateEquation(level, runFamilies).eq;
    steps = [];
    stage = 'ops';
    pendingOp = null;
    bank = [];
    typedValue = '';
    inputError = '';
    feedback = null;
    intermission = false;
  }

  function startTimer() {
    clearInterval(timerInterval);
    lastTs = performance.now();
    timerInterval = setInterval(onTick, 50);
  }

  function onTick() {
    const now = performance.now();
    const dt = now - lastTs;
    lastTs = now;
    if (gameState !== 'playing' || paused) return;
    activeMs += dt;
    if (mode === '60s') {
      timeLeft = Math.max(0, SPRINT_SECONDS - activeMs / 1000);
      if (timeLeft <= 0) endGame();
    }
  }

  function endGame() {
    clearInterval(timerInterval);
    durationMs = Math.round(mode === '60s' ? Math.min(activeMs, SPRINT_SECONDS * 1000) : activeMs);
    gameState = 'gameover';
  }

  onDestroy(() => {
    clearInterval(timerInterval);
  });

  /* ---------------- step 1: operation selection ---------------- */

  function chooseOp(op: BankOp | 'dist') {
    if (gameState !== 'playing' || intermission) return;
    inputError = '';

    if (op === 'pow' && !hasPower) {
      feedback = { kind: 'info', text: '// there is no exponent or root on x to undo. choose another operation.' };
      return;
    }
    if (op === 'dist') {
      runStep('dist');
      return;
    }

    feedback = null;
    pendingOp = op;
    stage = 'operand';
    typedValue = '';
    if (inputMode === 'bank') bank = buildOperandBank(currentState, op);
  }

  function cancelOperand() {
    stage = 'ops';
    pendingOp = null;
    bank = [];
    typedValue = '';
    inputError = '';
  }

  /* ---------------- step 2: operand selection ---------------- */

  function setInputMode(next: 'bank' | 'type') {
    inputMode = next;
    inputError = '';
    if (next === 'bank' && pendingOp && bank.length === 0) {
      bank = buildOperandBank(currentState, pendingOp);
    }
  }

  function pickTile(i: number) {
    if (!pendingOp || !bank[i]) return;
    runStep(pendingOp, bank[i]);
  }

  function submitTyped(e: Event) {
    e.preventDefault();
    if (!pendingOp) return;
    const allowX = pendingOp === 'add' || pendingOp === 'sub';
    const parsed = parseOperand(typedValue, allowX, pendingOp === 'pow');
    if (!parsed) {
      inputError = allowX
        ? '// enter an integer, a fraction like 8/3, or an x-term like 2x.'
        : pendingOp === 'pow'
          ? '// enter an exponent like 2, 1/2, or 3/2.'
          : '// enter an integer or a fraction like 8/3.';
      return;
    }
    inputError = '';
    runStep(pendingOp, parsed);
  }

  /* ---------------- applying a step ---------------- */

  function runStep(op: OpKind, operand?: Operand) {
    const result = evaluateStep(currentState, op, operand);
    if (!result.ok) {
      feedback = { kind: 'error', text: result.error };
      if (op !== 'dist') inputError = result.error;
      return;
    }

    let awarded = 0;
    if (result.quality === 'optimal') {
      awarded = Math.round(OPTIMAL_PTS * pointMult);
      score += awarded;
      totalOptimal++;
      feedback = { kind: 'optimal', text: `// OPTIMAL STEP (+${awarded})` };
    } else {
      score -= MESSY_PENALTY;
      totalMessy++;
      feedback = { kind: 'messy', text: `// MESSY STEP (-${MESSY_PENALTY})` };
    }

    steps = [...steps, { label: result.label, after: result.next, awarded, quality: result.quality }];
    stage = 'ops';
    pendingOp = null;
    bank = [];
    typedValue = '';
    inputError = '';

    const values = solvedValues(result.next);
    if (values) handleSolved(values);
  }

  function handleSolved(values: Frac[]) {
    // a messy squaring step can add solutions that don't check in the original equation
    const bad = extraneous(startEq, values);
    const good = values.filter(v => !bad.some(b => feq(b, v)));
    solvedText = good.length ? listValues(good) : 'no solution';
    extraneousText = bad.length
      ? `// ${bad.map(v => `x = ${fmtFrac(v)}`).join(' and ')} ${bad.length > 1 ? 'are' : 'is'} extraneous: ${bad.length > 1 ? 'they do' : 'it does'} not check in the original equation.`
      : '';
    solveBonus = Math.round(SOLVE_PTS * pointMult);
    score += solveBonus;
    solvedCount++;
    paused = true;
    intermission = true;
  }

  /* ---------------- undo ---------------- */

  function undo() {
    if (!canUndo) return;
    const last = steps[steps.length - 1];
    // points earned by the step are revoked (no farming optimal steps); penalties stand
    score -= last.awarded;
    if (last.quality === 'optimal') totalOptimal--;
    steps = steps.slice(0, -1);
    stage = 'ops';
    pendingOp = null;
    bank = [];
    typedValue = '';
    inputError = '';
    feedback = { kind: 'info', text: '// step reverted.' };
  }

  /* ---------------- intermission ---------------- */

  function nextEquation() {
    if (!intermission) return;
    if (finishingRace) {
      endGame();
      return;
    }
    loadEquation();
    paused = false;
    lastTs = performance.now();
  }
</script>

<div class="p-6 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-6 font-mono max-w-xl mx-auto">

  <!-- MENU STATE -->
  {#if gameState === 'menu'}
    <div class="space-y-6">
      <div class="space-y-2">
        <h2 class="text-xl font-bold">// algebraicStepFinder</h2>
        <p class="text-xs text-[var(--text-muted)]">
          pick the right move, one step at a time, until x is alone.
        </p>
      </div>

      <div class="p-4 border border-[var(--border-color)] bg-[var(--well)] rounded space-y-2 text-xs text-[var(--text-muted)]">
        <div>// SYSTEM_RULES:</div>
        <div>* choose an operation, then choose the number to apply to both sides.</div>
        <div>* optimal step: +{OPTIMAL_PTS} pts | messy step: -{MESSY_PENALTY} pts | solved: +{SOLVE_PTS} pts.</div>
        <div>* points are scaled by the difficulty multiplier. penalties are not.</div>
        <div>* [undo step] reverts the equation and the points it earned. penalties stand.</div>
        <div>* undoing an even power splits the equation in two: solve both branches.</div>
        <div>* the clock pauses between equations.</div>
      </div>

      <div class="p-4 border border-[var(--border-color)] bg-[var(--well)] rounded space-y-3 text-xs">
        <div class="text-[var(--text-muted)]">// equation types (at least one)</div>
        {#each FAMILY_OPTIONS as fam}
          <label class="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled[fam.id]}
              on:change={() => toggleFamily(fam.id)}
              disabled={enabled[fam.id] && selectedFamilies.length === 1}
              class="accent-[var(--accent)] mt-0.5"
            />
            <span>
              {fam.label}
              <span class="text-[var(--text-muted)]">e.g. {fam.example}</span>
            </span>
          </label>
        {/each}
      </div>

      <div class="p-4 border border-[var(--border-color)] bg-[var(--well)] rounded space-y-3 text-xs">
        <div class="flex justify-between items-center">
          <label for="asf-level" class="text-[var(--text-muted)]">// difficulty level</label>
          <span class="font-bold">
            LVL <span class="text-[var(--accent)]">{level}</span>
            | <span class="text-[var(--accent)]">{multiplier.toFixed(1)}&times;</span>
          </span>
        </div>
        <input
          id="asf-level"
          type="range"
          min="1"
          max="10"
          step="1"
          bind:value={level}
          class="w-full accent-[var(--accent)] cursor-pointer"
        />
        <div class="text-[var(--text-muted)]">// mix: {stepMix}</div>
      </div>

      <div class="p-4 border border-[var(--border-color)] bg-[var(--well)] rounded text-xs">
        <label class="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" bind:checked={typedMode} class="accent-[var(--accent)] mt-0.5" />
          <span>
            type my own answers
            <span class="text-[var(--text-muted)]">no number bank. +{TYPED_MULTIPLIER}&times; points, and race times go on the typed-answers board.</span>
          </span>
        </label>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          on:click={() => startGame('race10')}
          class="p-4 border border-[var(--border-color)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
        >
          <div class="font-bold text-sm">[race]</div>
          <div class="text-xs text-[var(--text-muted)] mt-1">ten equations. fastest time wins the leaderboard.</div>
          <div class="text-xs font-bold text-[var(--accent)] mt-3 text-right">[start] -&gt;</div>
        </button>
        <button
          on:click={() => startGame('60s')}
          class="p-4 border border-[var(--border-color)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
        >
          <div class="font-bold text-sm">[sprint]</div>
          <div class="text-xs text-[var(--text-muted)] mt-1">solve as many as you can in 60 seconds.</div>
          <div class="text-xs font-bold text-[var(--accent)] mt-3 text-right">[start] -&gt;</div>
        </button>

      </div>
    </div>

  <!-- PLAYING STATE -->
  {:else if gameState === 'playing'}
    <div class="space-y-6">

      <!-- HUD: single status row -->
      <div class="grid grid-cols-3 items-center text-xs text-[var(--text-muted)] border-b border-[var(--border-color)] pb-3">
        <span class="text-left">
          SOLVED: <strong class="text-[var(--text-primary)]">{solvedLabel}</strong>
        </span>
        <span class="text-center {paused ? 'text-[var(--warn)]' : mode === '60s' && timeLeft <= 10 ? 'text-[var(--bad)] animate-pulse font-bold' : ''}">
          {clockText}{paused ? ' [PAUSED]' : ''}
        </span>
        <span class="text-right">SCORE: <strong class="text-[var(--accent)]">{score}</strong></span>
      </div>

      <!-- Unified visual track -->
      <div class="w-full h-4 border border-[var(--border-color)] bg-[var(--well-strong)] p-0.5 rounded-sm">
        <div
          class="h-full transition-all duration-75 rounded-2xs {paused ? 'bg-[var(--warn)]' : 'bg-[var(--accent)]'}"
          style="width: {percentage}%"
        ></div>
      </div>

      {#if intermission}
        <!-- INTERMISSION -->
        <div class="p-8 border border-[var(--warn)] bg-[var(--well)] rounded text-center space-y-4">
          <div class="text-xs text-[var(--warn)] font-bold">// EQUATION SOLVED</div>
          <div class="text-xs text-[var(--text-muted)]">{fmtState([startEq])[0]}</div>
          <div class="text-3xl sm:text-4xl font-black tracking-wider text-[var(--text-primary)] break-words">{solvedText}</div>
          {#if extraneousText}
            <div class="text-xs text-[var(--warn)]">{extraneousText}</div>
          {/if}
          <div class="text-xs text-[var(--ok)] font-bold">
            // +{solveBonus} pts ({SOLVE_PTS} &times; {pointMult.toFixed(2)})
          </div>
          <div class="text-xs text-[var(--text-muted)]">
            steps: {steps.length} | optimal: {stepOptimalCount}
          </div>
          <button
            on:click={nextEquation}
            class="px-5 py-2 rounded border border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-surface)] font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-surface)] transition-colors cursor-pointer text-sm"
          >
            {finishingRace ? '[finish race ->]' : '[next equation ->]'}
          </button>
        </div>
      {:else}
        <!-- ACTIVE EQUATION CARD -->
        <div class="p-6 border border-[var(--border-color)] bg-[var(--well)] rounded space-y-4">
          <div class="flex justify-between items-center text-xs text-[var(--text-muted)]">
            <span>// EQUATION | LVL {level}</span>
            <button
              on:click={undo}
              disabled={!canUndo}
              class="px-2 py-1 rounded border transition-colors
                {canUndo
                  ? feedback?.kind === 'messy'
                    ? 'border-[var(--warn)] text-[var(--warn)] hover:bg-[var(--warn)] hover:text-[var(--bg-surface)] cursor-pointer'
                    : 'border-[var(--border-color)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer'
                  : 'border-[var(--border-color)] opacity-30 cursor-default'}"
            >
              [↶ undo step]
            </button>
          </div>

          {#if previousLines.length > 0}
            <div class="space-y-2 max-h-36 overflow-y-auto border-b border-[var(--border-color)]/40 pb-3">
              {#each previousLines as line}
                <div class="text-xs text-[var(--text-muted)] opacity-70">
                  <div class="italic">// {line.caption}</div>
                  <div class="text-sm">{line.branches.join('   or   ')}</div>
                </div>
              {/each}
            </div>
          {/if}

          <div class="text-center space-y-2 py-2">
            <div class="text-xs text-[var(--text-muted)] italic">// {currentLine.caption}</div>
            {#each currentLine.branches as branch, i}
              {#if i > 0}
                <div class="text-xs text-[var(--text-muted)]">or</div>
              {/if}
              <div class="text-2xl sm:text-3xl font-bold tracking-wide text-[var(--text-primary)] break-words">
                {branch}
              </div>
            {/each}
          </div>

          {#if feedback}
            <div class="text-center text-xs space-y-1">
              {#if feedback.kind === 'optimal'}
                <div class="text-[var(--ok)] font-bold">{feedback.text}</div>
              {:else if feedback.kind === 'messy'}
                <div class="text-[var(--warn)] font-bold">{feedback.text}</div>
                <div class="text-[var(--text-muted)]">[?] Did the equation get messier or closer to being solved?</div>
              {:else if feedback.kind === 'error'}
                <div class="text-[var(--bad)] font-bold">{feedback.text}</div>
              {:else}
                <div class="text-[var(--text-muted)]">{feedback.text}</div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- STEP 1: operation matrix -->
        {#if stage === 'ops'}
          <div class="space-y-2">
            <div class="text-xs text-[var(--text-muted)]">// choose an operation</div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {#each OP_BUTTONS as btn}
                <button
                  on:click={() => chooseOp(btn.op)}
                  class="h-14 px-2 rounded border-2 border-[var(--edge)] bg-[var(--tile)] text-[var(--text-primary)] text-xs sm:text-sm font-bold hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer select-none
                    {(btn.op === 'dist' && !hasGroups) || (btn.op === 'pow' && !hasPower) ? 'opacity-60' : ''}"
                >
                  {btn.label}
                </button>
              {/each}
            </div>
          </div>

        <!-- STEP 2: operand input -->
        {:else if stage === 'operand' && pendingOp}
          <div class="space-y-4">
            <div class="flex justify-between items-center text-xs text-[var(--text-muted)]">
              <button on:click={cancelOperand} class="hover:text-[var(--accent)] underline cursor-pointer">
                &lt;- [back]
              </button>
              <span>{inputMode === 'type' ? 'typed answers' : 'number bank'}</span>
            </div>

            <div class="text-sm text-center">
              <span class="text-[var(--text-muted)]">{OP_PHRASE[pendingOp][0]}</span>
              <span class="text-[var(--accent)] font-bold px-1">___</span>
              <span class="text-[var(--text-muted)]">{OP_PHRASE[pendingOp][1]}</span>
            </div>
            {#if pendingOp === 'pow'}
              <div class="text-xs text-center text-[var(--text-muted)]">
                // ^(1/2) is a square root, ^(1/3) a cube root, ^2 squares
              </div>
            {/if}

            {#if inputMode === 'bank'}
              <div class="grid grid-cols-4 gap-2 max-w-md mx-auto">
                {#each bank as tile, i}
                  <button
                    on:click={() => pickTile(i)}
                    class="h-12 rounded border-2 border-[var(--edge)] bg-[var(--tile)] text-[var(--text-primary)] text-base sm:text-lg font-bold hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer select-none"
                  >
                    {tileText(pendingOp, tile)}
                  </button>
                {/each}
              </div>
            {:else}
              <form on:submit={submitTyped} class="flex justify-center gap-3">
                <input
                  type="text"
                  use:focusOnMount
                  bind:value={typedValue}
                  autocomplete="off"
                  spellcheck="false"
                  placeholder={pendingOp === 'add' || pendingOp === 'sub' ? '8, -3, 8/3, 2x' : pendingOp === 'pow' ? '2, 1/2, 3/2' : '8, -3, 8/3'}
                  class="w-40 px-4 py-2 text-center text-xl rounded border-2 border-[var(--edge)] bg-[var(--tile)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-bold"
                />
                <button
                  type="submit"
                  class="px-5 py-2 rounded border border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-surface)] font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-surface)] transition-colors cursor-pointer"
                >
                  [apply]
                </button>
              </form>
            {/if}

            {#if inputError}
              <div class="text-center text-xs text-[var(--bad)] font-bold">{inputError}</div>
            {/if}
          </div>
        {/if}
      {/if}

      <div class="text-center text-xs text-[var(--text-muted)]">
        // isolate x: finish when every line reads x = number
      </div>
    </div>

  <!-- GAME OVER STATE -->
  {:else if gameState === 'gameover'}
    <LeaderboardPrompt
      challengeId={mode === '60s' ? 'algebraic-step-finder-60s' : 'algebraic-step-finder-race10'}
      {level}
      variant={runTyped ? 'typed' : ''}
      tags={familyTags}
      {score}
      {durationMs}
      headerTitle={mode === '60s' ? '// TIME UP' : '// RACE COMPLETE'}
      headerSubtitle={mode === '60s' ? `final score recorded for [SPRINT] at level ${level}` : `ranked by fastest time for [RACE] at level ${level}`}
      stats={[
        `equations solved: ${solvedCount} | level: ${level} (${multiplier.toFixed(1)}x)`,
        `optimal steps: ${totalOptimal} | messy steps: ${totalMessy}`,
        `input: ${runTyped ? `typed (${TYPED_MULTIPLIER}x points)` : 'number bank'}`,
        `types: ${FAMILY_OPTIONS.filter(f => runFamilies.includes(f.id)).map(f => f.label).join(', ')}`
      ]}
      on:retry={() => { gameState = 'menu'; }}
    />
  {/if}

</div>