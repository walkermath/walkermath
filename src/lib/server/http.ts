// src/lib/server/http.ts
// Response, cookie and request helpers for the Pages Functions.

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  h.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: h });
}

export const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  json({ error, ...extra }, status);

export function redirect(location: string, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set('Location', location);
  h.set('Cache-Control', 'no-store');
  return new Response(null, { status: 303, headers: h });
}

/** Parse a small JSON body; null if missing, too large or not an object. */
export async function readJson(request: Request, maxBytes = 4096): Promise<Record<string, any> | null> {
  const text = await request.text();
  if (!text || text.length > maxBytes) return null;
  try {
    const data = JSON.parse(text);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Reject cross-site writes: state-changing requests must come from this site's own pages. */
export function isAllowedOrigin(request: Request): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  const origin = request.headers.get('Origin');
  return !!origin && origin === new URL(request.url).origin;
}

/* ---------------- cookies ---------------- */

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/**
 * `__Host-` cookies: HttpOnly, Secure, Path=/, no Domain, so only this exact host can set or read
 * them. Browsers accept Secure cookies on http://localhost, so this works in local development too.
 */
export function setCookie(name: string, value: string, maxAgeSec: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`;
}

export const clearCookie = (name: string): string => setCookie(name, '', 0);

/** Visitor IP as Cloudflare reports it. Only ever used hashed, for rate limits. */
export const clientIp = (request: Request): string => request.headers.get('CF-Connecting-IP') || 'local';
