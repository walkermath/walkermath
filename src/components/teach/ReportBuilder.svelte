<!-- src/components/teach/ReportBuilder.svelte -->
<!-- /teach/reports: pick a date range, the deliveries (lessons, opened into their periods) and what
     to report (columns of checkboxes), then download a workbook. Rows in the file are aliases.
     The layout is src/lib/lesson/reports.ts; the file is written here (src/lib/reports/files.ts). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../lib/api.ts';
  import type { Breakdown, Cell, ItemKind } from '../../lib/lesson/reports.ts';
  import { CSV_TYPE, XLSX_TYPE, download, toCsv, toXlsx } from '../../lib/reports/files.ts';
  import { btn, btnMain, field, heading, label, niceDate, panel, todayIso } from './ui.ts';

  type Item = { key: string; moduleId: string; kind: ItemKind; module: string; label: string; available: boolean };
  type RunRow = { runId: string; classId: string; className: string; period: string; date: string; startTime: string };
  type Lesson = {
    lessonId: string;
    title: string;
    runs: RunRow[];
    items: Item[];
    modules: { moduleId: string; title: string; questions: { id: string; text: string; keyed: boolean }[] }[];
  };
  type Sheet = { name: string; columns: string[]; rows: Cell[][] };

  const BREAKDOWNS: { value: Breakdown; label: string; hint: string }[] = [
    { value: 'period', label: 'by period', hint: 'a sheet per class: aliases down the side, ready for a column of names' },
    { value: 'aggregate', label: 'aggregate', hint: 'one sheet, every class, with a period column to filter' },
    { value: 'lesson', label: 'by lesson', hint: 'a sheet per lesson' }
  ];

  function daysAgo(n: number): string {
    const d = new Date(Date.now() - n * 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  let from = $state(daysAgo(30));
  let to = $state(todayIso());
  let lessons = $state<Lesson[]>([]);
  let loaded = $state(false);
  let busy = $state(false);
  let error = $state('');

  /** runId -> picked */
  let runsOn = $state<Record<string, boolean>>({});
  /** lessonId -> itemKey -> picked */
  let picks = $state<Record<string, Record<string, boolean>>>({});
  /** lessonId -> periods shown */
  let open = $state<Record<string, boolean>>({});
  let breakdown = $state<Breakdown>('period');
  let analysis = $state(false);
  /** `${lessonId}:${moduleId}:${questionId}` -> picked */
  let qOn = $state<Record<string, boolean>>({});
  let qOpen = $state<Record<string, boolean>>({});

  let sheets = $state<Sheet[] | null>(null);

  /** Sets a checkbox's "some but not all" look. */
  function indet(node: HTMLInputElement, value: boolean) {
    node.indeterminate = value;
    return {
      update(v: boolean) {
        node.indeterminate = v;
      }
    };
  }

  async function load() {
    error = '';
    busy = true;
    sheets = null;
    try {
      const data = await api<{ lessons: Lesson[] }>(`/api/teach/reports/options?from=${from}&to=${to}`);
      lessons = data.lessons;
      const r: Record<string, boolean> = {};
      for (const l of lessons) for (const run of l.runs) r[run.runId] = runsOn[run.runId] ?? true;
      runsOn = r;
      for (const l of lessons) picks[l.lessonId] ??= {};
      loaded = true;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  onMount(load);

  /* ---- the grid: one column per item label, across lessons ---- */

  const columns = $derived.by(() => {
    const seen = new Map<string, { id: string; label: string }>();
    for (const l of lessons) for (const i of l.items) if (!seen.has(i.label.toLowerCase())) seen.set(i.label.toLowerCase(), { id: i.label.toLowerCase(), label: i.label });
    return [...seen.values()];
  });

  const itemAt = (l: Lesson, colId: string) => l.items.find((i) => i.label.toLowerCase() === colId);

  function lessonRuns(l: Lesson) {
    const on = l.runs.filter((r) => runsOn[r.runId]).length;
    return { all: on === l.runs.length, some: on > 0 };
  }

  function setLessonRuns(l: Lesson, value: boolean) {
    for (const r of l.runs) runsOn[r.runId] = value;
  }

  function column(colId: string) {
    const cells = lessons.map((l) => itemAt(l, colId)).filter((i): i is Item => !!i && i.available);
    const on = lessons.filter((l) => {
      const i = itemAt(l, colId);
      return i?.available && picks[l.lessonId]?.[i.key];
    }).length;
    return { any: cells.length > 0, all: cells.length > 0 && on === cells.length, some: on > 0 };
  }

  function setColumn(colId: string, value: boolean) {
    for (const l of lessons) {
      const i = itemAt(l, colId);
      if (i?.available) (picks[l.lessonId] ??= {})[i.key] = value;
    }
  }

  /* ---- question analysis ---- */

  const qKey = (l: Lesson, moduleId: string, qid: string) => `${l.lessonId}:${moduleId}:${qid}`;

  function groupState(keys: string[]) {
    const on = keys.filter((k) => qOn[k]).length;
    return { all: keys.length > 0 && on === keys.length, some: on > 0 };
  }

  function setGroup(keys: string[], value: boolean) {
    for (const k of keys) qOn[k] = value;
  }

  const lessonQs = (l: Lesson) => l.modules.flatMap((m) => m.questions.map((q) => qKey(l, m.moduleId, q.id)));
  const withQuestions = $derived(lessons.filter((l) => l.modules.length));

  /* ---- building ---- */

  const pickedRuns = $derived(lessons.flatMap((l) => l.runs.filter((r) => runsOn[r.runId]).map((r) => r.runId)));

  async function build() {
    error = '';
    busy = true;
    sheets = null;
    try {
      const items: Record<string, string[]> = {};
      const questions: string[] = [];
      for (const l of lessons) {
        if (!lessonRuns(l).some) continue;
        const keys = Object.entries(picks[l.lessonId] ?? {})
          .filter(([, v]) => v)
          .map(([k]) => k);
        if (keys.length) items[l.lessonId] = keys;
        if (analysis) questions.push(...lessonQs(l).filter((k) => qOn[k]));
      }
      const data = await api<{ sheets: Sheet[] }>('/api/teach/reports', {
        body: { runIds: pickedRuns, items, breakdown, questions }
      });
      sheets = data.sheets;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  const fileBase = $derived(`walkermath-report-${from}-to-${to}`);

  function saveXlsx() {
    if (sheets) download(`${fileBase}.xlsx`, toXlsx(sheets), XLSX_TYPE);
  }

  function saveCsv() {
    if (sheets?.length === 1) download(`${fileBase}.csv`, toCsv(sheets[0]), CSV_TYPE);
  }

  const show = (v: Cell) => (v === null || v === undefined ? '' : String(v));
</script>

<div class="space-y-6 text-sm">
  <section class="{panel} space-y-4">
    <h2 class={heading}>// reports</h2>
    <p class="text-xs {label}">
      pick the deliveries and what to report from them. rows in the file are aliases, never names: add your own column of
      names beside them for the gradebook.
    </p>
    <div class="flex flex-wrap items-end gap-3">
      <label class="space-y-1 text-xs">
        <span class={label}>from</span>
        <input type="date" class={field} bind:value={from} />
      </label>
      <label class="space-y-1 text-xs">
        <span class={label}>to</span>
        <input type="date" class={field} bind:value={to} />
      </label>
      <button type="button" class={btn} disabled={busy} onclick={load}>[show deliveries]</button>
    </div>
  </section>

  {#if error}
    <p class="p-3 rounded border border-[var(--bad)] text-[var(--bad)] text-xs">{error}</p>
  {/if}

  {#if loaded && !lessons.length}
    <p class="text-xs {label}">no finished deliveries between {niceDate(from)} and {niceDate(to)}.</p>
  {:else if lessons.length}
    <section class="{panel} space-y-3">
      <h3 class={heading}>// deliveries and columns</h3>
      <p class="text-xs {label}">open a lesson to pick its periods. greyed columns collect nothing from students.</p>
      <div class="overflow-x-auto">
        <table class="text-xs border-collapse">
          <thead>
            <tr>
              <th class="text-left p-2 align-bottom min-w-[16rem]">lesson</th>
              {#each columns as col (col.id)}
                {@const st = column(col.id)}
                <th class="p-2 align-bottom font-normal max-w-[8rem] {st.any ? '' : 'opacity-40'}">
                  <label class="flex flex-col items-center gap-1 cursor-pointer">
                    <span class="text-center leading-tight">{col.label}</span>
                    <input
                      type="checkbox"
                      disabled={!st.any}
                      checked={st.all}
                      use:indet={st.some && !st.all}
                      onchange={(e) => setColumn(col.id, (e.currentTarget as HTMLInputElement).checked)}
                    />
                  </label>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each lessons as l (l.lessonId)}
              {@const rs = lessonRuns(l)}
              <tr class="border-t border-[var(--line)]">
                <td class="p-2">
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="w-4 text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
                      aria-label={open[l.lessonId] ? 'hide periods' : 'show periods'}
                      onclick={() => (open[l.lessonId] = !open[l.lessonId])}>{open[l.lessonId] ? '▽' : '▷'}</button
                    >
                    <input
                      type="checkbox"
                      checked={rs.all}
                      use:indet={rs.some && !rs.all}
                      aria-label="all periods of {l.title}"
                      onchange={(e) => setLessonRuns(l, (e.currentTarget as HTMLInputElement).checked)}
                    />
                    <span class="font-bold {rs.some ? '' : 'opacity-50'}">{l.title}</span>
                  </div>
                </td>
                {#each columns as col (col.id)}
                  {@const it = itemAt(l, col.id)}
                  <td class="p-2 text-center">
                    {#if it?.available}
                      <input
                        type="checkbox"
                        aria-label="{l.title}: {it.label}"
                        checked={!!picks[l.lessonId]?.[it.key]}
                        onchange={(e) => ((picks[l.lessonId] ??= {})[it.key] = (e.currentTarget as HTMLInputElement).checked)}
                      />
                    {:else if it}
                      <span class="opacity-40" title="collects nothing">–</span>
                    {/if}
                  </td>
                {/each}
              </tr>
              {#if open[l.lessonId]}
                {#each l.runs as r (r.runId)}
                  <tr>
                    <td class="py-1 pl-12 pr-2" colspan={columns.length + 1}>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" bind:checked={runsOn[r.runId]} />
                        <span>{r.className} {r.period}</span>
                        <span class={label}>{niceDate(r.date)}</span>
                      </label>
                    </td>
                  </tr>
                {/each}
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section class="{panel} space-y-3">
      <h3 class={heading}>// sheets</h3>
      <div class="space-y-2">
        {#each BREAKDOWNS as b (b.value)}
          <label class="flex items-start gap-2 cursor-pointer text-xs">
            <input type="radio" name="breakdown" value={b.value} bind:group={breakdown} />
            <span><span class="font-bold">{b.label}</span> <span class={label}>// {b.hint}</span></span>
          </label>
        {/each}
      </div>
      <label class="flex items-start gap-2 cursor-pointer text-xs pt-2">
        <input type="checkbox" bind:checked={analysis} disabled={!withQuestions.length} />
        <span>
          <span class="font-bold">question analysis</span>
          <span class={label}>// one extra sheet: a row per question, with percent correct overall and by period, and the most common wrong answers</span>
        </span>
      </label>
      {#if analysis}
        <div class="pl-6 space-y-1 text-xs">
          {#each withQuestions as l (l.lessonId)}
            {@const lk = lessonQs(l)}
            {@const ls = groupState(lk)}
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="w-4 text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
                aria-label={qOpen[l.lessonId] ? 'hide questions' : 'show questions'}
                onclick={() => (qOpen[l.lessonId] = !qOpen[l.lessonId])}>{qOpen[l.lessonId] ? '▽' : '▷'}</button
              >
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={ls.all} use:indet={ls.some && !ls.all} onchange={(e) => setGroup(lk, (e.currentTarget as HTMLInputElement).checked)} />
                <span class="font-bold">{l.title}</span>
              </label>
            </div>
            {#if qOpen[l.lessonId]}
              {#each l.modules as m (m.moduleId)}
                {@const mk = m.questions.map((q) => qKey(l, m.moduleId, q.id))}
                {@const ms = groupState(mk)}
                <label class="flex items-center gap-2 pl-6 cursor-pointer">
                  <input type="checkbox" checked={ms.all} use:indet={ms.some && !ms.all} onchange={(e) => setGroup(mk, (e.currentTarget as HTMLInputElement).checked)} />
                  <span>{m.title}</span>
                </label>
                {#each m.questions as q (q.id)}
                  <label class="flex items-start gap-2 pl-12 cursor-pointer">
                    <input type="checkbox" bind:checked={qOn[qKey(l, m.moduleId, q.id)]} />
                    <span>{q.text || '(no text)'} {#if !q.keyed}<span class={label}>(no key: counted, not marked)</span>{/if}</span>
                  </label>
                {/each}
              {/each}
            {/if}
          {/each}
        </div>
      {/if}
      <div class="pt-2">
        <button type="button" class={btnMain} disabled={busy || !pickedRuns.length} onclick={build}>
          {busy ? '[building...]' : '[build report]'}
        </button>
      </div>
    </section>
  {/if}

  {#if sheets}
    <section class="{panel} space-y-3">
      <h3 class={heading}>// ready</h3>
      <ul class="text-xs space-y-1">
        {#each sheets as s (s.name)}
          <li><span class="font-bold">{s.name}</span> <span class={label}>// {s.rows.length} rows, {s.columns.length} columns</span></li>
        {/each}
      </ul>
      <div class="flex flex-wrap gap-2">
        <button type="button" class={btnMain} onclick={saveXlsx}>[download .xlsx]</button>
        {#if sheets.length === 1}
          <button type="button" class={btn} onclick={saveCsv}>[download .csv]</button>
        {/if}
      </div>
      <p class="text-xs {label}">
        // .xlsx opens in Excel and imports into Google Sheets (File > Import). free-text answers can still contain a
        name, and the file lives on your computer: keep it with your gradebook.
      </p>
      {#if sheets[0]?.rows.length}
        <div class="overflow-x-auto">
          <table class="text-xs border-collapse">
            <caption class="text-left {label} pb-1">preview: {sheets[0].name}</caption>
            <thead>
              <tr>
                {#each sheets[0].columns as c, i (i)}
                  <th class="p-1 border border-[var(--line)] text-left font-bold whitespace-nowrap">{c}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each sheets[0].rows.slice(0, 8) as row, r (r)}
                <tr>
                  {#each row as v, c (c)}
                    <td class="p-1 border border-[var(--line)] whitespace-nowrap">{show(v)}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
</div>
