<!-- src/components/teach/TeachApp.svelte -->
<!-- /teach: Google sign-in for teachers, then the class manager. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '../../lib/api.ts';
  import ClassManager from './ClassManager.svelte';

  type Teacher = { email: string; displayName: string; boardCode: string; sandbox: boolean };

  const SIGNIN_MESSAGES: Record<string, string> = {
    denied: "That Google account isn't on the teacher list. Sign in with the account you registered.",
    cancelled: 'Sign-in was cancelled.',
    expired: 'Sign-in took too long or was started in another tab. Try again.',
    failed: "Google sign-in didn't complete. Try again.",
    unconfigured: "Google sign-in isn't set up on this site yet (see docs/lessons-setup.md)."
  };

  let loading = $state(true);
  let teacher = $state<Teacher | null>(null);
  let notice = $state('');
  let error = $state('');

  onMount(async () => {
    const reason = new URLSearchParams(location.search).get('signin');
    if (reason) {
      notice = SIGNIN_MESSAGES[reason] ?? '';
      history.replaceState(null, '', location.pathname);
    }
    try {
      teacher = (await api<{ teacher: Teacher }>('/api/teach/me')).teacher;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) error = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  async function signOut() {
    try {
      await api('/api/auth/logout', { method: 'POST', body: {} });
    } finally {
      location.reload();
    }
  }
</script>

<div class="space-y-6 font-mono">
  <header class="border-b border-[var(--border-color)] pb-6 flex flex-wrap justify-between items-end gap-4">
    <div>
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">walkerMath\teach</h1>
      <p class="text-xs text-[var(--text-muted)] mt-1">// classes, rosters and live lessons</p>
    </div>
    {#if teacher}
      <div class="text-xs text-right space-y-1">
        <div class="text-[var(--text-muted)]">
          {teacher.email}
          {#if teacher.sandbox}<span class="ml-2 px-1.5 py-0.5 rounded border border-[var(--warn)] text-[var(--warn)] font-bold">SANDBOX</span>{/if}
        </div>
        <button type="button" onclick={signOut} class="hover:text-[var(--accent)] cursor-pointer">[sign out]</button>
      </div>
    {/if}
  </header>

  {#if notice}
    <p class="p-3 rounded border border-[var(--warn)] text-[var(--warn)] text-xs">{notice}</p>
  {/if}
  {#if error}
    <p class="p-3 rounded border border-[var(--bad)] text-[var(--bad)] text-xs">{error}</p>
  {/if}

  {#if loading}
    <p class="text-xs text-[var(--text-muted)]">loading...</p>
  {:else if teacher}
    {#if teacher.sandbox}
      <p class="p-3 rounded border border-[var(--warn)] text-xs text-[var(--text-muted)]">
        // sandbox account: classes here show a TEST banner to anyone who joins. use your school account for real classes.
      </p>
    {/if}
    <ClassManager />
  {:else if !error}
    <section class="p-6 border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-md space-y-4 max-w-md">
      <h2 class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">// teacher sign-in</h2>
      <p class="text-sm">Sign in with the Google account on the teacher list.</p>
      <a
        href="/api/auth/google/start"
        class="inline-block px-4 py-2 rounded border border-[var(--accent)] text-[var(--accent)] font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-surface)] transition-colors"
      >[sign in with Google]</a>
      <p class="text-xs text-[var(--text-muted)]">Students: go to <a href="/class" class="underline">/class</a> instead.</p>
    </section>
  {/if}
</div>
