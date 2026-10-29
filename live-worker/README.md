# walkermath-live

The Cloudflare Worker that hosts `LessonRoom`, the Durable Object that runs each live lesson.
Cloudflare does not allow a Durable Object inside a Pages project, so this lives next to the site
and the Pages project binds to it by name (`LESSON_ROOM` in the root `wrangler.toml`).

It has no public route. Every connection comes in through a Pages Function.

## Deploy (once, before the Pages deploy that includes the binding)

```sh
cd live-worker
npm install
npx wrangler login      # first time only
npx wrangler deploy
```

Then merge / deploy the site as usual. If the Pages deploy runs before this Worker exists,
the `LESSON_ROOM` binding has nothing to point at.

## Local development

Two terminals:

```sh
# 1: the room
cd live-worker && npx wrangler dev

# 2: the site (build first)
npm run build
npx wrangler pages dev dist
```

`wrangler pages dev` reads the `LESSON_ROOM` binding from the root `wrangler.toml` and connects to
the Worker started in terminal 1. Open http://localhost:8788/live-test.

## Phase 0

Right now the room only echoes messages for `/live-test`, the page that checks whether WebSockets
get through the school network. It falls back to polling if they don't.
