"""HTTP-level tests for the backend v1 API."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select

from backend.models import OtpCode

from .conftest import DRIVER_1, DRIVER_2, OWNER_1, OWNER_2, auth_header, sign_in


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "timezone": "Africa/Lagos", "currency": "NGN"}


def test_otp_flow_and_auth_errors(client, caplog):
    bad = client.post("/auth/request-otp", json={"phone": "abc"})
    assert bad.status_code == 400

    caplog.clear()
    with caplog.at_level("INFO", logger="backend.auth"):
        requested = client.post("/auth/request-otp", json={"phone": OWNER_1, "role": "owner"})
    assert requested.status_code == 200
    assert requested.json()["expiresIn"] == 300
    assert any("OTP for" in record.message for record in caplog.records)

    wrong = client.post("/auth/verify-otp", json={"phone": OWNER_1, "role": "owner", "code": "000000"})
    assert wrong.status_code == 400

    me = client.get("/auth/me")
    assert me.status_code == 401

    token = sign_in(client, caplog, OWNER_1)["token"]
    me = client.get("/auth/me", headers=auth_header(token))
    assert me.status_code == 200
    assert me.json()["role"] == "owner"
    assert client.get("/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_expired_otp_is_rejected(client, caplog, session):
    caplog.clear()
    with caplog.at_level("INFO", logger="backend.auth"):
        assert client.post("/auth/request-otp", json={"phone": OWNER_1}).status_code == 200
    row = session.scalars(select(OtpCode).order_by(OtpCode.id.desc())).first()
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    session.commit()
    response = client.post("/auth/verify-otp", json={"phone": OWNER_1, "code": "123456"})
    assert response.status_code == 400


def test_post_location_valid_and_bad_input(client, caplog, session):
    driver = sign_in(client, caplog, DRIVER_1, role="driver")["token"]
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    good = {
        "vehicleId": "v1",
        "lat": 6.5244,
        "lng": 3.3792,
        "accuracy": 12.5,
        "ts": now_ms,
    }
    created = client.post("/locations", json=good, headers=auth_header(driver))
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["vehicleId"] == "v1"
    assert body["lat"] == 6.5244
    assert body["accuracy"] == 12.5

    for change in (
        {"lat": 91},
        {"lng": -180.1},
        {"accuracy": -1},
        {"ts": "not-a-date"},
        {"ts": True},
        {"vehicleId": ""},
        {"lat": "6.5"},
        {"ts": None},
    ):
        payload = {**good, **change}
        response = client.post("/locations", json=payload, headers=auth_header(driver))
        assert response.status_code == 400, (change, response.text)

    missing = {key: value for key, value in good.items() if key != "lat"}
    assert client.post("/locations", json=missing, headers=auth_header(driver)).status_code == 400
    assert client.post("/locations", json=good).status_code == 401


def test_post_fares_stores_minor_units(client, caplog):
    driver = sign_in(client, caplog, DRIVER_1, role="driver")["token"]
    now = datetime.now(timezone.utc).isoformat()
    created = client.post(
        "/fares",
        json={"vehicleId": "v1", "amount": 500.5, "method": "cash", "ts": now},
        headers=auth_header(driver),
    )
    assert created.status_code == 201, created.text
    assert created.json()["amountMinor"] == 50050
    assert created.json()["amount"] == 500.5

    for bad in (
        {"amount": -1},
        {"amount": 0},
        {"amount": 1.234},
        {"amount": "500"},
        {"method": "card"},
        {"method": "Cash"},
    ):
        payload = {"vehicleId": "v1", "amount": 500, "method": "cash", "ts": now, **bad}
        response = client.post("/fares", json=payload, headers=auth_header(driver))
        assert response.status_code == 400, (bad, response.text)


def test_owners_never_see_other_owners_data(client, caplog):
    owner1 = sign_in(client, caplog, OWNER_1)["token"]
    owner2 = sign_in(client, caplog, OWNER_2)["token"]

    first = client.get("/vehicles/latest", headers=auth_header(owner1)).json()["vehicles"]
    second = client.get("/vehicles/latest", headers=auth_header(owner2)).json()["vehicles"]
    assert {v["vehicleId"] for v in first} == {"v1", "v3", "v5"}
    assert {v["vehicleId"] for v in second} == {"v2", "v4", "v6"}

    assert client.get("/vehicles/v1/earnings", headers=auth_header(owner2)).status_code == 400
    assert client.get("/vehicles/v1/earnings", headers=auth_header(owner1)).status_code == 200
    denied = client.post(
        "/locations",
        json={
            "vehicleId": "v1",
            "lat": 6.5,
            "lng": 3.3,
            "accuracy": 5,
            "ts": int(datetime.now(timezone.utc).timestamp() * 1000),
        },
        headers=auth_header(owner2),
    )
    assert denied.status_code == 400


def test_drivers_only_use_assigned_vehicles(client, caplog):
    driver = sign_in(client, caplog, DRIVER_1, role="driver")["token"]
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    ping = {
        "vehicleId": "v2",
        "lat": 6.5,
        "lng": 3.3,
        "accuracy": 5,
        "ts": now_ms,
    }
    assert client.post("/locations", json=ping, headers=auth_header(driver)).status_code == 400
    ping["vehicleId"] = "v1"
    assert client.post("/locations", json=ping, headers=auth_header(driver)).status_code == 201


def test_latest_returns_newest_ping_per_vehicle(client, caplog):
    owner = sign_in(client, caplog, OWNER_1)["token"]
    driver = sign_in(client, caplog, DRIVER_1, role="driver")["token"]
    now = datetime.now(timezone.utc)
    older = int((now - timedelta(days=1)).timestamp() * 1000)
    newer = int((now + timedelta(hours=1)).timestamp() * 1000)
    for ts, lat in ((older, 1.0), (newer, 9.0)):
        response = client.post(
            "/locations",
            json={"vehicleId": "v1", "lat": lat, "lng": 3.3, "accuracy": 5, "ts": ts},
            headers=auth_header(driver),
        )
        assert response.status_code == 201

    rows = client.get("/vehicles/latest", headers=auth_header(owner)).json()["vehicles"]
    v1 = next(row for row in rows if row["vehicleId"] == "v1")
    assert v1["lat"] == 9.0
    assert len({row["vehicleId"] for row in rows}) == len(rows)


def test_earnings_respect_city_timezone_and_methods(client, caplog):
    owner = sign_in(client, caplog, OWNER_1)["token"]
    response = client.get("/vehicles/v1/earnings?days=2", headers=auth_header(owner))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["timezone"] == "Africa/Lagos"
    assert body["currency"] == "NGN"
    assert body["days"] == 2
    assert body["totals"]["cashMinor"] == 100000
    assert body["totals"]["mobileMoneyMinor"] == 40000
    assert body["totals"]["totalMinor"] == 140000
    assert len(body["daily"]) == 2

    yesterday, today = body["daily"]
    assert yesterday["date"] == body["fromDate"]
    assert yesterday["cashMinor"] == 50000
    assert yesterday["mobileMoneyMinor"] == 0
    assert today["date"] == body["toDate"]
    assert today["mobileMoneyMinor"] == 40000
    assert today["cashMinor"] == 50000

    assert client.get("/vehicles/v1/earnings?days=0", headers=auth_header(owner)).status_code == 400
    assert client.get("/vehicles/v1/earnings?days=91", headers=auth_header(owner)).status_code == 400
    assert client.get("/vehicles/v1/earnings?days=abc", headers=auth_header(owner)).status_code == 400


def test_shift_lifecycle_links_pings(client, caplog):
    driver = sign_in(client, caplog, DRIVER_2, role="driver")["token"]
    started = client.post("/shifts/start", json={"vehicleId": "v2"}, headers=auth_header(driver))
    assert started.status_code == 200, started.text
    shift_id = started.json()["id"]
    assert client.post("/shifts/start", json={"vehicleId": "v2"}, headers=auth_header(driver)).status_code == 400

    ping = {
        "vehicleId": "v2",
        "lat": 6.5,
        "lng": 3.3,
        "accuracy": 5,
        "ts": int(datetime.now(timezone.utc).timestamp() * 1000),
    }
    first = client.post("/locations", json=ping, headers=auth_header(driver)).json()
    assert first["shiftId"] == shift_id

    ended = client.post("/shifts/end?vehicleId=v2", headers=auth_header(driver))
    assert ended.status_code == 200, ended.text
    second = client.post("/locations", json=ping, headers=auth_header(driver)).json()
    assert second["shiftId"] is None
    assert client.post("/shifts/end?vehicleId=v2", headers=auth_header(driver)).status_code == 400


def test_postgresql_schema_contains_required_objects():
    schema = (Path(__file__).resolve().parents[1] / "sql" / "schema.sql").read_text(encoding="utf-8")
    for table in (
        "owners", "vehicles", "drivers", "routes", "shifts",
        "location_pings", "fares", "otp_codes", "auth_tokens",
    ):
        assert f"CREATE TABLE IF NOT EXISTS {table} (" in schema
    assert "amount_minor BIGINT NOT NULL CHECK (amount_minor > 0)" in schema
    assert "method IN ('cash', 'mobile_money')" in schema
    assert "location_pings_latest_per_vehicle_idx" in schema
    assert "fares_vehicle_day_idx" in schema
