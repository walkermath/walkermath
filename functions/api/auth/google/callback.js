// functions/api/auth/google/callback.js
// Finishes teacher sign-in.
//
// 1. Check `state` against the cookie set in start.js.
// 2. Exchange the code at Google's token endpoint (client secret + PKCE verifier).
// 3. Read the ID token's claims and check issuer, audience, expiry, nonce and email_verified.
//    The token comes straight from Google over TLS in this server-to-server call, so per OpenID
//    Connect Core 3.1.3.7 the TLS connection stands in for signature verification. No library needed.
// 4. The verified email must be on the TEACHER_ACCOUNTS allowlist; otherwise nothing is stored.
// 5. Upsert the teacher row, start a session, go to /teach.

import { base64urlDecode, newId, safeEqual } from '../../../../src/lib/server/crypto.ts';
import { clearCookie, readCookie, redirect } from '../../../../src/lib/server/http.ts';
import { teacherAccounts } from '../../../../src/lib/server/accounts.ts';
import { OAUTH_COOKIE, startTeacherSession } from '../../../../src/lib/server/sessions.ts';

const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

function back(reason, extraCookies = []) {
  const headers = new Headers();
  headers.append('Set-Cookie', clearCookie(OAUTH_COOKIE));
  for (const c of extraCookies) headers.append('Set-Cookie', c);
  return redirect(reason ? `/teach?signin=${reason}` : '/teach', headers);
}

function readIdToken(idToken) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
  } catch {
    return null;
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return back('cancelled');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';
  const [savedState, nonce, verifier] = (readCookie(request, OAUTH_COOKIE) || '').split('.');
  if (!code || !savedState || !nonce || !verifier || !safeEqual(state, savedState)) return back('expired');

  // Exchange the code.
  let tokens;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${url.origin}/api/auth/google/callback`,
        grant_type: 'authorization_code',
        code_verifier: verifier
      })
    });
    if (!res.ok) return back('failed');
    tokens = await res.json();
  } catch {
    return back('failed');
  }

  const claims = readIdToken(tokens?.id_token);
  const now = Date.now();
  if (
    !claims ||
    !GOOGLE_ISSUERS.has(claims.iss) ||
    claims.aud !== env.GOOGLE_CLIENT_ID ||
    typeof claims.exp !== 'number' ||
    claims.exp * 1000 < now ||
    typeof claims.nonce !== 'string' ||
    !safeEqual(claims.nonce, nonce) ||
    claims.email_verified !== true ||
    typeof claims.sub !== 'string' ||
    typeof claims.email !== 'string'
  ) {
    return back('failed');
  }

  const email = claims.email.toLowerCase();
  const account = teacherAccounts(env).get(email);
  if (!account) return back('denied'); // nothing about this person is stored

  const displayName = typeof claims.name === 'string' ? claims.name.slice(0, 80) : '';
  const db = env.DB;
  const existing = await db.prepare('SELECT id FROM teachers WHERE google_sub = ?1').bind(claims.sub).first();
  let teacherId = existing?.id;
  if (teacherId) {
    await db
      .prepare(
        'UPDATE teachers SET email = ?2, display_name = ?3, board_code = ?4, sandbox = ?5, last_login_at = ?6 WHERE id = ?1'
      )
      .bind(teacherId, email, displayName, account.boardCode, account.sandbox ? 1 : 0, now)
      .run();
  } else {
    teacherId = newId();
    await db
      .prepare(
        `INSERT INTO teachers (id, google_sub, email, display_name, board_code, sandbox, created_at, last_login_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`
      )
      .bind(teacherId, claims.sub, email, displayName, account.boardCode, account.sandbox ? 1 : 0, now)
      .run();
  }

  const sessionCookie = await startTeacherSession(db, teacherId);
  return back('', [sessionCookie]);
}
