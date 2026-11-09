<!-- src/components/apps/SamplingCards.svelte -->
<!-- Sampling distributions from a deck of cards. Students choose which cards make up the population -->
<!-- (ace 1, number cards their number, J/Q/K 10), see its histogram with μ and σ, then draw samples of -->
<!-- size n with replacement and watch the sampling distribution of x̄ build up. Observed mean and SD of -->
<!-- the sample means sit next to a [reveal σ/√n] button so students predict before they check. -->
<!-- [show z-scores] gives each sample z = (x̄ − μ)/(σ/√n) and flags |z| > 2. -->
<!-- Changing the population or n saves the current distribution to a table (up to 6) so students can -->
<!-- compare n's and populations side by side, [open] one to keep drawing, or [compare] their histograms. -->
<!-- Tutorial mode (the default on a first visit, remembered per browser once turned off) unlocks the -->
<!-- app in 5 steps with a guide line; tapping a sample works out its x̄ (and z, from step 5); a single -->
<!-- draw's x̄ drops into its histogram bar; hovering a bar outlines its samples in the list. -->
<!-- Cards are drawn with CSS and Unicode suits: no images, nothing to load from another host. -->
<!-- Math: src/lib/stats/cardDeck.ts (npm run test:cards). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ALL_CARDS, PRESETS, SUITS, SUIT_NAMES, MAX_N, MIN_N, UNUSUAL_Z, cardLabel, cardName, cardValue,
    isRed, rankOf, suitOf, RANKS, clampN, meanSd, populationStats, drawSample, standardError, zScore,
    isUnusual, binSampleMeans, binEdges, binOfSum, sumsPerBin, normalPdf, populationLabel, type CardId, type Sample,
  } from '../../lib/stats/cardDeck';

  let {
    initialCards = ALL_CARDS,
    initialN = 3,
    tutorial: tutorialProp = undefined,
  }: {
    initialCards?: CardId[];
    initialN?: number;
    /** force tutorial mode on or off (a lesson embed); leave unset to use the browser's saved choice */
    tutorial?: boolean;
  } = $props();

  const MAX_SAMPLES = 10000;
  const LIST_LIMIT = 50; // samples shown in the list (newest first); every sample still counts
  const MAX_SAVED = 6; // saved sampling distributions kept for comparing
  const LONG_SAMPLE = 12; // samples bigger than this show their first SHORT_SHOW cards until expanded
  const SHORT_SHOW = 10;

  type Drawn = Sample & { id: number };
  /** A sampling distribution set aside when the population or n changed. */
  interface Saved {
    key: number;
    label: string;
    cards: CardId[];
    n: number;
    samples: Drawn[];
    nextId: number;
    revealed: boolean;
    mu: number;
    sigma: number;
    mean: number;
    sd: number;
    bins: number[];
  }

  // ---- tutorial mode ----
  // First visit: tutorial mode, which unlocks the app one step at a time. Turning it off is
  // remembered in this browser and shows everything. Steps (progress only goes up):
  //   1 one sample: population, [draw a sample]          2 build it up: each x̄ drops into the histogram
  //   3 speed up (after 5 samples): fast forward, clear   4 measure it (after 100): stats, [reveal theory]
  //   5 compare & z (after revealing): change n or population, saved table, z-scores, worked z
  const TUTORIAL_KEY = 'walkermath:sampling-cards:tutorial';
  const FAST_AT = 5;
  const MEASURE_AT = 100;
  let tutorial = $state(tutorialProp ?? true);
  let progress = $state(1);
  onMount(() => {
    if (tutorialProp !== undefined) return;
    try {
      if (localStorage.getItem(TUTORIAL_KEY) === 'off') {
        tutorial = false;
        if (!samples.length) popEditing = true;
      }
    } catch {
      /* storage blocked: stay in tutorial mode */
    }
  });
  function setTutorial(on: boolean) {
    tutorial = on;
    if (tutorialProp !== undefined) return;
    try {
      localStorage.setItem(TUTORIAL_KEY, on ? 'on' : 'off');
    } catch {
      /* not remembered, still switched for now */
    }
  }
  /** is this step's part of the app showing? (always, outside tutorial mode) */
  const at = (step: number) => !tutorial || progress >= step;

  // ---- state ----
  let inPop: Set<CardId> = $state.raw(new Set(initialCards));
  let n = $state(clampN(initialN));
  let samples: Drawn[] = $state.raw([]);
  let nextId = 1;
  /** id of the sample to deal with the card animation (single draws only) */
  let dealId = $state(-1);
  let revealed = $state(false);
  let showZ = $state(false);
  let notice = $state('');
  let deckOpen = $state(true);
  let saved: Saved[] = $state.raw([]);
  let savedKey = 1;
  let comparing = $state(false);
  /** long samples the student expanded to see every card */
  let expanded: Set<number> = $state.raw(new Set());
  /** the population editor is open (it folds to a summary line after the first draw) */
  let popEditing = $state(!(tutorialProp ?? true));
  /** the newest single-draw sample, animated dropping into its histogram bar */
  let drop: { id: number; bin: number; mean: number } | null = $state(null);
  /** histogram bar under the pointer (its samples are outlined in the list) */
  let hoverBin = $state(-1);
  /** the sample tapped in the list (its x̄ and z are worked out, its bar outlined) */
  let selectedId = $state(-1);

  // ---- derived ----
  const popCards = $derived(ALL_CARDS.filter((c) => inPop.has(c)));
  const pop = $derived(populationStats(popCards));
  const popName = $derived(populationLabel(popCards));
  const se = $derived(pop.size > 0 ? standardError(pop.sigma, n) : NaN);
  const zOk = $derived(Number.isFinite(se) && se > 0);
  const observed = $derived(meanSd(samples.map((s) => s.mean)));
  const bins = $derived(binSampleMeans(samples, n));
  const flagged = $derived(zOk ? samples.filter((s) => isUnusual(zScore(s.mean, pop.mu, pop.sigma, n))).length : 0);
  const shown = $derived(samples.slice(-LIST_LIMIT).reverse());
  const last = $derived(samples.length ? samples[samples.length - 1] : null);
  const selected = $derived(selectedId > 0 ? (samples.find((s) => s.id === selectedId) ?? null) : null);
  const selectedBin = $derived(selected ? binOfSum(selected.sum, n) : -1);

  // ---- formatting ----
  const fmt = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const fmtZ = (z: number | null) => (z === null ? '—' : `${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(2)}`);
  const pct = (a: number, b: number) => (b > 0 ? `${((100 * a) / b).toFixed(1)}%` : '—');

  // ---- saving and restoring sampling distributions ----
  /** Set the current distribution aside (if it has any samples) and start an empty one. */
  function stash() {
    if (samples.length > 0) {
      const entry: Saved = {
        key: savedKey++,
        label: popName,
        cards: popCards,
        n,
        samples,
        nextId,
        revealed,
        mu: pop.mu,
        sigma: pop.sigma,
        mean: observed.mean,
        sd: observed.sd,
        bins,
      };
      let next = [...saved, entry];
      if (next.length > MAX_SAVED) {
        next = next.slice(-MAX_SAVED);
        notice = `Saved ${entry.label}, n = ${entry.n} below (only the last ${MAX_SAVED} are kept).`;
      } else {
        notice = `Saved ${entry.label}, n = ${entry.n} below. New sampling distribution started.`;
      }
      saved = next;
    }
    resetView();
  }

  /** forget the current distribution's samples and anything pointing at them */
  function resetView() {
    samples = [];
    nextId = 1;
    dealId = -1;
    revealed = false;
    expanded = new Set();
    drop = null;
    hoverBin = -1;
    selectedId = -1;
  }

  function openSaved(entry: Saved) {
    saved = saved.filter((d) => d.key !== entry.key);
    stash();
    inPop = new Set(entry.cards);
    n = entry.n;
    samples = entry.samples;
    nextId = entry.nextId;
    revealed = entry.revealed;
    popEditing = false;
    notice = `Opened ${entry.label}, n = ${entry.n}. Keep drawing to add to it.`;
  }

  function deleteSaved(entry: Saved) {
    saved = saved.filter((d) => d.key !== entry.key);
  }

  // ---- population ----
  function setPopulation(next: Set<CardId>) {
    if (next.size === inPop.size && [...next].every((c) => inPop.has(c))) return;
    stash();
    inPop = next;
  }

  function toggleCard(c: CardId) {
    const next = new Set(inPop);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setPopulation(next);
  }

  const suitCards = (s: number) => ALL_CARDS.filter((c) => suitOf(c) === s);
  const suitFull = (s: number) => suitCards(s).every((c) => inPop.has(c));

  function toggleSuit(s: number) {
    const next = new Set(inPop);
    const full = suitFull(s);
    for (const c of suitCards(s)) {
      if (full) next.delete(c);
      else next.add(c);
    }
    setPopulation(next);
  }

  function applyPreset(cards: CardId[]) {
    setPopulation(new Set(cards));
  }

  // ---- sampling ----
  function setN(value: number, input?: HTMLInputElement) {
    const next = clampN(value);
    if (input) input.value = String(next);
    if (next === n) return;
    stash();
    n = next;
  }

  function draw(count: number) {
    if (popCards.length === 0) return;
    const room = Math.min(count, MAX_SAMPLES - samples.length);
    if (room <= 0) return;
    const batch: Drawn[] = [];
    for (let i = 0; i < room; i++) batch.push({ ...drawSample(popCards, n), id: nextId++ });
    samples = samples.concat(batch);
    dealId = count === 1 ? batch[0].id : -1;
    drop = count === 1 ? { id: batch[0].id, bin: binOfSum(batch[0].sum, n), mean: batch[0].mean } : null;
    notice = '';
    popEditing = false;
    if (samples.length >= 1) progress = Math.max(progress, 2);
    if (samples.length >= FAST_AT) progress = Math.max(progress, 3);
    if (samples.length >= MEASURE_AT) progress = Math.max(progress, 4);
  }

  function reveal() {
    revealed = true;
    progress = Math.max(progress, 5);
  }

  function select(id: number) {
    selectedId = selectedId === id ? -1 : id;
  }

  /** Throw away the current distribution (saved ones stay). */
  function clearSamples() {
    resetView();
    notice = '';
  }

  /** the current distribution as a table row (null until it has samples) */
  const currentRow = $derived(
    samples.length
      ? { key: 0, label: popName, n, count: samples.length, revealed, mu: pop.mu, sigma: pop.sigma, mean: observed.mean, sd: observed.sd, bins }
      : null,
  );
  const rows = $derived([
    ...saved.map((d) => ({ ...d, count: d.samples.length, entry: d as Saved | null })),
    ...(currentRow ? [{ ...currentRow, entry: null as Saved | null }] : []),
  ]);

  // ---- tutorial guide: what just happened and what to look at next ----
  const drewText = (s: Drawn) =>
    s.cards.length <= 6 ? `You drew ${s.cards.map(cardLabel).join(', ')}.` : `You drew ${s.cards.length} cards.`;
  const guide = $derived.by(() => {
    if (pop.size === 0) return 'The population is empty. Pick a preset or tap cards in the rest of the deck to add them.';
    if (progress === 1 && !samples.length)
      return `The population is ${popName === 'full deck' ? 'a full deck' : popName}: ${pop.size} cards. A card's value is its number (A = 1, J/Q/K = 10), and its histogram is below. A sample is ${n} cards drawn at random. Press [draw a sample].`;
    if (!samples.length) return `Draw samples to build a new sampling distribution for n = ${n}.`;
    const drew = last ? `${drewText(last)} Their average is x̄ = ${fmt(last.mean)}. ` : '';
    if (progress === 2)
      return `${drew}That x̄ just dropped into the histogram as one block. Draw ${Math.max(1, FAST_AT - samples.length)} more. Where do they land?`;
    if (progress === 3)
      return `${drew}Every block in the histogram is one sample's average, not one card. Use fast forward to get to ${MEASURE_AT} samples and watch the shape.`;
    if (progress === 4)
      return `Your ${samples.length} x̄'s pile up near ${fmt(observed.mean)}, with a spread (SD) of ${fmt(observed.sd)}. The cards go from 1 to 10, so why don't the averages spread out that far? Predict the center and spread of the x̄'s from μ, σ and n, then press [reveal theory].`;
    if (!revealed)
      return `n = ${n} now. Predict first: will the x̄'s spread out more or less than before? Draw lots of samples, then reveal theory to check. Tap any sample to see its average and z-score worked out.`;
    return `Theory: the x̄'s center at μ = ${fmt(pop.mu)} with a spread of σ/√n = ${fmt(se)}. Yours: ${fmt(observed.mean)} and ${samples.length > 1 ? fmt(observed.sd) : '—'}. Now change n (this distribution is saved for comparing), and tap any sample to see its z-score worked out.`;
  });

  // ---- worked x̄ and z for a tapped sample ----
  function workedMean(s: Drawn) {
    const values = s.cards.map(cardValue);
    const top = values.length <= LONG_SAMPLE ? `(${values.join(' + ')})` : `(sum of ${values.length} values)`;
    return `x̄ = ${top} / ${n} = ${s.sum} / ${n} = ${fmt(s.mean)}`;
  }
  function workedZ(s: Drawn) {
    const z = zScore(s.mean, pop.mu, pop.sigma, n);
    if (z === null) return null;
    const diff = s.mean - pop.mu;
    return {
      line1: `z = (x̄ − μ) / (σ/√n) = (${fmt(s.mean)} − ${fmt(pop.mu)}) / (${fmt(pop.sigma)}/√${n})`,
      line2: `  = ${diff < 0 ? '−' : ''}${fmt(Math.abs(diff))} / ${fmt(se)} ≈ ${fmtZ(z)}`,
      words: `This sample's average is ${fmt(Math.abs(z))} standard errors ${z >= 0 ? 'above' : 'below'} μ.`,
      unusual: isUnusual(z),
    };
  }

  // ---- histogram bar hover ----
  function binRange(i: number) {
    const { lo, hi } = binEdges(i, n);
    const a = lo + 0.5 / n;
    const b = hi - 0.5 / n;
    return Math.abs(a - b) < 1e-9 ? `x̄ = ${fmt(a)}` : `x̄ from ${fmt(a)} to ${fmt(b)}`;
  }

  function toggleExpanded(id: number) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
  }

  // ---- charts (shared x axis 0.5..10.5 so the two histograms line up) ----
  const W = 480;
  const PAD_L = 34;
  const PAD_R = 10;
  const PAD_T = 26;
  const PLOT_H = 120;
  const xs = (v: number) => PAD_L + ((v - 0.5) / 10) * (W - PAD_L - PAD_R);
  const clampX = (x: number) => Math.min(W - PAD_R - 72, Math.max(PAD_L + 72, x));
  const VALUES = Array.from({ length: 10 }, (_, i) => i + 1);

  const popMax = $derived(Math.max(1, ...pop.counts));
  const popY = (count: number, h = PLOT_H) => PAD_T + h - (count / popMax) * h;

  const binWidth = $derived(sumsPerBin(n) / n);
  const curve = $derived.by(() => {
    if (!revealed || !zOk || samples.length === 0) return null;
    const pts: [number, number][] = [];
    for (let x = 0.5; x <= 10.5001; x += 0.05) pts.push([x, samples.length * binWidth * normalPdf(x, pop.mu, se)]);
    return pts;
  });
  const sampMax = $derived(Math.max(1, ...bins, ...(curve ? curve.map((p) => p[1]) : [])));
  const sampY = (count: number) => PAD_T + PLOT_H - (count / sampMax) * PLOT_H;
  const curvePath = $derived(
    curve ? curve.map(([x, y], i) => `${i ? 'L' : 'M'}${xs(x).toFixed(1)},${sampY(y).toFixed(1)}`).join(' ') : '',
  );
  const zTicks = $derived(
    showZ && zOk
      ? [-3, -2, -1, 0, 1, 2, 3].map((k) => ({ k, v: pop.mu + k * se })).filter((t) => t.v >= 0.5 && t.v <= 10.5)
      : [],
  );
  const sampH = $derived(PAD_T + PLOT_H + (zTicks.length ? 56 : 24)); // z labels sit at +49, plus room below
  const binFlagged = (i: number) => {
    if (!showZ || !zOk) return false;
    const { lo, hi } = binEdges(i, n);
    return Math.abs(((lo + hi) / 2 - pop.mu) / se) > UNUSUAL_Z;
  };
</script>

{#snippet mini(r: { label: string; n: number; count: number; bins: number[]; mean: number; sd: number; mu: number; entry: Saved | null })}
  {@const top = Math.max(1, ...r.bins)}
  {@const H = 64}
  <svg viewBox={`0 0 ${W} ${H + 34}`} class="w-full h-auto" role="img"
    aria-label={`${r.label}, n = ${r.n}: ${r.count} samples, mean of x̄ ${fmt(r.mean)}, SD of x̄ ${fmt(r.sd)}`}>
    <text x={PAD_L} y="13" class="lbl strong">{r.entry ? '' : '▸ '}{r.label} · n = {r.n}</text>
    <text x={W - PAD_R} y="13" class="lbl" text-anchor="end">SD of x̄ = {r.count > 1 ? fmt(r.sd) : '—'}</text>
    {#each r.bins as count, i}
      {#if count > 0}
        {@const e = binEdges(i, r.n)}
        <rect x={xs(e.lo) + 0.5} y={18 + H - (count / top) * H} width={Math.max(1, xs(e.hi) - xs(e.lo) - 1)}
          height={(count / top) * H} class="bar" />
      {/if}
    {/each}
    <line x1={PAD_L} x2={W - PAD_R} y1={18 + H} y2={18 + H} class="axis" />
    <line x1={xs(r.mean)} x2={xs(r.mean)} y1="18" y2={18 + H} class="mean-line" />
    {#each VALUES as v}
      <text x={xs(v)} y={18 + H + 13} class="lbl small" text-anchor="middle">{v}</text>
    {/each}
  </svg>
{/snippet}

{#snippet popHist(h: number)}
  <figure>
    <svg viewBox={`0 0 ${W} ${PAD_T + h + 24}`} class="w-full h-auto" role="img"
      aria-label={pop.size ? `Population histogram of card values. Mean ${fmt(pop.mu)}, standard deviation ${fmt(pop.sigma)}.` : 'Population histogram: empty'}>
      <text x={PAD_L - 6} y={PAD_T + 4} class="lbl" text-anchor="end">{popMax}</text>
      {#each VALUES as v}
        {#if pop.counts[v - 1] > 0}
          <rect x={xs(v - 0.42)} y={popY(pop.counts[v - 1], h)} width={xs(v + 0.42) - xs(v - 0.42)}
            height={PAD_T + h - popY(pop.counts[v - 1], h)} class="bar pop" />
        {/if}
        <text x={xs(v)} y={PAD_T + h + 16} class="lbl" text-anchor="middle">{v}</text>
      {/each}
      <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + h} y2={PAD_T + h} class="axis" />
      {#if pop.size > 0}
        <line x1={xs(pop.mu)} x2={xs(pop.mu)} y1={PAD_T - 6} y2={PAD_T + h} class="mean-line" />
        <text x={clampX(xs(pop.mu))} y="14" class="lbl strong" text-anchor="middle">μ = {fmt(pop.mu)}, σ = {fmt(pop.sigma)}</text>
      {:else}
        <text x={W / 2} y={PAD_T + h / 2} class="lbl" text-anchor="middle">add cards to see the population</text>
      {/if}
    </svg>
    <figcaption class="text-[0.7rem] text-[var(--text-muted)] text-center">population: the value of each card (A = 1, J/Q/K = 10) · bar height = number of cards</figcaption>
  </figure>
{/snippet}

<div class="max-w-4xl mx-auto space-y-4 font-mono text-sm">
  <!-- tutorial mode switch -->
  <div class="flex justify-end items-center gap-2 text-xs">
    <span class="text-[var(--text-muted)]">tutorial mode</span>
    <button class="btn" role="switch" aria-checked={tutorial} onclick={() => setTutorial(!tutorial)}
      title={tutorial ? 'Turn off to see every control at once' : 'Turn on to unlock the app one step at a time'}>
      [{tutorial ? 'on' : 'off'}]
    </button>
  </div>

  <!-- ============ POPULATION ============ -->
  {#if popEditing}
    <section class="panel space-y-4">
      <div class="flex flex-wrap justify-between items-baseline gap-2 border-b border-[var(--border-color)] pb-2">
        <h2 class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">// choose the population ({pop.size} cards)</h2>
        <div class="flex flex-wrap gap-1.5">
          {#each PRESETS as p (p.id)}
            <button class="btn" onclick={() => applyPreset(p.cards)}>[{p.label}]</button>
          {/each}
          {#if pop.size > 0}
            <button class="btn primary" onclick={() => (popEditing = false)}>[done]</button>
          {/if}
        </div>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 items-start">
        <!-- the population: the big cards -->
        <div class="flex-1 min-w-0 w-full">
          <p class="text-xs text-[var(--text-muted)] mb-2">In the population (tap a card to remove it):</p>
          {#if popCards.length === 0}
            <p class="text-xs text-[var(--text-muted)]">Empty. Add cards from the rest of the deck.</p>
          {:else}
            <div class="flex flex-wrap gap-1.5">
              {#each popCards as c (c)}
                <button
                  class="card big"
                  class:red={isRed(c)}
                  onclick={() => toggleCard(c)}
                  aria-label={`Remove ${cardName(c)} (value ${cardValue(c)})`}
                  title={`${cardName(c)}: value ${cardValue(c)}`}
                >
                  <span>{RANKS[rankOf(c)]}</span><span class="suit">{SUITS[suitOf(c)]}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- the rest of the deck: a narrow picker, one column per suit, A..K top to bottom -->
        <div class="flex gap-1 shrink-0 items-start">
          {#if deckOpen}
            <div class="flex gap-1" role="group" aria-label="Rest of the deck">
              {#each [0, 1, 2, 3] as s}
                <div class="flex flex-col gap-0.5">
                  <button
                    class="btn suit-btn"
                    class:red-text={s === 1 || s === 2}
                    onclick={() => toggleSuit(s)}
                    aria-label={suitFull(s) ? `Remove all ${SUIT_NAMES[s]}` : `Add all ${SUIT_NAMES[s]}`}
                    title={suitFull(s) ? `remove all ${SUIT_NAMES[s]}` : `add all ${SUIT_NAMES[s]}`}
                  >{suitFull(s) ? '−' : '+'}{SUITS[s]}</button>
                  {#each suitCards(s) as c (c)}
                    {#if inPop.has(c)}
                      <span class="slot" aria-hidden="true"></span>
                    {:else}
                      <button
                        class="card pick"
                        class:red={isRed(c)}
                        onclick={() => toggleCard(c)}
                        aria-label={`Add ${cardName(c)} (value ${cardValue(c)})`}
                        title={`${cardName(c)}: value ${cardValue(c)}`}
                      >
                        <span>{RANKS[rankOf(c)]}</span><span class="suit">{SUITS[s]}</span>
                      </button>
                    {/if}
                  {/each}
                </div>
              {/each}
            </div>
          {/if}
          <button class="deck-label" onclick={() => (deckOpen = !deckOpen)} aria-expanded={deckOpen}>
            [{deckOpen ? '−' : '+'}] Rest of the deck (tap a card to add it)
          </button>
        </div>
      </div>

      {@render popHist(PLOT_H)}
    </section>
  {:else}
    <section class="panel py-3 flex flex-wrap items-center justify-between gap-2">
      <p>
        <span class="text-[var(--text-muted)]">population:</span> <b>{popName}</b>
        <span class="text-[var(--text-muted)]">·</span> {pop.size} cards
        <span class="text-[var(--text-muted)]">·</span> μ = {fmt(pop.mu)}
        <span class="text-[var(--text-muted)]">·</span> σ = {fmt(pop.sigma)}
      </p>
      {#if at(5) || samples.length === 0}
        <button class="btn" onclick={() => (popEditing = true)}>[change population]</button>
      {/if}
    </section>
  {/if}

  <!-- ============ SAMPLING ============ -->
  <section class="panel grid gap-6 md:grid-cols-2">
    <!-- left: guide, controls, histograms, stats -->
    <div class="space-y-4 min-w-0">
      <h2 class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-color)] pb-2">// sampling</h2>

      {#if tutorial}
        <div class="guide" aria-live="polite">
          <p>{guide}</p>
          {#if progress >= 5}
            <p class="mt-2 text-xs text-[var(--text-muted)]">
              That's the whole tutorial. <button class="link underline" onclick={() => setTutorial(false)}>[turn off tutorial mode]</button> to see every control at once.
            </p>
          {/if}
        </div>
      {/if}

      {#if at(5)}
        <div class="flex flex-wrap items-center gap-2">
          <label for="sc-n" class="font-bold">sample size n =</label>
          <button class="btn" onclick={() => setN(n - 1)} disabled={n <= MIN_N} aria-label="Smaller sample size">−</button>
          <input id="sc-n" type="number" min={MIN_N} max={MAX_N} value={n}
            onchange={(e) => setN(Number(e.currentTarget.value), e.currentTarget)}
            class="w-14 text-center bg-transparent border-b border-[var(--line)] px-1 py-0.5 focus:outline-none focus:border-[var(--accent)]" />
          <button class="btn" onclick={() => setN(n + 1)} disabled={n >= MAX_N} aria-label="Larger sample size">+</button>
        </div>
      {:else}
        <p><span class="font-bold">sample size n = {n}</span> <span class="text-[var(--text-muted)]">cards per sample</span></p>
      {/if}

      <div class="space-y-2">
        <button class="btn draw-btn" onclick={() => draw(1)} disabled={pop.size === 0 || samples.length >= MAX_SAMPLES}>
          [draw a sample] <span class="font-normal text-xs">({n} {n === 1 ? 'card' : 'cards'})</span>
        </button>
        {#if at(3)}
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-xs text-[var(--text-muted)]">fast forward:</span>
            {#each [10, 100, 1000] as k}
              <button class="btn" onclick={() => draw(k)} disabled={pop.size === 0 || samples.length >= MAX_SAMPLES}>[+{k}]</button>
            {/each}
            <button class="link ml-auto" onclick={clearSamples} disabled={samples.length === 0}>[clear samples]</button>
          </div>
        {/if}
      </div>
      {#if notice}<p class="text-xs text-[var(--text-muted)]">{notice}</p>{/if}
      {#if samples.length >= MAX_SAMPLES}<p class="text-xs text-[var(--text-muted)]">{MAX_SAMPLES} samples is the limit. Clear to start over.</p>{/if}

      {#if !popEditing}
        {@render popHist(70)}
      {/if}

      <!-- sampling distribution -->
      <figure>
        <svg viewBox={`0 0 ${W} ${sampH}`} class="w-full h-auto" role="img"
          aria-label={`Histogram of ${samples.length} sample means`}>
          {#if samples.length}<text x={PAD_L - 6} y={PAD_T + 4} class="lbl" text-anchor="end">{Math.round(sampMax)}</text>{/if}
          {#each bins as count, i}
            {#if count > 0}
              {@const e = binEdges(i, n)}
              {@const dropped = drop && drop.bin === i ? 1 : 0}
              {@const x = xs(e.lo) + 0.5}
              {@const w = Math.max(1, xs(e.hi) - xs(e.lo) - 1)}
              {#if count - dropped > 0}
                <rect {x} y={sampY(count - dropped)} width={w} height={PAD_T + PLOT_H - sampY(count - dropped)}
                  class="bar" class:flag={binFlagged(i)} class:hover={hoverBin === i} class:sel={selectedBin === i}
                  role="presentation" onpointerenter={() => (hoverBin = i)} onpointerleave={() => (hoverBin = -1)}
                  onclick={() => (hoverBin = hoverBin === i ? -1 : i)} />
              {/if}
              {#if dropped && drop}
                {#key drop.id}
                  <g class="drop" style={`animation-delay:${Math.min(n, LONG_SAMPLE) * 70 + 200}ms`}>
                    <rect {x} y={sampY(count)} width={w} height={sampY(count - 1) - sampY(count)} class="bar new" class:sel={selectedBin === i}
                      role="presentation" onpointerenter={() => (hoverBin = i)} onpointerleave={() => (hoverBin = -1)} />
                    <text x={x + w / 2} y={sampY(count) - 4} class="lbl strong small" text-anchor="middle">x̄ = {fmt(drop.mean)}</text>
                  </g>
                {/key}
              {/if}
            {/if}
          {/each}
          {#if curvePath}<path d={curvePath} class="curve" />{/if}
          <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + PLOT_H} y2={PAD_T + PLOT_H} class="axis" />
          {#each VALUES as v}
            <text x={xs(v)} y={PAD_T + PLOT_H + 16} class="lbl" text-anchor="middle">{v}</text>
          {/each}
          {#if revealed && pop.size > 0}
            <line x1={xs(pop.mu)} x2={xs(pop.mu)} y1={PAD_T} y2={PAD_T + PLOT_H} class="mu-line" />
          {/if}
          {#if samples.length && at(4)}
            <line x1={xs(observed.mean)} x2={xs(observed.mean)} y1={PAD_T - 6} y2={PAD_T + PLOT_H} class="mean-line" />
            <text x={clampX(xs(observed.mean))} y="14" class="lbl strong" text-anchor="middle">average of x̄'s = {fmt(observed.mean)}</text>
          {:else if !samples.length}
            <text x={W / 2} y={PAD_T + PLOT_H / 2} class="lbl" text-anchor="middle">each sample's x̄ will land here</text>
          {/if}
          {#if zTicks.length}
            {@const zy = PAD_T + PLOT_H + 34}
            <text x={PAD_L - 6} y={zy + 4} class="lbl" text-anchor="end">z</text>
            <line x1={xs(zTicks[0].v)} x2={xs(zTicks[zTicks.length - 1].v)} y1={zy} y2={zy} class="axis" />
            {#each zTicks as t (t.k)}
              <line x1={xs(t.v)} x2={xs(t.v)} y1={zy - 4} y2={zy + 4} class="axis" />
              <text x={xs(t.v)} y={zy + 15} class="lbl" class:warn={Math.abs(t.k) >= UNUSUAL_Z} text-anchor="middle">{t.k > 0 ? '+' : t.k < 0 ? '−' : ''}{Math.abs(t.k)}</text>
            {/each}
          {/if}
        </svg>
        <figcaption class={`text-[0.7rem] text-center ${hoverBin >= 0 && bins[hoverBin] ? '' : 'text-[var(--text-muted)]'}`}>
          {#if hoverBin >= 0 && bins[hoverBin]}
            <b>This bar:</b> {bins[hoverBin]} {bins[hoverBin] === 1 ? 'sample' : 'samples'} with {binRange(hoverBin)} (outlined in the list)
          {:else}
            sampling distribution: the average x̄ of each sample (n = {n}) · bar height = number of samples
          {/if}
        </figcaption>
      </figure>

      {#if at(4)}
        <dl class="stats">
          <dt>samples drawn</dt><dd>{samples.length}</dd>
          <dt>average of your x̄'s</dt><dd>{samples.length ? fmt(observed.mean) : '—'}</dd>
          <dt>spread of your x̄'s <span class="text-[var(--text-muted)]">(SD)</span></dt><dd>{samples.length > 1 ? fmt(observed.sd) : '—'}</dd>
        </dl>

        <div class="well p-3 space-y-2">
          {#if !revealed}
            <p class="text-xs text-[var(--text-muted)]">Predict first: from μ, σ and n, where should the x̄'s center, and how spread out should they be?</p>
            <button class="btn" onclick={reveal} disabled={pop.size === 0}>[reveal theory]</button>
          {:else}
            <p>center: μ = <b>{fmt(pop.mu)}</b></p>
            <p>spread: σ/√n = {fmt(pop.sigma)}/√{n} = <b>{fmt(se)}</b> <span class="text-xs text-[var(--text-muted)]">(the standard error)</span></p>
            <p class="text-xs text-[var(--text-muted)]">The curve on the histogram is the normal model N({fmt(pop.mu)}, {fmt(se)}).</p>
            <button class="btn" onclick={() => (revealed = false)}>[hide]</button>
          {/if}
        </div>
      {/if}

      {#if at(5)}
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" bind:checked={showZ} class="accent-[var(--accent)]" />
          show z-scores <span class="text-xs text-[var(--text-muted)]">z = (x̄ − μ) / (σ/√n)</span>
        </label>
        {#if showZ}
          {#if !zOk}
            <p class="text-xs text-[var(--text-muted)]">{pop.size === 0 ? 'No population yet.' : 'σ = 0 (every card has the same value), so there are no z-scores.'}</p>
          {:else if samples.length}
            <p class="text-xs">
              <span class="text-[var(--warn)] font-bold">|z| &gt; {UNUSUAL_Z}:</span>
              {flagged} of {samples.length} samples ({pct(flagged, samples.length)}). A normal model predicts about 5%.
            </p>
          {/if}
        {/if}

        <!-- saved sampling distributions: set aside automatically when the population or n changes -->
        <div class="space-y-2">
          <div class="flex justify-between items-baseline gap-2 border-b border-[var(--border-color)] pb-1">
            <h3 class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">// saved distributions</h3>
            <button class="btn" onclick={() => (comparing = !comparing)} disabled={rows.length < 2} aria-pressed={comparing}>
              [{comparing ? 'hide compare' : 'compare'}]
            </button>
          </div>
          {#if saved.length === 0}
            <p class="text-xs text-[var(--text-muted)]">Change n or the population and the current distribution is saved here, so you can compare them.</p>
          {:else}
            <div class="overflow-x-auto">
              <table class="dist-table">
                <thead>
                  <tr><th>population</th><th>n</th><th>samples</th><th>average of x̄</th><th>SD of x̄</th><th>σ/√n</th><th></th></tr>
                </thead>
                <tbody>
                  {#each rows as r (r.key)}
                    <tr class:current={!r.entry}>
                      <td>{r.entry ? '' : '▸ '}{r.label}</td>
                      <td>{r.n}</td>
                      <td>{r.count}</td>
                      <td>{fmt(r.mean)}</td>
                      <td>{r.count > 1 ? fmt(r.sd) : '—'}</td>
                      <td title={r.revealed ? '' : 'Hidden until you reveal theory for this distribution'}>{r.revealed ? fmt(standardError(r.sigma, r.n)) : '?'}</td>
                      <td class="whitespace-nowrap">
                        {#if r.entry}
                          {@const e = r.entry}
                          <button class="link" onclick={() => openSaved(e)} aria-label={`Open ${e.label}, n = ${e.n}`}>[open]</button>
                          <button class="link" onclick={() => deleteSaved(e)} aria-label={`Delete ${e.label}, n = ${e.n}`}>[×]</button>
                        {:else}
                          <span class="text-[var(--text-muted)]">current</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
          {#if comparing && rows.length >= 2}
            <div class="space-y-1">
              <p class="text-[0.7rem] text-[var(--text-muted)]">Same x̄ axis for each, so you can compare the spreads. Each histogram is scaled to its own tallest bar.</p>
              {#each rows as r (r.key)}
                {@render mini(r)}
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- right: the samples -->
    <div class="space-y-2 min-w-0">
      <h2 class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-color)] pb-2">
        // samples {#if samples.length > LIST_LIMIT}<span class="normal-case font-normal">(newest {LIST_LIMIT} of {samples.length})</span>{/if}
      </h2>
      {#if samples.length === 0}
        <p class="text-xs text-[var(--text-muted)]">No samples yet. Each sample draws n cards with replacement: a card goes back in the deck before the next draw.</p>
      {:else}
        <p class="text-[0.7rem] text-[var(--text-muted)]">Tap a sample to see its average{at(5) && zOk ? ' and z-score' : ''} worked out.</p>
        <ol class="samples space-y-1.5">
          {#each shown as s (s.id)}
            {@const z = zScore(s.mean, pop.mu, pop.sigma, n)}
            {@const odd = showZ && at(5) && isUnusual(z)}
            {@const long = s.cards.length > LONG_SAMPLE}
            {@const open = expanded.has(s.id)}
            {@const isSel = s.id === selectedId}
            <li class="sample" class:odd class:selected={isSel}
              class:inbin={hoverBin >= 0 && binOfSum(s.sum, n) === hoverBin}
              role="button" tabindex="0" aria-expanded={isSel}
              aria-label={`Sample ${s.id}: average ${fmt(s.mean)}`}
              onclick={() => select(s.id)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(s.id); } }}>
              <span class="text-[0.7rem] text-[var(--text-muted)] w-10 shrink-0">#{s.id}</span>
              <span class="flex flex-wrap gap-0.5 flex-1 min-w-0">
                {#each long && !open ? s.cards.slice(0, SHORT_SHOW) : s.cards as c, j}
                  <span class="card mini" class:red={isRed(c)} class:deal={s.id === dealId}
                    style={s.id === dealId ? `animation-delay:${Math.min(j, 20) * 70}ms` : ''}
                    title={`${cardName(c)}: value ${cardValue(c)}`}>
                    <span>{RANKS[rankOf(c)]}</span><span class="suit">{SUITS[suitOf(c)]}</span>
                  </span>
                {/each}
                {#if long}
                  <button class="link self-center ml-1" onclick={(e) => { e.stopPropagation(); toggleExpanded(s.id); }} aria-expanded={open}>
                    {open ? '[show less]' : `[+${s.cards.length - SHORT_SHOW} more]`}
                  </button>
                {/if}
              </span>
              <span class="text-right shrink-0 leading-tight">
                <span class="block">x̄ = <b>{fmt(s.mean)}</b></span>
                {#if showZ && at(5)}
                  <span class="block text-xs" class:warn={odd}>z = {fmtZ(z)}{#if odd} !<span class="sr-only"> unusual</span>{/if}</span>
                {/if}
              </span>
              {#if isSel}
                {@const wz = at(5) ? workedZ(s) : null}
                <div class="worked">
                  <p>{workedMean(s)}</p>
                  {#if wz}
                    <p class="mt-1">{wz.line1}</p>
                    <p class="whitespace-pre">{wz.line2}</p>
                    <p class="mt-1">{wz.words}{#if wz.unusual} <span class="warn">That's more than {UNUSUAL_Z} standard errors away: unusual.</span>{/if}</p>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  </section>
</div>

<style>
  .panel {
    padding: 1.25rem;
    border: 1px solid var(--border-color);
    background: var(--bg-surface);
    border-radius: 0.375rem;
  }
  .well {
    background: var(--well);
    border: 1px solid var(--border-color);
    border-radius: 0.25rem;
  }
  .btn {
    border: 1px solid var(--line);
    background: var(--bg-surface);
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: bold;
    transition: border-color 0.15s, color 0.15s;
  }
  .btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .btn.primary {
    border-color: var(--accent);
    color: var(--accent);
  }
  .red-text {
    color: var(--bad);
  }

  /* cards */
  .card {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1em;
    width: 2.1rem;
    height: 2.9rem;
    border: 1px solid var(--line);
    border-radius: 0.25rem;
    background: var(--tile);
    color: var(--text-primary);
    line-height: 1;
    font-weight: bold;
    font-size: 0.8rem;
    user-select: none;
  }
  button.card {
    cursor: pointer;
    transition: transform 0.1s, border-color 0.1s;
  }
  button.card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
  }
  .card.red {
    color: var(--bad);
  }
  .card .suit {
    font-size: 1.1em;
  }
  .card.mini {
    width: 1.55rem;
    height: 2.1rem;
    font-size: 0.65rem;
  }
  .card.big {
    width: 2.8rem;
    height: 3.9rem;
    font-size: 1.05rem;
    border-radius: 0.35rem;
  }
  /* rest-of-deck picker: small landscape tiles so 13 rows sit beside the population */
  .card.pick,
  .slot {
    width: 2.1rem;
    height: 1.35rem;
    flex-direction: row;
    gap: 0.1em;
    font-size: 0.65rem;
    border-radius: 0.15rem;
  }
  .slot {
    display: block;
    border: 1px dashed var(--border-color);
  }
  .btn.suit-btn {
    width: 2.1rem;
    padding: 0.1rem 0;
    font-size: 0.7rem;
    text-align: center;
  }
  .deck-label {
    writing-mode: vertical-rl;
    font-size: 0.7rem;
    color: var(--text-muted);
    padding: 0.25rem 0;
    white-space: nowrap;
  }
  .deck-label:hover {
    color: var(--text-primary);
  }

  /* dealing animation on single draws */
  .deal {
    animation: deal 0.35s ease-out both;
  }
  @keyframes deal {
    from {
      opacity: 0;
      transform: translateY(-8px) rotateY(90deg);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .deal {
      animation: none;
    }
  }

  /* stats */
  .stats {
    display: grid;
    grid-template-columns: auto auto;
    justify-content: start;
    column-gap: 1rem;
    row-gap: 0.15rem;
  }
  .stats dd {
    font-weight: bold;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* samples list */
  .samples {
    max-height: 34rem;
    overflow-y: auto;
    padding-right: 0.25rem;
  }
  .sample {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    background: var(--well);
    border: 1px solid var(--border-color);
    border-left-width: 3px;
    border-radius: 0.25rem;
    font-variant-numeric: tabular-nums;
  }
  .sample.odd {
    border-left-color: var(--warn);
  }
  .warn {
    color: var(--warn);
    font-weight: bold;
  }

  /* tutorial guide and the main action */
  .guide {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--accent);
    border-left-width: 3px;
    border-radius: 0.25rem;
    background: color-mix(in srgb, var(--accent) 6%, var(--bg-surface));
    line-height: 1.5;
  }
  .btn.draw-btn {
    width: 100%;
    padding: 0.6rem 1rem;
    font-size: 0.95rem;
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--bg-surface));
  }
  .link:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* tapping a sample: its worked x̄ and z */
  .sample {
    flex-wrap: wrap;
    cursor: pointer;
  }
  .sample:hover,
  .sample:focus-visible {
    border-color: var(--line);
    outline: none;
  }
  .sample.selected {
    border-color: var(--accent);
  }
  .sample.inbin {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--bg-surface));
  }
  .worked {
    flex-basis: 100%;
    margin-top: 0.35rem;
    padding: 0.4rem 0.5rem;
    border-top: 1px dashed var(--border-color);
    font-size: 0.75rem;
    overflow-x: auto;
  }

  /* saved distributions */
  .dist-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }
  .dist-table th {
    text-align: left;
    font-weight: normal;
    color: var(--text-muted);
    padding: 0.2rem 0.4rem;
    border-bottom: 1px solid var(--border-color);
    white-space: nowrap;
  }
  .dist-table td {
    padding: 0.25rem 0.4rem;
    border-bottom: 1px solid var(--border-color);
  }
  .dist-table tr.current td {
    font-weight: bold;
  }
  .link {
    font-size: 0.7rem;
    font-weight: bold;
    color: var(--text-muted);
  }
  .link:hover {
    color: var(--accent);
  }

  /* charts */
  svg .lbl {
    fill: var(--text-muted);
    font-size: 12px;
    font-family: 'Courier New', Courier, monospace;
  }
  svg .lbl.strong {
    fill: var(--text-primary);
    font-weight: bold;
  }
  svg .lbl.small {
    font-size: 10px;
  }
  svg .lbl.warn {
    fill: var(--warn);
  }
  svg .axis {
    stroke: var(--line);
    stroke-width: 1;
  }
  svg .bar {
    fill: color-mix(in srgb, var(--accent) 35%, transparent);
    stroke: var(--accent);
    stroke-width: 1;
  }
  svg .bar.hover {
    fill: color-mix(in srgb, var(--accent) 60%, transparent);
  }
  svg .bar.new {
    fill: var(--accent);
  }
  svg .bar.sel {
    stroke: var(--text-primary);
    stroke-width: 2.5;
  }
  svg .drop {
    animation: drop 0.45s cubic-bezier(0.3, 0.6, 0.5, 1) both;
  }
  @keyframes drop {
    from {
      transform: translateY(-70px);
      opacity: 0;
    }
    to {
      transform: none;
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    svg .drop {
      animation: none;
    }
  }
  svg .bar.flag {
    fill: color-mix(in srgb, var(--warn) 35%, transparent);
    stroke: var(--warn);
  }
  svg .mean-line {
    stroke: var(--text-primary);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }
  svg .mu-line {
    stroke: var(--text-muted);
    stroke-width: 1;
  }
  svg .curve {
    fill: none;
    stroke: var(--text-muted);
    stroke-width: 2;
  }
</style>
