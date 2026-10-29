// functions/api/live-test.js
// Phase 1 network check for the /live-test page. No sign-in, nothing stored.
//
//   GET with "Upgrade: websocket"  -> WebSocket, handed to the shared test room (echo)
//   plain GET                      -> polling fallback snapshot from the same room
//
// The room lives in the separate walkermath-live Worker (binding LESSON_ROOM, see wrangler.toml).
// Only the upgrade header is passed on: the room never sees the visitor's cookies, IP or other headers.

const TEST_ROOM = 'live-test';

export async function onRequestGet({ request, env }) {
  if (!env.LESSON_ROOM) {
    return new Response(JSON.stringify({ error: 'Live room is not available.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }

  const wantsSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
  const inner = new Request('https://room.internal/live-test', {
    method: 'GET',
    headers: wantsSocket ? { Upgrade: 'websocket' } : {}
  });

  const room = env.LESSON_ROOM.get(env.LESSON_ROOM.idFromName(TEST_ROOM));
  return room.fetch(inner);
}
