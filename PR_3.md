Closes #3

## Summary

Adds the core PostgreSQL data model for the minibus app: owners, vehicles, drivers, routes, shifts, location pings and fares, plus the documentation needed by every later backend task.

## Changes

- **`backend/schema.sql`** — a single transaction that creates the seven tables with primary/foreign keys, uniqueness and range checks, status enums expressed as `CHECK` constraints, and two partial indexes enforcing one open shift per vehicle and per driver. All ids are `BIGINT` identity values, timestamps are `TIMESTAMPTZ`, and money is `BIGINT` minor units (kobo).
- **Indexes** — `location_pings_latest_per_vehicle_idx (vehicle_id, ts DESC, id DESC)` for the latest ping per vehicle, and `fares_vehicle_day_idx (vehicle_id, ts) INCLUDE (amount, method, currency)` for fares/takings per vehicle per day. No timezone-dependent expression indexes or extensions are used, so the file loads on a plain PostgreSQL 12+ instance.
- **`docs/data-model.md`** — a Mermaid ER diagram, one paragraph per table, an explicit mapping of the `POST /locations` and `POST /fares` payloads from `web/config.js` to columns, and example queries showing how the two indexes are used.
- **`tests/check_schema.py`** — a dependency-free structural check of the schema, the payload mapping and the documentation.

## Payload compatibility

`web/config.js` posts `{ vehicleId, lat, lng, accuracy, ts }` to `/locations` and `{ vehicleId, amount, method: "cash" | "mobile_money", ts }` to `/fares`. The schema stores every one of those fields (`vehicleId` becomes the `vehicle_id` foreign key), accepts exactly the two payment methods, keeps `amount` as a positive integer in minor units, and adds `received_at` for server-side ingest time.

## Verification

```
$ python tests/check_schema.py
...
All schema checks passed
```

38/38 checks passed (all seven tables and their columns, foreign keys, checks, both required indexes, payload field mapping and the per-table documentation).

A PostgreSQL server / `psql` is not available in this environment, so the file was not executed against a live database here. It deliberately uses only core PostgreSQL 12+ syntax (`GENERATED ALWAYS AS IDENTITY`, btree/partial/`INCLUDE` indexes, `COMMENT ON`) and no extensions, so `psql "$DATABASE_URL" -f backend/schema.sql` can be used to confirm the load on a fresh database.

## Scope

No API code and no migrations tooling are included, as specified in the issue.
