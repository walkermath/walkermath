// src/lib/api.ts
// Tiny fetch wrapper for the /api routes used by the teach and class screens.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method || (init.body === undefined ? 'GET' : 'POST'),
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
    cache: 'no-store'
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON (e.g. the Functions aren't running)
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status}). Is the site running with its Functions?`, res.status);
  }
  return data as T;
}
