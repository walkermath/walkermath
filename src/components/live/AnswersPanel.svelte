<!-- src/components/live/AnswersPanel.svelte -->
<!-- The control panel's "answers" box: who has handed in what for a module, marked against your -->
<!-- key. Follows the live module unless you pick another; refreshes every few seconds. Your keys -->
<!-- come from the delivery's own copy of the lesson, so they match what students saw. -->
<!-- Active Feedback activities: click a cell to mark the answer ✓ ◐ ✗ and/or send that student a -->
<!-- message. Also shown after the lesson ends (no room: `rs` is null), so you can finish marking. -->
<script lang="ts">
  import { gridText } from '../../lib/lesson/grid.ts';
  import { sortText } from '../../lib/lesson/sort.ts';
  import { onDestroy, onMount, tick } from 'svelte';
  import type { RoomModule, RoomState, Spotlight } from '../../lib/lesson/room.ts';
  import type { RosterRow } from '../../lib/lesson/liveClient.ts';
  import { heading, label, panel } from '../teach/ui.ts';
  import { FEEDBACK_MESSAGE_MAX, MARK_COLOR, MARK_SYMBOL, isRevised, type Feedback, type Mark } from '../../lib/lesson/feedback.ts';

  type Q = { id: string; kind: string; text: string; choices: string[]; answer: string; sort?: any };
  type CollectModule = { id: string; title: string; kind: 'questions' | 'short' | 'tap' | 'coliseum'; feedback?: boolean; questions?: Q[] };
  type FbRow = Feedback & { moduleId: string; aliasId: string; questionId: string };
  type Row = { moduleId: string; aliasId: string; alias: string; answers: Record<string, string>; correct: Record<string, boolean | null>; updatedAt: number };
  type Score = { moduleId: string; aliasId: string; alias: string; best: number; plays: number };

  let {
    runId,
    modules = [],
    rs = null,
    students = [],
    onspotlight
  }: {
    runId: string;
    modules?: RoomModule[];
    /** The live room's state; null once the lesson has ended (marking after class). */
    rs?: RoomState | null;
    students?: RosterRow[];
    /** Put a poll's results or one answer on the projector (null hides it). */
    onspotlight?: (spot: Spotlight | null) => void;
  } = $props();

  let collect = $state<CollectModule[]>([]);
  let rows = $state<Row[]>([]);
  let scores = $state<Score[]>([]);
  let feedback = $state<FbRow[]>([]);
  let error = $state('');
  /** Bumped by every feedback save, so a refresh that started before it can't put old feedback back. */
  let fbSeq = 0;
  /** 'live' follows the module on screen; otherwise a module id. */
  let picked = $state<string>('live');
  let open = $state(true);
  let timer: ReturnType<typeof setInterval> | null = null;
  const REFRESH_MS = 4000;
  const OPEN_KEY = 'wm_answers_open';

  async function refresh() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const seq = fbSeq;
    try {
      const res = await fetch(`/api/teach/runs/${encodeURIComponent(runId)}/answers`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      collect = data.modules ?? [];
      rows = data.rows ?? [];
      scores = data.scores ?? [];
      if (seq === fbSeq) feedback = data.feedback ?? [];
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
    try {
      const saved = JSON.parse(localStorage.getItem(MSG_KEY) ?? '[]');
      if (Array.isArray(saved)) recentMessages = saved.filter((m) => typeof m === 'string' && m).slice(0, MSG_KEEP);
    } catch {
      // no storage, or unreadable: start empty
    }
    refresh();
    // After the lesson there's nothing new coming in: one load (and your own saves) is enough.
    if (rs) timer = setInterval(refresh, REFRESH_MS);
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

  /** With no live module (the lesson has ended), "live" means the first Active Feedback activity. */
  const liveId = $derived(rs ? modules[rs.index]?.id : (collect.find((m) => m.feedback) ?? collect[0])?.id);
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
    if (q.kind === 'grid') return gridText(v);
    if (q.kind === 'sort') return sortText(q.sort, v);
    return v;
  }
  function tally(q: Q) {
    const answered = mRows.filter((r) => (r.answers[q.id] ?? '').trim() !== '');
    const right = answered.filter((r) => r.correct[q.id] === true).length;
    return { answered: answered.length, right, keyed: !!q.answer };
  }
  const keyText = (q: Q) => (q.kind === 'choice' && q.answer !== '' ? `${letter(Number(q.answer))}` : q.kind === 'grid' ? gridText(q.answer) : q.kind === 'sort' ? sortText(q.sort, q.answer) : q.answer);
  /** A question's answers as bars: each choice, or the most common answers (alike ones together). */
  function pollOf(q: Q, qi: number): Spotlight {
    const answered = mRows.map((r) => r.answers[q.id] ?? '').filter((v) => v.trim() !== '');
    let bars: { label: string; count: number }[];
    if (q.kind === 'choice') {
      bars = q.choices.map((c, i) => ({ label: `${letter(i)}. ${c}`, count: answered.filter((v) => v === String(i)).length }));
    } else {
      const groups = new Map<string, { label: string; count: number }>();
      for (const v of answered) {
        const text = shownAnswer(q, v);
        const k = text.trim().toLowerCase().replace(/\s+/g, '');
        const g = groups.get(k) ?? { label: text.trim(), count: 0 };
        g.count++;
        groups.set(k, g);
      }
      const sorted = [...groups.values()].sort((a, b) => b.count - a.count);
      bars = sorted.slice(0, 7);
      const rest = sorted.slice(7).reduce((n, g) => n + g.count, 0);
      if (rest) bars.push({ label: 'other answers', count: rest });
    }
    return { kind: 'tally', title: `Q${qi + 1}`, bars };
  }
  const showAnswer = (title: string, text: string, math: boolean) => onspotlight?.({ kind: 'answer', title, text, math });

  const cellCls = (v: boolean | null | undefined) =>
    v === true ? 'text-[var(--ok)]' : v === false ? 'text-[var(--bad)]' : '';

  /* ---------------- Active Feedback: your marks and messages ---------------- */

  const fbKey = (aliasId: string, qid: string) => `${aliasId}|${qid}`;
  /** The shown module's feedback, by student and question. */
  const fbMap = $derived.by(() => {
    const m = new Map<string, FbRow>();
    if (shown) for (const f of feedback) if (f.moduleId === shown.id) m.set(fbKey(f.aliasId, f.questionId), f);
    return m;
  });
  const fbOf = (aliasId: string, qid: string) => fbMap.get(fbKey(aliasId, qid));
  /** Answered, and not marked yet (or changed since you marked it). */
  const needsFeedback = (aliasId: string, qid: string) => {
    const v = rowOf(aliasId)?.answers[qid] ?? '';
    if (!v.trim()) return false;
    const f = fbOf(aliasId, qid);
    return !f || isRevised(f, v);
  };
  function fbTally(q: Q) {
    const t = { right: 0, partial: 0, wrong: 0, waiting: 0 };
    for (const p of people) {
      const f = fbOf(p.aliasId, q.id);
      if (f?.mark) t[f.mark]++;
      if (needsFeedback(p.aliasId, q.id)) t.waiting++;
    }
    return t;
  }
  /* Messages you've sent, newest first, for reuse with one tap. Kept in this browser (not with the
     lesson), so overwriting or clearing a student's feedback doesn't lose them, and they carry over
     to other periods and lessons. A convenience only: without storage the list lasts until reload. */
  const MSG_KEY = 'wm_feedback_msgs';
  const MSG_KEEP = 10;
  let recentMessages = $state<string[]>([]);
  function storeMessages() {
    try {
      localStorage.setItem(MSG_KEY, JSON.stringify(recentMessages));
    } catch {
      // no storage
    }
  }
  function rememberMessage(m: string) {
    recentMessages = [m, ...recentMessages.filter((x) => x !== m)].slice(0, MSG_KEEP);
    storeMessages();
  }
  function forgetMessage(m: string) {
    recentMessages = recentMessages.filter((x) => x !== m);
    storeMessages();
  }

  /** The answer open for feedback, and your message being written. */
  let cell = $state<{ aliasId: string; qid: string } | null>(null);
  let draft = $state('');
  let fbBusy = $state(false);
  let fbStatus = $state('');
  let draftBox = $state<HTMLTextAreaElement | null>(null);

  function openCell(aliasId: string, qid: string) {
    cell = { aliasId, qid };
    draft = fbOf(aliasId, qid)?.message ?? '';
    fbStatus = '';
    tick().then(() => draftBox?.focus());
  }
  // Switching modules closes the editor. (Keyed on the id: every refresh brings a new module object.)
  const shownId = $derived(shown?.id ?? '');
  let lastShownId = '';
  $effect(() => {
    if (shownId === lastShownId) return;
    lastShownId = shownId;
    cell = null;
  });

  async function saveFb(mark: Mark | null, message: string) {
    if (!cell || !shown) return;
    const { aliasId, qid } = cell;
    const moduleId = shown.id;
    fbBusy = true;
    fbStatus = '';
    fbSeq++;
    try {
      const res = await fetch(`/api/teach/runs/${encodeURIComponent(runId)}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ moduleId, aliasId, questionId: qid, mark, message })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      const rest = feedback.filter((f) => !(f.moduleId === moduleId && f.aliasId === aliasId && f.questionId === qid));
      feedback = data.feedback ? [...rest, data.feedback] : rest;
      if (data.feedback?.message) rememberMessage(data.feedback.message);
      if (cell?.aliasId === aliasId && cell.qid === qid) draft = data.feedback?.message ?? '';
      fbStatus = data.feedback ? (rs ? '// sent. it shows on their screen within a few seconds.' : '// saved. they see it when they look back at this lesson.') : '// cleared.';
    } catch (e) {
      fbStatus = `// not saved: ${(e as Error).message}`;
    } finally {
      fbBusy = false;
      fbSeq++;
    }
  }
  /** A mark button: picks that mark (with the message as written), or takes it off if it's already on. */
  const markIt = (m: Mark) => {
    if (!cell) return;
    const cur = fbOf(cell.aliasId, cell.qid)?.mark ?? null;
    saveFb(cur === m ? null : m, draft);
  };
  const sendMessage = () => cell && saveFb(fbOf(cell.aliasId, cell.qid)?.mark ?? null, draft);

  /** The next answer that needs feedback, reading across then down, after the open one. */
  function nextNeeding() {
    if (!shown?.questions) return;
    const qs = shown.questions;
    const cells = people.flatMap((p) => qs.map((q) => ({ aliasId: p.aliasId, qid: q.id })));
    const from = cell ? cells.findIndex((c) => c.aliasId === cell!.aliasId && c.qid === cell!.qid) : -1;
    for (let k = 1; k <= cells.length; k++) {
      const c = cells[(from + k) % cells.length];
      if (needsFeedback(c.aliasId, c.qid)) return openCell(c.aliasId, c.qid);
    }
    fbStatus = '// every answer has feedback.';
  }
  const waitingCount = $derived(shown?.feedback && shown.questions ? people.reduce((n, p) => n + shown!.questions!.filter((q) => needsFeedback(p.aliasId, q.id)).length, 0) : 0);
  const fbBtn = 'px-2 py-1 rounded border-2 font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
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
          <option value="live">{rs ? 'the live module' : 'Active Feedback'}</option>
          {#each collect as m (m.id)}
            <option value={m.id}>{m.title}</option>
          {/each}
        </select>
      </label>
      {#if error}<span class="text-[var(--warn)]">// {error}</span>{/if}
    </div>
    {#if rs.spotlight && onspotlight}
      <p class="text-[var(--accent)]">
        // on the projector: {rs.spotlight.kind === 'tally' ? `${rs.spotlight.title} results` : `an answer to ${rs.spotlight.title}`}
        <button type="button" class="underline hover:text-[var(--accent)] cursor-pointer" onclick={() => onspotlight(null)}>[hide]</button>
      </p>
    {:else if shown?.feedback}
      <p class={label}>
        // click an answer to mark it ✓ ◐ ✗ and/or send that student a message. ↻ = changed since you marked it.
        {#if waitingCount}<b class="text-[var(--accent)]">{waitingCount} waiting.</b>{/if}
      </p>
    {:else if onspotlight && shown && shown.kind !== 'tap' && shown.kind !== 'coliseum'}
      <p class={label}>// click an answer to show it on the projector (no name), or [results → screen] for a question's tally.</p>
    {/if}

    {#if !shown}
      <p class={label}>// the live module doesn't collect anything. pick one above to see its answers.</p>
    {:else if shown.feedback && shown.questions}
      {@const fq = shown.questions}
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-[var(--line)]">
              <th class="py-1 pr-3 font-normal {label}">student</th>
              {#each fq as q, qi (q.id)}
                {@const t = tally(q)}
                {@const ft = fbTally(q)}
                <th class="py-1 pr-3 font-normal align-bottom" title={q.text}>
                  <div class="font-bold">Q{qi + 1}</div>
                  <div class={label}>
                    {t.answered} in · <span class="text-[var(--ok)]">✓{ft.right}</span> <span class="text-[var(--warn)]">◐{ft.partial}</span> <span class="text-[var(--bad)]">✗{ft.wrong}</span>{#if ft.waiting} · <span class="text-[var(--accent)]">{ft.waiting} waiting</span>{/if}
                  </div>
                  {#if onspotlight && t.answered}
                    <button type="button" class="underline hover:text-[var(--accent)] cursor-pointer" onclick={() => onspotlight(pollOf(q, qi))}>[results → screen]</button>
                  {/if}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each people as p (p.aliasId)}
              {@const r = rowOf(p.aliasId)}
              <tr class="border-b border-[var(--line)] align-top">
                <td class="py-1 pr-3 whitespace-nowrap {p.here ? '' : label}">{p.alias}</td>
                {#each fq as q, qi (q.id)}
                  {@const v = shownAnswer(q, r?.answers[q.id])}
                  {@const f = fbOf(p.aliasId, q.id)}
                  {@const revised = isRevised(f, r?.answers[q.id])}
                  {@const on = cell?.aliasId === p.aliasId && cell?.qid === q.id}
                  <td class="py-1 pr-3 max-w-[14rem]">
                    <button
                      type="button"
                      class="w-full text-left px-1 rounded border cursor-pointer hover:border-[var(--accent)] {on ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-transparent'}"
                      style={f?.mark ? `color: ${MARK_COLOR[f.mark]}` : ''}
                      title={`${p.alias}, Q${qi + 1}: ${v || 'no answer yet'}${f?.message ? `\nyour message: ${f.message}` : ''}`}
                      aria-label="Feedback for {p.alias}, question {qi + 1}"
                      aria-pressed={on}
                      onclick={() => openCell(p.aliasId, q.id)}
                    >
                      <span class="line-clamp-2 break-words">
                        {#if f?.mark}<b>{MARK_SYMBOL[f.mark]}</b>{/if}
                        {#if revised}<span class="text-[var(--accent)]" title="changed since you marked it">↻</span>{/if}
                        {#if f?.message}<span title="you sent a message">✉</span>{/if}
                        {#if v}{v}{:else}<span class={label}>-</span>{/if}
                      </span>
                    </button>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if people.length === 0}<p class={label}>// no students yet.</p>{/if}

      {#if cell}
        {@const c = cell}
        {@const qi = fq.findIndex((q) => q.id === c.qid)}
        {@const q = fq[qi]}
        {@const who = people.find((p) => p.aliasId === c.aliasId)}
        {@const raw = rowOf(c.aliasId)?.answers[c.qid]}
        {@const v = q ? shownAnswer(q, raw) : ''}
        {@const f = fbOf(c.aliasId, c.qid)}
        {#if q}
          <section class="mt-2 p-3 rounded border-2 border-[var(--accent)] space-y-2" aria-label="Feedback">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <div class={heading}>// feedback · {who?.alias ?? 'student'} · Q{qi + 1}</div>
              <button type="button" class="hover:text-[var(--accent)] cursor-pointer {label}" onclick={() => (cell = null)}>[close]</button>
            </div>
            <p class="{label} line-clamp-2" title={q.text}>{q.text}</p>
            <div class="p-2 rounded bg-[var(--well)] whitespace-pre-wrap break-words text-sm">{v || '(no answer yet)'}</div>
            {#if f && isRevised(f, raw)}
              <p class="text-[var(--accent)]">↻ changed since you marked it. it was: <span class="whitespace-pre-wrap">{shownAnswer(q, f.answer) || '(blank)'}</span></p>
            {/if}
            <div class="flex flex-wrap gap-2">
              {#each [['right', '✓ right'], ['partial', '◐ partly'], ['wrong', '✗ not yet']] as [m, text] (m)}
                {@const active = f?.mark === m}
                <button
                  type="button"
                  class={fbBtn}
                  style="border-color: {MARK_COLOR[m as Mark]}; {active ? `background: ${MARK_COLOR[m as Mark]}; color: var(--bg)` : `color: ${MARK_COLOR[m as Mark]}`}"
                  aria-pressed={active}
                  title={active ? 'Take this mark off' : 'Mark it (sends your message too)'}
                  disabled={fbBusy}
                  onclick={() => markIt(m as Mark)}
                >[{text}]</button>
              {/each}
            </div>
            <textarea
              bind:this={draftBox}
              class="w-full p-2 rounded border border-[var(--line)] bg-[var(--bg)] text-sm focus:outline-none focus:border-[var(--accent)]"
              rows="2"
              maxlength={FEEDBACK_MESSAGE_MAX}
              placeholder="A message just for this student (Enter sends, Shift+Enter for a new line)"
              bind:value={draft}
              onkeydown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            ></textarea>
            {#if recentMessages.length}
              <div class="flex flex-wrap gap-1">
                {#each recentMessages as msg (msg)}
                  <span class="inline-flex max-w-[16rem] items-center rounded border border-[var(--line)] hover:border-[var(--accent)] {label}">
                    <button
                      type="button"
                      class="truncate px-1.5 py-0.5 cursor-pointer"
                      title={`Use: ${msg}`}
                      onclick={() => {
                        draft = msg;
                        draftBox?.focus();
                      }}
                    >{msg}</button>
                    <button type="button" class="px-1 cursor-pointer hover:text-[var(--bad)]" title="Remove from this list" aria-label="Remove this saved message" onclick={() => forgetMessage(msg)}>×</button>
                  </span>
                {/each}
              </div>
            {/if}
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="{fbBtn} border-[var(--accent)] text-[var(--accent)]" disabled={fbBusy || draft.trim() === (f?.message ?? '')} onclick={sendMessage}>[send]</button>
              <button type="button" class="hover:text-[var(--accent)] cursor-pointer disabled:opacity-50" disabled={fbBusy} onclick={nextNeeding}>[next waiting →]</button>
              {#if f}
                <button type="button" class="hover:text-[var(--bad)] cursor-pointer disabled:opacity-50 {label}" disabled={fbBusy} onclick={() => saveFb(null, '')}>[clear feedback]</button>
              {/if}
              {#if v && onspotlight}
                <button type="button" class="hover:text-[var(--accent)] cursor-pointer {label}" title="Show this answer on the projector (no name)" onclick={() => showAnswer(`Q${qi + 1}`, v, q.kind === 'math')}>[answer → screen]</button>
              {/if}
              <span class="text-xs {draft.length > FEEDBACK_MESSAGE_MAX - 40 ? 'text-[var(--warn)]' : label}">{draft.length}/{FEEDBACK_MESSAGE_MAX}</span>
            </div>
            {#if fbStatus}<p class="{fbStatus.startsWith('// not saved') ? 'text-[var(--warn)]' : label}" aria-live="polite">{fbStatus}</p>{/if}
          </section>
        {/if}
      {:else if waitingCount}
        <button type="button" class="mt-2 hover:text-[var(--accent)] cursor-pointer font-bold" onclick={nextNeeding}>[start marking: {waitingCount} waiting →]</button>
      {/if}
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
                  {#if onspotlight && t.answered}
                    <button type="button" class="underline hover:text-[var(--accent)] cursor-pointer" onclick={() => onspotlight(pollOf(q, qi))}>[results → screen]</button>
                  {/if}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each people as p (p.aliasId)}
              {@const r = rowOf(p.aliasId)}
              <tr class="border-b border-[var(--line)] align-top">
                <td class="py-1 pr-3 whitespace-nowrap {p.here ? '' : label}">{p.alias}</td>
                {#each shown.questions as q, qi (q.id)}
                  {@const v = shownAnswer(q, r?.answers[q.id])}
                  <td class="py-1 pr-3 max-w-[14rem] {cellCls(r?.correct[q.id])}" title={v}>
                    {#if v && onspotlight}
                      <button
                        type="button"
                        class="text-left line-clamp-2 break-words hover:underline cursor-pointer"
                        title="Show this answer on the projector (no name)"
                        onclick={() => showAnswer(`Q${qi + 1}`, v, q.kind === 'math')}
                      >{r?.correct[q.id] === true ? '✓ ' : r?.correct[q.id] === false ? '✗ ' : ''}{v}</button>
                    {:else if v}
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
            {#if v.trim()}
              <span class="whitespace-pre-wrap break-words">
                {v}
                {#if onspotlight}
                  <button type="button" class="ml-1 underline hover:text-[var(--accent)] cursor-pointer" onclick={() => showAnswer(shown?.title ?? "", v, false)}>[show]</button>
                {/if}
              </span>
            {:else}<span class={label}>-</span>{/if}
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
