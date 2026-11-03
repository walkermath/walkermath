// functions/api/class/notes.js
//   GET  ?run=<runId>                 -> { notes: { moduleId: text } }
//   POST { runId, moduleId, text }    -> { ok, updatedAt }   (empty text removes the note)
// A student's personal notes on a lesson, live or finished. Private: only the student who wrote a
// note can read it; who is writing comes from the session, never from the request.

import { fail, json, readJson } from '../../../src/lib/server/http.ts';
import { readNotes, saveNote, NOTE_MAX } from '../../../src/lib/server/notes.ts';
import { currentStudent } from '../../../src/lib/server/sessions.ts';

export async function onRequestGet({ request, env }) {
  const s = await currentStudent(env, request);
  if (!s) return fail('Sign in to your class first.', 401);
  const notes = await readNotes(env.DB, s, new URL(request.url).searchParams.get('run'));
  if (!notes) return fail('Not found.', 404);
  return json({ notes });
}

export async function onRequestPost({ request, env }) {
  const s = await currentStudent(env, request);
  if (!s) return fail('Sign in to your class first.', 401);
  const body = await readJson(request, NOTE_MAX * 4 + 1000);
  if (!body) return fail('Invalid request.');
  const r = await saveNote(env.DB, s, body.runId, body.moduleId, body.text);
  if (!r.ok) return fail(r.error, r.status);
  return json({ ok: true, updatedAt: r.updatedAt });
}
