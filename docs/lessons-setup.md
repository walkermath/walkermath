# Lessons setup

Three one-time steps: a Google sign-in client, four settings, and the database tables.
Then a local test, then production (section 5).

The site runs as one Cloudflare Worker (`wrangler.toml`): the static Astro build is served as
files, `/api/*` runs the handlers in `functions/` through `src/worker/router.ts`, and the live
lesson rooms (a Durable Object) live in the same Worker.

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
     - `http://localhost:8787/api/auth/google/callback`
     - `https://walkermath.com/api/auth/google/callback`
     - `https://www.walkermath.com/api/auth/google/callback` (only if the site is also served on www)
   - Copy the **Client ID** and **Client secret**.

Locally, always open the site as `http://localhost:8787`, not `127.0.0.1:8787`: the redirect URI
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

Production: add all four as Secrets on the **Worker** named walkermath: Cloudflare dashboard >
Workers & Pages > walkermath (the Worker, not the old Pages project) > Settings > Variables and
Secrets > Add > type **Secret**. Or from the command line, one at a time (it prompts for the value):

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put AUTH_SECRET
```

`PROFANITY_BLOCKLIST` (optional, extra blocked words for leaderboard names) goes in the same way if
the Pages project had it.

Use a **different** `AUTH_SECRET` from the local one. Cloudflare secrets can't be read back, so if
the Pages value wasn't saved elsewhere it can't be copied to the Worker; set a new one. That only
matters if students already have cards: every PIN is keyed with the secret, so changing it makes all
existing PINs stop working (reset them from the class page) and signs everyone out once. Save the
new value in a password manager, and don't change it again after students have cards.

## 3. Database tables

Ten migrations, applied in order. They only add tables or columns (`leaderboard_entries` is untouched).
`0001`-`0003` and `0008`-`0010` are safe to run twice; `0004`-`0007` are not (SQLite can't add a column twice: "duplicate column
name" just means it's already applied).

```sh
# local (the database wrangler dev uses)
npx wrangler d1 execute walkermath-leaderboards --local --file schema.sql   # the leaderboard table (fresh local copy only; safe to re-run)
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0001_teachers_classes.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0002_allowed_teachers.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0003_lessons.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0004_lesson_topic.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0005_lesson_extras.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0006_lesson_scores.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0007_submissions.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0008_run_ink.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0009_run_joins.sql
npx wrangler d1 execute walkermath-leaderboards --local --file migrations/0010_student_notes.sql

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
| `0007_submissions.sql` | students' answers in live lessons; which delivery a game score belongs to; each delivery's final timing |
| `0008_run_ink.sql` | what you wrote on each page of a delivery, kept when it ends |
| `0009_run_joins.sql` | when each student first joined a delivery (the reports' Joined column) |
| `0010_student_notes.sql` | students' personal notes on a lesson (private to each student) |

## 4. Try it locally

One terminal: build the site, then run the Worker (the site, the API and the live rooms together).

```sh
npm run build
npx wrangler dev          # http://localhost:8787
```

(`npm run start` does both.) After changing code, stop it, build again and restart. The local
database is the one the migrations above were run on; if the site acts as if it's empty after the
move from Pages, run the migrations again (`0001`-`0003` and `0008`-`0010` are safe to repeat).

Teachers and classes:

1. <http://localhost:8787/teach>: sign in with the `ADMIN_EMAIL` account.
2. **[teachers]**: add your sandbox Gmail with "sandbox" ticked.
3. **[classes]**: create a class, make a few cards, print or download them (PINs are shown only then).
4. In a **private window**: <http://localhost:8787/class>, enter the class code, then an alias and PIN.
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

Live lessons (the Phase 4a gate):

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
   turns green and catches up. Stop `wrangler dev` for a few seconds: both screens show
   "reconnecting" and recover when it's back.
6. **[end lesson]**: students see "the lesson is over"; the delivery can't be started again.
7. Once every delivery of a lesson is over, its tile on [lessons] gets a **/!\\**: click it to
   archive the lesson or dismiss the prompt (dismissing is remembered in this browser only; it comes back after the next delivery finishes).

Answers (Phase 4b; run `0007_submissions.sql` first). Give the bellwork a couple of questions with
keys (a number, a choice), then start a delivery as above:

1. As the student, answer the bellwork. "// saving..." then "// saved" appears under the questions.
   Refresh the page: the answers are still there.
2. On the control panel, the **answers** box shows the student's answers within a few seconds, ✓ / ✗
   against your key, and "1 of 1 in". The **show** menu picks another module (it follows the live
   one by default); the box can be collapsed if the control panel is on the projector.
3. **[next]**: the student's bellwork locks ("handed in. this one is closed.") and the sidebar shows
   ✓ (or ✗ if they left it blank). The student can still open it from the list and read it, but not
   change it. Go **[<- back]** while it has time left and it reopens; once its time has run out it
   stays closed.
4. An activity with "done" on, or independent work set to "done" / "short answer", shows **[I'm done]**
   or an answer box; the answers box lists who's done / what they wrote.
5. A Coliseum Practice module: finish a game as the student; the answers box shows the best score
   and number of games.

The blackboard (Phase 4c; run `0008_run_ink.sql` first). Start a delivery of a lesson with a Notes
module, then on the control panel click **[presenter ↗]**: the projector screen opens in a new tab.
Drag that tab to the BenQ (or press **full screen**).

1. Write with a finger or the mouse: pick a color and width at the bottom left. The student window
   shows the stroke as you draw it, and the control panel's preview too.
2. **eraser** removes a whole stroke you touch; **undo** (or Ctrl+Z) takes back your last stroke,
   erase or clear; **clear** wipes the page (undo brings it back).
3. **next page >** / **< page** turn pages (so do Page Down / Page Up, the arrow keys, and a
   presentation clicker). On the last page it becomes **next: <module> ->**.
4. **+ blackboard** adds a blank page right after the one on screen, for this delivery only (the
   lesson itself doesn't change). Students see it appear in their page list.
5. As the student, flip back a page: the live board shows small in the corner; tap it to return.
6. In any other module (the bellwork, say), **+ board** on the presenter opens a scratch board for
   going over answers; **back to Bellwork** shows the module again. Students get a "board" tab and
   the corner view; they aren't pulled off their answers.
7. Switch the site to light mode (the presenter has a light/dark button too): the board turns light
   and the ink changes shade with it (chalk writes black).
8. Let a Notes module run out while you're writing: it waits ("time's up") instead of moving on. In
   the last 30 seconds the presenter shows the time left in the top bar.
9. End the lesson: every page's ink is kept with the delivery (`run_ink`), for the past-lessons page
   in Phase 5.

A slide with more text than fits now shrinks its text to fit instead of scrolling (ink has to stay
where you wrote it). The lesson builder says when a slide is shrunk below 85%.

Aliases, joins and posting (Phase 5a, step 1; run `0009_run_joins.sql` first).

1. Under [classes], add a few aliases to a test class: new ones look like `CometNarwhal42`: two
   words and a 2-digit tail (never 14, 18, 69 or 88). Aliases
   already printed (4-character tails) still sign in.
2. Sign in as a student typing the alias in lowercase, with spaces, or with the tail's 0 typed as O
   (or 1 as l): it still works.
3. Join a running delivery as the student, then check the table:
   `npx wrangler d1 execute walkermath-leaderboards --local --command "SELECT * FROM run_joins"`.
   One row per student per delivery, with the first time they connected; rejoining adds nothing.
4. Finish a game on the public /coliseum page while signed out: the end screen offers
   **[sign in to your class]** (a new tab) and **[i've signed in]**; nothing posts until then.
   Signed in, the score is saved for you and posts under the student's leaderboard name only when
   the class's leaderboard switch is on.

Reports (Phase 5a, step 2). Finish at least one delivery with some answers first.

1. **[teach] > [reports]**: pick a date range and **[show deliveries]**. Each finished lesson is a
   row; **▷** opens it into its periods, each with a checkbox. The lesson's checkbox picks or
   clears all of them.
2. The columns are what the lessons can report: Joined, then Bellwork, then Exit ticket, then each
   other module's Responses, Results or Coliseum score. The box under a column header picks it
   for every lesson. A module that collects nothing is left out; "–" means that lesson doesn't
   have the column.
3. Pick a sheet layout: **by period** (a sheet per class), **aggregate** (one sheet) or **by
   lesson**. Several lessons go side by side in the same sheet.
4. Tick **question analysis** to add a "Questions" sheet; open the tree to choose questions.
5. **[build report]** shows the sheets and a preview. **[download .xlsx]** saves a workbook (open
   it in Excel, or Google Sheets > File > Import); with one sheet, **[download .csv]** too.
6. Check a blank cell means nothing was handed in, 0 means answered and wrong, and Joined says
   "not recorded" for lessons taught before `0009_run_joins.sql`.

Looking back (Phase 5b). Needs a delivery you have ended, with a board added in class and a
student who answered.

1. As the student, open <http://localhost:8787/class>. Under **// past lessons** the ended lesson
   is listed; under **// coming up** the next scheduled ones show a date, time and title only.
2. Open the past lesson. The left side lists every part of the lesson (✓ = handed in, – = not,
   "best N" = a game score). Notes show every page with your ink, boards added in class included.
3. A question set shows the student's own answers with ✓ right / ✗ not right. The key itself is
   never shown, and nothing can be changed.
4. Sign in as a classmate who missed the lesson: the pages and ink are all there, with no answers.
5. When a live lesson ends, the student's screen offers **[look back at this lesson]**.
6. Personal notes (run `0010_student_notes.sql` first): in a live lesson, **[+ personal note]**
   under any module opens a box that saves as the student types. It's there again when they look
   back (✎ in the list), and they can keep editing it. Another student, and your control panel and
   reports, never see it.

Math questions (Phase 5, step 3). Needs a bellwork or exit ticket with questions.

1. In the lesson builder, open a question set and choose **[+ math]**. Type the key
   `(x+5)(x+2)`: "read as: (x + 5)(x + 2)" appears under it. Try `x2` (it says it is unclear) and
   `(x+5` (it says a "(" is missing its ")").
2. Leave **count as correct** on *same form, any order*. Save, start the lesson, and sign in as a
   student. The student's box also says "we read: ..." as they type.
3. Answer `(x+2)(x+5)`: right. Answer `x^2+7x+10`: wrong. In the control panel the answers table
   marks them green and red.
4. Make a second math question with the key `x=7`. `7=x` is right; `x+5=12` is wrong. A key of `7`
   accepts `x=7`. A key of `x=3 or x=-3` accepts `x=±3`.
5. Change a question to *any equivalent form* and re-mark: `x^2+7x+10` is now right. Marks are
   worked out when you look, so an old lesson's answers re-mark after you change the setting
   (the answer key is stored with each delivery, so past deliveries keep their own setting).
6. Build a report: the Responses column shows what was typed, and the Results column counts the
   marks.

Tests (no install needed): `npm run test:lessons` (API, against a stand-in database),
`npm run test:pacing` (the pacing engine), `npm run test:slides` (cutting notes into slides),
`npm run test:room` (the live room's clock and commands), `npm run test:answers` (what students
hand in, and marking against the key), `npm run test:ink` (strokes, the eraser, simplifying) and
`npm run test:router` (every `/api` route is wired up) and `npm run test:pseudonym` (names and
how sign-in reads a typed alias) and `npm run test:reports` (report sheets and the .xlsx/.csv files) and `npm run test:math` (the
algebra answer checker).

## 5. Production: moving walkermath.com from Pages to the Worker

Once, when this branch is ready to merge. The database doesn't move (the Worker uses the same D1
database). Live rooms start fresh, so don't do it during a lesson; finished lessons are in the
database and are kept.

1. **Database:** run any migrations production doesn't have yet, with `--remote` (section 3).
2. **Secrets:** create the Worker's secrets (section 2). `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   and `ADMIN_EMAIL` come from Google Cloud Console and your own address. `AUTH_SECRET` can be new
   (see section 2); if no student cards exist in production yet, nothing is lost.
3. **Free the domain:** Cloudflare dashboard > Workers & Pages > the walkermath **Pages** project >
   Custom domains > remove `walkermath.com` (and `www.walkermath.com` if it's there). The site is
   down from here until step 4 finishes, a minute or two.
4. **Deploy:** `npm run deploy` (builds, then `wrangler deploy`). `wrangler.toml` attaches
   `walkermath.com` to the Worker. If the site also answered on `www`, add
   `{ pattern = "www.walkermath.com", custom_domain = true }` to `routes` first.
5. **Check:** walkermath.com loads, the Coliseum leaderboard posts, /teach signs in, /live-test says
   "WebSocket OK".
6. **Auto-deploy:** Workers & Pages > walkermath (the Worker) > Settings > Builds > connect the
   GitHub repository. Production branch `master`; build command `npm run build`; deploy command
   `npx wrangler deploy`. Then pushes to master deploy as they did with Pages.
7. **Clean up:** delete the walkermath Pages project, and the `walkermath-live` Worker (its job moved
   into this one).

If anything goes wrong at step 5: remove the domain from the Worker (Settings > Domains & Routes) and
add it back to the Pages project; nothing in the database changed.

## What's stored

No student names, emails or school IDs. Aliases, keyed PIN hashes, class settings, lessons, and
hashed session tokens. Answer keys are stored apart from questions and never sent to students. Rate-limit counters use a keyed hash of the IP and expire within a day. Your
alias-to-student key stays in your own log or protected sheet.
