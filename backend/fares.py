from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, validator
from typing import Literal
from datetime import datetime

router = APIRouter()

class FareCreate(BaseModel):
    vehicleId: int = Field(..., gt=0, description="Identifier of the vehicle")
    amount: float = Field(..., gt=0, description="Fare amount, must be positive")
    method: Literal["cash", "mobile_money"] = Field(..., description="Payment method")
    ts: datetime = Field(..., description="Timestamp of the fare")

    @validator("amount")
    def amount_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("amount must be greater than 0")
        return v

# In‑memory storage for demonstration / testing purposes.
FARES_DB: list[dict] = []

@router.post("/fares", status_code=201)
def create_fare(fare: FareCreate):
    """Validate and store a fare.

    Returns the stored fare with an auto‑generated ``id``.
    """
    record = fare.dict()
    record["id"] = len(FARES_DB) + 1
    FARES_DB.append(record)
    return record
