# Lessons setup (Phase 2: teachers and classes)

Three one-time steps: a Google sign-in client, four settings, and the database tables.
Then a local test, then production.

## 1. Google sign-in client (about 10 minutes)

1. Go to <https://console.cloud.google.com/> signed in with your **personal** Google account
   (a school account may not be allowed to create projects).
2. Create a project, e.g. `walkermath`.
3. **APIs & Services > OAuth consent screen** (Google Auth Platform > Branding / Audience):
   - User type: **External**. App name: walkerMath. Support email: yours.
   - Scopes: none to add (`openid`, `email`, `profile` are included by default).
   - Audience / Test users: add **both** teacher emails. Leave the app in **Testing**:
     only listed test users can sign in, which is exactly what you want, and these scopes never
     need Google's review.
4. **APIs & Services > Credentials > Create credentials > OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs (add all that apply):
     - `http://localhost:8788/api/auth/google/callback`
     - `https://walkermath.com/api/auth/google/callback`
     - `https://www.walkermath.com/api/auth/google/callback` (only if the site is also served on www)
   - Copy the **Client ID** and **Client secret**.

Locally, always open the site as `http://localhost:8788`, not `127.0.0.1:8788`: the redirect URI
and the sign-in cookies are tied to the exact host name.

If signing in with your school account shows "Access blocked: ... admin has restricted", your
district's Google admin limits third-party apps for staff. Ask IT to trust the app's Client ID,
and use the sandbox account until then.

## 2. Settings

Locally: copy `.dev.vars.example` to `.dev.vars` and fill it in (`.dev.vars` is git-ignored).

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | from step 1 |
| `GOOGLE_CLIENT_SECRET` | from step 1 |
| `TEACHER_ACCOUNTS` | `walkerb@castleberryisd.net=WALKER, <sandbox Google email>=WALKER:sandbox` |
| `AUTH_SECRET` | long random string: `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"` |

The sandbox email must be the address of the Google account you actually sign in with. A
forwarding address only works if a Google account was created with it.

Production: Cloudflare dashboard > Workers & Pages > walkermath > Settings > Variables and
Secrets. Add all four, marking `GOOGLE_CLIENT_SECRET` and `AUTH_SECRET` as **Secret** (Encrypt).
Use a **different** `AUTH_SECRET` from the local one. Never change it once students have cards:
every PIN is keyed with it.

## 3. Database tables

```sh
# local (the database wrangler pages dev uses)
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0001_teachers_classes.sql

# production (once, when you're ready to deploy)
npx wrangler d1 execute walkermath-leaderboards --remote --file migrations/0001_teachers_classes.sql
```

It only adds tables; `leaderboard_entries` is untouched. Running it twice is harmless.

## 4. Try it locally

```sh
npm run build
npx wrangler pages dev dist
```

(The live Worker isn't needed for Phase 2 pages; run it too if you also want `/live-test`.)

1. <http://localhost:8788/teach>: sign in with Google, create a class, make a few cards.
2. Print or download the CSV (PINs are shown only then).
3. In a **private window** (a separate "device"): <http://localhost:8788/class>, enter the class
   code, then an alias and PIN from a card.
4. Back in `/teach`: the roster shows 1 signed-in device for that alias. Try **new PIN**,
   **retire**, **new code** with and without "sign every student device out", and **archive**.
5. Sign in with the sandbox account: its classes show a TEST banner to students.

## What's stored

No student names, emails or school IDs. Aliases, keyed PIN hashes, class settings, and hashed
session tokens. Rate-limit counters use a keyed hash of the IP and expire within a day. Your
alias-to-student key stays in your own log or protected sheet.
