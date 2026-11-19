# trans_sport Data Model

## Entity-Relationship Diagram

```
┌─────────────┐       ┌─────────────┐
│   users     │       │  vehicles   │
├─────────────┤       ├─────────────┤
│ id (PK)     │◄──┐   │ id (PK)     │
│ full_name   │   │   │ owner_id(FK)│
│ email       │   └───│ registration│
│ phone       │       │ make        │
│ role        │       │ model       │
│ is_active   │       │ year        │
│ created_at  │       │ color       │
│ updated_at  │       │ capacity    │
└─────────────┘       │ status      │
                      │ created_at  │
                      │ updated_at  │
                      └──────┬──────┘
                             │
                             │ 1
                             │
                             │ N
                      ┌──────┴──────┐
                      │   trips     │
                      ├─────────────┤
                      │ id (PK)     │
                      │ vehicle_id  │
                      │ driver_id   │
                      │ route_id    │
                      │ sched_dep   │
                      │ sched_arr   │
                      │ act_dep     │
                      │ act_arr     │
                      │ status      │
                      │ seats_avail │
                      │ created_at  │
                      │ updated_at  │
                      └──────┬──────┘
                             │
                             │ 1
                             │
                             │ N
                      ┌──────┴──────┐
                      │   fares     │
                      ├─────────────┤
                      │ id (PK)     │
                      │ trip_id(FK) │
                      │ pax_name    │
                      │ pax_phone   │
                      │ amount      │
                      │ currency    │
                      │ pay_type    │
                      │ txn_ref     │
                      │ is_paid     │
                      │ paid_at     │
                      │ created_at  │
                      │ updated_at  │
                      └─────────────┘

┌─────────────┐
│   routes    │
├─────────────┤
│ id (PK)     │
│ origin      │
│ destination │
│ distance_km │
│ est_dur_min │
│ is_active   │
│ created_at  │
│ updated_at  │
└─────────────┘
```

## Relationships

| Relationship | Type | Description |
|-------------|------|-------------|
| `users` → `vehicles` | 1:N | One owner can have multiple vehicles |
| `users` → `trips` | 1:N | One driver can drive multiple trips |
| `vehicles` → `trips` | 1:N | One vehicle can be used for multiple trips |
| `routes` → `trips` | 1:N | One route can have multiple trips |
| `trips` → `fares` | 1:N | One trip can have multiple fare records (one per passenger) |

## Key Constraints

- **Users**: Email and phone must be unique. Role must be one of `owner`, `driver`, or `admin`.
- **Vehicles**: Registration number must be unique. Capacity must be positive. Status must be valid.
- **Routes**: Origin and destination combination must be unique. Distance and duration must be positive.
- **Trips**: Scheduled arrival must be after scheduled departure. Status must be valid.
- **Fares**:
  - Payment type must be `cash` or `mobile_money`.
  - If `mobile_money`, `transaction_ref` is required.
  - If `cash`, `transaction_ref` must be NULL.
  - If `is_paid` is TRUE, `paid_at` must be set.
  - If `is_paid` is FALSE, `paid_at` must be NULL.

## Payment Support

The schema explicitly supports two payment methods:

1. **Cash**: Simple payment with no transaction reference.
2. **Mobile Money**: Requires a `transaction_ref` for reconciliation with mobile money providers (e.g., M-Pesa, Airtel Money).

## Extensibility

- Add `seats` table for seat-level reservations if needed.
- Add `trip_history` or use `trips` table with status tracking for historical data.
- Add `payments` table if multiple payment methods per fare are needed.
