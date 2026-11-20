"""Phone/OTP sign-in with console OTP delivery (pilot mode)."""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from dataclasses import dataclass
from datetime import timedelta

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from . import config
from .db import get_db
from .models import AuthToken, Driver, OtpCode, Owner, as_utc, utcnow
from .schemas import OtpRequestIn, OtpVerifyIn, TokenOut

logger = logging.getLogger(__name__)

ROLE_OWNER = "owner"
ROLE_DRIVER = "driver"


@dataclass(frozen=True)
class UserContext:
    principal_id: int
    phone: str
    role: str
    name: str


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _code_hash(phone: str, role: str, code: str) -> str:
    return _hash(f"otp:{phone}:{role}:{code}")


def request_otp(db: Session, payload: OtpRequestIn) -> dict:
    code = f"{secrets.randbelow(1_000_000):06d}"
    row = OtpCode(
        phone=payload.phone,
        role=payload.role,
        code_hash=_code_hash(payload.phone, payload.role, code),
        expires_at=utcnow() + timedelta(seconds=config.OTP_TTL_SECONDS),
    )
    db.add(row)
    db.commit()
    # Pilot mode: no SMS provider. The code is deliberately printed to the console.
    logger.info("OTP for %s (%s): %s", payload.phone, payload.role, code)
    return {
        "phone": payload.phone,
        "role": payload.role,
        "expiresIn": config.OTP_TTL_SECONDS,
    }


def verify_otp(db: Session, payload: OtpVerifyIn) -> TokenOut:
    row = (
        db.query(OtpCode)
        .filter(
            OtpCode.phone == payload.phone,
            OtpCode.role == payload.role,
            OtpCode.consumed_at.is_(None),
        )
        .order_by(OtpCode.id.desc())
        .first()
    )
    if row is None or as_utc(row.expires_at) <= utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    if row.attempts >= config.MAX_OTP_ATTEMPTS:
        row.consumed_at = utcnow()
        db.commit()
        raise HTTPException(status_code=400, detail="Too many attempts, request a new code")

    if not hmac.compare_digest(row.code_hash, _code_hash(payload.phone, payload.role, payload.code)):
        row.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    row.consumed_at = utcnow()
    if payload.role == ROLE_OWNER:
        principal = db.query(Owner).filter(Owner.phone == payload.phone).first()
        if principal is None:
            principal = Owner(phone=payload.phone, name=payload.name or f"Owner {payload.phone[-4:]}")
            db.add(principal)
            db.flush()
    else:
        principal = db.query(Driver).filter(Driver.phone == payload.phone).first()
        if principal is None:
            if payload.ownerId is None:
                raise HTTPException(
                    status_code=400,
                    detail="ownerId is required when registering a new driver",
                )
            if db.query(Owner).filter(Owner.id == payload.ownerId).first() is None:
                raise HTTPException(status_code=400, detail="ownerId does not exist")
            principal = Driver(
                phone=payload.phone,
                owner_id=payload.ownerId,
                name=payload.name or f"Driver {payload.phone[-4:]}",
            )
            db.add(principal)
            db.flush()

    token = secrets.token_urlsafe(32)
    expires_at = utcnow() + timedelta(seconds=config.TOKEN_TTL_SECONDS)
    db.add(
        AuthToken(
            token_hash=_hash(token),
            phone=payload.phone,
            role=payload.role,
            principal_id=principal.id,
            expires_at=expires_at,
        )
    )
    db.commit()
    return TokenOut(
        token=token,
        role=payload.role,
        principalId=principal.id,
        phone=payload.phone,
        name=principal.name,
        expiresAt=expires_at,
    )


def current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> UserContext:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token required")
    row = db.query(AuthToken).filter(AuthToken.token_hash == _hash(token)).first()
    if row is None or as_utc(row.expires_at) <= utcnow():
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if row.role == ROLE_OWNER:
        principal = db.query(Owner).filter(Owner.id == row.principal_id).first()
    elif row.role == ROLE_DRIVER:
        principal = db.query(Driver).filter(Driver.id == row.principal_id).first()
    else:
        principal = None
    if principal is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return UserContext(
        principal_id=principal.id,
        phone=row.phone,
        role=row.role,
        name=principal.name,
    )
