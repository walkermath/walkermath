<!-- src/components/teach/AliasCards.svelte -->
<!-- Freshly made alias + PIN pairs: printable cut-out cards and a CSV for the teacher's own log.
     This is the only time PINs are visible; the server keeps only a keyed hash. -->
<script lang="ts">
  type Card = { alias: string; pin: string };
  let {
    className,
    period,
    passcode,
    cards,
    onclose
  }: { className: string; period: string; passcode: string; cards: Card[]; onclose: () => void } = $props();

  const joinUrl = typeof location !== 'undefined' ? `${location.host}/class` : 'walkermath.com/class';

  function downloadCsv() {
    const rows = [['alias', 'pin', 'student'], ...cards.map((c) => [c.alias, c.pin, ''])];
    // PINs as text so spreadsheets keep leading zeros
    const csv = rows.map((r, i) => (i === 0 ? r.join(',') : `${r[0]},="${r[1]}",`)).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${period}-${className}`.replace(/[^A-Za-z0-9-]+/g, '_') + '-aliases.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function close() {
    if (confirm("Close the cards? The PINs won't be shown again (you can still give one student a new PIN later).")) onclose();
  }
</script>

<section class="print-area p-5 mb-6 border-2 border-[var(--accent)] bg-[var(--bg-surface)] rounded-md space-y-4 font-mono">
  <div class="no-print flex flex-wrap justify-between items-start gap-3">
    <div class="space-y-1">
      <div class="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
        // {cards.length} new {cards.length === 1 ? 'card' : 'cards'} · {period} {className}
      </div>
      <p class="text-xs text-[var(--text-muted)] max-w-prose">
        print or save these now: PINs are shown only this once. the CSV has a blank "student" column to fill in and keep
        in your protected sheet. hand cards out on paper or send each one through Canvas Inbox.
      </p>
    </div>
    <div class="flex flex-wrap gap-2 text-xs">
      <button type="button" onclick={() => window.print()} class="px-3 py-1.5 rounded border border-[var(--accent)] text-[var(--accent)] font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-surface)] transition-colors cursor-pointer">[print cards]</button>
      <button type="button" onclick={downloadCsv} class="px-3 py-1.5 rounded border border-[var(--border-color)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer">[download CSV]</button>
      <button type="button" onclick={close} class="px-3 py-1.5 rounded border border-[var(--border-color)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer">[done]</button>
    </div>
  </div>

  <div class="cards">
    {#each cards as c (c.alias)}
      <div class="card">
        <div class="muted">walkerMath · {period} {className}</div>
        <div class="label">go to</div>
        <div class="value">{joinUrl}</div>
        <div class="label">class code</div>
        <div class="value">{passcode}</div>
        <div class="label">your alias</div>
        <div class="alias">{c.alias}</div>
        <div class="label">your PIN</div>
        <div class="pin">{c.pin}</div>
        <div class="muted">keep this card private. don't share your PIN.</div>
      </div>
    {/each}
  </div>
</section>

<style>
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 0.75rem;
  }
  .card {
    border: 1px dashed var(--edge);
    border-radius: 0.375rem;
    padding: 0.75rem;
    break-inside: avoid;
    page-break-inside: avoid;
    font-size: 0.75rem;
    line-height: 1.35;
  }
  .label {
    color: var(--text-muted);
    margin-top: 0.4rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.65rem;
  }
  .value {
    font-weight: 700;
  }
  .alias {
    font-size: 1.05rem;
    font-weight: 900;
    word-break: break-all;
  }
  .pin {
    font-size: 1.3rem;
    font-weight: 900;
    letter-spacing: 0.25em;
  }
  .muted {
    color: var(--text-muted);
    font-size: 0.65rem;
  }
  .card > .muted:last-child {
    margin-top: 0.5rem;
  }

  @media print {
    :global(body *) {
      visibility: hidden;
    }
    .print-area,
    .print-area :global(*) {
      visibility: visible;
    }
    .print-area {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      border: none;
      padding: 0;
      margin: 0;
      background: #fff;
      color: #000;
    }
    .no-print {
      display: none !important;
    }
    .cards {
      grid-template-columns: repeat(3, 1fr);
    }
    .card {
      border-color: #888;
    }
    .label,
    .muted {
      color: #555;
    }
  }
</style>
