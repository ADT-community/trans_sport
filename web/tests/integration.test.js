const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const api = require("../api.js");

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let text = "";
    req.on("data", (chunk) => { text += chunk; });
    req.on("end", () => resolve(text ? JSON.parse(text) : null));
  });
}

test("end-to-end against a local backend: sign-in, offline queue replay, live map and earnings", async (t) => {
  const pings = [];
  const fares = [];
  let token = "";
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const body = req.method === "POST" ? await readBody(req) : null;
    if (url.pathname === "/auth/request-otp") return json(res, 200, { phone: body.phone, role: body.role, expiresIn: 300 });
    if (url.pathname === "/auth/verify-otp") {
      if (body.code !== "123456") return json(res, 400, { detail: "Invalid code" });
      token = "test-token";
      return json(res, 200, { token, role: body.role, principalId: 1, phone: body.phone });
    }
    if (req.headers.authorization !== "Bearer test-token") return json(res, 401, { detail: "Bearer token required" });
    if (url.pathname === "/shifts/start") return json(res, 200, { id: 1, vehicleId: body.vehicleId });
    if (url.pathname === "/shifts/end") return json(res, 200, { id: 1, vehicleId: url.searchParams.get("vehicleId") });
    if (url.pathname === "/locations") { pings.push(body); return json(res, 201, { id: pings.length, ...body }); }
    if (url.pathname === "/fares") { fares.push(body); return json(res, 201, { id: fares.length, ...body }); }
    if (url.pathname === "/vehicles/latest") {
      const latest = pings.length ? pings[pings.length - 1] : { ts: 0, lat: 6.5, lng: 3.3, accuracy: 10 };
      return json(res, 200, { timezone: "Africa/Lagos", vehicles: [{
        vehicleId: "v1", plate: "LND 482 XA", routeId: "A",
        lat: latest.lat, lng: latest.lng, accuracy: latest.accuracy, ts: latest.ts, shiftId: 1
      }] });
    }
    if (url.pathname === "/vehicles/v1/earnings") return json(res, 200, {
      vehicleId: "v1", plate: "LND 482 XA", timezone: "Africa/Lagos", currency: "NGN", days: 7,
      daily: [], totals: { cash: fares.length * 500, mobileMoney: 0, total: fares.length * 500, fareCount: fares.length }
    });
    return json(res, 404, { detail: "not found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });

  const c = api.createClient({
    apiUrl: `http://127.0.0.1:${server.address().port}`,
    storage: memoryStorage(),
    getToken: () => token
  });

  await c.authRequestOtp("+2348010000001", "driver");
  const auth = await c.authVerifyOtp("+2348010000001", "driver", "123456");
  assert.equal(auth.token, "test-token");

  await c.setOnline(false);
  await c.post("/shifts/start", { vehicleId: "v1" });
  await c.post("/locations", { vehicleId: "v1", lat: 6.55, lng: 3.34, accuracy: 8, ts: Date.now() });
  await c.post("/fares", { vehicleId: "v1", amount: 500, method: "cash", ts: Date.now() });
  await c.post("/locations", { vehicleId: "v1", lat: 6.56, lng: 3.35, accuracy: 9, ts: Date.now() });
  assert.equal(c.queued(), 4);
  assert.equal(pings.length, 0, "offline pings must not reach the server");
  assert.equal(fares.length, 0);

  await c.setOnline(true);
  assert.equal(c.queued(), 0);
  assert.deepEqual(pings.map((p) => p.lat), [6.55, 6.56], "pings replay in order");
  assert.equal(fares.length, 1);
  assert.equal(fares[0].method, "cash");

  const latest = await c.latest();
  const vehicles = [{ id: "v1", pos: [0, 0], status: "idle", lastSeen: 0, today: { cash: 0, digital: 0, trips: 0, pax: 0 } }];
  api.applyLatest(vehicles, latest, { now: Date.now(), staleAfterMs: 45000 });
  assert.deepEqual(vehicles[0].pos, [6.56, 3.35]);
  assert.equal(vehicles[0].status, "active");

  const earnings = await c.earnings("v1", 7);
  api.applyEarnings(vehicles, { v1: earnings });
  assert.equal(vehicles[0].today.cash, 500);
  assert.equal(vehicles[0].today.trips, 1);
});
