Closes #8

## What changed

- Added `server/`, a dependency-free Node.js payments API for mobile-money fares:
  - `POST /payments/request` creates a `pending` payment with a reference and pay code;
  - `POST /webhooks/mobile-money` verifies an HMAC signature over the **raw** body using a
    constant-time comparison, confirms the payment and writes a fare exactly once;
  - `GET /payments/:id` exposes only pending/confirmed/failed status, `GET /fares` lists stored
    fares, `GET /health` reports the active provider;
  - a `sandbox` adapter completes a signed confirmation locally (no keys, no network) and a
    `paystack` adapter calls `POST /charge` with a mobile-money phone number;
  - all secrets come from environment variables (`server/.env.example`), never from the web app
    or the API responses.
- Driver/passenger screens now show pending and confirmed states and add the fare to takings only
  after confirmation. With `apiUrl` empty, the same states are simulated locally for demo mode.
- Added `docs/research/mobile-money.md`: Paystack vs Flutterwave vs MTN MoMo on small-payment fees,
  countries, sandbox, payout speed and the reason for choosing Paystack.
- Updated README (setup, endpoints, env vars) and added a Node CI job for the API tests.

## Acceptance criteria

- [x] Provider comparison in `docs/research/mobile-money.md`
- [x] Sandbox payment completes end to end (`server/test/e2e.test.js`)
- [x] Fare stored only after a signed confirmation (unit tests for unsigned, failed, mismatched
      and duplicate webhooks)

## Checks

- `npm --prefix server test` (Node 20+ built-in runner): 10/10 passed
- `node --test` from `server/`: 10 tests, 10 pass, 0 fail
- live smoke of `node server/index.js`: health ok/sandbox, request pending -> confirmed, 1 fare
- `node --check` on all changed/added JavaScript files: clean

No live payments, real provider keys or payouts to owners are included.
