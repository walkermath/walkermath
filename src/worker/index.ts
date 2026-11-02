// src/worker/index.ts
// The site as one Cloudflare Worker: the static Astro build (dist/) is served as assets, /api/*
// runs the handlers in functions/ through the route table (router.ts), and the LessonRoom Durable
// Object (live lessons) lives in this same Worker. Config: wrangler.toml.

import { LessonRoom } from './LessonRoom.ts';
import { route } from './router.ts';

export { LessonRoom };

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  [key: string]: unknown;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    // wrangler.toml sends only /api/* here; anything else is a static file (or the 404 page).
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await route(request, env, ctx);
    } catch (err) {
      // Shows in the Worker's logs (Cloudflare dashboard > Workers > walkermath > Logs).
      console.error(`${request.method} ${pathname} failed:`, err);
      return new Response(JSON.stringify({ error: 'Something went wrong on the server.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }
  }
};
