# Backend v1: data model and API for pings, fares and earnings

Closes #5

## What changed

- **`backend/`** — new FastAPI + SQLAlchemy service:
  - `POST /locations` `{ vehicleId, lat, lng, accuracy, ts }` and `POST /fares` `{ vehicleId, amount, method, ts }`, exactly the payloads posted by `web/app.js` (see `web/config.js`).
  - `GET /vehicles/latest` uses a window query for the newest ping per vehicle.
  - `GET /vehicles/{id}/earnings?days=7` returns zero-filled daily cash / mobile-money totals in the city timezone (`Africa/Lagos` by default, overridable per route) — a fare at 23:30 and one at 00:30 land on different days.
  - Phone-number sign-in: `POST /auth/request-otp`, `POST /auth/verify-otp`, `GET /auth/me`; the OTP is logged to the console (no SMS in the pilot), codes expire and are single-use, tokens are hashed bearer sessions.
  - Owners see only their own vehicles; drivers only their assigned vehicles. Access-denied and unknown-vehicle requests both return `400`, so ownership is not leaked. Malformed input returns `400` (validation errors are remapped from FastAPI's default `422`).
  - `POST /shifts/start` and `/shifts/end` link pings/fares to the open shift.
  - Demo seed data (2 owners, 4 routes, 8 vehicles/drivers, pings and fares) so `python -m backend` is useful immediately.
- **`backend/sql/schema.sql`** — canonical PostgreSQL 12+ schema: `owners`, `vehicles`, `drivers`, `routes`, `shifts`, `location_pings`, `fares`, plus `otp_codes`/`auth_tokens`; money in integer minor units (kobo), checks, FKs, indexes for newest-ping and daily-earnings queries, partial unique indexes for one open shift per vehicle/driver. No extensions required.
- **`docs/data-model.md`** — ER diagram, per-table rules, money/time conventions, ownership rules, example SQL.
- **`backend/README.md`** + root README — one-command local run, env vars, curl examples, full endpoint list; CI workflow added.

Money convention: the API accepts `amount` in NGN (what the app sends) and stores `amount_minor = round(amount * 100)`; responses expose both. `ts` accepts epoch milliseconds or ISO-8601 with an offset.

## Verification

`python -m pytest backend/tests -v` (in-memory SQLite, 11 tests):

```
11 passed, 1 warning in 1.59s
```

Covered: OTP flow + console log + expiry + bad codes, 401 without a token, valid/invalid location and fare payloads (ranges, types, missing fields, methods, decimals), cross-owner isolation on all reads/writes, driver scoping, newest-ping selection, shift lifecycle, cross-midnight cash vs mobile-money earnings, and `days` bounds. `python -m compileall -q backend` and `git diff --check` are clean.

Live server smoke test (`python -m backend`, HTTP on :8123):

```
HEALTH {'status': 'ok', 'timezone': 'Africa/Lagos', 'currency': 'NGN'}
LATEST 3 ['v1', 'v3', 'v5']
EARNINGS 140000 Africa/Lagos 2
ISOLATION 400
PING 201 FARE 201 50000
BAD_INPUT 400
```

Local PostgreSQL is not available on this machine, so the DDL was validated structurally by a test; runtime tests use the equivalent SQLite schema. CI runs the suite on Python 3.12.
