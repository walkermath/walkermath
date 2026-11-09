<!-- src/components/apps/SamplingCards.svelte -->
<!-- Sampling distributions from a deck of cards. Students choose which cards make up the population -->
<!-- (ace 1, number cards their number, J/Q/K 10), see its histogram with μ and σ, then draw samples of -->
<!-- size n with replacement and watch the sampling distribution of x̄ build up. Observed mean and SD of -->
<!-- the sample means sit next to a [reveal σ/√n] button so students predict before they check. -->
<!-- [show z-scores] gives each sample z = (x̄ − μ)/(σ/√n) and flags |z| > 2. -->
<!-- Changing the population or n saves the current distribution to a table (up to 6) so students can -->
<!-- compare n's and populations side by side, [open] one to keep drawing, or [compare] their histograms. -->
<!-- Cards are drawn with CSS and Unicode suits: no images, nothing to load from another host. -->
<!-- Math: src/lib/stats/cardDeck.ts (npm run test:cards). -->
<script lang="ts">
  import {
    ALL_CARDS, PRESETS, SUITS, SUIT_NAMES, MAX_N, MIN_N, UNUSUAL_Z, cardName, cardValue,
    isRed, rankOf, suitOf, RANKS, clampN, meanSd, populationStats, drawSample, standardError, zScore,
    isUnusual, binSampleMeans, binEdges, sumsPerBin, normalPdf, populationLabel, type CardId, type Sample,
  } from '../../lib/stats/cardDeck';

  let {
    initialCards = ALL_CARDS,
    initialN = 3,
  }: { initialCards?: CardId[]; initialN?: number } = $props();

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
    samples = [];
    nextId = 1;
    dealId = -1;
    revealed = false;
    expanded = new Set();
  }

  function openSaved(entry: Saved) {
    saved = saved.filter((d) => d.key !== entry.key);
    stash();
    inPop = new Set(entry.cards);
    n = entry.n;
    samples = entry.samples;
    nextId = entry.nextId;
    revealed = entry.revealed;
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
    notice = '';
  }

  /** Throw away the current distribution (saved ones stay). */
  function clearSamples() {
    samples = [];
    nextId = 1;
    dealId = -1;
    revealed = false;
    expanded = new Set();
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
  const popY = (count: number) => PAD_T + PLOT_H - (count / popMax) * PLOT_H;

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

<div class="max-w-4xl mx-auto space-y-6 font-mono text-sm">
  <!-- ============ POPULATION ============ -->
  <section class="panel space-y-4">
    <div class="flex flex-wrap justify-between items-baseline gap-2 border-b border-[var(--border-color)] pb-2">
      <h2 class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">// population ({pop.size} cards)</h2>
      <div class="flex flex-wrap gap-1.5">
        {#each PRESETS as p (p.id)}
          <button class="btn" onclick={() => applyPreset(p.cards)}>[{p.label}]</button>
        {/each}
      </div>
    </div>

    <div class="flex flex-col sm:flex-row gap-3 items-start">
      <!-- the population: the big cards -->
      <div class="flex-1 min-w-0 w-full">
        <p class="text-xs text-[var(--text-muted)] mb-2">In the population (tap a card to remove it):</p>
        {#if popCards.length === 0}
          <p class="text-xs text-[var(--warn)]">[!] Empty. Add cards from the rest of the deck.</p>
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

    <!-- population histogram -->
    <figure>
      <svg viewBox={`0 0 ${W} ${PAD_T + PLOT_H + 24}`} class="w-full h-auto" role="img"
        aria-label={pop.size ? `Population histogram of card values. Mean ${fmt(pop.mu)}, standard deviation ${fmt(pop.sigma)}.` : 'Population histogram: empty'}>
        <text x={PAD_L - 6} y={PAD_T + 4} class="lbl" text-anchor="end">{popMax}</text>
        {#each VALUES as v}
          {#if pop.counts[v - 1] > 0}
            <rect x={xs(v - 0.42)} y={popY(pop.counts[v - 1])} width={xs(v + 0.42) - xs(v - 0.42)}
              height={PAD_T + PLOT_H - popY(pop.counts[v - 1])} class="bar" />
          {/if}
          <text x={xs(v)} y={PAD_T + PLOT_H + 16} class="lbl" text-anchor="middle">{v}</text>
        {/each}
        <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + PLOT_H} y2={PAD_T + PLOT_H} class="axis" />
        {#if pop.size > 0}
          <line x1={xs(pop.mu)} x2={xs(pop.mu)} y1={PAD_T - 6} y2={PAD_T + PLOT_H} class="mean-line" />
          <text x={clampX(xs(pop.mu))} y="14" class="lbl strong" text-anchor="middle">μ = {fmt(pop.mu)}, σ = {fmt(pop.sigma)}</text>
        {:else}
          <text x={W / 2} y={PAD_T + PLOT_H / 2} class="lbl" text-anchor="middle">add cards to see the population</text>
        {/if}
      </svg>
      <figcaption class="text-[0.7rem] text-[var(--text-muted)] text-center">card value (A = 1, J/Q/K = 10) · bar height = number of cards</figcaption>
    </figure>
  </section>

  <!-- ============ SAMPLING ============ -->
  <section class="panel grid gap-6 md:grid-cols-2">
    <!-- left: controls, stats, sampling distribution -->
    <div class="space-y-4 min-w-0">
      <h2 class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-color)] pb-2">// sampling distribution of x̄</h2>

      <div class="flex flex-wrap items-center gap-2">
        <label for="sc-n" class="font-bold">sample size n =</label>
        <button class="btn" onclick={() => setN(n - 1)} disabled={n <= MIN_N} aria-label="Smaller sample size">−</button>
        <input id="sc-n" type="number" min={MIN_N} max={MAX_N} value={n}
          onchange={(e) => setN(Number(e.currentTarget.value), e.currentTarget)}
          class="w-14 text-center bg-transparent border-b border-[var(--line)] px-1 py-0.5 focus:outline-none focus:border-[var(--accent)]" />
        <button class="btn" onclick={() => setN(n + 1)} disabled={n >= MAX_N} aria-label="Larger sample size">+</button>
      </div>

      <div class="flex flex-wrap gap-1.5">
        <button class="btn primary" onclick={() => draw(1)} disabled={pop.size === 0 || samples.length >= MAX_SAMPLES}>[draw {n} {n === 1 ? 'card' : 'cards'}]</button>
        {#each [10, 100, 1000] as k}
          <button class="btn" onclick={() => draw(k)} disabled={pop.size === 0 || samples.length >= MAX_SAMPLES}>[×{k}]</button>
        {/each}
        <button class="btn" onclick={clearSamples} disabled={samples.length === 0}>[clear]</button>
      </div>
      {#if notice}<p class="text-xs text-[var(--warn)]">[!] {notice}</p>{/if}
      {#if samples.length >= MAX_SAMPLES}<p class="text-xs text-[var(--warn)]">[!] {MAX_SAMPLES} samples is the limit. Clear to start over.</p>{/if}

      <dl class="stats">
        <dt>samples drawn</dt><dd>{samples.length}</dd>
        <dt>mean of the x̄'s</dt><dd>{samples.length ? fmt(observed.mean) : '—'}</dd>
        <dt>SD of the x̄'s <span class="text-[var(--text-muted)]">(observed SE)</span></dt><dd>{samples.length > 1 ? fmt(observed.sd) : '—'}</dd>
      </dl>

      <div class="well p-3 space-y-2">
        {#if !revealed}
          <p class="text-xs text-[var(--text-muted)]">Predict first: what should the mean and SD of the x̄'s be, using μ, σ and n?</p>
          <button class="btn" onclick={() => (revealed = true)} disabled={pop.size === 0}>[reveal theory]</button>
        {:else}
          <p>theory: mean = μ = <b>{fmt(pop.mu)}</b></p>
          <p>SE = σ/√n = {fmt(pop.sigma)}/√{n} = <b>{fmt(se)}</b></p>
          <p class="text-xs text-[var(--text-muted)]">The curve on the histogram is the normal model N({fmt(pop.mu)}, {fmt(se)}).</p>
          <button class="btn" onclick={() => (revealed = false)}>[hide]</button>
        {/if}
      </div>

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

      <figure>
        <svg viewBox={`0 0 ${W} ${sampH}`} class="w-full h-auto" role="img"
          aria-label={`Histogram of ${samples.length} sample means`}>
          {#if samples.length}<text x={PAD_L - 6} y={PAD_T + 4} class="lbl" text-anchor="end">{Math.round(sampMax)}</text>{/if}
          {#each bins as count, i}
            {#if count > 0}
              {@const e = binEdges(i, n)}
              <rect x={xs(e.lo) + 0.5} y={sampY(count)} width={Math.max(1, xs(e.hi) - xs(e.lo) - 1)}
                height={PAD_T + PLOT_H - sampY(count)} class="bar" class:flag={binFlagged(i)} />
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
          {#if samples.length}
            <line x1={xs(observed.mean)} x2={xs(observed.mean)} y1={PAD_T - 6} y2={PAD_T + PLOT_H} class="mean-line" />
            <text x={clampX(xs(observed.mean))} y="14" class="lbl strong" text-anchor="middle">mean of x̄ = {fmt(observed.mean)}</text>
          {:else}
            <text x={W / 2} y={PAD_T + PLOT_H / 2} class="lbl" text-anchor="middle">draw samples to build the distribution</text>
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
        <figcaption class="text-[0.7rem] text-[var(--text-muted)] text-center">sample mean x̄ (n = {n}) · bar height = number of samples</figcaption>
      </figure>

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
                <tr><th>population</th><th>n</th><th>samples</th><th>mean of x̄</th><th>SD of x̄</th><th>σ/√n</th><th></th></tr>
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
    </div>

    <!-- right: the samples -->
    <div class="space-y-2 min-w-0">
      <h2 class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-color)] pb-2">
        // samples {#if samples.length > LIST_LIMIT}<span class="normal-case font-normal">(newest {LIST_LIMIT} of {samples.length})</span>{/if}
      </h2>
      {#if samples.length === 0}
        <p class="text-xs text-[var(--text-muted)]">No samples yet. Each sample draws n cards with replacement: a card goes back in the deck before the next draw.</p>
      {:else}
        <ol class="samples space-y-1.5">
          {#each shown as s (s.id)}
            {@const z = zScore(s.mean, pop.mu, pop.sigma, n)}
            {@const odd = showZ && isUnusual(z)}
            {@const long = s.cards.length > LONG_SAMPLE}
            {@const open = expanded.has(s.id)}
            <li class="sample" class:odd>
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
                  <button class="link self-center ml-1" onclick={() => toggleExpanded(s.id)} aria-expanded={open}>
                    {open ? '[show less]' : `[+${s.cards.length - SHORT_SHOW} more]`}
                  </button>
                {/if}
              </span>
              <span class="text-right shrink-0 leading-tight">
                <span class="block">x̄ = <b>{fmt(s.mean)}</b></span>
                {#if showZ}
                  <span class="block text-xs" class:warn={odd}>z = {fmtZ(z)}{#if odd} !<span class="sr-only"> unusual</span>{/if}</span>
                {/if}
              </span>
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
