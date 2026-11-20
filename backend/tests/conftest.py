"""Shared pytest fixtures: in-memory SQLite with seeded demo data."""

from __future__ import annotations

import logging
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app import app
from backend.db import Base, configure_for_tests, get_db
from backend.seed import seed_demo

OWNER_1 = "+2348010000001"
OWNER_2 = "+2348010000002"
DRIVER_1 = "+2348020000001"
DRIVER_2 = "+2348020000002"


@pytest.fixture()
def engine():
    created = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(created)
    yield created
    created.dispose()


@pytest.fixture()
def session(engine):
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    opened = factory()
    seed_demo(opened)
    yield opened
    opened.close()


@pytest.fixture()
def client(engine, session):
    configure_for_tests(engine)

    def override_db():
        yield session

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def sign_in(client: TestClient, caplog, phone: str, role: str = "owner", **extra) -> dict:
    """Run the real OTP flow and read the code from the captured console log."""
    caplog.clear()
    with caplog.at_level(logging.INFO, logger="backend.auth"):
        response = client.post("/auth/request-otp", json={"phone": phone, "role": role})
    assert response.status_code == 200, response.text
    messages = [record.message for record in caplog.records if "OTP for" in record.message]
    assert messages, "OTP was not logged"
    match = re.search(r":\s*(\d{6})\s*$", messages[-1])
    assert match, messages[-1]
    response = client.post(
        "/auth/verify-otp",
        json={"phone": phone, "role": role, "code": match.group(1), **extra},
    )
    assert response.status_code == 200, response.text
    return response.json()


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
