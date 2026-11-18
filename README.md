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

- [ ] Data model for vehicles, drivers, owners, routes, trips and fares
- [ ] Driver app: sign in and share GPS in the background, battery-friendly
- [ ] Backend endpoint to receive and store location pings
- [ ] Owner dashboard: live map of vehicles
- [ ] Owner dashboard: daily earnings per vehicle and driver
- [ ] Mobile money sandbox integration (one provider)
- [ ] Pick the pilot city and interview 5 minibus owners (research bounty)

## Contribute

See the [website](https://adt-community.github.io) for how bounties and goals work, then pick an open issue in this repo.
