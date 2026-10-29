<!-- src/components/teach/TeacherAdmin.svelte -->
<!-- /teach/teachers (admin only): who may sign in as a teacher. Changes apply on the next request. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../lib/api.ts';
  import { btnDanger, btnMain, field, heading, label, panel } from './ui.ts';

  type Account = {
    email: string;
    boardCode: string;
    sandbox: boolean;
    note: string;
    addedAt: number;
    lastLoginAt: number | null;
    isAdmin: boolean;
  };

  let { me }: { me: string } = $props();

  let teachers = $state<Account[]>([]);
  let boardCodes = $state<string[]>([]);
  let loaded = $state(false);
  let error = $state('');
  let busy = $state(false);

  let email = $state('');
  let boardCode = $state('');
  let sandbox = $state(false);
  let note = $state('');

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

  const load = () =>
    run(async () => {
      const data = await api<{ teachers: Account[]; boardCodes: string[] }>('/api/teach/admin/teachers');
      teachers = data.teachers;
      boardCodes = data.boardCodes;
      if (!boardCode) boardCode = boardCodes[0] ?? '';
      loaded = true;
    });

  onMount(load);

  const add = () =>
    run(async () => {
      await api('/api/teach/admin/teachers', { body: { email, boardCode, sandbox, note } });
      email = '';
      note = '';
      sandbox = false;
      await load();
    });

  const update = (t: Account, patch: Partial<Account>) =>
    run(async () => {
      await api('/api/teach/admin/teachers', { method: 'PATCH', body: { email: t.email, ...patch } });
      await load();
    });

  const remove = (t: Account) =>
    run(async () => {
      if (!confirm(`Remove ${t.email}? They're signed out at once and their classes close to students. Their classes and lessons are kept: adding the email back restores them.`)) return;
      await api(`/api/teach/admin/teachers?email=${encodeURIComponent(t.email)}`, { method: 'DELETE' });
      await load();
    });

  const when = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'never');
</script>

<div class="space-y-6 text-xs">
  {#if error}
    <p class="p-3 rounded border border-[var(--bad)] text-[var(--bad)]">{error}</p>
  {/if}

  <form
    class="{panel} space-y-3"
    onsubmit={(e) => {
      e.preventDefault();
      add();
    }}
  >
    <div class={heading}>// add a teacher</div>
    <div class="grid gap-3 sm:grid-cols-[1fr_8rem_1fr]">
      <label class="block space-y-1">
        <span class={label}>Google account email</span>
        <input class={field} type="email" bind:value={email} placeholder="name@school.org" required />
      </label>
      <label class="block space-y-1">
        <span class={label}>leaderboard code</span>
        <select class={field} bind:value={boardCode}>
          {#each boardCodes as c}<option value={c}>{c}</option>{/each}
        </select>
      </label>
      <label class="block space-y-1">
        <span class={label}>note (only you see it)</span>
        <input class={field} bind:value={note} maxlength="80" placeholder="e.g. testing account" />
      </label>
    </div>
    <div class="flex flex-wrap items-center gap-4">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" bind:checked={sandbox} />
        sandbox (classes show a TEST banner; for trying things out)
      </label>
      <button type="submit" class={btnMain} disabled={busy}>[add]</button>
    </div>
    <p class="{label} leading-relaxed">
      // while your Google sign-in app is in Testing mode, also add the email as a test user in Google Cloud Console.
      new leaderboard codes are added in src/lib/teachers.ts.
    </p>
  </form>

  <div class="{panel} space-y-3">
    <div class={heading}>// teachers ({teachers.length})</div>
    {#if !loaded}
      <p class={label}>loading...</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead class={label}>
            <tr class="border-b border-[var(--border-color)]">
              <th class="py-2 pr-3 font-normal">email</th>
              <th class="py-2 pr-3 font-normal">code</th>
              <th class="py-2 pr-3 font-normal">sandbox</th>
              <th class="py-2 pr-3 font-normal">note</th>
              <th class="py-2 pr-3 font-normal">last sign-in</th>
              <th class="py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {#each teachers as t (t.email)}
              <tr class="border-b border-[var(--border-color)] last:border-0 align-middle">
                <td class="py-2 pr-3 font-bold text-sm">
                  {t.email}
                  {#if t.isAdmin}<span class="ml-1 text-[var(--accent)]">admin</span>{/if}
                  {#if t.email === me}<span class="ml-1 {label}">(you)</span>{/if}
                </td>
                <td class="py-2 pr-3">
                  <select
                    class="{field} w-24 p-1"
                    value={t.boardCode}
                    disabled={busy}
                    onchange={(e) => update(t, { boardCode: (e.currentTarget as HTMLSelectElement).value })}
                  >
                    {#each boardCodes as c}<option value={c}>{c}</option>{/each}
                  </select>
                </td>
                <td class="py-2 pr-3">
                  <input
                    type="checkbox"
                    checked={t.sandbox}
                    disabled={busy}
                    onchange={(e) => update(t, { sandbox: (e.currentTarget as HTMLInputElement).checked })}
                  />
                </td>
                <td class="py-2 pr-3">
                  <input
                    class="{field} p-1"
                    value={t.note}
                    maxlength="80"
                    disabled={busy}
                    onchange={(e) => update(t, { note: (e.currentTarget as HTMLInputElement).value })}
                  />
                </td>
                <td class="py-2 pr-3 whitespace-nowrap">{when(t.lastLoginAt)}</td>
                <td class="py-2 text-right">
                  {#if !t.isAdmin}
                    <button type="button" class={btnDanger} onclick={() => remove(t)} disabled={busy}>[remove]</button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
