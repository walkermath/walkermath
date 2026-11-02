<!-- src/components/teach/ClassManager.svelte -->
<!-- Classes, passcodes and alias rosters for the signed-in teacher. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../lib/api.ts';
  import { PERIODS } from '../../lib/classroom.ts';
  import AliasCards from './AliasCards.svelte';

  type Cls = {
    id: string;
    name: string;
    period: string;
    passcode: string;
    bellStart: string | null;
    bellEnd: string | null;
    archived: boolean;
    leaderboardPosting: boolean;
    activeAliases?: number;
  };
  type Alias = { id: string; alias: string; retired: boolean; devices: number; boardName: string | null };
  type Card = { alias: string; pin: string };

  let classes = $state<Cls[]>([]);
  let loaded = $state(false);
  let error = $state('');
  let busy = $state(false);

  // new-class form
  let showNew = $state(false);
  let newName = $state('');
  let newPeriod = $state('P1');
  let newStart = $state('');
  let newEnd = $state('');

  // open class
  let current = $state<Cls | null>(null);
  let aliases = $state<Alias[]>([]);
  let edit = $state({ name: '', period: 'P1', bellStart: '', bellEnd: '' });
  let addCount = $state(30);
  let signOutAll = $state(false);

  // cards to print (PINs are only ever shown here, right after creation)
  let cards = $state<Card[] | null>(null);

  const activeClasses = $derived(classes.filter((c) => !c.archived));
  const archivedClasses = $derived(classes.filter((c) => c.archived));
  const activeAliases = $derived(aliases.filter((a) => !a.retired));
  const retiredAliases = $derived(aliases.filter((a) => a.retired));

  async function run(task: () => Promise<void>) {
    error = '';
    busy = true;
    try {
      await task();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  const loadClasses = () =>
    run(async () => {
      classes = (await api<{ classes: Cls[] }>('/api/teach/classes')).classes;
      loaded = true;
    });

  onMount(loadClasses);

  function syncEdit(c: Cls) {
    edit = { name: c.name, period: c.period, bellStart: c.bellStart ?? '', bellEnd: c.bellEnd ?? '' };
  }

  const createClass = () =>
    run(async () => {
      const { class: c } = await api<{ class: Cls }>('/api/teach/classes', {
        body: { name: newName, period: newPeriod, bellStart: newStart || null, bellEnd: newEnd || null }
      });
      showNew = false;
      newName = '';
      newStart = '';
      newEnd = '';
      await loadClasses();
      await openClass(c.id);
    });

  async function openClass(id: string) {
    cards = null;
    await run(async () => {
      const data = await api<{ class: Cls; aliases: Alias[] }>(`/api/teach/classes/${id}`);
      current = data.class;
      aliases = data.aliases;
      syncEdit(data.class);
    });
  }

  const refreshCurrent = async () => {
    if (current) {
      const data = await api<{ class: Cls; aliases: Alias[] }>(`/api/teach/classes/${current.id}`);
      current = data.class;
      aliases = data.aliases;
    }
  };

  const saveClass = () =>
    run(async () => {
      if (!current) return;
      const { class: c } = await api<{ class: Cls }>(`/api/teach/classes/${current.id}`, {
        method: 'PATCH',
        body: { name: edit.name, period: edit.period, bellStart: edit.bellStart || null, bellEnd: edit.bellEnd || null }
      });
      current = c;
      syncEdit(c);
      await loadClasses();
    });

  /** Public leaderboard posting for lesson games: off until chosen, confirmed when turned on. */
  const setPosting = (on: boolean) =>
    run(async () => {
      if (!current) return;
      if (
        on &&
        !confirm(
          `Post ${current.period} ${current.name}'s Coliseum scores from lessons to the public leaderboard?\n\n` +
            'Scores appear under a generated leaderboard name, never the lesson alias. You can turn this off any time, but scores already posted stay on the board.'
        )
      ) {
        current.leaderboardPosting = false;
        return;
      }
      current = (await api<{ class: Cls }>(`/api/teach/classes/${current.id}`, { method: 'PATCH', body: { leaderboardPosting: on } })).class;
      await loadClasses();
    });

  const setArchived = (archived: boolean) =>
    run(async () => {
      if (!current) return;
      current = (await api<{ class: Cls }>(`/api/teach/classes/${current.id}`, { method: 'PATCH', body: { archived } })).class;
      await loadClasses();
    });

  const deleteClass = () =>
    run(async () => {
      if (!current) return;
      if (!confirm(`Delete ${current.name} (${current.period}) and all of its aliases? This can't be undone.`)) return;
      await api(`/api/teach/classes/${current.id}`, { method: 'DELETE' });
      current = null;
      aliases = [];
      await loadClasses();
    });

  const rotatePasscode = () =>
    run(async () => {
      if (!current) return;
      const msg = signOutAll
        ? 'Make a new class code AND sign every student device out of this class?'
        : 'Make a new class code? Students already signed in stay signed in.';
      if (!confirm(msg)) return;
      current = (await api<{ class: Cls }>(`/api/teach/classes/${current.id}/passcode`, { body: { signOutAll } })).class;
      signOutAll = false;
      await refreshCurrent();
      await loadClasses();
    });

  const addAliases = () =>
    run(async () => {
      if (!current) return;
      const { created } = await api<{ created: Card[] }>(`/api/teach/classes/${current.id}/aliases`, {
        body: { count: Number(addCount) }
      });
      cards = created.map(({ alias, pin }) => ({ alias, pin }));
      await refreshCurrent();
      await loadClasses();
    });

  const resetPin = (a: Alias) =>
    run(async () => {
      if (!current) return;
      if (!confirm(`New PIN for ${a.alias}? Their old card stops working and their devices are signed out.`)) return;
      const r = await api<Card>(`/api/teach/classes/${current.id}/aliases/${a.id}/pin`, { body: {} });
      cards = [{ alias: r.alias, pin: r.pin }];
      await refreshCurrent();
    });

  const setRetired = (a: Alias, retired: boolean) =>
    run(async () => {
      if (!current) return;
      if (retired && !confirm(`Retire ${a.alias}? It can't sign in until you bring it back.`)) return;
      await api(`/api/teach/classes/${current.id}/aliases/${a.id}`, { method: 'PATCH', body: { retired } });
      await refreshCurrent();
      await loadClasses();
    });

  const bells = (c: Cls) => (c.bellStart && c.bellEnd ? `${c.bellStart}-${c.bellEnd}` : 'no bell times');

  const field =
    'w-full bg-[var(--bg-primary)] border border-[var(--border-color)] p-2 rounded font-mono text-sm focus:outline-none focus:border-[var(--accent)]';
  const btn =
    'px-3 py-1.5 rounded border border-[var(--border-color)] text-xs hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  const btnDanger =
    'px-3 py-1.5 rounded border border-[var(--border-color)] text-xs hover:border-[var(--bad)] hover:text-[var(--bad)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  const btnMain =
    'px-3 py-1.5 rounded border border-[var(--accent)] text-[var(--accent)] text-xs font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-surface)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
</script>

{#if error}
  <p class="p-3 rounded border border-[var(--bad)] text-[var(--bad)] text-xs no-print">{error}</p>
{/if}

{#if cards && current}
  <AliasCards
    className={current.name}
    period={current.period}
    passcode={current.passcode}
    {cards}
    onclose={() => (cards = null)}
  />
{/if}

<div class="grid gap-6 md:grid-cols-[16rem_1fr] no-print">
  <!-- class list -->
  <aside class="space-y-3">
    <div class="flex justify-between items-center">
      <h2 class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">// classes</h2>
      <button type="button" class={btn} onclick={() => (showNew = !showNew)}>{showNew ? '[cancel]' : '[+ new]'}</button>
    </div>

    {#if showNew}
      <form
        class="p-3 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-2 text-xs"
        onsubmit={(e) => {
          e.preventDefault();
          createClass();
        }}
      >
        <label class="block space-y-1">
          <span class="text-[var(--text-muted)]">name</span>
          <input class={field} bind:value={newName} maxlength="60" placeholder="Algebra II" required />
        </label>
        <label class="block space-y-1">
          <span class="text-[var(--text-muted)]">period</span>
          <select class={field} bind:value={newPeriod}>
            {#each PERIODS as p}<option value={p}>{p}</option>{/each}
          </select>
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block space-y-1">
            <span class="text-[var(--text-muted)]">bell start</span>
            <input class={field} type="time" bind:value={newStart} />
          </label>
          <label class="block space-y-1">
            <span class="text-[var(--text-muted)]">bell end</span>
            <input class={field} type="time" bind:value={newEnd} />
          </label>
        </div>
        <button type="submit" class={btnMain} disabled={busy}>[create class]</button>
      </form>
    {/if}

    {#if !loaded}
      <p class="text-xs text-[var(--text-muted)]">loading...</p>
    {:else if classes.length === 0 && !showNew}
      <p class="text-xs text-[var(--text-muted)]">no classes yet. start with [+ new].</p>
    {/if}

    <ul class="space-y-2">
      {#each activeClasses as c (c.id)}
        <li>
          <button
            type="button"
            onclick={() => openClass(c.id)}
            class="w-full text-left p-3 rounded-md border bg-[var(--bg-surface)] transition-colors cursor-pointer {current?.id === c.id
              ? 'border-[var(--accent)]'
              : 'border-[var(--border-color)] hover:border-[var(--accent)]'}"
          >
            <div class="text-sm font-bold">{c.period} · {c.name}</div>
            <div class="text-xs text-[var(--text-muted)]">{c.activeAliases ?? 0} students · {bells(c)}</div>
          </button>
        </li>
      {/each}
    </ul>

    {#if archivedClasses.length}
      <details class="text-xs">
        <summary class="cursor-pointer text-[var(--text-muted)]">archived ({archivedClasses.length})</summary>
        <ul class="mt-2 space-y-1">
          {#each archivedClasses as c (c.id)}
            <li>
              <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={() => openClass(c.id)}>
                {c.period} · {c.name}
              </button>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  </aside>

  <!-- open class -->
  <section class="space-y-6 min-w-0">
    {#if !current}
      <p class="text-xs text-[var(--text-muted)] pt-8">pick a class, or make one with [+ new].</p>
    {:else}
      {#if current.archived}
        <p class="p-3 rounded border border-[var(--warn)] text-[var(--warn)] text-xs">
          archived: students can't join this class. <button type="button" class="underline cursor-pointer" onclick={() => setArchived(false)}>restore it</button>
        </p>
      {/if}

      <!-- class code -->
      <div class="p-5 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-3">
        <div class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">// class code (write it on the board)</div>
        <div class="text-3xl sm:text-4xl font-black tracking-widest text-[var(--accent)]">{current.passcode}</div>
        <div class="flex flex-wrap items-center gap-3 text-xs">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={signOutAll} />
            also sign every student device out
          </label>
          <button type="button" class={btn} onclick={rotatePasscode} disabled={busy}>[new code]</button>
        </div>
      </div>

      <!-- settings -->
      <form
        class="p-5 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-3 text-xs"
        onsubmit={(e) => {
          e.preventDefault();
          saveClass();
        }}
      >
        <div class="font-bold uppercase tracking-wider text-[var(--text-muted)]">// settings</div>
        <div class="grid gap-3 sm:grid-cols-[1fr_6rem_7rem_7rem]">
          <label class="block space-y-1">
            <span class="text-[var(--text-muted)]">name</span>
            <input class={field} bind:value={edit.name} maxlength="60" required />
          </label>
          <label class="block space-y-1">
            <span class="text-[var(--text-muted)]">period</span>
            <select class={field} bind:value={edit.period}>
              {#each PERIODS as p}<option value={p}>{p}</option>{/each}
            </select>
          </label>
          <label class="block space-y-1">
            <span class="text-[var(--text-muted)]">bell start</span>
            <input class={field} type="time" bind:value={edit.bellStart} />
          </label>
          <label class="block space-y-1">
            <span class="text-[var(--text-muted)]">bell end</span>
            <input class={field} type="time" bind:value={edit.bellEnd} />
          </label>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="submit" class={btnMain} disabled={busy}>[save]</button>
          {#if !current.archived}
            <button type="button" class={btn} onclick={() => setArchived(true)} disabled={busy}>[archive]</button>
          {/if}
          <button type="button" class={btnDanger} onclick={deleteClass} disabled={busy}>[delete]</button>
        </div>
        <label class="flex items-start gap-2 cursor-pointer pt-2 border-t border-[var(--border-color)]">
          <input
            type="checkbox"
            class="mt-0.5"
            checked={current.leaderboardPosting}
            disabled={busy}
            onchange={(e) => setPosting((e.currentTarget as HTMLInputElement).checked)}
          />
          <span>
            post Coliseum scores from lessons to the public leaderboard
            <span class="block text-[var(--text-muted)]">
              // off: scores are kept for you only. on: they also post under each student's generated leaderboard name
              (never their lesson alias). test classes never post.
            </span>
          </span>
        </label>
      </form>

      <!-- roster -->
      <div class="p-5 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-4 text-xs">
        <div class="flex flex-wrap justify-between items-end gap-3">
          <div class="font-bold uppercase tracking-wider text-[var(--text-muted)]">// aliases ({activeAliases.length})</div>
          <form
            class="flex items-end gap-2"
            onsubmit={(e) => {
              e.preventDefault();
              addAliases();
            }}
          >
            <label class="space-y-1">
              <span class="block text-[var(--text-muted)]">add students</span>
              <input class="{field} w-20" type="number" min="1" max="60" bind:value={addCount} />
            </label>
            <button type="submit" class={btnMain} disabled={busy || current.archived}>[make cards]</button>
          </form>
        </div>

        <p class="text-[var(--text-muted)] leading-relaxed">
          // each student gets an alias + PIN card. record which student has which alias in your own log or protected
          sheet; walkerMath never stores names. PINs are shown once, when cards are made.
        </p>

        {#if activeAliases.length === 0}
          <p class="text-[var(--text-muted)]">no aliases yet.</p>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead class="text-[var(--text-muted)]">
                <tr class="border-b border-[var(--border-color)]">
                  <th class="py-2 pr-3 font-normal">alias</th>
                  <th class="py-2 pr-3 font-normal">signed-in devices</th>
                  <th class="py-2 pr-3 font-normal" title="Their public Coliseum name. Only you see this link.">leaderboard name</th>
                  <th class="py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {#each activeAliases as a (a.id)}
                  <tr class="border-b border-[var(--border-color)] last:border-0">
                    <td class="py-2 pr-3 font-bold text-sm">{a.alias}</td>
                    <td class="py-2 pr-3">{a.devices}</td>
                    <td class="py-2 pr-3 text-[var(--text-muted)]">{a.boardName ?? '-'}</td>
                    <td class="py-2 text-right whitespace-nowrap space-x-2">
                      <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={() => resetPin(a)} disabled={busy}>[new PIN]</button>
                      <button type="button" class="hover:text-[var(--bad)] cursor-pointer" onclick={() => setRetired(a, true)} disabled={busy}>[retire]</button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

        {#if retiredAliases.length}
          <details>
            <summary class="cursor-pointer text-[var(--text-muted)]">retired ({retiredAliases.length})</summary>
            <ul class="mt-2 space-y-1">
              {#each retiredAliases as a (a.id)}
                <li class="flex justify-between gap-3">
                  <span class="text-[var(--text-muted)] line-through">{a.alias}</span>
                  <button type="button" class="hover:text-[var(--accent)] cursor-pointer" onclick={() => setRetired(a, false)} disabled={busy}>[bring back]</button>
                </li>
              {/each}
            </ul>
          </details>
        {/if}
      </div>
    {/if}
  </section>
</div>
