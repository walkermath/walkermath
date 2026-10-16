<!-- src/components/coliseum/MultRacer.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getSavedProfile, saveProfile } from '../../lib/playerStorage';

  let gameState: 'menu' | 'playing' | 'gameover' = 'menu';
  let mode: '60s' | 'streak' = '60s';
  let allowNegatives = false;
  
  // Player Details (captured at game over)
  let playerName = '';
  let teacherName = '';
  let classPeriod = '';

  onMount(() => {
    const saved = getSavedProfile();
    playerName = saved.tag;
    teacherName = saved.teacher;
    classPeriod = saved.class_period;
  });

  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let startTime = 0;
  let durationMs = 0;

  let numA = 0;
  let numB = 0;
  let userAnswer = '';
  let feedback = '';

  let timeLeft = 60;
  let maxTime = 60;
  let timerInterval: any = null;

  let streakCount = 0;
  let currentMaxCap = 10;

  function startGame(selectedMode: '60s' | 'streak') {
    mode = selectedMode;
    gameState = 'playing';
    score = 0;
    correctCount = 0;
    wrongCount = 0;
    streakCount = 0;
    userAnswer = '';
    feedback = '';
    startTime = Date.now();

    if (mode === '60s') {
      timeLeft = 60;
      maxTime = 60;
    } else {
      currentMaxCap = 10;
      timeLeft = 10;
      maxTime = 10;
    }

    nextQuestion();
    startTimer();
  }

  function nextQuestion() {
    userAnswer = '';
    const rangeMin = allowNegatives ? -12 : 0;
    numA = Math.floor(Math.random() * (13 - rangeMin)) + rangeMin;
    numB = Math.floor(Math.random() * (13 - rangeMin)) + rangeMin;
    
    if (allowNegatives && numA >= 0 && numB >= 0 && Math.random() > 0.5) {
      numA *= -1;
    }
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

    const parsed = parseInt(userAnswer, 10);
    const expected = numA * numB;

    if (parsed === expected) {
      correctCount++;
      const negativeBonus = allowNegatives ? 1 : 0;
      score += 3 + negativeBonus;
      feedback = 'correct';

      if (mode === 'streak') {
        streakCount++;
        if (streakCount <= 4) {
          currentMaxCap = 10;
        } else {
          currentMaxCap = Math.max(1.0, currentMaxCap - 0.75);
        }
        maxTime = currentMaxCap;
        timeLeft = maxTime;
      }
    } else {
      wrongCount++;
      score -= 5;
      feedback = 'wrong';

      if (mode === 'streak') {
        timeLeft = Math.max(0, timeLeft - 1.5);
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

  async function submitScore() {
    saveProfile({ tag: playerName, teacher: teacherName, class_period: classPeriod });
    const challengeId = mode === '60s' ? 'mult-racer-60s' : 'mult-racer-streak';

    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: challengeId,
          display_name: playerName || 'ANON',
          class_period: classPeriod || 'OPEN',
          teacher: teacherName || 'GENERAL',
          score,
          duration_ms: durationMs
        })
      });

      const data = await res.json();

      if (res.ok) {
        window.location.href = '/coliseum#leaderboards';
      } else {
        alert(`[!] ${data.error || 'Failed to save score.'}`);
      }
    } catch (err) {
      alert('[!] Network error while submitting score.');
    }
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
        <h2 class="text-xl font-bold">// multiplicationRacer_12</h2>
        <p class="text-xs text-[var(--text-muted)]">
          correct: +3 pts {allowNegatives ? '(+1 Negative Bonus)' : ''} | incorrect: -5 pts
        </p>
      </div>

      <div class="p-4 border border-[var(--border-color)] bg-black/20 rounded space-y-4 text-xs">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" bind:checked={allowNegatives} class="accent-[var(--accent)]" />
          <span>enable negatives (-12 to 12) [+1 bonus per question]</span>
        </label>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button 
          on:click={() => startGame('60s')}
          class="p-4 border border-[var(--border-color)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
        >
          <div class="font-bold text-sm">[sprint]</div>
          <div class="text-xs text-[var(--text-muted)] mt-1">what can you do with 60 seconds?</div>
        </button>

        <button 
          on:click={() => startGame('streak')}
          class="p-4 border border-[var(--border-color)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
        >
          <div class="font-bold text-sm">[streak]</div>
          <div class="text-xs text-[var(--text-muted)] mt-1">flawless execution.</div>
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
        <div class="text-4xl font-bold tracking-wider py-2">
          {numA} &times; {numB} = ?
        </div>

        <div class="flex justify-center gap-3">
          <input 
            type="number" 
            bind:value={userAnswer} 
            autofocus
            required
            class="w-36 px-4 py-2 text-center text-xl rounded border border-[var(--border-color)] bg-black text-white focus:outline-none focus:border-[var(--accent)] font-bold"
          />
          <button 
            type="submit"
            class="px-5 py-2 rounded border border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-surface)] font-bold hover:bg-[var(--accent)] hover:text-black transition-colors cursor-pointer"
          >
            [submit]
          </button>
        </div>

        {#if feedback === 'correct'}
          <div class="text-xs text-emerald-400 font-bold">// CORRECT (+3)</div>
        {:else if feedback === 'wrong'}
          <div class="text-xs text-red-400 font-bold">// INCORRECT (-5)</div>
        {:else}
          <div class="text-xs text-[var(--text-muted)]">// type answer and press enter</div>
        {/if}
      </form>

      <div class="flex justify-between text-xs text-[var(--text-muted)]">
        <span>correct: {correctCount}</span>
        <span>wrong: {wrongCount}</span>
      </div>
    </div>

  <!-- GAME OVER STATE -->
  {:else if gameState === 'gameover'}
    <div class="space-y-6 text-center py-4">
      <div class="space-y-2">
        <h2 class="text-2xl font-bold">// TIME UP</h2>
        <p class="text-xs text-[var(--text-muted)]">final score recorded for [{mode.toUpperCase()}]</p>
      </div>

      <div class="p-6 border border-[var(--border-color)] bg-black/20 rounded space-y-3">
        <div class="text-3xl font-bold text-[var(--accent)]">{score}</div>
        <div class="text-xs text-[var(--text-muted)] space-y-1">
          <div>correct: {correctCount} | wrong: {wrongCount}</div>
          <div>time elapsed: {(durationMs / 1000).toFixed(2)}s</div>
        </div>
      </div>

      <!-- Credential Inputs Entry -->
      <div class="p-4 border border-[var(--border-color)] bg-black/20 rounded space-y-4 text-xs text-left">
        <div class="text-[var(--text-muted)]">// enter credentials to log score:</div>
        
        <div class="space-y-1">
          <span class="text-[var(--text-muted)]">initials / tag (max 6 chars):</span>
          <input 
            type="text" 
            bind:value={playerName} 
            maxlength="6" 
            placeholder="MATH"
            class="w-full px-3 py-1.5 rounded border border-[var(--border-color)] bg-black text-white text-sm uppercase tracking-widest focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <span class="text-[var(--text-muted)]">class period:</span>
            <select 
              bind:value={classPeriod} 
              class="w-full px-3 py-1.5 rounded border border-[var(--border-color)] bg-black text-white text-sm uppercase tracking-widest focus:outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              <option value="" disabled selected>select</option>
              {#each ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as p}
                <option value="P{p}">period {p}</option>
              {/each}
            </select>
          </div>

          <div class="space-y-1">
            <span class="text-[var(--text-muted)]">teacher:</span>
            <input 
              type="text" 
              bind:value={teacherName} 
              maxlength="20" 
              placeholder="WALKER"
              class="w-full px-3 py-1.5 rounded border border-[var(--border-color)] bg-black text-white text-sm uppercase tracking-widest focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
      </div>

      <div class="space-y-3">
        <button 
          on:click={submitScore}
          class="w-full py-3 rounded border border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-surface)] font-bold hover:bg-[var(--accent)] hover:text-black transition-colors cursor-pointer text-xs"
        >
          [post score to leaderboard]
        </button>
      </div>

      <div>
        <button 
          on:click={() => { gameState = 'menu'; }}
          class="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] underline cursor-pointer"
        >
          &lt;- [play again without saving]
        </button>
      </div>
    </div>
  {/if}

</div>