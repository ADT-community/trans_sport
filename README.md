# trans_sport — Minibus app

Uber-style convenience for the minibuses Africa already rides, without owning a single bus.

Part of the [ADT community](https://adt-community.github.io). Contributors are paid through bounties and goals.

## The problem

Most trips in African cities are on informal minibuses (matatus, danfos, trotros, taxis). Passengers can't see where buses are or what they cost, most fares are cash, and owners have little visibility into what their vehicles earn.

## What we're building

| User | What they get |
|---|---|
| **Passengers** | Minibuses near them on a map with route, fare and arrival time. Pay by mobile money. Share a trip for safety. No booking, just get on. |
| **Drivers** | A phone app that shares GPS and accepts fares. |
| **Owners** | A dashboard showing where each vehicle is, what it earned today and how each driver is doing. |

**Build order:** owner dashboard + driver app first (owners pay, and drivers' GPS feeds everything else), then the passenger app.

## Web app (`web/`)

A mobile web app with three views, switched from the bottom tabs:

- **Ride (passengers):** live map of minibuses, nearest buses with arrival time, fare and free seats. Tap one for details, **pay by mobile money** or **share the trip** with a friend (shared links open straight to that bus).
- **Drive (drivers):** start/end shift, which shares the phone's **live GPS** only while on shift. Record **cash fares** in one tap, **request mobile money** with a pay code, count passengers on board, finish trips, and see today's trips and takings.
- **Owner:** today's takings, active vehicles, passengers and mobile money share, a fleet map, every vehicle's status and earnings, and a **driver table** that flags top performers and drivers to check on.

Out of the box it runs in **demo mode** with simulated minibuses on four Lagos routes (`web/sim.js`; coordinates are approximate). Set `apiUrl` in `web/config.js` to send real GPS pings (`POST /locations`) and fares (`POST /fares`) to a backend.

Leaflet (the map library) is bundled in `web/vendor/` so the app loads on slow connections. OpenStreetMap's public tiles are fine for testing; switch `tileUrl` to a paid tile provider before launch.

**Try it:** serve `web/` (for example `npx serve web`) and open it on a phone. GPS needs `https` or `localhost`.

## Mobile money sandbox API

`server/` is a dependency-free Node.js service for digital fares. A request starts as `pending`;
a fare is written only when a correctly signed provider webhook confirms the payment.

```sh
copy server\.env.example server\.env   # cp on macOS/Linux
# edit server/.env: set WEBHOOK_SECRET to a long random string
node server/index.js                   # http://localhost:4000
npm --prefix server test               # unit + sandbox end-to-end tests
```

Set `apiUrl: "http://localhost:4000"` in `web/config.js` to use it from the driver and
passenger screens. The driver's **Request mobile money** button now shows a pending state with
the pay code/reference, then a confirmed state; the fare is added to today's takings only on
confirmation. With an empty `apiUrl`, the same states are simulated locally for the demo.

| Endpoint | Purpose |
|---|---|
| `POST /payments/request` | `{ vehicleId, amount, phone? }` → `201` with `id`, `reference`, `payCode`, `status: pending` |
| `GET /payments/:id` | poll `pending` / `confirmed` / `failed` |
| `POST /webhooks/mobile-money` | HMAC-signed provider callback; confirms the payment and stores the fare once |
| `GET /fares` | fares recorded after confirmation |
| `GET /health` | service status and active provider |

Configuration is read only from the environment (`server/.env` is loaded into it on startup):

| Variable | Meaning |
|---|---|
| `PAYMENT_PROVIDER` | `sandbox` (default) or `paystack` |
| `WEBHOOK_SECRET` | required, at least 16 characters; HMAC secret for webhook verification |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_CUSTOMER_EMAIL` | required only for `paystack` |
| `SANDBOX_CONFIRM_DELAY_MS` | delay before the sandbox sends its signed confirmation (default 1200) |
| `PORT`, `CORS_ORIGIN`, `DATA_FILE` | listener, allowed browser origin, optional JSON persistence path |

The sandbox provider needs no keys and makes no external calls. Provider research and the
reason for choosing Paystack are in [`docs/research/mobile-money.md`](docs/research/mobile-money.md).
Live payments and payouts to owners are out of scope.

## How it earns

- Monthly fee per vehicle from owners
- Small cut of digital fares
- Later: route and demand data for cities and planners

## Suggested stack

- **Driver & passenger apps:** React Native (Expo), Android first, works on low-cost phones
- **Owner dashboard:** Next.js web app
- **Backend:** Postgres + PostGIS (e.g. Supabase) for locations and routes
- **Payments:** mobile money APIs (M-Pesa, MTN MoMo, Airtel Money) or an aggregator like Flutterwave/Paystack

## Goals

| Goal | Done when |
|---|---|
| **G1: Owner pilot** | 10 vehicles in one pilot city tracked live on the dashboard |
| **G2: Digital fares** | Drivers accept mobile money fares, owners see daily takings |
| **G3: Passenger beta** | Passengers see live minibuses and fares on a map |
| **G4: First revenue** | First owner group paying monthly |

## Starter tasks (bounty candidates)

- [ ] **Design bounty:** replace the placeholder minimal design with a proper design system and screens (`web/styles.css`)
- [x] Web prototype: passenger map, driver app and owner dashboard on simulated data (`web/`)
- [ ] Data model for vehicles, drivers, owners, routes, trips and fares
- [ ] Driver app: sign in and share GPS in the background, battery-friendly
- [ ] Backend endpoint to receive and store location pings
- [ ] Owner dashboard: live map of vehicles
- [ ] Owner dashboard: daily earnings per vehicle and driver
- [x] Mobile money sandbox integration (one provider)
- [ ] Pick the pilot city and interview 5 minibus owners (research bounty)

## Contribute

See the [website](https://adt-community.github.io) for how bounties and goals work, then pick an open issue in this repo.

## License

[GNU AGPL-3.0](LICENSE). You can use, study, change and share this code. If you run a modified version as a service for others, you must publish your changes under the same license.

By contributing, you agree your contributions are licensed under the same terms.

Third-party code: [Leaflet](https://leafletjs.com) in `web/vendor/leaflet/` is under its own BSD-2-Clause license (see the `LICENSE` file there). Map data © OpenStreetMap contributors.
