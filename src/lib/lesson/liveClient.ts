// src/lib/lesson/liveClient.ts
// The browser's connection to a live lesson's room, shared by the control panel and the
// student view.
//
//   1. One HTTP read first (GET /api/live/<run>?full=1), so the screen draws at once and a lesson
//      that isn't running (404 / 409) is reported without waiting on a socket.
//   2. Then a WebSocket. It reconnects with backoff (0.5 s doubling to 8 s); the room sends the
//      full lesson and state on every connect, so nothing is missed.
//   3. If the socket never opens twice in a row (some school filters block WebSockets), it polls
//      every 3 s instead, and teacher commands go by POST. Same room, same state.
//
// Every state carries serverNow; `offset` turns the device clock into the room's clock.

import type { RoomModule, RoomState, Command } from './room.ts';

export type Link = { label: string; url: string };
export type LiveLesson = { title: string; resources: Link[]; modules: RoomModule[] };
/** `here: false` = was in this lesson earlier and has left (closed the tab, lost wifi). */
export type RosterRow = { aliasId: string; alias: string; devices: number; here: boolean };
export type Transport = 'connecting' | 'socket' | 'polling' | 'offline';

export interface LiveHandlers {
  onLesson: (lesson: LiveLesson) => void;
  onState: (state: RoomState) => void;
  onRoster?: (students: RosterRow[]) => void;
  onTransport?: (t: Transport) => void;
  /** The lesson can't be reached: not started (409), not yours / over (404), or another error. */
  onGone?: (status: number, message: string) => void;
}

export interface LiveConnection {
  /** The room's clock, in epoch ms. */
  now: () => number;
  send: (cmd: Command) => Promise<void>;
  close: () => void;
}

const POLL_MS = 3000;
const PING_MS = 25_000;
/** The control panel refreshes who's here this often (students who go quiet send nothing). */
const ROSTER_MS = 10_000;

export function connectLive(runId: string, h: LiveHandlers): LiveConnection {
  const base = `/api/live/${encodeURIComponent(runId)}`;
  let offset = 0;
  let ws: WebSocket | null = null;
  let closed = false;
  let failures = 0; // sockets that closed without ever opening
  let delay = 500;
  let polling = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let rosterTimer: ReturnType<typeof setInterval> | null = null;
  let lastVersion = 0;

  const clock = (serverNow: unknown) => {
    if (typeof serverNow === 'number') offset = serverNow - Date.now();
  };

  const takeState = (state: RoomState | undefined, serverNow: unknown) => {
    if (!state) return;
    clock(serverNow);
    // Messages can cross on a reconnect: never go back to an older state.
    if (state.version < lastVersion && state.status !== 'ended') return;
    lastVersion = state.version;
    h.onState(state);
    if (state.status === 'ended') stop();
  };

  const transport = (t: Transport) => h.onTransport?.(t);

  async function read(full: boolean): Promise<boolean> {
    try {
      const res = await fetch(`${base}${full ? '?full=1' : ''}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404 || res.status === 409) {
          h.onGone?.(res.status, data.error || 'This lesson is not available.');
          stop();
        }
        return false;
      }
      if (data.lesson) h.onLesson(data.lesson);
      if (data.students) h.onRoster?.(data.students);
      takeState(data.state, data.serverNow);
      return true;
    } catch {
      return false;
    }
  }

  function poll() {
    if (closed) return;
    polling = true;
    transport('polling');
    const tick = async () => {
      if (closed) return;
      const ok = await read(false);
      if (!ok && !closed) transport('offline');
      else if (!closed) transport('polling');
      if (!closed) pollTimer = setTimeout(tick, POLL_MS);
    };
    pollTimer = setTimeout(tick, POLL_MS);
  }

  function open() {
    if (closed || polling) return;
    transport('connecting');
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${base}`;
    let opened = false;
    try {
      ws = new WebSocket(url);
    } catch {
      failures++;
      return retry();
    }
    ws.onopen = () => {
      opened = true;
      failures = 0;
      delay = 500;
      transport('socket');
      pingTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
      if (h.onRoster) rosterTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'roster' })), ROSTER_MS);
    };
    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      let msg: any;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.type === 'lesson') h.onLesson(msg.lesson);
      else if (msg.type === 'state') takeState(msg.state, msg.serverNow);
      else if (msg.type === 'roster') h.onRoster?.(msg.students);
    };
    ws.onclose = () => {
      if (pingTimer) clearInterval(pingTimer);
      if (rosterTimer) clearInterval(rosterTimer);
      pingTimer = rosterTimer = null;
      ws = null;
      if (closed) return;
      if (!opened) failures++;
      retry();
    };
  }

  function retry() {
    if (closed) return;
    if (failures >= 2) return poll(); // the socket is being blocked: poll instead
    transport('offline');
    setTimeout(async () => {
      // Check the lesson is still there (it may have ended) before opening again.
      if (await read(false)) open();
      else if (!closed) retry();
    }, delay);
    delay = Math.min(delay * 2, 8000);
  }

  function stop() {
    closed = true;
    if (pollTimer) clearTimeout(pollTimer);
    if (pingTimer) clearInterval(pingTimer);
    if (rosterTimer) clearInterval(rosterTimer);
    try {
      ws?.close(1000, 'done');
    } catch {
      // already closed
    }
  }

  read(true).then((ok) => {
    if (ok) open();
    else if (!closed) retry();
  });

  return {
    now: () => Date.now() + offset,
    async send(cmd) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'cmd', cmd }));
        return;
      }
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd }),
        credentials: 'same-origin'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      takeState(data.state, data.serverNow);
    },
    close: stop
  };
}

/** "4:05", or "-0:30" once a module has run over. */
export function countdown(ms: number): string {
  const neg = ms < 0;
  const s = neg ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${neg ? '-' : ''}${m}:${String(r).padStart(2, '0')}`;
}

/** "10:41 AM" on this device's clock. */
export const clockAt = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
