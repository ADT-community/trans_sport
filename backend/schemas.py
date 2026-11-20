"""Request/response schemas and strict input validation."""

from __future__ import annotations

import math
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

MIN_TS = datetime(2000, 1, 1, tzinfo=timezone.utc)
MAX_TS = datetime(2100, 1, 1, tzinfo=timezone.utc)
_PHONE_RE = re.compile(r"^\+\d{10,15}$")
_VEHICLE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$")


def parse_phone(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("phone must be a string")
    digits = re.sub(r"\D", "", value)
    if not 10 <= len(digits) <= 15:
        raise ValueError("phone must contain 10 to 15 digits")
    return "+" + digits


def parse_timestamp(value: object) -> datetime:
    """Accept epoch milliseconds (as sent by Date.now()) or an ISO-8601 string."""
    if isinstance(value, bool):
        raise ValueError("ts must be a number or an ISO-8601 string")
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            raise ValueError("ts must be finite")
        seconds = value / 1000 if abs(value) >= 1e11 else value
        try:
            result = datetime.fromtimestamp(seconds, tz=timezone.utc)
        except (OverflowError, OSError, ValueError) as exc:
            raise ValueError("ts is out of range") from exc
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            raise ValueError("ts must not be empty")
        if text.endswith(("Z", "z")):
            text = text[:-1] + "+00:00"
        try:
            result = datetime.fromisoformat(text)
        except ValueError as exc:
            raise ValueError("ts must be an ISO-8601 string") from exc
        if result.tzinfo is None:
            result = result.replace(tzinfo=timezone.utc)
        result = result.astimezone(timezone.utc)
    else:
        raise ValueError("ts must be a number or an ISO-8601 string")
    if not MIN_TS <= result <= MAX_TS:
        raise ValueError("ts is out of range")
    return result


def parse_amount_to_minor(value: object) -> int:
    """Convert NGN major units (web app) to integer kobo used by the DB."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("amount must be a number")
    if not math.isfinite(value) or value <= 0:
        raise ValueError("amount must be a positive finite number")
    try:
        minor = Decimal(str(value)) * 100
    except InvalidOperation as exc:
        raise ValueError("amount is invalid") from exc
    if minor != minor.to_integral_value():
        raise ValueError("amount must not have more than 2 decimal places")
    result = int(minor)
    if result <= 0 or result > 10**12:
        raise ValueError("amount is out of range")
    return result


def _number(value: object, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a number")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{name} must be finite")
    return result


class OtpRequestIn(BaseModel):
    phone: str
    role: Literal["owner", "driver"] = "owner"

    @field_validator("phone", mode="before")
    @classmethod
    def _phone(cls, value: object) -> str:
        return parse_phone(value)


class OtpVerifyIn(OtpRequestIn):
    code: str = Field(min_length=6, max_length=6)

    name: str | None = Field(default=None, max_length=120)
    ownerId: int | None = Field(default=None, gt=0)

    @field_validator("code", mode="before")
    @classmethod
    def _code(cls, value: object) -> str:
        if isinstance(value, int) and not isinstance(value, bool):
            value = f"{value:06d}"
        if not isinstance(value, str) or not value.isdigit():
            raise ValueError("code must be 6 digits")
        return value


class TokenOut(BaseModel):
    token: str
    tokenType: Literal["bearer"] = "bearer"
    role: Literal["owner", "driver"]
    principalId: int
    phone: str
    name: str
    expiresAt: datetime


class LocationIn(BaseModel):
    vehicleId: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy: float = Field(ge=0)
    ts: datetime

    @field_validator("vehicleId", mode="before")
    @classmethod
    def _vehicle(cls, value: object) -> str:
        if not isinstance(value, str) or not _VEHICLE_RE.fullmatch(value.strip()):
            raise ValueError("vehicleId is invalid")
        return value.strip()

    @field_validator("lat", "lng", "accuracy", mode="before")
    @classmethod
    def _numbers(cls, value: object, info) -> float:
        return _number(value, info.field_name)

    @field_validator("ts", mode="before")
    @classmethod
    def _ts(cls, value: object) -> datetime:
        return parse_timestamp(value)


class FareIn(BaseModel):
    vehicleId: str
    amount: float
    method: Literal["cash", "mobile_money"]
    ts: datetime

    @field_validator("vehicleId", mode="before")
    @classmethod
    def _vehicle(cls, value: object) -> str:
        if not isinstance(value, str) or not _VEHICLE_RE.fullmatch(value.strip()):
            raise ValueError("vehicleId is invalid")
        return value.strip()

    @field_validator("amount", mode="before")
    @classmethod
    def _minor(cls, value: object) -> float:
        parse_amount_to_minor(value)
        return _number(value, "amount")

    @field_validator("ts", mode="before")
    @classmethod
    def _ts(cls, value: object) -> datetime:
        return parse_timestamp(value)


class ShiftStartIn(BaseModel):
    vehicleId: str
    driverId: int | None = Field(default=None, gt=0)

    @field_validator("vehicleId", mode="before")
    @classmethod
    def _vehicle(cls, value: object) -> str:
        if not isinstance(value, str) or not _VEHICLE_RE.fullmatch(value.strip()):
            raise ValueError("vehicleId is invalid")
        return value.strip()


class LatestVehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    vehicleId: str
    plate: str
    routeId: str | None
    lat: float
    lng: float
    accuracy: float
    ts: datetime
    shiftId: int | None = None


class PingOut(BaseModel):
    id: int
    vehicleId: str
    shiftId: int | None
    lat: float
    lng: float
    accuracy: float
    ts: datetime


class FareOut(BaseModel):
    id: int
    vehicleId: str
    shiftId: int | None
    amount: float
    amountMinor: int
    method: str
    ts: datetime


class DayTotals(BaseModel):
    date: str
    cashMinor: int
    mobileMoneyMinor: int
    totalMinor: int
    cash: float
    mobileMoney: float
    total: float
    fareCount: int


class EarningsOut(BaseModel):
    vehicleId: str
    plate: str
    timezone: str
    currency: str
    days: int
    fromDate: str
    toDate: str
    daily: list[DayTotals]
    totals: DayTotals


def minor_to_major(minor: int) -> float:
    return round(minor / 100, 2)


def local_dates(timezone_name: str, days: int) -> tuple[datetime, datetime, str, str]:
    """Return UTC [start, end) bounds for the last N local calendar days."""
    from zoneinfo import ZoneInfo

    zone = ZoneInfo(timezone_name)
    today = datetime.now(zone).date()
    start_date = today - timedelta(days=days - 1)
    end_date = today + timedelta(days=1)
    start_local = datetime.combine(start_date, datetime.min.time(), tzinfo=zone)
    end_local = datetime.combine(end_date, datetime.min.time(), tzinfo=zone)
    return (
        start_local.astimezone(timezone.utc),
        end_local.astimezone(timezone.utc),
        start_date.isoformat(),
        today.isoformat(),
    )
