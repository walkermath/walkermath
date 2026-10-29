<!-- src/components/class/ClassJoin.svelte -->
<!-- /class: students join with the class code, then their alias + PIN card (once per device). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../lib/api.ts';
  import { PIN_LENGTH } from '../../lib/classroom.ts';

  type Student = { alias: string; className: string; period: string; teacher: string; test: boolean };
  type ClassInfo = { name: string; period: string; test: boolean };

  let loading = $state(true);
  let student = $state<Student | null>(null);
  let step = $state<'code' | 'card'>('code');
  let found = $state<ClassInfo | null>(null);
  let passcode = $state('');
  let alias = $state('');
  let pin = $state('');
  let error = $state('');
  let busy = $state(false);

  onMount(async () => {
    try {
      student = (await api<{ student: Student | null }>('/api/class/me')).student;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  async function checkCode(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    busy = true;
    try {
      found = (await api<{ class: ClassInfo }>('/api/class/lookup', { body: { passcode } })).class;
      step = 'card';
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function signIn(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    busy = true;
    try {
      student = (await api<{ student: Student }>('/api/class/signin', { body: { passcode, alias, pin } })).student;
      pin = '';
    } catch (err) {
      error = (err as Error).message;
      pin = '';
    } finally {
      busy = false;
    }
  }

  async function switchStudent() {
    busy = true;
    try {
      await api('/api/class/logout', { body: {} });
    } catch {
      // signing out locally is enough to show the form again
    }
    student = null;
    found = null;
    step = 'code';
    passcode = '';
    alias = '';
    pin = '';
    busy = false;
  }

  const pinPattern = `\\d{${PIN_LENGTH}}`;

  const field =
    'w-full bg-[var(--bg-primary)] border border-[var(--border-color)] p-3 rounded font-mono text-lg tracking-wide focus:outline-none focus:border-[var(--accent)]';
  const btnMain =
    'w-full px-4 py-3 rounded border border-[var(--accent)] text-[var(--accent)] font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-surface)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
</script>

<div class="space-y-6 font-mono max-w-md mx-auto">
  <header class="border-b border-[var(--border-color)] pb-6">
    <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">walkerMath\class</h1>
    <p class="text-xs text-[var(--text-muted)] mt-1">// join your class</p>
  </header>

  {#if loading}
    <p class="text-xs text-[var(--text-muted)]">loading...</p>
  {:else if student}
    {#if student.test}
      <p class="p-3 rounded border-2 border-[var(--warn)] text-[var(--warn)] text-sm font-bold text-center">TEST CLASS</p>
    {/if}
    <section class="p-6 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-4">
      <div class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">// signed in</div>
      <div>
        <div class="text-2xl font-black break-all">{student.alias}</div>
        <div class="text-sm text-[var(--text-muted)]">{student.period} · {student.className}</div>
      </div>
      <p class="text-sm">No live lesson right now. When your teacher starts one, it will show up here.</p>
    </section>
    <p class="text-xs text-[var(--text-muted)]">
      not you?
      <button type="button" class="underline hover:text-[var(--accent)] cursor-pointer" onclick={switchStudent} disabled={busy}>switch student</button>
    </p>
  {:else if step === 'code'}
    <form class="p-6 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-4" onsubmit={checkCode}>
      <label class="block space-y-2">
        <span class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">// class code</span>
        <input
          class="{field} uppercase"
          bind:value={passcode}
          placeholder="SLOPE-318"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="16"
          required
        />
      </label>
      <p class="text-xs text-[var(--text-muted)]">it's on the board.</p>
      <button type="submit" class={btnMain} disabled={busy}>[next]</button>
    </form>
  {:else}
    {#if found?.test}
      <p class="p-3 rounded border-2 border-[var(--warn)] text-[var(--warn)] text-sm font-bold text-center">TEST CLASS</p>
    {/if}
    <form class="p-6 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-4" onsubmit={signIn}>
      <div class="text-sm">
        <span class="text-[var(--text-muted)]">joining</span>
        <span class="font-bold">{found?.period} · {found?.name}</span>
      </div>
      <label class="block space-y-2">
        <span class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">// your alias (from your card)</span>
        <input class={field} bind:value={alias} placeholder="VectorFoxK7M2" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="24" required />
      </label>
      <label class="block space-y-2">
        <span class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">// your PIN</span>
        <input
          class="{field} tracking-[0.4em]"
          bind:value={pin}
          type="password"
          inputmode="numeric"
          autocomplete="off"
          pattern={pinPattern}
          maxlength={PIN_LENGTH}
          required
        />
      </label>
      <button type="submit" class={btnMain} disabled={busy}>[sign in]</button>
      <button
        type="button"
        class="text-xs text-[var(--text-muted)] underline hover:text-[var(--accent)] cursor-pointer"
        onclick={() => {
          step = 'code';
          error = '';
        }}>wrong class? go back</button>
    </form>
    <p class="text-xs text-[var(--text-muted)] leading-relaxed">
      // you only do this once on this device. lost your card? ask your teacher for a new PIN.
    </p>
  {/if}

  {#if error}
    <p class="p-3 rounded border border-[var(--bad)] text-[var(--bad)] text-sm">{error}</p>
  {/if}
</div>
