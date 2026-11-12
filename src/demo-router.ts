import type { NextFunction, Request, Response } from 'express';
import * as http from 'http';

/**
 * App-Review demo routing.
 *
 * Apple's reviewers need a working login, but must never see real customers or touch the real database.
 * A second backend instance (DEMO_MODE=true, its own database) holds fictional data. This middleware, active only
 * on the production backend when DEMO_UPSTREAM is set, forwards to that instance:
 *   - POST /auth/login whose email is in DEMO_EMAILS (the demo instance issues a token carrying `demo: true`)
 *   - any request whose Bearer token carries `demo: true`
 * Everything else falls straight through untouched. A forged `demo` claim gains nothing: the demo instance verifies
 * the signature with its own secret and only holds fictional data.
 */
const MAX_LOGIN_BODY = 64 * 1024;

function demoClaim(authHeader?: string): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false;
  try {
    const payload = JSON.parse(Buffer.from(authHeader.slice(7).split('.')[1] ?? '', 'base64url').toString('utf8'));
    return payload?.demo === true;
  } catch {
    return false;
  }
}

function forward(upstream: URL, req: Request, res: Response, body?: Buffer) {
  const headers = { ...req.headers, host: upstream.host };
  if (body) headers['content-length'] = String(body.length);
  const proxied = http.request(
    { protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port, path: req.originalUrl, method: req.method, headers, timeout: 30000 },
    (up) => {
      // The production app already set CORS headers on `res`; the demo instance's own would duplicate them.
      const out = Object.fromEntries(Object.entries(up.headers).filter(([k]) => !k.toLowerCase().startsWith('access-control-')));
      res.writeHead(up.statusCode ?? 502, out as http.OutgoingHttpHeaders);
      up.pipe(res);
    },
  );
  proxied.on('timeout', () => proxied.destroy(new Error('demo upstream timeout')));
  proxied.on('error', () => {
    if (!res.headersSent) res.status(502).json({ statusCode: 502, message: 'Demo environment unavailable' });
    else res.end();
  });
  if (body) proxied.end(body);
  else req.pipe(proxied);
}

export function demoRouter(upstreamUrl: string, demoEmails: string) {
  const upstream = new URL(upstreamUrl);
  const emails = new Set(demoEmails.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.method === 'OPTIONS') return next();

      if (demoClaim(req.headers.authorization)) return forward(upstream, req, res);

      if (emails.size && req.method === 'POST' && /^\/auth\/login\/?(\?|$)/.test(req.originalUrl)) {
        const chunks: Buffer[] = [];
        let size = 0;
        let aborted = false;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_LOGIN_BODY) { aborted = true; res.status(413).json({ message: 'Payload too large' }); req.destroy(); return; }
          chunks.push(c);
        });
        req.on('end', () => {
          if (aborted) return;
          const raw = Buffer.concat(chunks);
          let parsed: any;
          try { parsed = JSON.parse(raw.toString('utf8') || '{}'); } catch { parsed = undefined; }
          if (parsed && emails.has(String(parsed.email ?? '').trim().toLowerCase())) return forward(upstream, req, res, raw);
          // Not a demo login: hand the already-read body to the normal body parser (it skips when `_body` is set).
          (req as any).body = parsed ?? {};
          (req as any)._body = true;
          next();
        });
        req.on('error', () => next());
        return;
      }
    } catch {
      /* never let routing break a normal request */
    }
    next();
  };
}
