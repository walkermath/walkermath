// functions/api/teach/_middleware.js
// Every /api/teach/* route requires a signed-in teacher on the allowlist.
// Writes must also come from this site's own pages (Origin check).

import { isAllowedOrigin, json } from '../../../src/lib/server/http.ts';
import { currentTeacher } from '../../../src/lib/server/sessions.ts';

export async function onRequest(context) {
  const { request, env } = context;
  if (!isAllowedOrigin(request)) return json({ error: 'Bad origin.' }, 403);

  const teacher = await currentTeacher(env, request);
  if (!teacher) return json({ error: 'Not signed in.' }, 401);

  context.data.teacher = teacher;
  return context.next();
}
