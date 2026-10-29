// functions/api/auth/google/start.js
// Begins teacher sign-in: redirects to Google with state, nonce and a PKCE challenge.
// Those three values ride in a short-lived HttpOnly cookie and are checked in callback.js.

import { randomToken, sha256Base64url } from '../../../../src/lib/server/crypto.ts';
import { redirect, setCookie } from '../../../../src/lib/server/http.ts';
import { OAUTH_COOKIE } from '../../../../src/lib/server/sessions.ts';

export async function onRequestGet({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.AUTH_SECRET || !env.TEACHER_ACCOUNTS) {
    return redirect('/teach?signin=unconfigured');
  }

  const origin = new URL(request.url).origin;
  const state = randomToken(16);
  const nonce = randomToken(16);
  const verifier = randomToken(32);

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: await sha256Base64url(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account'
  });

  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, {
    'Set-Cookie': setCookie(OAUTH_COOKIE, `${state}.${nonce}.${verifier}`, 600)
  });
}
