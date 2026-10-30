# Lessons setup (Phases 2-3: teachers, classes and the lesson builder)

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

Locally: create a file named `.dev.vars` in the project root (it is git-ignored; never commit it)
with these four lines:

```
GOOGLE_CLIENT_ID="1234567890-abc.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."
ADMIN_EMAIL="you@school.org"
AUTH_SECRET="a-long-random-string"
```

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | from step 1 |
| `GOOGLE_CLIENT_SECRET` | from step 1 |
| `ADMIN_EMAIL` | `walkerb@castleberryisd.net` (several admins: separate with commas) |
| `AUTH_SECRET` | long random string: `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"` |

The admin is always let in and is the only one who sees **[teachers]** in `/teach`, where every
other teacher account is added, removed, or marked sandbox. No setting changes or redeploys are
needed to add a teacher. (The old `TEACHER_ACCOUNTS` setting is no longer used: delete it from
`.dev.vars` and, if you added it, from the Cloudflare Secrets.)

Any email you add must be the address of the Google account that signs in. A forwarding address
only works if a Google account was created with it. While the Google app is in Testing mode, also
add each teacher as a test user in Google Cloud Console.

Production: this project manages plain variables through `wrangler.toml`, so the dashboard only
accepts **Secrets**. Add all four as Secrets: Cloudflare dashboard > Workers & Pages > walkermath >
Settings > Variables and Secrets > Add > type **Secret**. Or from the command line, one at a time
(it prompts for the value):

```sh
npx wrangler pages secret put GOOGLE_CLIENT_ID     --project-name walkermath
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name walkermath
npx wrangler pages secret put ADMIN_EMAIL          --project-name walkermath
npx wrangler pages secret put AUTH_SECRET          --project-name walkermath
```

Use a **different** `AUTH_SECRET` from the local one. Never change it once students have cards:
every PIN is keyed with it.

## 3. Database tables

Seven migrations, applied in order. They only add tables or columns (`leaderboard_entries` is untouched).
`0001`-`0003` are safe to run twice; `0004`-`0007` are not (SQLite can't add a column twice: "duplicate column
name" just means it's already applied).

```sh
# local (the database wrangler pages dev uses)
npx wrangler d1 execute walkermath-leaderboards --local --file schema.sql   # the leaderboard table (fresh local copy only; safe to re-run)
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0001_teachers_classes.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0002_allowed_teachers.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0003_lessons.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0004_lesson_topic.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0005_lesson_extras.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0006_lesson_scores.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0007_archive_prompt.sql

# production (once each, when you're ready to deploy): the same commands with --remote
```

| File | Adds |
| --- | --- |
| `schema.sql` | `leaderboard_entries`, the original Coliseum leaderboard (already in production) |
| `0001_teachers_classes.sql` | teachers, sessions, classes, aliases (Phase 2) |
| `0002_allowed_teachers.sql` | the teacher list managed in [teachers] |
| `0003_lessons.sql` | lessons, their modules, scheduled deliveries (Phase 3) |
| `0004_lesson_topic.sql` | a topic for each lesson |
| `0005_lesson_extras.sql` | standards and the Resources links on each lesson |
| `0006_lesson_scores.sql` | Coliseum games in lessons: kept scores, each class's leaderboard switch (off), students' leaderboard names |
| `0007_archive_prompt.sql` | remembers when you dismissed a lesson's "archive?" prompt |

## 4. Try it locally

Two terminals from Phase 4 on: the live room (a separate Worker) and the site.

```sh
# terminal 1: the live room (leave it running)
cd live-worker
npm install        # first time only
npx wrangler dev

# terminal 2: the site
npm run build
npx wrangler pages dev dist
```

`wrangler pages dev` finds the room Worker from terminal 1 by name (`walkermath-live`). Without it,
everything works except live lessons, which say "the live room is not available".

Teachers and classes:

1. <http://localhost:8788/teach>: sign in with the `ADMIN_EMAIL` account.
2. **[teachers]**: add your sandbox Gmail with "sandbox" ticked.
3. **[classes]**: create a class, make a few cards, print or download them (PINs are shown only then).
4. In a **private window**: <http://localhost:8788/class>, enter the class code, then an alias and PIN.
5. Back in [classes]: the roster shows 1 signed-in device. Try **new PIN**, **retire**, **new code**, **archive**.

Lesson builder (the Phase 3 gate):

1. **[lessons] > [+ new lesson]**. It starts with a locked Bellwork (5:00) and a locked Exit ticket
   (4:00). Fill in title, topic, learning objective, success criteria, duration 48.
2. With the **+** tile (new modules land before the exit ticket), build the spec's lesson: set
   Bellwork to 6:00, add Notes 10:00 (pick a note), Activity 6:00 and 7:00 (pick a category),
   Independent work 15:00, and set the Exit ticket to 4:00. Add a couple of questions with answer
   keys to the bellwork. **[save]** (or Ctrl+S).
3. The bar under the tiles should read "48:00 of 48:00 planned". Open **// what if a module runs
   long?** in the utilities column on the right, pick Notes and 1 min: the rest should become
   5:45, 6:45, 14:30, 4:00.
4. Drag a tile to reorder it (or focus it and press Alt + arrow keys), then reload: order and
   settings are kept.
5. Click the lesson tile: under **when**, add two classes (bell times fill in). They show up on the
   [lessons] home under "coming up".
6. Add a **Notes** module (it starts as one blank blackboard), add pages, or import a walkerMath note (it's cut into slides at its
   headings), and edit a slide: the preview beside it is what students will see. A line of `---`
   splits a slide when you click out of the box. A `!` on a thumbnail means the slide is taller than
   one page.

7. Add a **Coliseum Practice** activity, pick a challenge and click [try it]. Bellwork stays first and
   the exit ticket last: drag a tile toward either end and it won't pass them. Delete one and a dashed
   `+ bellwork` / `+ exit ticket` slot brings it back.
8. Under [classes], the roster has a "leaderboard name" column and the class settings have the
   leaderboard switch (off). Lesson play itself arrives with Phase 4; until then a game opened from
   [try it] while signed in as a student (/class) saves through the lesson path.

The slide renderer needs packages added to `package.json` (`unified`, `remark-*`, `rehype-*`,
including the new `rehype-sanitize`): run `npm install` once and commit the updated
`package-lock.json`, or the Cloudflare build will fail.

Live lessons (the Phase 4a gate; both terminals running):

1. Schedule a delivery for **today** (lesson tile > when), with the bell a few minutes from now. On
   [lessons], "coming up" shows **[start]**: it opens the control panel. Click **[start lesson
   now]**: the lesson is fitted to the time left before the bell.
2. In a private window, sign in as a student at /class: a **[join live lesson]** button appears
   within a few seconds. Join. The control panel's "here now" lists the alias.
3. On the control panel try **[next]**, **[<- back]**, **[+1 min]** / **[-1 min]** (the rest of the
   lesson re-plans; changed times turn blue), **[pause]** / **[resume]**, and **[go]** on a later
   module. The student screen follows within a moment. Shift + arrow keys = next / back; on a Notes
   module the arrow keys turn pages, and students can flip back through pages and return to live.
   Leave a module part-way and come back: its clock picks up where it stopped (‖ in the list).
4. Let a module's time run out: it moves on by itself (or waits, if set to "hold"). Go back to it:
   it stays at 0:00 and waits (✓ in the list); **[+1 min]** gives it a minute. The last module
   always waits for **[end lesson]**.
5. Close the student window: within a few seconds the alias turns grey with a red ○ under "here
   now" (a Chromebook that just sleeps takes up to about a minute). Reopen /class/live: it reconnects,
   turns green and catches up. Stop terminal 1 for a few seconds: both screens show "reconnecting"
   and recover when it's back.
6. **[end lesson]**: students see "the lesson is over"; the delivery can't be started again.
7. Once every delivery of a lesson is over, its tile on [lessons] gets a **/!\\**: click it to
   archive the lesson or dismiss the prompt (it comes back after the next delivery finishes).

Answering questions (and auto-collecting at time-up) is Phase 4b; the blackboard is 4c.

Tests (no install needed): `npm run test:lessons` (API, against a stand-in database),
`npm run test:pacing` (the pacing engine), `npm run test:slides` (cutting notes into slides) and
`npm run test:room` (the live room's clock and commands).

## What's stored

No student names, emails or school IDs. Aliases, keyed PIN hashes, class settings, lessons, and
hashed session tokens. Answer keys are stored apart from questions and never sent to students. Rate-limit counters use a keyed hash of the IP and expire within a day. Your
alias-to-student key stays in your own log or protected sheet.
