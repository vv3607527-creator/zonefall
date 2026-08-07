# ZONEFALL — Deployment Guide

## 1. Local development

```bash
npm install                      # deps (esbuild auto-approved via allowScripts)
npm run dev                      # Vite client (5173) + Node server (8787) concurrently
# open http://127.0.0.1:5173     (Vite proxies /ws → 8787)
```

Requirements: Node >= 23.6 (type stripping). Works on Termux (aarch64) and desktop.

## 2. Production build + serve

```bash
npm run build       # tsc typecheck + vite build → dist/
npm start           # serves dist/ + WS on :8787 (PORT env to override)
```

Static serving: sanitized paths; only `dist/` contents exposed. `/health` returns `{ ok, tick }`.

Health check: `curl http://127.0.0.1:8787/health`.

## 3. Hosting options

| Option | Fit | Notes |
|---|---|---|
| Node process (Railway/Render/Fly) | Best — WS + sim | 1 CPU, 512MB enough for 100-player sim (~1500 ticks/s of lightweight work) |
| Vercel static + separate Node server | Viable | Client static on Vercel; sim on Railway; WS origin `wss://game.example.com/ws` |
| Home server / Termux | Dev + LAN party | `host 0.0.0.0`, open port, clients join via LAN IP |

Domain + TLS: any reverse proxy (Caddy/Cloudflare) terminating `wss://`.

## 4. Packaging scripts

```bash
npm run build                # dist/ bundle (single process deployment)
export PORT=8787 && npm start
```

Mobile "app": package `dist/` in a Capacitor / PWA shell (manifest + service worker for offline shell, WebGL runs natively in WebView). iOS 120 fps / Android 60 fps = native WebView settings (allowInlineMediaPlayback, webgl antialias off → handled client-side by UA detect).

## 5. Performance verification

```bash
bash scripts/screenshot.sh http://127.0.0.1:8787 shots/full.png    # visual check headless
```

FPS probe (open browser console):
```
window.__zfFps()   // trailing-average FPS; dynamic resolution adjusts automatically
```
Optical probes: `performance.now()` deltas logged to `/health?probe=1` every 60s during a match.

### Perf targets & knobs

| Tier | Target | Mechanism |
|---|---|---|
| PC 240 fps | 240 cap | dynamic pixel ratio 1.0–1.75, antialias on |
| iOS 120 | 120 | UA-detect mobile → antialias off, ratio ≤1.5 |
| Android 60 | 60 | ratio auto drops to 0.6 under 40ms frames; vegetation LOD |
| Low-end | 30 safe | settings override `quality=fps` reduces instanced density |

## 6. CI (GitHub Actions, suggested)

- `npm ci`, `npm run verify` (typecheck + vitest), `curl` boot smoke, `scripts/screenshot.sh` artifact on push to main.

## 7. Rollout / rollback

- Stateless server (match seed in memory only) → rolling restart safe; dist immutable artifacts per release; WS reconnect retry with backoff on client (max 5).

## 8. Secrets

- None in code. If account auth is added: `JWT_SECRET`, `DB_URI` via env vars only; validate presence at boot.