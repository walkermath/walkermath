// live-worker/src/LessonRoom.ts
// One LessonRoom per running lesson, named by its run id. It owns the clock: it stores the
// lesson's state, applies the teacher's commands, wakes itself (an alarm) when a module's time is
// up, and tells every connected device. The state machine itself is src/lib/lesson/room.ts.
//
// The room is only reachable through the Pages Functions (this Worker has no public route), which
// check who is connecting and pass that on as X-Role / X-Who / X-Name headers.
//
// The room named 'live-test' is the Phase 1 network check (echo), kept for /live-test.
//
// Uses the WebSocket Hibernation API (ctx.acceptWebSocket), so an idle room is not billed for
// duration and keep-alive pings are answered by the runtime without waking the object.
// Privacy: the room never reads, stores or logs IPs or other request headers.

import { DurableObject } from 'cloudflare:workers';
import {
  apply,
  nextAlarm,
  parseCommand,
  startRoom,
  timeUp,
  upgradeState,
  type RoomModule,
  type RoomState
} from '../../src/lib/lesson/room.ts';

export interface Env {}

/** Hard cap on sockets per room; a class is ~35, so this only stops abuse. */
const MAX_SOCKETS = 200;
/** A student socket that hasn't pinged for this long (lid closed, wifi gone) counts as left. */
const STALE_MS = 70_000;
/** A student in slow mode (polling every 3 s) counts as here while their last poll is this recent. */
const POLL_HERE_MS = 12_000;
/** Client messages are small JSON; anything bigger is refused. */
const MAX_MESSAGE_CHARS = 4096;

type Role = 'teacher' | 'student' | 'test';
type Who = { role: Role; who: string; name: string; at?: number };
type RosterRow = { aliasId: string; alias: string; devices: number; here: boolean };
type Link = { label: string; url: string };
/** What every device gets once: the title, the lesson's Resources links and the student-safe modules. */
type Lesson = { title: string; resources: Link[]; modules: RoomModule[] };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

const whoFrom = (request: Request): Who => {
  const role = request.headers.get('X-Role');
  return {
    role: role === 'teacher' || role === 'student' ? role : 'test',
    who: (request.headers.get('X-Who') ?? '').slice(0, 64),
    name: (request.headers.get('X-Name') ?? '').slice(0, 32)
  };
};

export class LessonRoom extends DurableObject<Env> {
  /** In-memory copies; dropped when the room hibernates, then read back from storage. */
  private state: RoomState | null = null;
  private lesson: Lesson | null = null;
  /** Every student seen in this lesson (alias id -> alias), so the roster can show who left. */
  private seen: Map<string, string> | null = null;
  /** Students in slow mode: alias id -> last poll (in memory; polling keeps the room awake). */
  private polled = new Map<string, { alias: string; at: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive: the runtime answers "ping" with "pong" itself, without waking the room.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /* ---------------- storage ---------------- */

  private async load(): Promise<{ state: RoomState; lesson: Lesson } | null> {
    if (!this.state) {
      const stored = await this.ctx.storage.get<RoomState>('state');
      this.state = stored ? upgradeState(stored) : null;
    }
    if (this.state && !this.lesson) {
      // Modules are stored one per key: a long Notes module can be tens of KB on its own.
      const meta = await this.ctx.storage.get<{ title: string; resources?: Link[]; count: number }>('meta');
      const keys = Array.from({ length: meta?.count ?? 0 }, (_, i) => `m:${i}`);
      const found = keys.length ? await this.ctx.storage.get<RoomModule>(keys) : new Map();
      this.lesson = { title: meta?.title ?? '', resources: meta?.resources ?? [], modules: keys.map((k) => found.get(k)!).filter(Boolean) };
    }
    return this.state && this.lesson ? { state: this.state, lesson: this.lesson } : null;
  }

  private async save(state: RoomState) {
    this.state = state;
    await this.ctx.storage.put('state', state);
    const at = nextAlarm(state);
    if (at === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 50));
  }

  /* ---------------- messages ---------------- */

  private stateMsg(state: RoomState) {
    return JSON.stringify({ type: 'state', state, serverNow: Date.now() });
  }

  private lessonMsg(lesson: Lesson) {
    return JSON.stringify({ type: 'lesson', lesson });
  }

  private async loadSeen(): Promise<Map<string, string>> {
    if (!this.seen) this.seen = new Map(Object.entries((await this.ctx.storage.get<Record<string, string>>('seen')) ?? {}));
    return this.seen;
  }

  /** Remembers a student the first time they turn up, so they stay on the roster (greyed) after leaving. */
  private async markSeen(aliasId: string, alias: string) {
    const seen = await this.loadSeen();
    if (!aliasId || seen.get(aliasId) === alias) return;
    seen.set(aliasId, alias);
    await this.ctx.storage.put('seen', Object.fromEntries(seen));
  }

  /** A student socket that is still there: open and pinging. */
  private alive(ws: WebSocket, now: number): boolean {
    if (ws.readyState !== 1) return false; // 1 = open
    const a = ws.deserializeAttachment() as Who | null;
    const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
    return now - Math.max(pinged, a?.at ?? 0) < STALE_MS;
  }

  /**
   * Who is here, for the teacher: one row per alias with its device count. Students who were here
   * earlier in the lesson and have gone are listed with here: false. `closing` is a socket that is
   * closing right now (the runtime still lists it while its close handler runs).
   */
  private async roster(closing?: WebSocket): Promise<RosterRow[]> {
    const now = Date.now();
    const rows = new Map<string, RosterRow>();
    for (const [aliasId, alias] of await this.loadSeen()) rows.set(aliasId, { aliasId, alias, devices: 0, here: false });
    for (const ws of this.ctx.getWebSockets('student')) {
      if (ws === closing) continue;
      const a = ws.deserializeAttachment() as Who | null;
      if (!a?.who) continue;
      if (!this.alive(ws, now)) {
        try {
          ws.close(1001, 'Gone quiet'); // the device will reconnect if it is still there
        } catch {
          // already closed
        }
        continue;
      }
      const row = rows.get(a.who) ?? { aliasId: a.who, alias: a.name, devices: 0, here: false };
      row.devices++;
      row.here = true;
      rows.set(a.who, row);
    }
    for (const [aliasId, p] of this.polled) {
      if (now - p.at > POLL_HERE_MS) {
        this.polled.delete(aliasId);
        continue;
      }
      const row = rows.get(aliasId) ?? { aliasId, alias: p.alias, devices: 0, here: false };
      row.devices = Math.max(row.devices, 1);
      row.here = true;
      rows.set(aliasId, row);
    }
    return [...rows.values()].sort((x, y) => Number(y.here) - Number(x.here) || x.alias.localeCompare(y.alias));
  }

  private async rosterMsg(closing?: WebSocket) {
    return JSON.stringify({ type: 'roster', students: await this.roster(closing) });
  }

  private send(ws: WebSocket, msg: string) {
    try {
      ws.send(msg);
    } catch {
      // closing socket
    }
  }

  private broadcast(msg: string, tag?: string) {
    for (const ws of this.ctx.getWebSockets(tag)) {
      const a = ws.deserializeAttachment() as Who | null;
      if (a?.role !== 'test') this.send(ws, msg);
    }
  }

  private async run(cmd: unknown, now = Date.now()): Promise<RoomState | null> {
    const loaded = await this.load();
    const c = parseCommand(cmd);
    if (!loaded || !c) return loaded?.state ?? null;
    const next = apply(loaded.state, loaded.lesson.modules, c, now);
    if (next !== loaded.state) {
      await this.save(next);
      this.broadcast(this.stateMsg(next));
    }
    return next;
  }

  /* ---------------- HTTP (from the Pages Functions) ---------------- */

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const wantsSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
    if (url.pathname === '/live-test') return this.liveTest(request, wantsSocket);

    const who = whoFrom(request);

    if (wantsSocket) {
      if (who.role === 'test') return new Response('Forbidden', { status: 403 });
      if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('Room is full', { status: 503 });
      const loaded = await this.load();
      if (!loaded) return new Response('Not started', { status: 409 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, [who.role]);
      server.serializeAttachment({ ...who, at: Date.now() } satisfies Who);
      this.send(server, this.lessonMsg(loaded.lesson));
      this.send(server, this.stateMsg(loaded.state));
      if (who.role === 'teacher') this.send(server, await this.rosterMsg());
      else {
        await this.markSeen(who.who, who.name);
        this.broadcast(await this.rosterMsg(), 'teacher');
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    // Start (or reopen) the room. Idempotent: a room that's already running is left as it is.
    if (request.method === 'POST' && url.pathname === '/init') {
      if (who.role !== 'teacher') return json({ error: 'Forbidden' }, 403);
      const existing = await this.load();
      if (existing) return json({ state: existing.state, serverNow: Date.now() });
      const body = (await request.json()) as { runId: string; title: string; resources?: Link[]; modules: RoomModule[]; endsAt: number };
      const lesson: Lesson = { title: body.title, resources: body.resources ?? [], modules: body.modules };
      const entries: Record<string, unknown> = { meta: { title: lesson.title, resources: lesson.resources, count: lesson.modules.length } };
      lesson.modules.forEach((m, i) => (entries[`m:${i}`] = m));
      await this.ctx.storage.put(entries);
      this.lesson = lesson;
      const state = startRoom(body.runId, lesson.modules, body.endsAt, Date.now());
      await this.save(state);
      return json({ state, serverNow: Date.now() });
    }

    // Polling fallback, and the first load: the same room over plain HTTP.
    if (request.method === 'GET' && url.pathname === '/state') {
      const loaded = await this.load();
      if (!loaded) return json({ error: 'Not started' }, 409);
      if (who.role === 'student' && who.who) {
        // Slow mode: a student who polls is here. Tell the teacher when one turns up.
        const fresh = !this.polled.has(who.who);
        this.polled.set(who.who, { alias: who.name, at: Date.now() });
        if (fresh) {
          await this.markSeen(who.who, who.name);
          this.broadcast(await this.rosterMsg(), 'teacher');
        }
      }
      return json({
        state: loaded.state,
        serverNow: Date.now(),
        ...(url.searchParams.get('full') === '1' ? { lesson: loaded.lesson } : {}),
        ...(who.role === 'teacher' ? { students: await this.roster() } : {})
      });
    }

    if (request.method === 'POST' && url.pathname === '/cmd') {
      if (who.role !== 'teacher') return json({ error: 'Forbidden' }, 403);
      const body = (await request.json().catch(() => null)) as { cmd?: unknown } | null;
      const state = await this.run(body?.cmd);
      return state ? json({ state, serverNow: Date.now() }) : json({ error: 'Not started' }, 409);
    }

    return new Response('Not found', { status: 404 });
  }

  /* ---------------- sockets ---------------- */

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_CHARS) {
      ws.close(1009, 'Message too large');
      return;
    }
    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      return; // ignore anything that is not JSON
    }
    const a = ws.deserializeAttachment() as Who | null;

    if (a?.role === 'test') {
      if (data?.type === 'echo') {
        const t = Number(data.t);
        this.send(ws, JSON.stringify({ type: 'echo', t: Number.isFinite(t) ? t : null, serverNow: Date.now() }));
      }
      return;
    }

    if (data?.type === 'cmd' && a?.role === 'teacher') {
      await this.run(data.cmd);
      return;
    }
    // The control panel asks every few seconds, so students who went quiet or stopped polling grey out.
    if (data?.type === 'roster' && a?.role === 'teacher') {
      this.send(ws, await this.rosterMsg());
      return;
    }
    // A device that reconnected (or missed something) asks for the latest state.
    if (data?.type === 'sync') {
      const loaded = await this.load();
      if (!loaded) return;
      if (data.full) this.send(ws, this.lessonMsg(loaded.lesson));
      this.send(ws, this.stateMsg(loaded.state));
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
    const a = ws.deserializeAttachment() as Who | null;
    if (a?.role === 'student') this.broadcast(await this.rosterMsg(ws), 'teacher');
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, 'Unexpected error');
    } catch {
      // already closed
    }
    const a = ws.deserializeAttachment() as Who | null;
    if (a?.role === 'student') this.broadcast(await this.rosterMsg(ws), 'teacher');
  }

  /* ---------------- the clock ---------------- */

  async alarm(): Promise<void> {
    const loaded = await this.load();
    if (!loaded) return;
    const next = timeUp(loaded.state, loaded.lesson.modules, Date.now());
    if (next !== loaded.state) {
      await this.save(next);
      this.broadcast(this.stateMsg(next));
    } else {
      // Woke early (or was paused meanwhile): set the alarm again from the current state.
      await this.save(loaded.state);
    }
  }

  /* ---------------- Phase 1 network check ---------------- */

  private liveTest(request: Request, wantsSocket: boolean): Response {
    if (wantsSocket) {
      if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('Room is full', { status: 503 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, ['test']);
      server.serializeAttachment({ role: 'test', who: '', name: '' } satisfies Who);
      server.send(JSON.stringify({ type: 'hello', serverNow: Date.now() }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (request.method === 'GET') {
      return json({ type: 'state', transport: 'poll', serverNow: Date.now(), connected: this.ctx.getWebSockets().length });
    }
    return new Response('Method not allowed', { status: 405 });
  }
}
