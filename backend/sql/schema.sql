-- trans_sport backend v1 - canonical PostgreSQL schema (PostgreSQL 12+).
-- Money is stored as integer minor units (kobo for NGN): 1 NGN = 100 kobo.
-- All timestamps are timestamptz and are written in UTC; day boundaries in
-- earnings queries are computed in the city timezone (Africa/Lagos by default).
-- No extensions are required for the pilot.

CREATE TABLE IF NOT EXISTS owners (
    id          BIGSERIAL PRIMARY KEY,
    phone       VARCHAR(20) NOT NULL UNIQUE,
    name        VARCHAR(120) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drivers (
    id          BIGSERIAL PRIMARY KEY,
    owner_id    BIGINT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
    phone       VARCHAR(20) UNIQUE,
    name        VARCHAR(120) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS routes (
    id             VARCHAR(32) PRIMARY KEY,
    name           VARCHAR(160) NOT NULL,
    fare_minor     BIGINT NOT NULL CHECK (fare_minor >= 0),
    city_timezone  VARCHAR(64) NOT NULL DEFAULT 'Africa/Lagos',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
    id          VARCHAR(64) PRIMARY KEY,       -- e.g. v1, matches web/sim.js
    owner_id    BIGINT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
    driver_id   BIGINT REFERENCES drivers(id) ON DELETE SET NULL,
    route_id    VARCHAR(32) REFERENCES routes(id) ON DELETE SET NULL,
    plate       VARCHAR(32) NOT NULL UNIQUE,
    seats       INTEGER NOT NULL CHECK (seats > 0),
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicles_owner_idx ON vehicles(owner_id);
CREATE INDEX IF NOT EXISTS vehicles_driver_idx ON vehicles(driver_id);

CREATE TABLE IF NOT EXISTS shifts (
    id          BIGSERIAL PRIMARY KEY,
    vehicle_id  VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    driver_id   BIGINT NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
    started_at  TIMESTAMPTZ NOT NULL,
    ended_at    TIMESTAMPTZ,
    CONSTRAINT ck_shifts_time_order CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS shifts_vehicle_open_idx ON shifts(vehicle_id, ended_at);
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_vehicle_idx
    ON shifts(vehicle_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_driver_idx
    ON shifts(driver_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS location_pings (
    id          BIGSERIAL PRIMARY KEY,
    vehicle_id  VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    shift_id    BIGINT REFERENCES shifts(id) ON DELETE SET NULL,
    lat         DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng         DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    accuracy    DOUBLE PRECISION NOT NULL CHECK (accuracy >= 0),
    ts          TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS location_pings_latest_per_vehicle_idx
    ON location_pings(vehicle_id, ts DESC, id DESC);

CREATE TABLE IF NOT EXISTS fares (
    id           BIGSERIAL PRIMARY KEY,
    vehicle_id   VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    shift_id     BIGINT REFERENCES shifts(id) ON DELETE SET NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    method       VARCHAR(16) NOT NULL CHECK (method IN ('cash', 'mobile_money')),
    ts           TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fares_vehicle_day_idx
    ON fares(vehicle_id, ts DESC, id DESC);

CREATE TABLE IF NOT EXISTS otp_codes (
    id          BIGSERIAL PRIMARY KEY,
    phone       VARCHAR(20) NOT NULL,
    role        VARCHAR(16) NOT NULL CHECK (role IN ('owner', 'driver')),
    code_hash   VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_codes_phone_role_idx ON otp_codes(phone, role, id DESC);

CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash    VARCHAR(64) PRIMARY KEY,
    phone         VARCHAR(20) NOT NULL,
    role          VARCHAR(16) NOT NULL CHECK (role IN ('owner', 'driver')),
    principal_id  BIGINT NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_tokens_expires_idx ON auth_tokens(expires_at);

COMMENT ON COLUMN fares.amount_minor IS 'Fare in minor units (kobo): 1 NGN = 100 kobo.';
COMMENT ON COLUMN location_pings.ts IS 'Device timestamp, UTC-normalised on ingest.';
COMMENT ON COLUMN routes.city_timezone IS 'IANA timezone used to group earnings by local calendar day.';
