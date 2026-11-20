"""FastAPI application for the trans_sport pilot backend."""

from __future__ import annotations

import logging

from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from . import config, service
from .auth import UserContext, current_user, request_otp, verify_otp
from .db import get_db
from .schemas import (
    EarningsOut,
    FareIn,
    FareOut,
    LatestVehicleOut,
    LocationIn,
    OtpRequestIn,
    OtpVerifyIn,
    PingOut,
    ShiftStartIn,
    TokenOut,
)

logger = logging.getLogger(__name__)

app = FastAPI(
    title="trans_sport API",
    version="1.0.0",
    description="Backend v1: location pings, fares, earnings and phone sign-in.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request, exc: RequestValidationError) -> JSONResponse:
    errors = [
        {"field": ".".join(str(part) for part in error.get("loc", [])[1:]), "message": error.get("msg", "invalid")}
        for error in exc.errors()
    ]
    return JSONResponse(status_code=400, content={"detail": "Invalid request", "errors": errors})


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "timezone": config.CITY_TIMEZONE, "currency": config.CURRENCY}


@app.post("/auth/request-otp")
def auth_request_otp(payload: OtpRequestIn, db: Session = Depends(get_db)) -> dict:
    return request_otp(db, payload)


@app.post("/auth/verify-otp", response_model=TokenOut)
def auth_verify_otp(payload: OtpVerifyIn, db: Session = Depends(get_db)) -> TokenOut:
    return verify_otp(db, payload)


@app.get("/auth/me")
def auth_me(user: UserContext = Depends(current_user)) -> dict:
    return {"principalId": user.principal_id, "phone": user.phone, "role": user.role, "name": user.name}


@app.get("/vehicles")
def vehicles(db: Session = Depends(get_db), user: UserContext = Depends(current_user)) -> list[dict]:
    return service.list_vehicles(db, user)


@app.post("/locations", response_model=PingOut, status_code=status.HTTP_201_CREATED)
def post_location(
    payload: LocationIn,
    db: Session = Depends(get_db),
    user: UserContext = Depends(current_user),
) -> dict:
    return service.record_ping(db, user, payload)


@app.post("/fares", response_model=FareOut, status_code=status.HTTP_201_CREATED)
def post_fare(
    payload: FareIn,
    db: Session = Depends(get_db),
    user: UserContext = Depends(current_user),
) -> dict:
    return service.record_fare(db, user, payload)


@app.get("/vehicles/latest", response_model=dict)
def vehicles_latest(
    db: Session = Depends(get_db),
    user: UserContext = Depends(current_user),
) -> dict:
    return service.latest_pings(db, user)


@app.get("/vehicles/{vehicle_id}/earnings", response_model=EarningsOut)
def vehicle_earnings(
    vehicle_id: str,
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
    user: UserContext = Depends(current_user),
) -> EarningsOut:
    return service.earnings(db, user, vehicle_id, days)


@app.post("/shifts/start")
def shift_start(
    payload: ShiftStartIn,
    db: Session = Depends(get_db),
    user: UserContext = Depends(current_user),
) -> dict:
    return service.start_shift(db, user, payload)


@app.post("/shifts/end")
def shift_end(
    vehicleId: str = Query(..., min_length=1, max_length=64),
    db: Session = Depends(get_db),
    user: UserContext = Depends(current_user),
) -> dict:
    return service.end_shift(db, user, vehicleId)
