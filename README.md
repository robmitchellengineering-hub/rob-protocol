# ROB — Robust Object Broadcast Protocol · Explainer

An animated, WebGL explainer for the **ROB protocol** (Robust Object Broadcast):
broadcast-grade, low-latency, sample-synced audio over standard Wi-Fi.

A single static site — no build step, no framework. Open it, or serve it, and
it runs.

## Run it

```bash
# from this folder
python3 -m http.server 8123
# then open http://localhost:8123
```

Or just double-click `index.html` (serving over HTTP is recommended — the CDN
modules load more reliably than from `file://`).

## What's inside

- `index.html` — structure + the explainer copy
- `styles.css` — the dark/glass/gradient design system
- `app.js` — the Three.js engine: one fixed canvas, scroll-driven per-section
  scenes, UnrealBloom for the glow

The animated scenes walk the protocol:

1. **Hero** — packets streaming between source and receiver
2. **The problem** — Wi-Fi jitter, queues and retries
3. **The packet** — RTP header → ROB core extension → layered audio blocks → SRTP
4. **Layered redundancy** — 24 → 16 → 10-bit graceful degradation
5. **Multipath** — two paths, keep the first copy
6. **Clock** — one shared network clock, sync rings
7. **Soft slots** — turn-taking, never send late audio
8. **Latency tiers** — one protocol at every distance

## Deploy

Drop the three files on any static host:

- **GitHub Pages** — enable Pages on the repo, root = `/`
- **Netlify** — drag the folder in (no build command)

## Tech

Three.js (r160) via jsDelivr CDN, ES modules, no dependencies to install.
Requires WebGL and a network connection (for the CDN + fonts).
