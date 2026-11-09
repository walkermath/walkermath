<!-- src/components/apps/NormalAreas.svelte -->
<!-- Normal-model areas: shade the area less than, greater than, between or outside cutoffs on the -->
<!-- standard normal curve, or on X ~ N(μ, σ), or on x̄ ~ N(μ, σ/√n) (the CLT, from the sampling app). -->
<!-- Two directions: [find the area] (drag or type the cutoffs) and [find the cutoff] (type an area or -->
<!-- percentile). Every answer shows its steps: standardizing, the left-area (z-table) form with any -->
<!-- "1 −", and a plain-English sentence. Cutoffs are kept in z units so the picture stays put when the -->
<!-- scale changes. Math: src/lib/stats/normal.ts (npm run test:normal). -->
<script lang="ts">
  import {
    normalCdf, normalPdf, invNorm, regionArea, cutoffsForArea, ordinal, TWO_CUTOFFS, type Region,
  } from '../../lib/stats/normal';

  type Scale = 'z' | 'x' | 'xbar';
  type Goal = 'area' | 'cutoff';

  const REGIONS: { id: Region; label: string }[] = [
    { id: 'left', label: 'less than' },
    { id: 'right', label: 'greater than' },
    { id: 'between', label: 'between' },
    { id: 'outside', label: 'outside' },
  ];
  const SCALES: { id: Scale; label: string }[] = [
    { id: 'z', label: 'Z ~ N(0, 1)' },
    { id: 'x', label: 'X ~ N(μ, σ)' },
    { id: 'xbar', label: 'x̄ ~ N(μ, σ/√n)' },
  ];
  const Z_LIM = 4; // the curve is drawn from −4 to 4

  // ---- state (cutoffs in z units) ----
  let region: Region = $state('left');
  let goal: Goal = $state('area');
  let scale: Scale = $state('z');
  let za = $state(1);
  let zb = $state(2);
  /** the area typed in [find the cutoff] */
  let targetArea = $state(0.9);
  let mu = $state(70);
  let sigma = $state(10);
  let nSize = $state(25);
  /** which cutoff is being dragged (−1: none) */
  let dragging = $state(-1);
  let svgEl: SVGSVGElement | null = $state(null);

  // ---- derived ----
  const two = $derived(TWO_CUTOFFS[region]);
  /** the SD of the scale: 1, σ, or σ/√n */
  const spread = $derived(scale === 'z' ? 1 : scale === 'x' ? sigma : sigma / Math.sqrt(nSize));
  const center = $derived(scale === 'z' ? 0 : mu);
  const letter = $derived(scale === 'z' ? 'Z' : scale === 'x' ? 'X' : 'x̄');
  const things = $derived(scale === 'xbar' ? 'sample means' : 'values');
  const area = $derived(regionArea(region, za, two ? zb : za));

  const toX = (z: number) => center + z * spread;
  const fromX = (x: number) => (x - center) / spread;

  // ---- formatting ----
  const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : x > 0 ? '∞' : '−∞');
  const f4 = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : '—');
  /** a value on the current scale: z always to 2 places, x and x̄ to at most 2 */
  const fv = (v: number) => {
    if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
    if (scale === 'z') return v.toFixed(2);
    return String(Math.round(v * 100) / 100);
  };
  const fz = (z: number) => (Math.abs(z) < 0.005 ? '0.00' : f2(z).replace('-', '−'));
  const fx = (v: number) => fv(v).replace('-', '−');
  const pctText = (p: number) => `${(100 * p).toFixed(2)}%`;
  /** round a typed number for display in formulas (μ, σ) */
  const num = (v: number) => String(Math.round(v * 1000) / 1000).replace('-', '−');

  // ---- dragging: snap to 0.01 in z, or to a tidy step on the x scales ----
  const xStep = $derived(10 ** (Math.round(Math.log10(spread)) - 2));
  function snap(z: number): number {
    if (scale === 'z') return Math.round(z * 100) / 100;
    return fromX(Math.round(toX(z) / xStep) * xStep);
  }
  const clampZ = (z: number) => Math.max(-Z_LIM, Math.min(Z_LIM, z));

  function setCutoff(i: number, z: number) {
    if (!Number.isFinite(z)) return;
    if (goal === 'cutoff' && two) {
      // finding cutoffs from a middle or tail area: they stay symmetric about the center
      const k = Math.max(0.01, Math.abs(z));
      za = -k;
      zb = k;
      targetArea = regionArea(region, za, zb);
      return;
    }
    if (!two || i === 0) za = two ? Math.min(z, zb) : z;
    else zb = Math.max(z, za);
    if (goal === 'cutoff') targetArea = regionArea(region, za, two ? zb : za);
  }

  // ---- graph geometry ----
  const W = 560;
  const PAD_L = 20;
  const PAD_R = 20;
  const PAD_T = 34;
  const PLOT_H = 150;
  const BASE = PAD_T + PLOT_H;
  const gx = (z: number) => PAD_L + ((clampZ(z) + Z_LIM) / (2 * Z_LIM)) * (W - PAD_L - PAD_R);
  const gy = (z: number) => BASE - (normalPdf(clampZ(z)) / normalPdf(0)) * PLOT_H;
  const H = $derived(BASE + (scale === 'z' ? 24 : 42));
  const curvePath = (() => {
    const pts: string[] = [];
    for (let z = -Z_LIM; z <= Z_LIM + 1e-9; z += 0.05) pts.push(`${pts.length ? 'L' : 'M'}${gx(z).toFixed(1)},${gy(z).toFixed(1)}`);
    return pts.join(' ');
  })();
  function shade(lo: number, hi: number): string {
    const a = clampZ(lo);
    const b = clampZ(hi);
    if (!(b > a)) return '';
    const pts = [`M${gx(a).toFixed(1)},${BASE}`];
    for (let z = a; z < b; z += 0.04) pts.push(`L${gx(z).toFixed(1)},${gy(z).toFixed(1)}`);
    pts.push(`L${gx(b).toFixed(1)},${gy(b).toFixed(1)}`, `L${gx(b).toFixed(1)},${BASE}`, 'Z');
    return pts.join(' ');
  }
  const shaded = $derived.by(() => {
    switch (region) {
      case 'left':
        return [shade(-Z_LIM, za)];
      case 'right':
        return [shade(za, Z_LIM)];
      case 'between':
        return [shade(za, zb)];
      case 'outside':
        return [shade(-Z_LIM, za), shade(zb, Z_LIM)];
    }
  });
  const cuts = $derived(two ? [za, zb] : [za]);
  /** two cutoff labels too close to sit side by side: the upper one drops a line */
  const labelsClose = $derived(two && gx(zb) - gx(za) < (scale === 'z' ? 80 : 150));
  const TICKS = [-3, -2, -1, 0, 1, 2, 3];

  function zFromPointer(e: PointerEvent): number {
    if (!svgEl) return 0;
    const r = svgEl.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    return clampZ(((vx - PAD_L) / (W - PAD_L - PAD_R)) * 2 * Z_LIM - Z_LIM);
  }
  function onPointerDown(e: PointerEvent) {
    const z = zFromPointer(e);
    // grab the nearest cutoff and bring it to the pointer
    let i = 0;
    if (two && Math.abs(z - zb) < Math.abs(z - za)) i = 1;
    dragging = i;
    svgEl?.setPointerCapture(e.pointerId);
    setCutoff(i, snap(z));
  }
  function onPointerMove(e: PointerEvent) {
    if (dragging < 0) return;
    setCutoff(dragging, snap(zFromPointer(e)));
  }
  function endDrag() {
    dragging = -1;
  }
  function onHandleKey(e: KeyboardEvent, i: number) {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const stepZ = scale === 'z' ? 0.01 : xStep / spread;
    const cur = i === 0 ? za : zb;
    setCutoff(i, snap(clampZ(cur + dir * stepZ * (e.shiftKey ? 10 : 1))));
  }

  // ---- controls ----
  function setRegion(next: Region) {
    if (next === region) return;
    const wasTwo = two;
    region = next;
    if (goal === 'cutoff') {
      applyArea(targetArea);
      return;
    }
    if (!wasTwo && TWO_CUTOFFS[next]) {
      const k = Math.abs(za) > 0.05 ? Math.abs(za) : 1;
      za = -k;
      zb = k;
    }
  }

  function setGoal(next: Goal) {
    goal = next;
    if (next === 'cutoff') applyArea(area > 0 && area < 1 ? area : 0.9);
  }

  function applyArea(a: number) {
    const c = cutoffsForArea(region, a);
    if (!c) return;
    targetArea = a;
    za = c.za;
    zb = c.zb;
  }

  /** "0.9", ".9", "90%" or "90" (read as a percent) → 0.9 */
  function parseArea(text: string): number {
    const t = text.trim().replace('%', '');
    const v = Number(t);
    if (!Number.isFinite(v)) return NaN;
    return text.includes('%') || v > 1 ? v / 100 : v;
  }

  function onAreaInput(e: Event & { currentTarget: HTMLInputElement }) {
    const a = parseArea(e.currentTarget.value);
    if (a > 0 && a < 1) applyArea(a);
    e.currentTarget.value = f4(targetArea);
  }

  function onCutoffInput(i: number, e: Event & { currentTarget: HTMLInputElement }) {
    const v = Number(e.currentTarget.value.replace('−', '-'));
    if (Number.isFinite(v)) setCutoff(i, fromX(v));
    e.currentTarget.value = fv(toX(i === 0 ? za : zb));
  }

  /** change μ, σ or n: in [find the area] keep the typed cutoffs (x values); in [find the cutoff] keep the area */
  function setParam(which: 'mu' | 'sigma' | 'n', e: Event & { currentTarget: HTMLInputElement }) {
    let v = Number(e.currentTarget.value.replace('−', '-'));
    const ok = Number.isFinite(v) && (which === 'mu' || v > 0);
    if (ok) {
      if (which === 'n') v = Math.max(1, Math.round(v));
      const xa = toX(za);
      const xb = toX(zb);
      if (which === 'mu') mu = v;
      else if (which === 'sigma') sigma = v;
      else nSize = v;
      if (goal === 'area') {
        za = fromX(xa);
        zb = fromX(xb);
      }
    }
    e.currentTarget.value = String(which === 'mu' ? mu : which === 'sigma' ? sigma : nSize);
  }

  function empirical(k: number) {
    goal = 'area';
    region = 'between';
    za = -k;
    zb = k;
  }

  // ---- worked steps ----
  // Worked steps are lists of parts: the first on its own line, then "= part" on a new line each,
  // so a long chain reads down the box instead of scrolling across it.

  /** standardizing one cutoff: z = (x − μ) / σ, = (76 − 70) / 10, = 0.60 */
  function standardize(z: number): string[] {
    const x = fx(toX(z));
    if (scale === 'x') return ['z = (x − μ) / σ', `(${x} − ${num(mu)}) / ${num(sigma)}`, fz(z)];
    return ['z = (x̄ − μ) / (σ/√n)', `(${x} − ${num(mu)}) / (${num(sigma)}/√${nSize})`, `(${x} − ${num(mu)}) / ${num(spread)}`, fz(z)];
  }
  /** un-standardizing one cutoff: x = μ + z·σ, = 70 + 1.28 × 10, = 82.82 */
  function unstandardize(z: number): string[] {
    if (scale === 'x') return ['x = μ + z·σ', `${num(mu)} + (${fz(z)}) × ${num(sigma)}`, fx(toX(z))];
    return ['x̄ = μ + z·(σ/√n)', `${num(mu)} + (${fz(z)}) × ${num(spread)}`, fx(toX(z))];
  }

  const L = $derived(letter);
  /** the probability statement in the scale's own letter, e.g. P(X < 76) */
  const statement = $derived.by(() => {
    const a = fx(toX(za));
    const b = fx(toX(zb));
    switch (region) {
      case 'left':
        return `P(${L} < ${a})`;
      case 'right':
        return `P(${L} > ${a})`;
      case 'between':
        return `P(${a} < ${L} < ${b})`;
      case 'outside':
        return `P(${L} < ${a} or ${L} > ${b})`;
    }
  });
  /** the same statement for Z, then in left areas (z-table / normalcdf form), then the answer */
  const chain = $derived.by(() => {
    const A = normalCdf(za);
    const B = normalCdf(zb);
    const a = fz(za);
    const b = fz(zb);
    switch (region) {
      case 'left':
        return [`P(Z < ${a})`, f4(A)];
      case 'right':
        return [`P(Z > ${a})`, `1 − P(Z < ${a})`, `1 − ${f4(A)}`, f4(1 - A)];
      case 'between':
        return [`P(${a} < Z < ${b})`, `P(Z < ${b}) − P(Z < ${a})`, `${f4(B)} − ${f4(A)}`, f4(B - A)];
      case 'outside':
        return [`P(Z < ${a}) + P(Z > ${b})`, `P(Z < ${a}) + (1 − P(Z < ${b}))`, `${f4(A)} + (1 − ${f4(B)})`, f4(A + 1 - B)];
    }
  });
  /** drop the Z step when it just repeats the statement (on the Z scale) */
  const chainShown = $derived(chain[0] === statement ? chain.slice(1) : chain);
  const sentence = $derived.by(() => {
    const a = fx(toX(za));
    const b = fx(toX(zb));
    const p = pctText(area);
    switch (region) {
      case 'left': {
        const pct = Math.floor(100 * area);
        const pctl = pct >= 1 && pct <= 99 ? ` So ${a} is about the ${ordinal(pct)} percentile.` : '';
        return `About ${p} of ${things} are below ${a}.${pctl}`;
      }
      case 'right':
        return `About ${p} of ${things} are above ${a}.`;
      case 'between':
        return `About ${p} of ${things} are between ${a} and ${b}.`;
      case 'outside':
        return `About ${p} of ${things} are below ${a} or above ${b}.`;
    }
  });
  /** [find the cutoff]: turning the area into left areas, then z */
  const inverseSteps: string[][] = $derived.by(() => {
    const t = f4(targetArea);
    switch (region) {
      case 'left':
        return [['area to the left', t], ['z', `invNorm(${t})`, fz(za)]];
      case 'right':
        return [['area to the right', t], ['area to the left', `1 − ${t}`, f4(1 - targetArea)], ['z', `invNorm(${f4(1 - targetArea)})`, fz(za)]];
      case 'between': {
        const tail = (1 - targetArea) / 2;
        return [['middle area', t], ['each tail', `(1 − ${t}) / 2`, f4(tail)], ['z', `±invNorm(${f4(1 - tail)})`, `±${fz(zb)}`]];
      }
      case 'outside': {
        const tail = targetArea / 2;
        return [['both tails together', t], ['each tail', `${t} / 2`, f4(tail)], ['z', `±invNorm(${f4(1 - tail)})`, `±${fz(zb)}`]];
      }
    }
  });
  const inverseSentence = $derived.by(() => {
    const a = fx(toX(za));
    const b = fx(toX(zb));
    const p = pctText(targetArea);
    switch (region) {
      case 'left': {
        const k = Math.round(100 * targetArea);
        const pctl = k >= 1 && k <= 99 && Math.abs(100 * targetArea - k) < 1e-6 ? `${a} is the ${ordinal(k)} percentile: ` : '';
        return `${pctl}${p} of ${things} are below ${a}.`;
      }
      case 'right':
        return `${p} of ${things} are above ${a}.`;
      case 'between':
        return `The middle ${p} of ${things} are between ${a} and ${b}.`;
      case 'outside':
        return `${p} of ${things} are below ${a} or above ${b} (${pctText(targetArea / 2)} in each tail).`;
    }
  });
</script>

<!-- one worked equation: the first part, then "= part" on its own line for each step after it -->
{#snippet eq(parts: string[], boldLast: boolean)}
  <div class="eq">
    <p>{parts[0]}</p>
    {#each parts.slice(1) as part, i}
      <p class="cont">= {#if boldLast && i === parts.length - 2}<b class="answer">{part}</b>{:else}{part}{/if}</p>
    {/each}
  </div>
{/snippet}

<div class="max-w-3xl mx-auto space-y-4 font-mono text-sm">
  <section class="panel space-y-3">
    <!-- what kind of question -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-[var(--text-muted)] w-20 shrink-0">find the</span>
      <div class="seg" role="group" aria-label="What to find">
        <button class:on={goal === 'area'} aria-pressed={goal === 'area'} onclick={() => setGoal('area')}>[area]</button>
        <button class:on={goal === 'cutoff'} aria-pressed={goal === 'cutoff'} onclick={() => setGoal('cutoff')}>[cutoff]</button>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-[var(--text-muted)] w-20 shrink-0">shade</span>
      <div class="seg" role="group" aria-label="Region">
        {#each REGIONS as r (r.id)}
          <button class:on={region === r.id} aria-pressed={region === r.id} onclick={() => setRegion(r.id)}>[{r.label}]</button>
        {/each}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-[var(--text-muted)] w-20 shrink-0">distribution</span>
      <div class="seg" role="group" aria-label="Distribution">
        {#each SCALES as s (s.id)}
          <button class:on={scale === s.id} aria-pressed={scale === s.id} onclick={() => (scale = s.id)}>[{s.label}]</button>
        {/each}
      </div>
    </div>
    {#if scale !== 'z'}
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 pl-0 sm:pl-[5.5rem]">
        <label class="flex items-center gap-1">μ =
          <input class="field w-20" type="text" inputmode="decimal" value={mu} onchange={(e) => setParam('mu', e)} aria-label="population mean μ" />
        </label>
        <label class="flex items-center gap-1">σ =
          <input class="field w-20" type="text" inputmode="decimal" value={sigma} onchange={(e) => setParam('sigma', e)} aria-label="population standard deviation σ" />
        </label>
        {#if scale === 'xbar'}
          <label class="flex items-center gap-1">n =
            <input class="field w-16" type="text" inputmode="numeric" value={nSize} onchange={(e) => setParam('n', e)} aria-label="sample size n" />
          </label>
          <span class="text-xs text-[var(--text-muted)]">σ/√n = {num(spread)}</span>
        {/if}
      </div>
      {#if scale === 'xbar'}
        <p class="text-xs text-[var(--text-muted)] sm:pl-[5.5rem]">By the CLT, sample means x̄ are about normal with center μ and spread σ/√n (the standard error).</p>
      {/if}
    {/if}
  </section>

  <section class="panel space-y-3">
    <!-- the inputs for this kind of question -->
    {#if goal === 'area'}
      <div class="flex flex-wrap items-center gap-2">
        {#if two}
          <label class="flex items-center gap-1">{region === 'between' ? 'from' : 'below'}
            <input class="field w-24" type="text" inputmode="decimal" value={fv(toX(za))} onchange={(e) => onCutoffInput(0, e)} aria-label="lower cutoff" />
          </label>
          <label class="flex items-center gap-1">{region === 'between' ? 'to' : 'or above'}
            <input class="field w-24" type="text" inputmode="decimal" value={fv(toX(zb))} onchange={(e) => onCutoffInput(1, e)} aria-label="upper cutoff" />
          </label>
        {:else}
          <label class="flex items-center gap-1">{letter} {region === 'left' ? '<' : '>'}
            <input class="field w-24" type="text" inputmode="decimal" value={fv(toX(za))} onchange={(e) => onCutoffInput(0, e)} aria-label="cutoff" />
          </label>
        {/if}
        <span class="text-xs text-[var(--text-muted)]">or drag on the curve</span>
      </div>
    {:else}
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-1">
          {region === 'left' ? 'area to the left' : region === 'right' ? 'area to the right' : region === 'between' ? 'middle area' : 'area in both tails'} =
          <input class="field w-24" type="text" inputmode="decimal" value={f4(targetArea)} onchange={onAreaInput} aria-label="area" />
        </label>
        <span class="text-xs text-[var(--text-muted)]">0.90 or 90%</span>
      </div>
    {/if}

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-[var(--text-muted)]">68–95–99.7 rule:</span>
      {#each [1, 2, 3] as k (k)}
        <button class="btn" onclick={() => empirical(k)}>[within {k} SD]</button>
      {/each}
    </div>

    <!-- the curve -->
    <figure>
      <svg bind:this={svgEl} viewBox={`0 0 ${W} ${H}`} class="w-full h-auto curve-svg" class:grabbing={dragging >= 0}
        role="group" aria-label={`Normal curve with ${statement} = ${f4(area)} shaded`}
        onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={endDrag} onpointercancel={endDrag}>
        <text x={W / 2} y="16" class="lbl strong" text-anchor="middle">{statement} = {f4(area)}</text>
        {#each shaded as d}
          {#if d}<path {d} class="shade" />{/if}
        {/each}
        <path d={curvePath} class="curve" />
        <line x1={PAD_L} x2={W - PAD_R} y1={BASE} y2={BASE} class="axis" />
        {#each TICKS as t (t)}
          <line x1={gx(t)} x2={gx(t)} y1={BASE} y2={BASE + 4} class="axis" />
          <text x={gx(t)} y={BASE + 16} class="lbl" text-anchor="middle">{t < 0 ? '−' : ''}{Math.abs(t)}</text>
          {#if scale !== 'z'}
            <text x={gx(t)} y={BASE + 33} class="lbl xrow" text-anchor="middle">{fx(toX(t))}</text>
          {/if}
        {/each}
        <text x={PAD_L - 4} y={BASE + 16} class="lbl small" text-anchor="end">z</text>
        {#if scale !== 'z'}<text x={PAD_L - 4} y={BASE + 33} class="lbl small xrow" text-anchor="end">{scale === 'x' ? 'x' : 'x̄'}</text>{/if}
        {#each cuts as c, i (i)}
          <line x1={gx(c)} x2={gx(c)} y1={BASE} y2={PAD_T - 2} class="cut" />
          <text x={Math.min(W - PAD_R - 30, Math.max(PAD_L + 30, gx(c)))} y={PAD_T - 6 + (i === 1 && labelsClose ? 14 : 0)}
            class="lbl strong cut-lbl" text-anchor="middle">
            {scale === 'z' ? `z = ${fz(c)}` : `${fx(toX(c))} (z = ${fz(c)})`}
          </text>
          <circle cx={gx(c)} cy={BASE} r="8" class="handle" class:active={dragging === i}
            role="slider" tabindex="0" aria-label={two ? (i === 0 ? 'lower cutoff' : 'upper cutoff') : 'cutoff'}
            aria-valuemin={-Z_LIM} aria-valuemax={Z_LIM} aria-valuenow={Math.round(c * 100) / 100}
            aria-valuetext={scale === 'z' ? `z = ${fz(c)}` : `${fx(toX(c))}, z = ${fz(c)}`}
            onkeydown={(e) => onHandleKey(e, i)} />
        {/each}
      </svg>
      <figcaption class="text-[0.7rem] text-[var(--text-muted)] text-center">
        Drag on the curve to move {two ? 'the nearest cutoff' : 'the cutoff'} (or focus a dot and use the arrow keys).
      </figcaption>
    </figure>

    <!-- the answer, worked out -->
    <div class="work space-y-1">
      {#if goal === 'area'}
        {#if scale !== 'z'}
          <p class="muted">standardize:</p>
          {#each cuts as c, i (i)}
            {@render eq(standardize(c), false)}
          {/each}
        {/if}
        <p class="muted mt-2">area:</p>
        {@render eq([statement, ...chainShown], true)}
        <p class="sentence">{sentence}</p>
      {:else}
        <p class="muted">cutoff:</p>
        {#each inverseSteps as parts, i}
          {@render eq(parts, scale === 'z' && i === inverseSteps.length - 1)}
        {/each}
        {#if scale !== 'z'}
          <p class="muted mt-2">un-standardize:</p>
          {#each cuts as c, i (i)}
            {@render eq(unstandardize(c), true)}
          {/each}
        {/if}
        <p class="sentence">{inverseSentence}</p>
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
  .btn {
    border: 1px solid var(--line);
    background: var(--bg-surface);
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: bold;
    transition: border-color 0.15s, color 0.15s;
  }
  .btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* segmented choices */
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    border: 1px solid var(--line);
    border-radius: 0.25rem;
    overflow: hidden;
  }
  .seg button {
    padding: 0.2rem 0.55rem;
    font-size: 0.75rem;
    font-weight: bold;
    color: var(--text-muted);
  }
  .seg button + button {
    border-left: 1px solid var(--border-color);
  }
  .seg button.on {
    background: var(--accent);
    color: var(--bg-surface);
  }
  .seg button:not(.on):hover {
    color: var(--accent);
  }

  .field {
    background: transparent;
    border-bottom: 1px solid var(--line);
    padding: 0.1rem 0.25rem;
    text-align: center;
    font-weight: bold;
  }
  .field:focus {
    outline: none;
    border-color: var(--accent);
  }

  /* worked answer */
  .work {
    padding: 0.75rem;
    background: var(--well);
    border: 1px solid var(--border-color);
    border-radius: 0.25rem;
    line-height: 1.6;
    overflow-x: auto;
  }
  .work .muted {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .work .eq {
    padding-left: 1rem;
  }
  .work .eq + .eq {
    margin-top: 0.4rem;
  }
  .work .eq .cont {
    padding-left: 2ch;
  }
  .work .answer {
    color: var(--accent);
  }
  .work .sentence {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px dashed var(--border-color);
  }

  /* curve */
  .curve-svg {
    touch-action: none;
    cursor: pointer;
    user-select: none;
  }
  .curve-svg.grabbing {
    cursor: grabbing;
  }
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
  svg .lbl.xrow {
    fill: var(--accent);
  }
  svg .lbl.cut-lbl {
    font-size: 11px;
  }
  svg .axis {
    stroke: var(--line);
    stroke-width: 1;
  }
  svg .curve {
    fill: none;
    stroke: var(--text-primary);
    stroke-width: 2;
  }
  svg .shade {
    fill: color-mix(in srgb, var(--accent) 35%, transparent);
    stroke: none;
  }
  svg .cut {
    stroke: var(--accent);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }
  svg .handle {
    fill: var(--accent);
    stroke: var(--bg-surface);
    stroke-width: 2;
    cursor: grab;
  }
  svg .handle.active,
  svg .handle:focus-visible {
    stroke: var(--text-primary);
    outline: none;
  }
</style>
