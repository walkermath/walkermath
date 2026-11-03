// src/worker/router.ts
// The /api routes, as an explicit table. The handlers are the files in functions/ (written in the
// Pages Functions style: onRequestGet, onRequestPost, ... taking a context), unchanged; this table
// replaces Pages' file-based routing so the site can run as a single Worker.
//
// Rules carried over from Pages:
//   - [param] segments match one path segment and arrive as context.params.
//   - A folder's _middleware.js runs before every route under it, and calls context.next().
//   - The method picks onRequest<Method>, falling back to onRequest.
// Adding a file under functions/ means adding a line here (npm run test:router checks none is missing).

import * as authStart from '../../functions/api/auth/google/start.js';
import * as authCallback from '../../functions/api/auth/google/callback.js';
import * as authLogout from '../../functions/api/auth/logout.js';
import * as classMw from '../../functions/api/class/_middleware.js';
import * as classAnswers from '../../functions/api/class/answers.js';
import * as classBoardName from '../../functions/api/class/board-name.js';
import * as classLessons from '../../functions/api/class/lessons/index.js';
import * as classLessonOne from '../../functions/api/class/lessons/[runId].js';
import * as classLive from '../../functions/api/class/live.js';
import * as classLogout from '../../functions/api/class/logout.js';
import * as classLookup from '../../functions/api/class/lookup.js';
import * as classNotes from '../../functions/api/class/notes.js';
import * as classMe from '../../functions/api/class/me.js';
import * as classScore from '../../functions/api/class/score.js';
import * as classSignin from '../../functions/api/class/signin.js';
import * as leaderboard from '../../functions/api/leaderboard.js';
import * as liveTest from '../../functions/api/live-test.js';
import * as liveRun from '../../functions/api/live/[runId].js';
import * as teachMw from '../../functions/api/teach/_middleware.js';
import * as teachAdmin from '../../functions/api/teach/admin/teachers.js';
import * as teachAliasOne from '../../functions/api/teach/classes/[classId]/aliases/[aliasId]/index.js';
import * as teachAliasPin from '../../functions/api/teach/classes/[classId]/aliases/[aliasId]/pin.js';
import * as teachAliases from '../../functions/api/teach/classes/[classId]/aliases/index.js';
import * as teachClassOne from '../../functions/api/teach/classes/[classId]/index.js';
import * as teachPasscode from '../../functions/api/teach/classes/[classId]/passcode.js';
import * as teachClasses from '../../functions/api/teach/classes/index.js';
import * as teachLessonOne from '../../functions/api/teach/lessons/[lessonId]/index.js';
import * as teachLessonRunOne from '../../functions/api/teach/lessons/[lessonId]/runs/[runId].js';
import * as teachLessonRuns from '../../functions/api/teach/lessons/[lessonId]/runs/index.js';
import * as teachLessons from '../../functions/api/teach/lessons/index.js';
import * as teachMe from '../../functions/api/teach/me.js';
import * as teachReports from '../../functions/api/teach/reports/index.js';
import * as teachReportOptions from '../../functions/api/teach/reports/options.js';
import * as teachRuns from '../../functions/api/teach/runs.js';
import * as teachRunAnswers from '../../functions/api/teach/runs/[runId]/answers.js';
import * as teachRunEnd from '../../functions/api/teach/runs/[runId]/end.js';
import * as teachRunOne from '../../functions/api/teach/runs/[runId]/index.js';
import * as teachRunStart from '../../functions/api/teach/runs/[runId]/start.js';

type Handler = (context: any) => Response | Promise<Response>;
type Module = Record<string, Handler | unknown>;

export interface Route {
  /** The URL path, with :name for a [name] segment. */
  path: string;
  /** The file in functions/ (for the check that every file is routed). */
  file: string;
  mod: Module;
}

/** Folder middleware, outermost first: the path prefix it covers and its module. */
export const MIDDLEWARE: { prefix: string; file: string; mod: Module }[] = [
  { prefix: '/api/class/', file: 'functions/api/class/_middleware.js', mod: classMw },
  { prefix: '/api/teach/', file: 'functions/api/teach/_middleware.js', mod: teachMw }
];

const r = (path: string, file: string, mod: Module): Route => ({ path, file: `functions/api/${file}`, mod });

export const ROUTES: Route[] = [
  r('/api/auth/google/start', 'auth/google/start.js', authStart),
  r('/api/auth/google/callback', 'auth/google/callback.js', authCallback),
  r('/api/auth/logout', 'auth/logout.js', authLogout),

  r('/api/class/answers', 'class/answers.js', classAnswers),
  r('/api/class/board-name', 'class/board-name.js', classBoardName),
  r('/api/class/lessons', 'class/lessons/index.js', classLessons),
  r('/api/class/lessons/:runId', 'class/lessons/[runId].js', classLessonOne),
  r('/api/class/live', 'class/live.js', classLive),
  r('/api/class/logout', 'class/logout.js', classLogout),
  r('/api/class/lookup', 'class/lookup.js', classLookup),
  r('/api/class/notes', 'class/notes.js', classNotes),
  r('/api/class/me', 'class/me.js', classMe),
  r('/api/class/score', 'class/score.js', classScore),
  r('/api/class/signin', 'class/signin.js', classSignin),

  r('/api/leaderboard', 'leaderboard.js', leaderboard),
  r('/api/live-test', 'live-test.js', liveTest),
  r('/api/live/:runId', 'live/[runId].js', liveRun),

  r('/api/teach/admin/teachers', 'teach/admin/teachers.js', teachAdmin),
  r('/api/teach/classes', 'teach/classes/index.js', teachClasses),
  r('/api/teach/classes/:classId', 'teach/classes/[classId]/index.js', teachClassOne),
  r('/api/teach/classes/:classId/passcode', 'teach/classes/[classId]/passcode.js', teachPasscode),
  r('/api/teach/classes/:classId/aliases', 'teach/classes/[classId]/aliases/index.js', teachAliases),
  r('/api/teach/classes/:classId/aliases/:aliasId', 'teach/classes/[classId]/aliases/[aliasId]/index.js', teachAliasOne),
  r('/api/teach/classes/:classId/aliases/:aliasId/pin', 'teach/classes/[classId]/aliases/[aliasId]/pin.js', teachAliasPin),
  r('/api/teach/lessons', 'teach/lessons/index.js', teachLessons),
  r('/api/teach/lessons/:lessonId', 'teach/lessons/[lessonId]/index.js', teachLessonOne),
  r('/api/teach/lessons/:lessonId/runs', 'teach/lessons/[lessonId]/runs/index.js', teachLessonRuns),
  r('/api/teach/lessons/:lessonId/runs/:runId', 'teach/lessons/[lessonId]/runs/[runId].js', teachLessonRunOne),
  r('/api/teach/me', 'teach/me.js', teachMe),
  r('/api/teach/reports', 'teach/reports/index.js', teachReports),
  r('/api/teach/reports/options', 'teach/reports/options.js', teachReportOptions),
  r('/api/teach/runs', 'teach/runs.js', teachRuns),
  r('/api/teach/runs/:runId', 'teach/runs/[runId]/index.js', teachRunOne),
  r('/api/teach/runs/:runId/answers', 'teach/runs/[runId]/answers.js', teachRunAnswers),
  r('/api/teach/runs/:runId/end', 'teach/runs/[runId]/end.js', teachRunEnd),
  r('/api/teach/runs/:runId/start', 'teach/runs/[runId]/start.js', teachRunStart)
];

/* ---------------- matching ---------------- */

interface Compiled {
  route: Route;
  re: RegExp;
  names: string[];
}

const compiled: Compiled[] = ROUTES.map((route) => {
  const names: string[] = [];
  const re = route.path
    .split('/')
    .map((seg) => {
      if (!seg.startsWith(':')) return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(seg.slice(1));
      return '([^/]+)';
    })
    .join('/');
  return { route, names, re: new RegExp(`^${re}/?$`) };
});

/** The route for a path and its params, or null. */
export function match(pathname: string): { route: Route; params: Record<string, string> } | null {
  for (const c of compiled) {
    const m = c.re.exec(pathname);
    if (!m) continue;
    const params: Record<string, string> = {};
    let ok = true;
    c.names.forEach((n, i) => {
      try {
        params[n] = decodeURIComponent(m[i + 1]);
      } catch {
        ok = false; // a malformed %-escape: treat as no match
      }
    });
    if (ok) return { route: c.route, params };
  }
  return null;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function handlerFor(mod: Module, method: string): Handler | null {
  const name = `onRequest${method[0]}${method.slice(1).toLowerCase()}`;
  const h = (mod[name] ?? (method === 'HEAD' ? mod.onRequestGet : undefined) ?? mod.onRequest) as Handler | undefined;
  return typeof h === 'function' ? h : null;
}

const jsonError = (error: string, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
  });

/**
 * Runs an /api request: finds the route, runs its folder middleware (each calls context.next()),
 * then the handler for the method. Unknown paths are 404, unknown methods 405.
 */
export async function route(request: Request, env: any, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
  const url = new URL(request.url);
  const found = match(url.pathname);
  if (!found) return jsonError('Not found.', 404);
  const method = request.method.toUpperCase();
  const handler = handlerFor(found.route.mod, method);
  if (!handler) {
    const allow = METHODS.filter((m) => handlerFor(found.route.mod, m)).join(', ');
    return jsonError('Method not allowed.', 405, { Allow: allow });
  }

  const chain: Handler[] = [
    ...MIDDLEWARE.filter((m) => url.pathname.startsWith(m.prefix)).map((m) => m.mod.onRequest as Handler),
    handler
  ];
  const context: any = {
    request,
    env,
    params: found.params,
    data: {},
    waitUntil: (p: Promise<unknown>) => ctx.waitUntil(p),
    next: async () => {
      throw new Error('next() called past the last handler');
    }
  };
  const run = (i: number): Promise<Response> => {
    context.next = () => run(i + 1);
    return Promise.resolve(chain[i](context));
  };
  return run(0);
}
