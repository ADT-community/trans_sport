-- trans_sport core data model (PostgreSQL 12+, no extensions required).
--
-- Load with:  psql "$DATABASE_URL" -f backend/schema.sql
--
-- Conventions:
--   * All ids are opaque BIGINT identity values. The web app sends the id as a
--     string (vehicleId), so the API layer only has to parse/format it.
--   * Monetary amounts are integer minor units (kobo for NGN), never floats.
--   * Client-supplied timestamps are TIMESTAMPTZ; received_at records when the
--     server actually stored the row.
--   * Daily reporting uses the Africa/Lagos business day (UTC+01:00). Pass a
--     half-open timestamptz range from the API so the btree indexes below are
--     used; see docs/data-model.md.

BEGIN;

CREATE TABLE owners (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name  TEXT NOT NULL CHECK (btrim(full_name) <> ''),
    phone      TEXT NOT NULL UNIQUE,
    email      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE drivers (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name  TEXT NOT NULL CHECK (btrim(full_name) <> ''),
    phone      TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vehicles (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plate      TEXT NOT NULL UNIQUE,
    owner_id   BIGINT NOT NULL REFERENCES owners (id) ON DELETE RESTRICT,
    seats      INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 100),
    status     TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'idle', 'offline')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX vehicles_owner_idx ON vehicles (owner_id);

CREATE TABLE routes (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code      TEXT NOT NULL UNIQUE CHECK (btrim(code) <> ''),
    name      TEXT NOT NULL CHECK (btrim(name) <> ''),
    base_fare BIGINT NOT NULL CHECK (base_fare > 0),
    color     TEXT,
    active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shifts (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vehicle_id BIGINT NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT,
    driver_id  BIGINT NOT NULL REFERENCES drivers (id) ON DELETE RESTRICT,
    route_id   BIGINT REFERENCES routes (id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at   TIMESTAMPTZ,
    CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE INDEX shifts_vehicle_started_idx ON shifts (vehicle_id, started_at DESC);
CREATE INDEX shifts_driver_started_idx ON shifts (driver_id, started_at DESC);
CREATE UNIQUE INDEX shifts_one_open_per_vehicle_idx ON shifts (vehicle_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX shifts_one_open_per_driver_idx ON shifts (driver_id) WHERE ended_at IS NULL;

CREATE TABLE location_pings (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vehicle_id  BIGINT NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
    shift_id    BIGINT REFERENCES shifts (id) ON DELETE SET NULL,
    ts          TIMESTAMPTZ NOT NULL,
    lat         NUMERIC(9,6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng         NUMERIC(9,6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
    accuracy    DOUBLE PRECISION NOT NULL CHECK (accuracy >= 0),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Latest ping per vehicle:
--   SELECT DISTINCT ON (vehicle_id) vehicle_id, lat, lng, ts
--   FROM location_pings ORDER BY vehicle_id, ts DESC, id DESC;
CREATE INDEX location_pings_latest_per_vehicle_idx
    ON location_pings (vehicle_id, ts DESC, id DESC);

CREATE TABLE fares (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vehicle_id  BIGINT NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT,
    shift_id    BIGINT REFERENCES shifts (id) ON DELETE SET NULL,
    amount      BIGINT NOT NULL CHECK (amount > 0),
    currency    CHAR(3) NOT NULL DEFAULT 'NGN',
    method      TEXT NOT NULL CHECK (method IN ('cash', 'mobile_money')),
    ts          TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    provider_ref TEXT
);

COMMENT ON COLUMN location_pings.accuracy IS 'Horizontal accuracy radius in metres, from GeolocationPosition.coords.accuracy.';
COMMENT ON COLUMN fares.amount IS 'Minor units of currency (kobo for NGN): 500 means NGN 5.00.';
COMMENT ON COLUMN fares.method IS 'Payment method posted by the driver app: cash or mobile_money.';
COMMENT ON COLUMN fares.provider_ref IS 'Optional mobile money transaction reference; NULL for cash fares.';

-- Fares per vehicle per day (Lagos day), covering index for daily takings:
--   SELECT vehicle_id, sum(amount) FROM fares
--   WHERE vehicle_id = $1
--     AND ts >= $2 AND ts < $3
--   GROUP BY vehicle_id;
CREATE INDEX fares_vehicle_day_idx ON fares (vehicle_id, ts) INCLUDE (amount, method, currency);

COMMIT;
