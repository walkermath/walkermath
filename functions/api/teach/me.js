// functions/api/teach/me.js
import { json } from '../../../src/lib/server/http.ts';

export function onRequestGet({ data }) {
  const t = data.teacher;
  return json({
    teacher: { email: t.email, displayName: t.displayName, boardCode: t.boardCode, sandbox: t.sandbox }
  });
}
