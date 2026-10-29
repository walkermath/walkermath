// live-worker/src/LessonRoom.ts
// One LessonRoom per running lesson (Phase 4). In Phase 1 it is a bare echo room used by the
// /live-test page to check that WebSockets get through the school network.
//
// Uses the WebSocket Hibernation API (ctx.acceptWebSocket), so an idle room is not billed for
// duration and keep-alive pings are answered by the runtime without waking the object.
//
// Privacy: the room never reads, stores or logs request headers, IPs or message contents.

import { DurableObject } from 'cloudflare:workers';

export interface Env {}

/** Hard cap on sockets per room; a class is ~35, so this only stops abuse. */
const MAX_SOCKETS = 200;
/** Client messages are tiny JSON; anything bigger is refused. */
const MAX_MESSAGE_CHARS = 1024;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

export class LessonRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive: the runtime answers "ping" with "pong" itself, without waking the room.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    const wantsSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

    if (wantsSocket) {
      if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
        return new Response('Room is full', { status: 503 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, ['test']);
      server.send(JSON.stringify({ type: 'hello', serverNow: Date.now() }));
      return new Response(null, { status: 101, webSocket: client });
    }

    // Polling fallback: the same room, over plain HTTP.
    if (request.method === 'GET') {
      return json({
        type: 'state',
        transport: 'poll',
        serverNow: Date.now(),
        connected: this.ctx.getWebSockets().length
      });
    }

    return new Response('Method not allowed', { status: 405 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_CHARS) {
      ws.close(1009, 'Message too large');
      return;
    }
    let data: { type?: unknown; t?: unknown };
    try {
      data = JSON.parse(message);
    } catch {
      return; // ignore anything that is not JSON
    }
    if (data?.type === 'echo') {
      const t = Number(data.t);
      ws.send(JSON.stringify({ type: 'echo', t: Number.isFinite(t) ? t : null, serverNow: Date.now() }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // 1005 / 1006 are reserved and cannot be sent back.
    const safe = code === 1005 || code === 1006 ? 1000 : code;
    try {
      ws.close(safe, reason);
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, 'Unexpected error');
    } catch {
      // already closed
    }
  }
}
