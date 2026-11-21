// trans_sport front-end configuration. This file is public: never put secret keys here.
window.TRANS_CONFIG = {
  // Backend base URL. Empty = demo mode with simulated Lagos minibuses (nothing is sent).
  // When set, the driver app POSTs GPS pings to `${apiUrl}/locations`:
  //   { vehicleId, lat, lng, accuracy, ts }
  // and fares to `${apiUrl}/fares`: { vehicleId, amount, method: "cash" | "mobile_money", ts }
  // Requests carry the bearer token obtained through the in-app OTP sign-in;
  // they are queued (max `maxQueue`, FIFO, persisted in localStorage) while offline.
  apiUrl: "",

  // Live mode timings (milliseconds) used only when apiUrl is set.
  pingIntervalMs: 20000,     // driver GPS ping every 20 s while on shift
  latestIntervalMs: 15000,   // owner map refresh from GET /vehicles/latest every 15 s
  earningsIntervalMs: 60000, // owner earnings refresh from GET /vehicles/{id}/earnings
  staleAfterMs: 45000,       // a vehicle with no newer ping is greyed out
  earningsDays: 7,
  maxQueue: 500,

  // Map tiles. OpenStreetMap's public tiles are fine for testing; use a paid tile
  // provider before real launch (see https://operations.osmfoundation.org/policies/tiles/).
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: "&copy; OpenStreetMap contributors",

  currency: "NGN",
  locale: "en-NG",
  city: { name: "Lagos", center: [6.5244, 3.3792], zoom: 12 }
};
