// index.ts — process entrypoint: HTTP static serving for the built client,
// sim bootstrap, and graceful shutdown. In dev, Vite serves the client and
// proxies /ws to this process; in prod, this process serves dist/ itself.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sim } from './sim.ts';
import { TICK_RATE } from '../../shared/src/consts.ts';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 8787);
const BOT_COUNT = Number(process.env.BOTS ?? 99);
/** Directory of the built client (vite build output). */
const CLIENT_DIR = fileURLToPath(new URL('../../../dist/', import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/** Serve a static file with path-traversal protection. */
async function serveStatic(reqUrl: string): Promise<{ status: number; body: Buffer; type: string }> {
  let pathname = decodeURIComponent(new URL(reqUrl, 'http://x').pathname);
  if (pathname === '/') pathname = '/index.html';
  const file = normalize(join(CLIENT_DIR, pathname));
  if (!file.startsWith(CLIENT_DIR)) {
    return { status: 403, body: Buffer.from('Forbidden'), type: 'text/plain' };
  }
  try {
    const body = await readFile(file);
    const ext = extname(file).toLowerCase();
    return { status: 200, body, type: MIME[ext] ?? 'application/octet-stream' };
  } catch {
    // SPA fallback: unknown routes serve index.html (the client routes).
    try {
      const body = await readFile(join(CLIENT_DIR, 'index.html'));
      return { status: 200, body, type: 'text/html; charset=utf-8' };
    } catch {
      return { status: 404, body: Buffer.from('Not found'), type: 'text/plain' };
    }
  }
}

/** Boot the authoritative sim and the static file server on the same port. */
function main(): void {
  const http = createServer(async (req, res) => {
    const { status, body, type } = await serveStatic(req.url ?? '/');
    res.writeHead(status, {
      'content-type': type,
      'cache-control': status === 200 && body.length > 0 ? 'public, max-age=60' : 'no-store',
    });
    res.end(body);
  });

  http.on('error', (err) => {
    console.error('[zonefall] HTTP error:', err.message);
  });

  // The sim attaches its WebSocket listener to this server, so static files
  // and /ws share one port (binding it twice would throw EADDRINUSE).
  const sim = new Sim({ host: HOST, port: PORT, botCount: BOT_COUNT, httpServer: http });

  http.listen(PORT, HOST, () => {
    console.log(`[zonefall] server on http://${HOST}:${PORT} (bots=${BOT_COUNT}, tick=${TICK_RATE}Hz)`);
  });

  sim.start();

  const shutdown = (sig: string): void => {
    console.log(`[zonefall] ${sig} — shutting down`);
    sim.stop();
    sim.net.close();
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
