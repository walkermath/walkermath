// src/lib/server/accounts.ts
// Who may sign in as a teacher. Configured with the TEACHER_ACCOUNTS setting, not in code:
//
//   TEACHER_ACCOUNTS = "walkerb@school.org=WALKER, me@gmail.com=WALKER:sandbox"
//
// Each entry is  email=BOARDCODE  with an optional  :sandbox  flag.
//   * BOARDCODE must be in src/lib/teachers.ts TEACHERS (it is the leaderboard teacher code).
//   * sandbox accounts can do everything, but their classes show a TEST banner to students and are
//     meant for trying things out; real students should only ever join a non-sandbox account's class.
// The email is the one on the Google account used to sign in. It is checked on every request, so
// removing an entry signs that account out everywhere.

import { isKnownTeacher } from '../teachers.ts';

export interface TeacherAccount {
  email: string;
  boardCode: string;
  sandbox: boolean;
}

const cache = new Map<string, Map<string, TeacherAccount>>();

export function teacherAccounts(env: { TEACHER_ACCOUNTS?: string }): Map<string, TeacherAccount> {
  const raw = env.TEACHER_ACCOUNTS || '';
  const hit = cache.get(raw);
  if (hit) return hit;

  const map = new Map<string, TeacherAccount>();
  for (const entry of raw.split(',')) {
    const [emailPart, rest = ''] = entry.split('=');
    const email = (emailPart || '').trim().toLowerCase();
    const [code = '', flag = ''] = rest.split(':');
    const boardCode = code.trim().toUpperCase();
    if (!email.includes('@') || !isKnownTeacher(boardCode)) continue;
    map.set(email, { email, boardCode, sandbox: flag.trim().toLowerCase() === 'sandbox' });
  }
  cache.set(raw, map);
  return map;
}
