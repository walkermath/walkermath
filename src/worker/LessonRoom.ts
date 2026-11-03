// src/worker/LessonRoom.ts
// One LessonRoom per running lesson, named by its run id. It owns the clock: it stores the
// lesson's state, applies the teacher's commands, wakes itself (an alarm) when a module's time is
// up, and tells every connected device. The state machine itself is src/lib/lesson/room.ts.
//
// The room has no route of its own: it is only reached through the site's /api handlers
// (functions/api/live/[runId].js and friends), which check who is connecting and pass that on as
// X-Role / X-Who / X-Name headers.
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
} from '../lib/lesson/room.ts';
import { INK_LIMITS, PAGE_ID, applyInk, parseInkOp, type InkOp, type Stroke } from '../lib/lesson/ink.ts';

export interface Env {
  /** D1: the room writes only run_joins (when each student first turns up). */
  DB?: any;
}

/** Hard cap on sockets per room; a class is ~35, so this only stops abuse. */
const MAX_SOCKETS = 200;
/** A student socket that hasn't pinged for this long (lid closed, wifi gone) counts as left. */
const STALE_MS = 70_000;
/** A student in slow mode (polling every 3 s) counts as here while their last poll is this recent. */
const POLL_HERE_MS = 12_000;
/** Client messages are small JSON; anything bigger is refused. The teacher's ink (a long stroke,
 *  or a page of strokes put back by undo) can be bigger. */
const MAX_MESSAGE_CHARS = 4096;
const MAX_TEACHER_MESSAGE_CHARS = 400_000;
/** Ink this recent means the teacher is writing: a board's time running out waits for them. */
const WRITING_MS = 15_000;
/** Pages one request may ask ink for. */
const MAX_INK_PAGES = 20;
/** Pages with ink one delivery may have (each page has its own stroke limit). */
const MAX_INKED_PAGES = 400;
/** Durable Object storage takes at most 128 keys per put or delete. */
const STORAGE_BATCH = 128;

type Role = 'teacher' | 'student' | 'test';
type Who = { role: Role; who: string; name: string; at?: number };
/** `hand`: when the student tapped "I'm stuck" (epoch ms), or null. */
type RosterRow = { aliasId: string; alias: string; devices: number; here: boolean; hand: number | null };
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
  /** "I'm stuck": alias id -> when the hand went up. Kept in storage under 'hands'. */
  private hands: Map<string, number> | null = null;
  /** Students in slow mode: alias id -> last poll (in memory; polling keeps the room awake). */
  private polled = new Map<string, { alias: string; at: number }>();
  /** Ink by page, read from storage when first needed (each stroke is its own key: k:<page>:<stroke>). */
  private inkCache = new Map<string, Map<string, Stroke>>();
  /** A counter per page that goes up with every change, so slow-mode devices know what to fetch. */
  private inkRev: Record<string, number> | null = null;
  /** When the teacher last wrote (epoch ms). */
  private lastInkAt: number | null = null;

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

  private async loadHands(): Promise<Map<string, number>> {
    if (!this.hands) this.hands = new Map(Object.entries((await this.ctx.storage.get<Record<string, number>>('hands')) ?? {}));
    return this.hands;
  }

  /** A student's "I'm stuck" goes up or down (the student, or the teacher clearing it). */
  private async setHand(aliasId: string, on: boolean) {
    const hands = await this.loadHands();
    if (on === hands.has(aliasId)) return;
    if (on) hands.set(aliasId, Date.now());
    else hands.delete(aliasId);
    await this.ctx.storage.put('hands', Object.fromEntries(hands));
    this.broadcast(await this.rosterMsg(), 'teacher');
    // Every device of that student shows the change (the teacher may have cleared it).
    const msg = JSON.stringify({ type: 'hand', on });
    for (const ws of this.ctx.getWebSockets('student')) {
      if ((ws.deserializeAttachment() as Who | null)?.who === aliasId) this.send(ws, msg);
    }
  }

  /** Remembers a student the first time they turn up, so they stay on the roster (greyed) after leaving. */
  private async markSeen(aliasId: string, alias: string) {
    const seen = await this.loadSeen();
    if (!aliasId || seen.get(aliasId) === alias) return;
    const first = !seen.has(aliasId);
    seen.set(aliasId, alias);
    await this.ctx.storage.put('seen', Object.fromEntries(seen));
    if (first) await this.recordJoin(aliasId);
  }

  /** The reports' Joined column: the first time this student connected to this delivery. */
  private async recordJoin(aliasId: string) {
    const runId = this.state?.runId;
    if (!runId || !this.env.DB) return;
    try {
      await this.env.DB.prepare('INSERT OR IGNORE INTO run_joins (run_id, alias_id, joined_at) VALUES (?1, ?2, ?3)')
        .bind(runId, aliasId, Date.now())
        .run();
    } catch (err) {
      // A database without migration 0009, or a blip: the lesson goes on; only the report loses a time.
      console.error('run_joins:', (err as Error).message);
    }
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
    const hands = await this.loadHands();
    for (const [aliasId, alias] of await this.loadSeen()) rows.set(aliasId, { aliasId, alias, devices: 0, here: false, hand: hands.get(aliasId) ?? null });
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
      const row = rows.get(a.who) ?? { aliasId: a.who, alias: a.name, devices: 0, here: false, hand: hands.get(a.who) ?? null };
      row.devices++;
      row.here = true;
      rows.set(a.who, row);
    }
    for (const [aliasId, p] of this.polled) {
      if (now - p.at > POLL_HERE_MS) {
        this.polled.delete(aliasId);
        continue;
      }
      const row = rows.get(aliasId) ?? { aliasId, alias: p.alias, devices: 0, here: false, hand: hands.get(aliasId) ?? null };
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

  private broadcast(msg: string, tag?: string, except?: WebSocket) {
    for (const ws of this.ctx.getWebSockets(tag)) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment() as Who | null;
      if (a?.role !== 'test') this.send(ws, msg);
    }
  }

  /* ---------------- ink ---------------- */

  private async loadRev(): Promise<Record<string, number>> {
    if (!this.inkRev) this.inkRev = (await this.ctx.storage.get<Record<string, number>>('inkrev')) ?? {};
    return this.inkRev;
  }

  /** A page's strokes by id, from memory or storage. */
  private async inkPage(page: string): Promise<Map<string, Stroke>> {
    let m = this.inkCache.get(page);
    if (!m) {
      const found = await this.ctx.storage.list<Stroke>({ prefix: `k:${page}:` });
      m = new Map([...found.values()].map((st) => [st.id, st]));
      this.inkCache.set(page, m);
    }
    return m;
  }

  /** A page's strokes in drawing order (ids sort by time). */
  private async strokes(page: string): Promise<Stroke[]> {
    return [...(await this.inkPage(page)).values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** Ink for some pages, and each page's counter: what a device asks for when it shows a page. */
  private async inkPages(ids: unknown): Promise<{ pages: Record<string, Stroke[]>; rev: Record<string, number> }> {
    const list = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && PAGE_ID.test(id)).slice(0, MAX_INK_PAGES) : [];
    const rev = await this.loadRev();
    const pages: Record<string, Stroke[]> = {};
    const revs: Record<string, number> = {};
    for (const id of list) {
      pages[id] = await this.strokes(id);
      revs[id] = rev[id] ?? 0;
    }
    return { pages, rev: revs };
  }

  /**
   * The teacher's ink. A stroke being drawn ('live') is only passed on; finished strokes, erasing
   * and clearing are stored and passed on, and bump the page's counter. Everyone but the sender
   * hears about it (the sender has already drawn it).
   */
  private async ink(op: InkOp | null, from?: WebSocket): Promise<boolean> {
    const loaded = await this.load();
    if (!op || !loaded || loaded.state.status !== 'live') return false;
    const now = Date.now();
    this.lastInkAt = now;
    if (op.op === 'live') {
      this.broadcast(JSON.stringify({ type: 'ink', op }), undefined, from);
      return true;
    }
    const rev = await this.loadRev();
    if (!(op.page in rev) && Object.keys(rev).length >= MAX_INKED_PAGES) return false;
    const page = await this.inkPage(op.page);
    let applied: InkOp = op;
    if (op.op === 'add') {
      const room = INK_LIMITS.strokes - page.size;
      const fresh = op.strokes.filter((st) => !page.has(st.id)).slice(0, Math.max(0, room));
      if (!fresh.length) return false;
      for (let i = 0; i < fresh.length; i += STORAGE_BATCH) {
        const entries: Record<string, Stroke> = {};
        for (const st of fresh.slice(i, i + STORAGE_BATCH)) {
          page.set(st.id, st);
          entries[`k:${op.page}:${st.id}`] = st;
        }
        await this.ctx.storage.put(entries);
      }
      applied = { ...op, strokes: fresh };
    } else if (op.op === 'erase') {
      const gone = op.ids.filter((id) => page.has(id));
      if (!gone.length) return false;
      for (const id of gone) page.delete(id);
      await this.deleteKeys(gone.map((id) => `k:${op.page}:${id}`));
      applied = { ...op, ids: gone };
    } else {
      if (!page.size) return false;
      await this.deleteKeys([...page.keys()].map((id) => `k:${op.page}:${id}`));
      page.clear();
    }
    rev[op.page] = (rev[op.page] ?? 0) + 1;
    await this.ctx.storage.put({ inkrev: rev, lastInk: now });
    this.broadcast(JSON.stringify({ type: 'ink', op: applied, rev: rev[op.page] }), undefined, from);
    return true;
  }

  private async deleteKeys(keys: string[]) {
    for (let i = 0; i < keys.length; i += STORAGE_BATCH) await this.ctx.storage.delete(keys.slice(i, i + STORAGE_BATCH));
  }

  /** Every page's ink, for the record kept when the delivery ends. */
  private async inkDump(): Promise<Record<string, Stroke[]>> {
    const all = await this.ctx.storage.list<Stroke>({ prefix: 'k:' });
    const pages: Record<string, Stroke[]> = {};
    for (const [key, st] of all) {
      const page = key.slice(2, key.lastIndexOf(':'));
      (pages[page] ??= []).push(st);
    }
    for (const list of Object.values(pages)) list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return pages;
  }

  /** Has the teacher written in the last few seconds? */
  private async writing(now: number): Promise<boolean> {
    if (this.lastInkAt === null) this.lastInkAt = (await this.ctx.storage.get<number>('lastInk')) ?? 0;
    return now - this.lastInkAt < WRITING_MS;
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

  /* ---------------- HTTP (from the /api handlers) ---------------- */

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
        if ((await this.loadHands()).has(who.who)) this.send(server, JSON.stringify({ type: 'hand', on: true }));
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

    // The /api handlers read the state to check a student's answers (no roster side effects).
    if (request.method === 'GET' && url.pathname === '/peek') {
      const loaded = await this.load();
      if (!loaded) return json({ error: 'Not started' }, 409);
      return json({ state: loaded.state, serverNow: Date.now() });
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
        inkRev: await this.loadRev(),
        ...(url.searchParams.get('full') === '1' ? { lesson: loaded.lesson } : {}),
        ...(who.role === 'teacher' ? { students: await this.roster() } : {}),
        ...(who.role === 'student' ? { hand: (await this.loadHands()).has(who.who) } : {})
      });
    }

    // "I'm stuck": a student raises or lowers their own hand; the teacher can lower anyone's.
    if (request.method === 'POST' && url.pathname === '/hand') {
      const loaded = await this.load();
      if (!loaded || loaded.state.status !== 'live') return json({ error: 'Not started' }, 409);
      const body = (await request.json().catch(() => null)) as { on?: unknown; aliasId?: unknown } | null;
      const on = body?.on === true;
      if (who.role === 'student' && who.who) {
        await this.setHand(who.who, on);
        return json({ hand: on });
      }
      if (who.role === 'teacher' && !on && typeof body?.aliasId === 'string') {
        await this.setHand(body.aliasId.slice(0, 64), false);
        return json({ hand: false });
      }
      return json({ error: 'Forbidden' }, 403);
    }

    // Ink over plain HTTP: slow-mode devices fetch pages whose counter moved; a slow-mode teacher writes.
    if (request.method === 'GET' && url.pathname === '/ink') {
      if (!(await this.load())) return json({ error: 'Not started' }, 409);
      return json(await this.inkPages((url.searchParams.get('pages') ?? '').split(',')));
    }
    if (request.method === 'POST' && url.pathname === '/ink') {
      if (who.role !== 'teacher') return json({ error: 'Forbidden' }, 403);
      const body = (await request.json().catch(() => null)) as { op?: unknown } | null;
      const op = parseInkOp(body?.op);
      if (!op) return json({ error: 'Invalid ink.' }, 400);
      await this.ink(op);
      return json({ ok: true, rev: (await this.loadRev())[op.page] ?? 0 });
    }
    // The record kept when the delivery ends: every page's ink.
    if (request.method === 'GET' && url.pathname === '/inkdump') {
      if (who.role !== 'teacher') return json({ error: 'Forbidden' }, 403);
      return json({ pages: await this.inkDump() });
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
    const a = ws.deserializeAttachment() as Who | null;
    const max = a?.role === 'teacher' ? MAX_TEACHER_MESSAGE_CHARS : MAX_MESSAGE_CHARS;
    if (typeof message !== 'string' || message.length > max) {
      ws.close(1009, 'Message too large');
      return;
    }
    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      return; // ignore anything that is not JSON
    }

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
    if (data?.type === 'ink' && a?.role === 'teacher') {
      await this.ink(parseInkOp(data.op), ws);
      return;
    }
    // A device showing a page asks for its ink (and again after reconnecting).
    if (data?.type === 'inkGet') {
      if (!(await this.load())) return;
      this.send(ws, JSON.stringify({ type: 'inkPages', ...(await this.inkPages(data.pages)) }));
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
    const now = Date.now();
    const next = timeUp(loaded.state, loaded.lesson.modules, now, { writing: await this.writing(now) });
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
