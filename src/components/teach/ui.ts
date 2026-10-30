// src/components/teach/ui.ts
// Shared Tailwind class strings for the teacher screens, so they all look like ClassManager.

export const field =
  'w-full bg-[var(--bg-primary)] border border-[var(--line)] p-2 rounded font-mono text-sm focus:outline-none focus:border-[var(--accent)]';
export const btn =
  'px-3 py-1.5 rounded border border-[var(--line)] text-xs hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
export const btnDanger =
  'px-3 py-1.5 rounded border border-[var(--line)] text-xs hover:border-[var(--bad)] hover:text-[var(--bad)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
export const btnMain =
  'px-3 py-1.5 rounded border border-[var(--accent)] text-[var(--accent)] text-xs font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-surface)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
export const panel = 'p-5 border border-[var(--line)] bg-[var(--bg-surface)] rounded-md';
export const heading = 'text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]';
export const label = 'text-[var(--text-muted)]';

/** 'Tue, Nov 3' for a 'YYYY-MM-DD' date (no time-zone shifting). */
export function niceDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Today's date as 'YYYY-MM-DD' on this device. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
