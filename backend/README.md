# trans_sport backend v1

FastAPI + SQLAlchemy service for location pings, fares and earnings. Local mode uses SQLite, so
**no database server is needed**; production uses PostgreSQL with the schema in
[`sql/schema.sql`](sql/schema.sql).

## One-command local run

```bash
python -m pip install -r backend/requirements-dev.txt && python -m backend
```

The server listens on `http://127.0.0.1:8000` (interactive docs at `/docs`). On first start it creates
`backend/data/trans_sport.db` and inserts demo data: 2 owners, 4 routes, 8 vehicles, 8 drivers,
open shift, pings and fares (including fares either side of midnight in Lagos).

Useful flags: `python -m backend --port 8001 --reload --no-seed`.

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `sqlite:///backend/data/trans_sport.db` | SQLAlchemy URL; use `postgresql+psycopg://user:pass@host:5432/trans_sport` for PostgreSQL |
| `CITY_TIMEZONE` | `Africa/Lagos` | IANA timezone for daily earnings (overridden per route) |
| `CURRENCY` | `NGN` | Currency label in responses |
| `OTP_TTL_SECONDS` | `300` | OTP lifetime |
| `TOKEN_TTL_SECONDS` | `86400` | Bearer token lifetime |
| `MAX_OTP_ATTEMPTS` | `5` | Wrong-code attempts before a code is burned |
| `CREATE_TABLES` | `1` | Set to `0` when the PostgreSQL schema was applied by a migration tool |
| `SEED_DEMO` | `1` | Set to `0` to start with an empty database |
| `LOG_LEVEL` | `INFO` | Logging level (OTP codes are logged at INFO) |

PostgreSQL pilot:

```bash
createdb trans_sport
psql "$DATABASE_URL" -f backend/sql/schema.sql
DATABASE_URL='postgresql+psycopg://user:pass@localhost:5432/trans_sport' CREATE_TABLES=0 python -m backend
```

## Sign in (pilot OTP)

There is no SMS provider: the 6-digit code is printed to the console, e.g.
`INFO backend.auth:auth.py:53 OTP for +2348010000001 (owner): 123456`.

```bash
curl -s -X POST localhost:8000/auth/request-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+2348010000001","role":"owner"}'

curl -s -X POST localhost:8000/auth/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+2348010000001","role":"owner","code":"<code from console>"}'
# -> {"token":"...","role":"owner","principalId":1,...}
```

Send the token as `Authorization: Bearer <token>` on every other call.

## Endpoints

| Method | Path | Body / query | Result |
|---|---|---|---|
| `GET` | `/health` | — | service status |
| `POST` | `/auth/request-otp` | `{ phone, role }` | sends (logs) a 6-digit code |
| `POST` | `/auth/verify-otp` | `{ phone, role, code, name?, ownerId? }` | bearer token |
| `GET` | `/auth/me` | — | current principal |
| `GET` | `/vehicles` | — | vehicles visible to the caller |
| `POST` | `/locations` | `{ vehicleId, lat, lng, accuracy, ts }` | `201`, stored ping (`ts` = epoch ms or ISO-8601) |
| `POST` | `/fares` | `{ vehicleId, amount, method, ts }` | `201`, stored fare; `amount` in NGN, stored as kobo |
| `GET` | `/vehicles/latest` | — | newest ping per visible vehicle |
| `GET` | `/vehicles/{id}/earnings` | `?days=7` (1–90) | daily and total cash/mobile-money sums in city timezone |
| `POST` | `/shifts/start` | `{ vehicleId }` | opens a shift (driver only) |
| `POST` | `/shifts/end` | `?vehicleId=v1` | closes the open shift (driver only) |

`POST /locations` and `POST /fares` match the payloads in [`web/config.js`](../web/config.js). Set
`apiUrl: "http://localhost:8000"` there to point the demo app at this service.

Validation errors (bad/missing fields, invalid ranges, unknown or inaccessible vehicle) return
`400`; missing/invalid tokens return `401`.

## Tests

```bash
python -m pip install -r backend/requirements-dev.txt
python -m pytest backend/tests -q
```

Tests run against an in-memory SQLite database and cover OTP/console delivery, bad input, both
payloads, shift linking, newest-ping selection, cross-owner isolation, and the cross-midnight
cash/mobile-money split. See [`docs/data-model.md`](../docs/data-model.md) for the schema.
