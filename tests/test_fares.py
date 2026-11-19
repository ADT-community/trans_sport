import pytest
from fastapi.testclient import TestClient
from backend.main import app  # Adjust import if your entry point differs

client = TestClient(app)

@pytest.fixture(autouse=True)
def clear_db():
    # Reset the in‑memory DB before each test
    from backend.fares import FARES_DB
    FARES_DB.clear()
    yield
    FARES_DB.clear()


def test_create_fare_success():
    payload = {
        "vehicleId": 1,
        "amount": 12.5,
        "method": "cash",
        "ts": "2023-01-01T12:00:00Z"
    }
    response = client.post("/fares", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == 1
    for key in payload:
        assert data[key] == payload[key]


def test_create_fare_invalid_method():
    payload = {
        "vehicleId": 1,
        "amount": 10,
        "method": "credit_card",
        "ts": "2023-01-01T12:00:00Z"
    }
    response = client.post("/fares", json=payload)
    assert response.status_code == 422  # FastAPI returns 422 for validation errors


def test_create_fare_negative_amount():
    payload = {
        "vehicleId": 1,
        "amount": -5,
        "method": "cash",
        "ts": "2023-01-01T12:00:00Z"
    }
    response = client.post("/fares", json=payload)
    assert response.status_code == 422
