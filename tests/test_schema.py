import os
import uuid
import pytest
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta, timezone


@pytest.fixture(scope="session")
def db_connection():
    """Create a database connection for testing."""
    database_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/trans_sport_test")
    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    yield conn
    conn.close()


@pytest.fixture(scope="session")
def cursor(db_connection):
    """Create a cursor for testing."""
    cur = db_connection.cursor(cursor_factory=RealDictCursor)
    yield cur
    cur.close()


@pytest.fixture(scope="session")
def apply_schema(cursor):
    """Apply the schema to the test database."""
    with open("schema.sql", "r") as f:
        schema_sql = f.read()
    cursor.execute(schema_sql)


@pytest.fixture(scope="session")
def test_data(cursor, apply_schema):
    """Insert test data for validation."""
    # Create test user (owner)
    cursor.execute("""
        INSERT INTO users (full_name, email, phone, role)
        VALUES ('Test Owner', 'owner@test.com', '+254700000001', 'owner')
        RETURNING id
    """)
    owner_id = cursor.fetchone()["id"]

    # Create test user (driver)
    cursor.execute("""
        INSERT INTO users (full_name, email, phone, role)
        VALUES ('Test Driver', 'driver@test.com', '+254700000002', 'driver')
        RETURNING id
    """)
    driver_id = cursor.fetchone()["id"]

    # Create test vehicle
    cursor.execute("""
        INSERT INTO vehicles (owner_id, registration_number, make, model, year, capacity)
        VALUES (%s, 'TEST123', 'Toyota', 'Coaster', 2020, 30)
        RETURNING id
    """, (owner_id,))
    vehicle_id = cursor.fetchone()["id"]

    # Create test route
    cursor.execute("""
        INSERT INTO routes (origin, destination, distance_km, estimated_duration_minutes)
        VALUES ('Nairobi', 'Mombasa', 470.0, 360)
        RETURNING id
    """)
    route_id = cursor.fetchone()["id"]

    # Create test trip
    departure = datetime.now(timezone.utc) + timedelta(days=1)
    arrival = departure + timedelta(hours=6)
    cursor.execute("""
        INSERT INTO trips (vehicle_id, driver_id, route_id, scheduled_departure, scheduled_arrival, seats_available)
        VALUES (%s, %s, %s, %s, %s, 30)
        RETURNING id
    """, (vehicle_id, driver_id, route_id, departure, arrival))
    trip_id = cursor.fetchone()["id"]

    # Create cash fare
    cursor.execute("""
        INSERT INTO fares (trip_id, passenger_name, amount, payment_type, is_paid, paid_at)
        VALUES (%s, 'Cash Passenger', 1500.00, 'cash', TRUE, NOW())
        RETURNING id
    """, (trip_id,))
    cash_fare_id = cursor.fetchone()["id"]

    # Create mobile money fare
    cursor.execute("""
        INSERT INTO fares (trip_id, passenger_name, amount, payment_type, transaction_ref, is_paid, paid_at)
        VALUES (%s, 'Mobile Passenger', 1500.00, 'mobile_money', 'MPESA123456', TRUE, NOW())
        RETURNING id
    """, (trip_id,))
    mobile_fare_id = cursor.fetchone()["id"]

    return {
        "owner_id": owner_id,
        "driver_id": driver_id,
        "vehicle_id": vehicle_id,
        "route_id": route_id,
        "trip_id": trip_id,
        "cash_fare_id": cash_fare_id,
        "mobile_fare_id": mobile_fare_id,
    }


def test_tables_exist(cursor, apply_schema):
    """Verify all required tables exist."""
    cursor.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'vehicles', 'routes', 'trips', 'fares')
    """)
    tables = {row["table_name"] for row in cursor.fetchall()}
    expected_tables = {"users", "vehicles", "routes", "trips", "fares"}
    assert expected_tables.issubset(tables), f"Missing tables: {expected_tables - tables}"


def test_foreign_keys(cursor, apply_schema):
    """Verify foreign key relationships are correctly defined."""
    cursor.execute("""
        SELECT
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
            ON tc.constraint_name = ccu.constraint_name
            AND tc.table_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
    """)
    fks = {(row["table_name"], row["column_name"], row["foreign_table_name"], row["foreign_column_name"])
           for row in cursor.fetchall()}

    expected_fks = {
        ("vehicles", "owner_id", "users", "id"),
        ("trips", "vehicle_id", "vehicles", "id"),
        ("trips", "driver_id", "users", "id"),
        ("trips", "route_id", "routes", "id"),
        ("fares", "trip_id", "trips", "id"),
    }
    assert expected_fks.issubset(fks), f"Missing foreign keys: {expected_fks - fks}"


def test_payment_types(cursor, test_data):
    """Verify fares support both cash and mobile money payment types."""
    cursor.execute("""
        SELECT DISTINCT payment_type FROM fares
    """)
    payment_types = {row["payment_type"] for row in cursor.fetchall()}
    assert "cash" in payment_types, "Cash payment type not found"
    assert "mobile_money" in payment_types, "Mobile money payment type not found"


def test_mobile_money_requires_transaction_ref(cursor, test_data):
    """Verify mobile money fares have transaction references."""
    cursor.execute("""
        SELECT id, transaction_ref FROM fares WHERE payment_type = 'mobile_money'
    """)
    for row in cursor.fetchall():
        assert row["transaction_ref"] is not None, f"Mobile money fare {row['id']} missing transaction_ref"


def test_cash_fares_have_no_transaction_ref(cursor, test_data):
    """Verify cash fares do not have transaction references."""
    cursor.execute("""
        SELECT id, transaction_ref FROM fares WHERE payment_type = 'cash'
    """)
    for row in cursor.fetchall():
        assert row["transaction_ref"] is None, f"Cash fare {row['id']} should not have transaction_ref"


def test_unique_registration_number(cursor, apply_schema):
    """Verify registration number uniqueness constraint."""
    with pytest.raises(psycopg2.errors.UniqueViolation):
        cursor.execute("""
            INSERT INTO vehicles (owner_id, registration_number, make, model, year, capacity)
            VALUES (%s, 'TEST123', 'Toyota', 'Coaster', 2020, 30)
        """, (test_data["owner_id"],))


def test_valid_trip_status(cursor, apply_schema):
    """Verify trip status constraint."""
    with pytest.raises(psycopg2.errors.CheckViolation):
        cursor.execute("""
            INSERT INTO trips (vehicle_id, driver_id, route_id, scheduled_departure, scheduled_arrival, status)
            VALUES (%s, %s, %s, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', 'invalid_status')
        """, (test_data["vehicle_id"], test_data["driver_id"], test_data["route_id"]))


def test_fare_amount_non_negative(cursor, apply_schema):
    """Verify fare amount is non-negative."""
    with pytest.raises(psycopg2.errors.CheckViolation):
        cursor.execute("""
            INSERT INTO fares (trip_id, passenger_name, amount, payment_type)
            VALUES (%s, 'Test Passenger', -100.00, 'cash')
        """, (test_data["trip_id"],))


def test_updated_at_trigger(cursor, test_data):
    """Verify updated_at trigger works."""
    cursor.execute("SELECT updated_at FROM users WHERE id = %s", (test_data["owner_id"],))
    original_updated_at = cursor.fetchone()["updated_at"]

    import time
    time.sleep(1.1)  # Ensure timestamp changes

    cursor.execute("UPDATE users SET full_name = 'Updated Owner' WHERE id = %s", (test_data["owner_id"],))
    cursor.execute("SELECT updated_at FROM users WHERE id = %s", (test_data["owner_id"],))
    new_updated_at = cursor.fetchone()["updated_at"]

    assert new_updated_at > original_updated_at, "updated_at trigger did not update timestamp"
