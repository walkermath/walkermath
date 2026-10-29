<!-- src/components/teach/TeachApp.svelte -->
<!-- The teacher area shell: Google sign-in, the header and sub-nav, then the screen for `view`. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '../../lib/api.ts';
  import ClassManager from './ClassManager.svelte';
  import TeachHome from './TeachHome.svelte';
  import LessonBuilder from './LessonBuilder.svelte';
  import TeacherAdmin from './TeacherAdmin.svelte';

  type View = 'home' | 'classes' | 'lesson' | 'teachers';
  type Teacher = {
    email: string;
    displayName: string;
    boardCode: string;
    sandbox: boolean;
    timeZone: string;
    isAdmin: boolean;
  };

  let { view = 'home' }: { view?: View } = $props();

  const TABS: { view: View; href: string; label: string; admin?: boolean }[] = [
    { view: 'home', href: '/teach', label: 'lessons' },
    { view: 'classes', href: '/teach/classes', label: 'classes' },
    { view: 'teachers', href: '/teach/teachers', label: 'teachers', admin: true }
  ];

  const SIGNIN_MESSAGES: Record<string, string> = {
    denied: "That Google account isn't on the teacher list. Ask the site admin to add it, or sign in with another account.",
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
      // Lesson times are typed in this device's time zone; keep the server's copy in step.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && teacher.timeZone !== tz) {
        try {
          teacher = (await api<{ teacher: Teacher }>('/api/teach/me', { method: 'PATCH', body: { timeZone: tz } })).teacher;
        } catch {
          // not fatal: the saved zone is used
        }
      }
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
      <p class="text-xs text-[var(--text-muted)] mt-1">// lessons, classes and live delivery</p>
      {#if teacher}
        <nav class="flex gap-4 text-sm mt-3">
          {#each TABS.filter((t) => !t.admin || teacher?.isAdmin) as t}
            <a
              href={t.href}
              class="hover:text-[var(--accent)] transition-colors {view === t.view || (view === 'lesson' && t.view === 'home')
                ? 'text-[var(--accent)] font-bold'
                : ''}">[{t.label}]</a
            >
          {/each}
        </nav>
      {/if}
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
    {#if view === 'classes'}
      <ClassManager />
    {:else if view === 'lesson'}
      <LessonBuilder />
    {:else if view === 'teachers'}
      {#if teacher.isAdmin}
        <TeacherAdmin me={teacher.email} />
      {:else}
        <p class="text-xs text-[var(--text-muted)]">only the site admin can manage teachers.</p>
      {/if}
    {:else}
      <TeachHome />
    {/if}
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
