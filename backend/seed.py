"""Deterministic demo data so the API is useful after a single command."""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from . import config
from .db import get_session_factory
from .models import Driver, Fare, LocationPing, Owner, Route, Shift, Vehicle, utcnow

OWNERS = [
    ("+2348010000001", "Ada Okafor"),
    ("+2348010000002", "Musa Bello"),
]
ROUTES = [
    ("A", "Ikeja -> Oshodi -> Mile 2", 50000),
    ("B", "Yaba -> Obalende -> CMS", 40000),
    ("C", "Ojota -> Ketu -> Mile 12", 30000),
    ("D", "Lekki Phase 1 -> Ajah", 70000),
]
DRIVERS = [
    "Tunde Bakare", "Chinedu Okafor", "Musa Ibrahim", "Segun Adeyemi",
    "Emeka Nwosu", "Yusuf Bello", "Kunle Ajayi", "Ifeanyi Eze",
]
PLATES = [
    "LND 482 XA", "KJA 117 EP", "LSR 903 KT", "APP 245 GG",
    "EKY 660 BD", "AAA 318 JX", "FST 771 KN", "MUS 552 LA",
]
POSITIONS = [
    (6.5244, 3.3792), (6.5550, 3.3430), (6.5095, 3.3711), (6.4500, 3.4040),
    (6.5866, 3.3800), (6.5968, 3.3893), (6.4474, 3.4723), (6.4360, 3.5250),
]


def seed_demo(db: Session) -> None:
    """Insert demo data only when the database has no owners."""
    if db.query(Owner).count():
        return

    owners = [Owner(phone=phone, name=name) for phone, name in OWNERS]
    db.add_all(owners)
    db.flush()

    db.add_all(
        Route(id=rid, name=name, fare_minor=fare, city_timezone=config.CITY_TIMEZONE)
        for rid, name, fare in ROUTES
    )
    db.flush()

    drivers: list[Driver] = []
    vehicles: list[Vehicle] = []
    for index, (name, plate) in enumerate(zip(DRIVERS, PLATES)):
        owner = owners[index % 2]
        driver = Driver(
            owner_id=owner.id,
            phone=f"+234802000{index + 1:04d}",
            name=name,
        )
        db.add(driver)
        db.flush()
        drivers.append(driver)
        vehicles.append(
            Vehicle(
                id=f"v{index + 1}",
                owner_id=owner.id,
                driver_id=driver.id,
                route_id=ROUTES[index % len(ROUTES)][0],
                plate=plate,
                seats=14,
                active=index != 7,
            )
        )
    db.add_all(vehicles)
    db.flush()

    shift = Shift(vehicle_id="v1", driver_id=drivers[0].id, started_at=utcnow() - timedelta(hours=2))
    db.add(shift)
    db.flush()

    for index, vehicle in enumerate(vehicles[:6]):
        db.add(
            LocationPing(
                vehicle_id=vehicle.id,
                shift_id=shift.id if vehicle.id == "v1" else None,
                lat=POSITIONS[index][0],
                lng=POSITIONS[index][1],
                accuracy=12.0 + index,
                ts=utcnow() - timedelta(minutes=index),
            )
        )

    zone = ZoneInfo(config.CITY_TIMEZONE)
    today = datetime.now(zone).date()
    yesterday = today - timedelta(days=1)
    fares = [
        ("v1", 50000, "cash", datetime.combine(yesterday, time(23, 30), tzinfo=zone)),
        ("v1", 40000, "mobile_money", datetime.combine(today, time(0, 30), tzinfo=zone)),
        ("v1", 50000, "cash", datetime.combine(today, time(8, 15), tzinfo=zone)),
        ("v3", 30000, "cash", datetime.combine(yesterday, time(22, 10), tzinfo=zone)),
        ("v3", 30000, "mobile_money", datetime.combine(today, time(7, 45), tzinfo=zone)),
    ]
    for vehicle_id, amount_minor, method, local_ts in fares:
        db.add(
            Fare(
                vehicle_id=vehicle_id,
                amount_minor=amount_minor,
                method=method,
                ts=local_ts.astimezone(timezone.utc),
                shift_id=shift.id if vehicle_id == "v1" else None,
            )
        )
    db.commit()


def seed_if_empty() -> None:
    if not config.SEED_DEMO:
        return
    session = get_session_factory()()
    try:
        seed_demo(session)
    finally:
        session.close()
