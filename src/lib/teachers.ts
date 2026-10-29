// src/lib/teachers.ts
// Teachers are picked from this list, never typed. The API checks against it too, so edit it
// here and redeploy. Codes are 1-6 letters (A-Z), shown as-is on the leaderboard.
export const TEACHERS: string[] = ['WALKER'];

export const isKnownTeacher = (t: unknown): t is string => typeof t === 'string' && TEACHERS.includes(t);