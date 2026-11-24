// trans_sport front-end configuration. This file is public: never put secret keys here.
window.TRANS_CONFIG = {
  // Backend base URL. Empty = demo mode: nothing is sent or fetched and the
  // simulated Lagos minibuses drive every screen.
  //
  // When set, the app uses these endpoints:
  //   POST `${apiUrl}/locations`  { vehicleId, lat, lng, accuracy, ts }
  //       one ping every 20 s while the driver is on shift; queued and resent in
  //       order (up to 500) when the phone has no network.
  //   POST `${apiUrl}/fares`      { vehicleId, amount, method: "cash" | "mobile_money", ts }
  //       every cash or mobile money fare, queued the same way.
  //   GET  `${apiUrl}/vehicles/latest`
  //       newest ping per vehicle, polled every 15 s for the owner's fleet map.
  //       Rows: { vehicleId, plate, driver, routeId, lat, lng, ts, status }
  //   GET  `${apiUrl}/vehicles/{vehicleId}/earnings?days=1`
  //       daily totals for the owner dashboard: { days: [{ date, cash, mobileMoney, trips, passengers, hours }] }
  //
  // `ts` is epoch milliseconds and amounts are in whole `currency` units (naira),
  // the same units the dashboard shows. Only `vehicleId`, `lat`, `lng` and `ts` are
  // required on a `/vehicles/latest` row; anything missing just shows as unknown.
  apiUrl: "",

  // Map tiles. OpenStreetMap's public tiles are fine for testing; use a paid tile
  // provider before real launch (see https://operations.osmfoundation.org/policies/tiles/).
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: "&copy; OpenStreetMap contributors",

  currency: "NGN",
  locale: "en-NG",
  city: { name: "Lagos", center: [6.5244, 3.3792], zoom: 12 }
};
