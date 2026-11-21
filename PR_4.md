# Connect the driver app and owner dashboard to the backend

Closes #4

## What changed

- **`web/api.js`** (new) — browser API transport used by both views:
  - bearer-token requests to the backend (`POST /locations`, `POST /fares`, `/shifts/*`, `GET /vehicles/latest`, `GET /vehicles/{id}/earnings`, OTP sign-in);
  - a durable FIFO offline queue in `localStorage`, capped at 500 items (oldest dropped first), persisted across reloads and replayed in order when connectivity returns (browser `online` event, next ping, or explicit flush). Network errors and 5xx/401/408/429 are retried; other 4xx are discarded so one bad payload cannot block the queue;
  - pure helpers for mapping `/vehicles/latest` positions/staleness and earnings totals onto the in-memory vehicles.
- **`web/app.js`** — live mode when `apiUrl` is set:
  - driver sends a GPS ping every 20 s while on shift (plus immediately on a fresh fix), opens/closes a backend shift, and records fares through the same queue; the Drive screen shows the number of queued records;
  - pilot OTP sign-in (phone + code printed in the backend console); token is kept in `sessionStorage`, not in `config.js`;
  - owner polls `/vehicles/latest` every 15 s (also on tab activation), moves markers to the reported coordinates, greys vehicles whose newest ping is older than 45 s, and pulls earnings from `/vehicles/{id}/earnings?days=7`;
  - demo mode is untouched when `apiUrl` is empty: no requests, no polling, no sign-in UI, same simulated fleet.
- **`web/config.js`** — documents live mode and exposes `pingIntervalMs`, `latestIntervalMs`, `earningsIntervalMs`, `staleAfterMs`, `earningsDays`, `maxQueue`.
- **`web/sim.js`** — the simulator no longer moves/earns for vehicles fed by live data.
- **`web/index.html` / `web/styles.css`** — sign-in buttons and the grey style for stale bus markers.
- **`web/tests/`** (new) and **`README.md`** — Node tests and a description of the live flow.

This PR only changes the web app; it assumes the backend v1 contract from #5 (`POST /locations`, `POST /fares`, `GET /vehicles/latest`, `GET /vehicles/{id}/earnings`, OTP auth).

## Verification

`node --test web/tests/` — **10 passed, 0 failed**:

- demo mode performs no requests;
- URL/bearer/JSON payloads and all read/auth endpoints;
- offline FIFO replay, persistence, 500-item cap (oldest 100 dropped from 600);
- ordered retry after a transient failure, permanent 4xx vs. retryable 401, no duplicate in-flight sends;
- stale detection and earnings mapping;
- end-to-end against a local HTTP server: sign-in → 4 offline writes → reconnect → pings/fares arrive in order → live map position and earnings update.

Also ran `node --check` on all changed JS, `git diff --check`, and loaded the app under a minimal DOM stub in both demo and live modes with no runtime errors. No new dependencies or downloads.

## Manual demo checklist (needs a backend and a phone)

1. Start backend v1 (`python -m backend`) and set `apiUrl` in `web/config.js` to its address; serve `web/` over HTTPS/localhost.
2. Sign in as the owner, open the Owner tab; sign in as the driver in a second tab/phone, start a shift, and confirm the vehicle appears live on the owner map.
3. Toggle the browser offline for ~1 minute, take a couple of fares, then go online and confirm the queued pings/fares drain in order and the greyed vehicle turns live again.

A screen recording of that manual two-device run is not included: this environment has no browser/phone capture tooling (no ffmpeg). The steps and an automated offline-reconnect test are provided above.
