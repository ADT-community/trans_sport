// trans_sport front-end configuration. This file is public: never put secret keys here.
window.TRANS_CONFIG = {
  // Backend base URL. Empty = demo mode with simulated Lagos minibuses.
  // When set, the driver app POSTs GPS pings to `${apiUrl}/locations`:
  //   { vehicleId, lat, lng, accuracy, ts }
  // and cash fares to `${apiUrl}/fares`. Mobile money fares go through the payments API below.
  apiUrl: "",

  payments: {
    requestPath: "/payments/request",
    statusPath: "/payments/",
    pollIntervalMs: 1500,
    pollTimeoutMs: 30000
  },

  // Map tiles. OpenStreetMap's public tiles are fine for testing; use a paid tile
  // provider before real launch (see https://operations.osmfoundation.org/policies/tiles/).
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: "&copy; OpenStreetMap contributors",

  currency: "NGN",
  locale: "en-NG",
  city: { name: "Lagos", center: [6.5244, 3.3792], zoom: 12 }
};
