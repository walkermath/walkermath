// functions/api/class/_middleware.js
// Student routes. Writes must come from this site's own pages; each route checks sign-in itself
// (lookup and signin are used before a student has a session).

import { isAllowedOrigin, json } from '../../../src/lib/server/http.ts';

export async function onRequest(context) {
  if (!isAllowedOrigin(context.request)) return json({ error: 'Bad origin.' }, 403);
  return context.next();
}
