"""Business logic: vehicle scoping, pings, fares and earnings."""

from __future__ import annotations

from datetime import date, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import config
from .auth import UserContext
from .models import Fare, LocationPing, Route, Shift, Vehicle, as_utc, utcnow
from .schemas import (
    DayTotals,
    EarningsOut,
    FareIn,
    LocationIn,
    ShiftStartIn,
    minor_to_major,
    local_dates,
)


def _scope_filter(user: UserContext):
    if user.role == "owner":
        return Vehicle.owner_id == user.principal_id
    if user.role == "driver":
        return Vehicle.driver_id == user.principal_id
    raise HTTPException(status_code=403, detail="Unsupported role")


def accessible_vehicle(db: Session, user: UserContext, vehicle_id: str) -> Vehicle:
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).filter(_scope_filter(user)).first()
    if vehicle is None:
        raise HTTPException(status_code=400, detail="Unknown vehicle or no access")
    return vehicle


def list_vehicles(db: Session, user: UserContext) -> list[dict]:
    rows = db.query(Vehicle).filter(_scope_filter(user)).order_by(Vehicle.id).all()
    return [
        {
            "vehicleId": row.id,
            "plate": row.plate,
            "routeId": row.route_id,
            "driverId": row.driver_id,
            "seats": row.seats,
            "active": row.active,
        }
        for row in rows
    ]


def active_shift(db: Session, vehicle_id: str) -> Shift | None:
    return (
        db.query(Shift)
        .filter(Shift.vehicle_id == vehicle_id, Shift.ended_at.is_(None))
        .order_by(Shift.started_at.desc(), Shift.id.desc())
        .first()
    )


def record_ping(db: Session, user: UserContext, payload: LocationIn) -> dict:
    vehicle = accessible_vehicle(db, user, payload.vehicleId)
    shift = active_shift(db, vehicle.id)
    ping = LocationPing(
        vehicle_id=vehicle.id,
        shift_id=shift.id if shift else None,
        lat=payload.lat,
        lng=payload.lng,
        accuracy=payload.accuracy,
        ts=payload.ts,
    )
    db.add(ping)
    db.commit()
    return {
        "id": ping.id,
        "vehicleId": ping.vehicle_id,
        "shiftId": ping.shift_id,
        "lat": ping.lat,
        "lng": ping.lng,
        "accuracy": ping.accuracy,
        "ts": as_utc(ping.ts),
    }


def record_fare(db: Session, user: UserContext, payload: FareIn) -> dict:
    from .schemas import parse_amount_to_minor

    vehicle = accessible_vehicle(db, user, payload.vehicleId)
    shift = active_shift(db, vehicle.id)
    minor = parse_amount_to_minor(payload.amount)
    fare = Fare(
        vehicle_id=vehicle.id,
        shift_id=shift.id if shift else None,
        amount_minor=minor,
        method=payload.method,
        ts=payload.ts,
    )
    db.add(fare)
    db.commit()
    return {
        "id": fare.id,
        "vehicleId": fare.vehicle_id,
        "shiftId": fare.shift_id,
        "amount": minor_to_major(minor),
        "amountMinor": minor,
        "method": fare.method,
        "ts": as_utc(fare.ts),
    }


def start_shift(db: Session, user: UserContext, payload: ShiftStartIn) -> dict:
    vehicle = accessible_vehicle(db, user, payload.vehicleId)
    if user.role != "driver":
        raise HTTPException(status_code=403, detail="Only a driver can start a shift")
    if payload.driverId is not None and payload.driverId != user.principal_id:
        raise HTTPException(status_code=400, detail="driverId does not match the signed-in driver")
    existing = active_shift(db, vehicle.id)
    if existing is not None:
        raise HTTPException(status_code=400, detail="Vehicle already has an open shift")
    shift = Shift(vehicle_id=vehicle.id, driver_id=user.principal_id, started_at=utcnow())
    db.add(shift)
    db.commit()
    return {"id": shift.id, "vehicleId": shift.vehicle_id, "driverId": shift.driver_id, "startedAt": as_utc(shift.started_at)}


def end_shift(db: Session, user: UserContext, vehicle_id: str) -> dict:
    vehicle = accessible_vehicle(db, user, vehicle_id)
    if user.role != "driver":
        raise HTTPException(status_code=403, detail="Only a driver can end a shift")
    shift = active_shift(db, vehicle.id)
    if shift is None:
        raise HTTPException(status_code=400, detail="Vehicle has no open shift")
    shift.ended_at = utcnow()
    db.commit()
    return {
        "id": shift.id,
        "vehicleId": shift.vehicle_id,
        "driverId": shift.driver_id,
        "startedAt": as_utc(shift.started_at),
        "endedAt": as_utc(shift.ended_at),
    }


def latest_pings(db: Session, user: UserContext) -> dict:
    ranked = (
        db.query(
            LocationPing.vehicle_id.label("vehicle_id"),
            LocationPing.lat.label("lat"),
            LocationPing.lng.label("lng"),
            LocationPing.accuracy.label("accuracy"),
            LocationPing.ts.label("ts"),
            LocationPing.shift_id.label("shift_id"),
            func.row_number()
            .over(
                partition_by=LocationPing.vehicle_id,
                order_by=[LocationPing.ts.desc(), LocationPing.id.desc()],
            )
            .label("rn"),
        )
        .subquery("ranked")
    )
    rows = (
        db.query(
            ranked.c.vehicle_id,
            Vehicle.plate,
            Vehicle.route_id,
            ranked.c.lat,
            ranked.c.lng,
            ranked.c.accuracy,
            ranked.c.ts,
            ranked.c.shift_id,
        )
        .join(Vehicle, Vehicle.id == ranked.c.vehicle_id)
        .filter(ranked.c.rn == 1)
        .filter(_scope_filter(user))
        .order_by(Vehicle.id)
        .all()
    )
    return {
        "timezone": config.CITY_TIMEZONE,
        "vehicles": [
            {
                "vehicleId": row.vehicle_id,
                "plate": row.plate,
                "routeId": row.route_id,
                "lat": row.lat,
                "lng": row.lng,
                "accuracy": row.accuracy,
                "ts": as_utc(row.ts),
                "shiftId": row.shift_id,
            }
            for row in rows
        ],
    }


def _day_totals(day: str, rows: list[Fare], zone_name: str) -> DayTotals:
    zone = ZoneInfo(zone_name)
    cash = sum(row.amount_minor for row in rows if row.method == "cash")
    mobile = sum(row.amount_minor for row in rows if row.method == "mobile_money")
    total = cash + mobile
    return DayTotals(
        date=day,
        cashMinor=cash,
        mobileMoneyMinor=mobile,
        totalMinor=total,
        cash=minor_to_major(cash),
        mobileMoney=minor_to_major(mobile),
        total=minor_to_major(total),
        fareCount=len(rows),
    )


def earnings(db: Session, user: UserContext, vehicle_id: str, days: int) -> EarningsOut:
    vehicle = accessible_vehicle(db, user, vehicle_id)
    zone_name = config.CITY_TIMEZONE
    if vehicle.route_id:
        route = db.query(Route).filter_by(id=vehicle.route_id).first()
        if route and route.city_timezone:
            zone_name = route.city_timezone
    zone = ZoneInfo(zone_name)
    start_utc, end_utc, from_date, to_date = local_dates(zone_name, days)

    rows = (
        db.query(Fare)
        .filter(Fare.vehicle_id == vehicle.id, Fare.ts >= start_utc, Fare.ts < end_utc)
        .all()
    )
    by_day: dict[str, list[Fare]] = {}
    for fare in rows:
        local_day = as_utc(fare.ts).astimezone(zone).date().isoformat()
        by_day.setdefault(local_day, []).append(fare)

    first_day = date.fromisoformat(from_date)
    daily = [
        _day_totals(
            (first_day + timedelta(days=offset)).isoformat(),
            by_day.get((first_day + timedelta(days=offset)).isoformat(), []),
            zone_name,
        )
        for offset in range(days)
    ]
    totals = _day_totals(
        f"{from_date}..{to_date}",
        [fare for group in by_day.values() for fare in group],
        zone_name,
    )
    return EarningsOut(
        vehicleId=vehicle.id,
        plate=vehicle.plate,
        timezone=zone_name,
        currency=config.CURRENCY,
        days=days,
        fromDate=from_date,
        toDate=to_date,
        daily=daily,
        totals=totals,
    )
