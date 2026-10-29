// live-worker/src/index.ts
// Exports the LessonRoom Durable Object for the Pages site to bind to.
// The Worker itself has no public route (see wrangler.toml); its own fetch handler answers 404.

export { LessonRoom } from './LessonRoom';

export default {
  async fetch(): Promise<Response> {
    return new Response('Not found', { status: 404 });
  }
} satisfies ExportedHandler;
