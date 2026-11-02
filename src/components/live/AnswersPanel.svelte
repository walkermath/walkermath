<!-- src/components/live/AnswersPanel.svelte -->
<!-- The control panel's "answers" box: who has handed in what for a module, marked against your -->
<!-- key. Follows the live module unless you pick another; refreshes every few seconds. Your keys -->
<!-- come from the delivery's own copy of the lesson, so they match what students saw. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { RoomModule, RoomState } from '../../lib/lesson/room.ts';
  import type { RosterRow } from '../../lib/lesson/liveClient.ts';
  import { heading, label, panel } from '../teach/ui.ts';

  type Q = { id: string; kind: string; text: string; choices: string[]; answer: string };
  type CollectModule = { id: string; title: string; kind: 'questions' | 'short' | 'tap' | 'coliseum'; questions?: Q[] };
  type Row = { moduleId: string; aliasId: string; alias: string; answers: Record<string, string>; correct: Record<string, boolean | null>; updatedAt: number };
  type Score = { moduleId: string; aliasId: string; alias: string; best: number; plays: number };

  let {
    runId,
    modules,
    rs,
    students
  }: { runId: string; modules: RoomModule[]; rs: RoomState; students: RosterRow[] } = $props();

  let collect = $state<CollectModule[]>([]);
  let rows = $state<Row[]>([]);
  let scores = $state<Score[]>([]);
  let error = $state('');
  /** 'live' follows the module on screen; otherwise a module id. */
  let picked = $state<string>('live');
  let open = $state(true);
  let timer: ReturnType<typeof setInterval> | null = null;
  const REFRESH_MS = 4000;
  const OPEN_KEY = 'wm_answers_open';

  async function refresh() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    try {
      const res = await fetch(`/api/teach/runs/${encodeURIComponent(runId)}/answers`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      collect = data.modules ?? [];
      rows = data.rows ?? [];
      scores = data.scores ?? [];
      error = '';
    } catch (e) {
      error = (e as Error).message;
    }
  }

  onMount(() => {
    try {
      open = localStorage.getItem(OPEN_KEY) !== '0';
    } catch {
      // no storage: stays open
    }
    refresh();
    timer = setInterval(refresh, REFRESH_MS);
  });
  onDestroy(() => timer && clearInterval(timer));

  const toggle = (e: Event) => {
    open = (e.currentTarget as HTMLDetailsElement).open;
    try {
      localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
      // fine
    }
  };

  const liveId = $derived(modules[rs.index]?.id);
  const shown = $derived(collect.find((m) => m.id === (picked === 'live' ? liveId : picked)) ?? null);
  const mRows = $derived(shown ? rows.filter((r) => r.moduleId === shown.id) : []);
  const mScores = $derived(shown ? scores.filter((r) => r.moduleId === shown.id).sort((a, b) => b.best - a.best) : []);

  const filled = (r: Row | undefined) =>
    !!r && (shown?.kind === 'tap' ? r.answers.done === '1' : Object.values(r.answers).some((v) => v.trim() !== ''));

  /** Everyone in this lesson (here now, or here earlier), plus anyone who handed something in. */
  const people = $derived.by(() => {
    const byId = new Map<string, { aliasId: string; alias: string; here: boolean }>();
    for (const s of students) byId.set(s.aliasId, { aliasId: s.aliasId, alias: s.alias, here: s.here });
    for (const r of mRows) if (!byId.has(r.aliasId)) byId.set(r.aliasId, { aliasId: r.aliasId, alias: r.alias, here: false });
    for (const r of mScores) if (!byId.has(r.aliasId)) byId.set(r.aliasId, { aliasId: r.aliasId, alias: r.alias, here: false });
    return [...byId.values()].sort((a, b) => a.alias.localeCompare(b.alias));
  });
  const rowOf = (aliasId: string) => mRows.find((r) => r.aliasId === aliasId);
  const inCount = $derived(people.filter((p) => filled(rowOf(p.aliasId))).length);

  const letter = (i: number) => String.fromCharCode(65 + i);
  function shownAnswer(q: Q, v: string | undefined): string {
    if (v === undefined || v.trim() === '') return '';
    if (q.kind === 'choice') return `${letter(Number(v))}. ${q.choices[Number(v)] ?? ''}`;
    return v;
  }
  function tally(q: Q) {
    const answered = mRows.filter((r) => (r.answers[q.id] ?? '').trim() !== '');
    const right = answered.filter((r) => r.correct[q.id] === true).length;
    return { answered: answered.length, right, keyed: !!q.answer };
  }
  const keyText = (q: Q) => (q.kind === 'choice' && q.answer !== '' ? `${letter(Number(q.answer))}` : q.answer);
  const cellCls = (v: boolean | null | undefined) =>
    v === true ? 'text-[var(--ok)]' : v === false ? 'text-[var(--bad)]' : '';
</script>

{#if collect.length}
  <details class="{panel} space-y-3" {open} ontoggle={toggle}>
    <summary class="cursor-pointer {heading}">
      // answers{shown ? `: ${shown.title} · ${shown.kind === 'coliseum' ? `${mScores.length} played` : `${inCount} of ${people.length} in`}` : ''}
    </summary>

    <div class="flex flex-wrap items-center gap-2 pt-1">
      <label class="flex items-center gap-2">
        <span class={label}>show</span>
        <select class="bg-[var(--bg)] border border-[var(--line)] rounded px-1 py-0.5" bind:value={picked}>
          <option value="live">the live module</option>
          {#each collect as m (m.id)}
            <option value={m.id}>{m.title}</option>
          {/each}
        </select>
      </label>
      {#if error}<span class="text-[var(--warn)]">// {error}</span>{/if}
    </div>

    {#if !shown}
      <p class={label}>// the live module doesn't collect anything. pick one above to see its answers.</p>
    {:else if shown.kind === 'questions' && shown.questions}
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-[var(--line)]">
              <th class="py-1 pr-3 font-normal {label}">student</th>
              {#each shown.questions as q, qi (q.id)}
                {@const t = tally(q)}
                <th class="py-1 pr-3 font-normal align-bottom" title={q.text}>
                  <div class="font-bold">Q{qi + 1}</div>
                  <div class={label}>
                    {#if t.keyed}{t.right}/{t.answered} right · key {keyText(q)}{:else}{t.answered} in · no key{/if}
                  </div>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each people as p (p.aliasId)}
              {@const r = rowOf(p.aliasId)}
              <tr class="border-b border-[var(--line)] align-top">
                <td class="py-1 pr-3 whitespace-nowrap {p.here ? '' : label}">{p.alias}</td>
                {#each shown.questions as q (q.id)}
                  {@const v = shownAnswer(q, r?.answers[q.id])}
                  <td class="py-1 pr-3 max-w-[14rem] {cellCls(r?.correct[q.id])}" title={v}>
                    {#if v}
                      <span class="line-clamp-2 break-words">{r?.correct[q.id] === true ? '✓ ' : r?.correct[q.id] === false ? '✗ ' : ''}{v}</span>
                    {:else}
                      <span class={label}>-</span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if people.length === 0}<p class={label}>// no students yet.</p>{/if}
    {:else if shown.kind === 'short'}
      <ul class="space-y-2">
        {#each people as p (p.aliasId)}
          {@const v = rowOf(p.aliasId)?.answers.short ?? ''}
          <li class="grid grid-cols-[9rem_minmax(0,1fr)] gap-3">
            <span class={p.here ? '' : label}>{p.alias}</span>
            {#if v.trim()}<span class="whitespace-pre-wrap break-words">{v}</span>{:else}<span class={label}>-</span>{/if}
          </li>
        {/each}
      </ul>
    {:else if shown.kind === 'tap'}
      <ul class="flex flex-wrap gap-1">
        {#each people as p (p.aliasId)}
          {@const done = filled(rowOf(p.aliasId))}
          <li class="px-1.5 py-0.5 rounded border {done ? 'border-[var(--ok)] text-[var(--ok)]' : 'border-[var(--line)] ' + label}">
            {done ? '✓' : '·'} {p.alias}
          </li>
        {/each}
      </ul>
    {:else if shown.kind === 'coliseum'}
      {#if mScores.length === 0}
        <p class={label}>// no games finished yet.</p>
      {:else}
        <table class="text-left border-collapse">
          <thead>
            <tr class="border-b border-[var(--line)]">
              <th class="py-1 pr-6 font-normal {label}">student</th>
              <th class="py-1 pr-6 font-normal {label}">best</th>
              <th class="py-1 font-normal {label}">games</th>
            </tr>
          </thead>
          <tbody>
            {#each mScores as r (r.aliasId)}
              <tr class="border-b border-[var(--line)]">
                <td class="py-1 pr-6">{r.alias}</td>
                <td class="py-1 pr-6 tabular-nums font-bold">{r.best}</td>
                <td class="py-1 tabular-nums">{r.plays}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}
  </details>
{/if}
