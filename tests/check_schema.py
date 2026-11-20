import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "backend" / "schema.sql").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "data-model.md").read_text(encoding="utf-8")
CONFIG = (ROOT / "web" / "config.js").read_text(encoding="utf-8")

TABLES = (
    "owners",
    "vehicles",
    "drivers",
    "routes",
    "shifts",
    "location_pings",
    "fares",
)

failures = []


def check(label, condition):
    if condition:
        print(f"PASS  {label}")
    else:
        print(f"FAIL  {label}")
        failures.append(label)


def table_body(name):
    match = re.search(
        rf"CREATE TABLE {name} \((.*?)\n\);", SCHEMA, re.DOTALL | re.IGNORECASE
    )
    return match.group(1) if match else ""


def statement_text():
    text = re.sub(r"--[^\n]*", "", SCHEMA)
    return text


check("schema starts a transaction", SCHEMA.lstrip().upper().startswith("--") and "BEGIN;" in SCHEMA and "COMMIT;" in SCHEMA)
check("no extension dependency", not re.search(r"CREATE EXTENSION", SCHEMA, re.I))

for table in TABLES:
    check(f"table {table} exists", bool(table_body(table)))

for table, columns in {
    "owners": ("id", "full_name", "phone", "created_at"),
    "vehicles": ("id", "plate", "owner_id", "seats", "status"),
    "drivers": ("id", "full_name", "phone"),
    "routes": ("id", "code", "name", "base_fare"),
    "shifts": ("id", "vehicle_id", "driver_id", "route_id", "started_at", "ended_at"),
    "location_pings": ("id", "vehicle_id", "lat", "lng", "accuracy", "ts", "received_at"),
    "fares": ("id", "vehicle_id", "amount", "method", "ts", "received_at"),
}.items():
    body = table_body(table)
    missing = [c for c in columns if not re.search(rf"^\s*{c}\s+", body, re.M)]
    check(f"{table} has columns {', '.join(columns)}", not missing)

fares = table_body("fares")
pings = table_body("location_pings")
check("fares.amount is an integer in minor units", bool(re.search(r"amount\s+BIGINT", fares, re.I)) and "amount > 0" in fares)
check("fares.method allows cash and mobile_money only", bool(re.search(r"method IN \('cash', 'mobile_money'\)", fares)))
check("fares.currency defaults to NGN", bool(re.search(r"currency\s+CHAR\(3\)\s+NOT NULL DEFAULT 'NGN'", fares, re.I)))
check("fares.ts is a client-supplied timestamptz", bool(re.search(r"ts\s+TIMESTAMPTZ NOT NULL", pings, re.I)) and bool(re.search(r"ts\s+TIMESTAMPTZ NOT NULL", fares, re.I)))
check("ping coordinates are range-checked", "lat BETWEEN -90 AND 90" in pings and "lng BETWEEN -180 AND 180" in pings)
check("ping accuracy is non-negative metres", "accuracy >= 0" in pings and "in metres" in SCHEMA.lower())
check("shifts has one-open-per-vehicle and per-driver indexes", SCHEMA.count("WHERE ended_at IS NULL") == 2)

sql = statement_text()
check("latest-ping index exists", bool(re.search(r"location_pings_latest_per_vehicle_idx\s+ON location_pings \(vehicle_id, ts DESC, id DESC\)", sql, re.I)))
check("fares-per-vehicle-per-day index exists", bool(re.search(r"fares_vehicle_day_idx\s+ON fares \(vehicle_id, ts\)", sql, re.I)))
check("parentheses are balanced", sql.count("(") == sql.count(")"))
segments = [part.strip() for part in re.split(r";", sql)]
check("every statement ends with a semicolon", segments[-1] == "" and all(segments[:-1]))

check("web/config.js posts GPS pings", "/locations" in CONFIG and "{ vehicleId, lat, lng, accuracy, ts }" in CONFIG)
check("web/config.js posts fares", "/fares" in CONFIG and 'method: "cash" | "mobile_money"' in CONFIG)
for field in ("vehicleId", "lat", "lng", "accuracy", "ts", "amount", "method"):
    check(f"documentation maps {field}", field in DOC)
check("documentation has a Mermaid relationship diagram", "```mermaid" in DOC and "erDiagram" in DOC)
check("documentation explains every table once", all(len(re.findall(rf"^### {table}$", DOC, re.M)) == 1 for table in TABLES))

if failures:
    print(f"\n{len(failures)} check(s) failed")
    sys.exit(1)
print("\nAll schema checks passed")
