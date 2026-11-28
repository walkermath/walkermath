<!-- src/components/teach/GradeLesson.svelte -->
<!-- Grading after class, for one lesson across its deliveries (periods). One question at a time:
       - Long answers: each student's answer with points and a comment.
       - Automatically marked questions: answers grouped by what was written, with the automatic
         mark; "give credit" overrides a whole group (or one student) with full or partial points.
     Release scores per module, per period or for every period shown. Students see grades and
     comments only after release. Scores come from the same scoreModule the reports use. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '../../lib/api.ts';
  import { QUESTION_KINDS, answerText, gradeAnswer, keyText, pointsOf, type Question } from '../../lib/questions/index.ts';
  import { btn, btnMain, field, heading, label, niceDate, panel } from './ui.ts';

  type Grade = { runId: string; moduleId: string; aliasId: string; questionId: string; score: number; max: number; comment: string; source: string; answer: string; at: number };
  type Run = {
    id: string;
    className: string;
    period: string;
    date: string;
    startTime: string;
    status: string;
    modules: { id: string; title: string; questions: Question[]; releasedAt: number | null }[];
    submissions: { moduleId: string; aliasId: string; alias: string; answers: Record<string, string> }[];
    grades: Grade[];
  };

  let { lessonId }: { lessonId: string } = $props();

  let title = $state('');
  let runs = $state<Run[]>([]);
  let loading = $state(true);
  let error = $state('');
  let status = $state('');
  /** Periods shown (run ids); all by default. */
  let shown = $state<Set<string>>(new Set());
  let ungradedOnly = $state(false);
  let openGroup = $state<string | null>(null);

  onMount(load);
  async function load() {
    loading = true;
    try {
      const v = await api<{ lesson: { title: string }; runs: Run[] }>(`/api/teach/lessons/${lessonId}/grading`);
      title = v.lesson.title;
      runs = v.runs;
      shown = new Set(v.runs.map((r) => r.id));
      error = '';
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Could not load this lesson.';
    } finally {
      loading = false;
    }
  }

  const visible = $derived(runs.filter((r) => shown.has(r.id)));
  /** The lesson's graded modules, in order (from the first delivery that has each). */
  const modules = $derived.by(() => {
    const out: { id: string; title: string; questions: Question[] }[] = [];
    for (const r of runs) for (const m of r.modules) if (!out.some((x) => x.id === m.id)) out.push(m);
    return out;
  });

  const gradeKey = (runId: string, moduleId: string, aliasId: string, qid: string) => `${runId}|${moduleId}|${aliasId}|${qid}`;
  const grades = $derived(new Map(runs.flatMap((r) => r.grades.map((g) => [gradeKey(g.runId, g.moduleId, g.aliasId, g.questionId), g] as const))));

  /** Every answer to one question in the periods shown (blank ones left out). */
  function answersTo(moduleId: string, q: Question) {
    return visible.flatMap((r) => {
      const rq = r.modules.find((m) => m.id === moduleId)?.questions.find((x) => x.id === q.id);
      if (!rq) return [];
      return r.submissions
        .filter((s) => s.moduleId === moduleId && (s.answers[q.id] ?? '').trim())
        .map((s) => ({ runId: r.id, aliasId: s.aliasId, alias: s.alias, period: r.period, answer: s.answers[q.id], q: rq, grade: grades.get(gradeKey(r.id, moduleId, s.aliasId, q.id)) }));
    });
  }

  /** Same written answer, same group: ignoring case and spacing, as the checker reads it. */
  const norm = (q: Question, a: string) => (answerText(q, a) ?? a).trim().toLowerCase().replace(/\s+/g, ' ');
  function groups(moduleId: string, q: Question) {
    const by = new Map<string, ReturnType<typeof answersTo>>();
    for (const a of answersTo(moduleId, q)) by.set(norm(a.q, a.answer), [...(by.get(norm(a.q, a.answer)) ?? []), a]);
    return [...by.entries()]
      .map(([k, list]) => ({ key: k, shown: answerText(list[0].q, list[0].answer) ?? list[0].answer, list, auto: gradeAnswer(list[0].q, list[0].answer).status }))
      .sort((a, b) => (a.auto === b.auto ? b.list.length - a.list.length : a.auto === 'right' ? 1 : b.auto === 'right' ? -1 : 0));
  }

  const MARK: Record<string, string> = { right: '✓', wrong: '✗', partial: '◐' };

  async function save(moduleId: string, items: { runId: string; aliasId: string; questionId: string; score: number | null; comment: string }[]) {
    if (!items.length) return;
    status = 'saving…';
    try {
      const r = await api<{ saved: Grade[] }>(`/api/teach/lessons/${lessonId}/grading`, { body: { grades: items.map((i) => ({ ...i, moduleId })) } });
      for (const it of items) {
        const run = runs.find((x) => x.id === it.runId);
        if (!run) continue;
        run.grades = run.grades.filter((g) => !(g.moduleId === moduleId && g.aliasId === it.aliasId && g.questionId === it.questionId));
      }
      for (const g of r.saved) runs.find((x) => x.id === g.runId)?.grades.push(g);
      status = 'saved.';
    } catch (e) {
      status = e instanceof ApiError ? e.message : 'Could not save. Check your connection and try again.';
    }
  }

  /** A long answer's points or comment changed. */
  function setLong(moduleId: string, a: ReturnType<typeof answersTo>[number], score: string, comment: string) {
    const n = score.trim() === '' ? null : Number(score);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return (status = 'Points must be a number, 0 or more.');
    save(moduleId, [{ runId: a.runId, aliasId: a.aliasId, questionId: a.q.id, score: n, comment: n === null ? '' : comment }]);
  }

  /** Give a whole group (or one student) points: an override of the automatic mark. null = back to automatic. */
  function credit(moduleId: string, list: ReturnType<typeof answersTo>, score: number | null) {
    save(moduleId, list.map((a) => ({ runId: a.runId, aliasId: a.aliasId, questionId: a.q.id, score, comment: score === null ? '' : a.grade?.comment ?? '' })));
  }

  async function release(moduleId: string, runIds: string[], released: boolean) {
    status = released ? 'releasing…' : 'taking back…';
    try {
      await api(`/api/teach/lessons/${lessonId}/grading`, { body: { release: { runIds, moduleId, released } } });
      const now = Date.now();
      for (const r of runs) if (runIds.includes(r.id)) for (const m of r.modules) if (m.id === moduleId) m.releasedAt = released ? now : null;
      status = released ? 'released: students can see these grades now.' : 'taken back: students no longer see these grades.';
    } catch (e) {
      status = e instanceof ApiError ? e.message : 'Could not change the release.';
    }
  }

  const ungradedIn = (moduleId: string, q: Question) => (q.kind === 'long' ? answersTo(moduleId, q).filter((a) => !a.grade).length : 0);
  const time = (ms: number) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const plain = (s: string) => s.replace(/\$+/g, '').replace(/\s+/g, ' ').trim();
</script>

<div class="space-y-5 text-sm">
  <div class="flex flex-wrap items-baseline gap-3">
    <a href="/teach" class="hover:text-[var(--accent)]">[&lt; lessons]</a>
    <h1 class="text-xl font-bold">grading · {title}</h1>
  </div>

  {#if loading}
    <p class={label}>// loading…</p>
  {:else if error}
    <p class="text-[var(--bad)]">// {error}</p>
  {:else if !runs.length}
    <p class={label}>// nothing to grade yet: this lesson hasn't been taught.</p>
  {:else if !modules.length}
    <p class={label}>// this lesson has no questions to grade.</p>
  {:else}
    <div class="flex flex-wrap items-center gap-2">
      <span class={label}>periods:</span>
      {#each runs as r (r.id)}
        <label class="flex items-center gap-1 px-2 py-1 rounded border {shown.has(r.id) ? 'border-[var(--accent)]' : 'border-[var(--line)]'} cursor-pointer">
          <input
            type="checkbox"
            checked={shown.has(r.id)}
            onchange={(e) => {
              const next = new Set(shown);
              if (e.currentTarget.checked) next.add(r.id);
              else next.delete(r.id);
              shown = next;
            }}
          />
          {r.period} {r.className} <span class={label}>· {niceDate(r.date)}{r.status === 'live' ? ' · live now' : ''}</span>
        </label>
      {/each}
      <label class="flex items-center gap-1 ml-auto"><input type="checkbox" bind:checked={ungradedOnly} /> long answers: ungraded only</label>
    </div>
    {#if status}<p class={label} aria-live="polite">// {status}</p>{/if}

    {#each modules as m (m.id)}
      <section class="{panel} space-y-4">
        <div class="flex flex-wrap items-baseline gap-3">
          <h2 class="text-base font-bold flex-1">{m.title}</h2>
          {#if visible.length > 1}
            {@const unreleased = visible.filter((r) => r.modules.some((x) => x.id === m.id && !x.releasedAt)).map((r) => r.id)}
            {#if unreleased.length}
              <button type="button" class={btnMain} onclick={() => release(m.id, unreleased, true)}>[release for {unreleased.length} period{unreleased.length === 1 ? '' : 's'}]</button>
            {/if}
          {/if}
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {#each visible as r (r.id)}
            {@const rm = r.modules.find((x) => x.id === m.id)}
            {#if rm}
              <span>
                {r.period}:
                {#if rm.releasedAt}
                  <span class="text-[var(--ok)]">released {time(rm.releasedAt)}</span>
                  <button type="button" class="hover:text-[var(--bad)] cursor-pointer {label}" onclick={() => release(m.id, [r.id], false)}>[take back]</button>
                {:else}
                  <span class="text-[var(--warn)]">not released</span>
                  <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={() => release(m.id, [r.id], true)}>[release]</button>
                {/if}
              </span>
            {/if}
          {/each}
        </div>
        <p class="text-xs {label} help-text">// students see your grades and comments for a module once you release it. automatic ✓/✗ marks show as soon as the module closes, as always.</p>

        {#each m.questions as q, qi (q.id)}
          {@const worth = pointsOf(q)}
          <div class="space-y-2 pt-3 border-t border-[var(--line)]">
            <div class="flex flex-wrap items-baseline gap-2">
              <span class="font-bold">Q{qi + 1}</span>
              <span class={label}>{QUESTION_KINDS[q.kind]?.label ?? q.kind} · {worth} point{worth === 1 ? '' : 's'}</span>
              {#if q.kind === 'long' && ungradedIn(m.id, q)}<span class="text-[var(--warn)] text-xs">{ungradedIn(m.id, q)} to grade</span>{/if}
            </div>
            <p>{plain(q.text)}</p>
            {#if q.kind === 'long'}
              {@const list = answersTo(m.id, q).filter((a) => !ungradedOnly || !a.grade)}
              {#if q.rubric}<p class="text-xs p-2 rounded bg-[var(--bg-primary)]"><span class={label}>rubric:</span> {q.rubric}</p>{/if}
              {#if !list.length}<p class={label}>// {ungradedOnly ? 'everything here is graded.' : 'no answers.'}</p>{/if}
              {#each list as a (a.runId + a.aliasId)}
                <div class="grid gap-2 md:grid-cols-[1fr_16rem] p-2 rounded border {a.grade ? 'border-[var(--line)]' : 'border-[var(--warn)]'}">
                  <div class="min-w-0">
                    <div class="text-xs {label}">{a.alias} · {a.period}</div>
                    <p class="whitespace-pre-wrap break-words">{a.answer}</p>
                  </div>
                  <div class="space-y-1">
                    <div class="flex items-center gap-1">
                      <input
                        type="number"
                        class="{field} w-20 p-1"
                        min="0"
                        max={worth}
                        step="0.5"
                        aria-label="Points for {a.alias}"
                        value={a.grade ? String(a.grade.score) : ''}
                        onchange={(e) => setLong(m.id, a, e.currentTarget.value, a.grade?.comment ?? '')}
                      />
                      <span class={label}>/ {worth}</span>
                      <button type="button" class="hover:text-[var(--accent)] cursor-pointer text-xs" onclick={() => setLong(m.id, a, String(worth), a.grade?.comment ?? '')}>[full]</button>
                      <button type="button" class="hover:text-[var(--accent)] cursor-pointer text-xs" onclick={() => setLong(m.id, a, '0', a.grade?.comment ?? '')}>[0]</button>
                    </div>
                    <textarea
                      class="{field} p-1 text-xs"
                      rows="2"
                      maxlength="400"
                      placeholder={a.grade ? 'comment (optional)' : 'give points first, then a comment'}
                      disabled={!a.grade}
                      aria-label="Comment for {a.alias}"
                      value={a.grade?.comment ?? ''}
                      onchange={(e) => a.grade && setLong(m.id, a, String(a.grade.score), e.currentTarget.value)}
                    ></textarea>
                  </div>
                </div>
              {/each}
            {:else}
              {@const gs = groups(m.id, q)}
              <p class="text-xs {label}">key: {keyText(q) || '(none)'}</p>
              {#if !gs.length}<p class={label}>// no answers.</p>{/if}
              <div class="space-y-1">
                {#each gs as g (g.key)}
                  {@const given = g.list.filter((a) => a.grade)}
                  {@const allSame = given.length === g.list.length && given.every((a) => a.grade?.score === given[0].grade?.score)}
                  <div class="p-2 rounded border border-[var(--line)] space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="w-5 {g.auto === 'right' ? 'text-[var(--ok)]' : g.auto === 'partial' ? 'text-[var(--warn)]' : 'text-[var(--bad)]'}">{MARK[g.auto] ?? '·'}</span>
                      <span class="font-mono break-all flex-1 min-w-0">{g.shown}</span>
                      <button type="button" class="{label} hover:text-[var(--accent)] cursor-pointer text-xs" onclick={() => (openGroup = openGroup === `${q.id}|${g.key}` ? null : `${q.id}|${g.key}`)}>
                        {g.list.length} student{g.list.length === 1 ? '' : 's'}
                      </button>
                      {#if given.length}
                        <span class="text-xs text-[var(--accent)]">{allSame ? `given ${given[0].grade?.score} / ${worth}` : `${given.length} overridden`}</span>
                        <button type="button" class="text-xs hover:text-[var(--bad)] cursor-pointer" onclick={() => credit(m.id, given, null)}>[back to automatic]</button>
                      {/if}
                      {#if g.auto !== 'right' || given.length}
                        <button type="button" class="text-xs hover:text-[var(--accent)] cursor-pointer" onclick={() => credit(m.id, g.list, worth)}>[give full credit]</button>
                      {/if}
                      <label class="flex items-center gap-1 text-xs">
                        <span class={label}>or</span>
                        <input
                          type="number"
                          class="{field} w-16 p-1"
                          min="0"
                          max={worth}
                          step="0.5"
                          aria-label="Points for everyone who answered {g.shown}"
                          onchange={(e) => {
                            const n = Number(e.currentTarget.value);
                            if (e.currentTarget.value !== '' && Number.isFinite(n) && n >= 0) credit(m.id, g.list, n);
                            e.currentTarget.value = '';
                          }}
                        />
                        <span class={label}>/ {worth}</span>
                      </label>
                    </div>
                    {#if openGroup === `${q.id}|${g.key}`}
                      <ul class="pl-7 text-xs space-y-0.5">
                        {#each g.list as a (a.runId + a.aliasId)}
                          <li class="flex flex-wrap items-center gap-2">
                            <span>{a.alias} · {a.period}</span>
                            {#if a.grade}
                              <span class="text-[var(--accent)]">given {a.grade.score} / {worth}</span>
                              <button type="button" class="hover:text-[var(--bad)] cursor-pointer" onclick={() => credit(m.id, [a], null)}>[undo]</button>
                            {:else if g.auto !== 'right'}
                              <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={() => credit(m.id, [a], worth)}>[give credit]</button>
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                {/each}
              </div>
              <p class="text-xs {label} help-text">// answers are grouped by what was written. "give credit" overrides the automatic mark for everyone in the group (open the count to do one student).</p>
            {/if}
          </div>
        {/each}
      </section>
    {/each}
  {/if}
</div>
