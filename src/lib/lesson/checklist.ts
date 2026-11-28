// src/lib/lesson/checklist.ts
// The readiness checklist: a few short items students see when they join a lesson ("Have your
// journal out"). Part of the lesson (lessons.checklist_json), copied into the room when a delivery
// opens, and shown to students. Who has finished it is kept in the live room only, never in the
// database. Pure functions, shared by the server, the room and the screens.

export const CHECKLIST = { items: 5, chars: 80 } as const;

/** Items from a teacher (or storage), cleaned: one line each, trimmed, no blanks or repeats, capped. */
export function cleanChecklist(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n/) : [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const line = item.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHECKLIST.chars);
    if (line && !out.includes(line)) out.push(line);
    if (out.length >= CHECKLIST.items) break;
  }
  return out;
}

/** A stored value (JSON text, or missing before migration 0014) as items. */
export function parseChecklist(json: unknown): string[] {
  if (typeof json !== 'string' || !json) return [];
  try {
    return cleanChecklist(JSON.parse(json));
  } catch {
    return [];
  }
}

/**
 * Where the checklist goes on a student's screen:
 *  'block'  before the lesson starts: front and center, and the first module waits until it's done
 *  'nudge'  once the lesson is running: on the side, flashing, never blocking work
 *  null     nothing to show (no items, already done, or the lesson is over)
 */
export function checklistMode(items: readonly string[], done: boolean, status: 'waiting' | 'live' | 'ended'): 'block' | 'nudge' | null {
  if (!items.length || done || status === 'ended') return null;
  return status === 'waiting' ? 'block' : 'nudge';
}
