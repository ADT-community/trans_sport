const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../api.js");

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    _data: data
  };
}

function fakeFetch(handler) {
  const calls = [];
  const fn = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(handler(url, init, calls.length));
  };
  fn.calls = calls;
  return fn;
}

const ok = (json) => ({ ok: true, status: 201, json: async () => json || {} });
const httpError = (status) => ({ ok: false, status, json: async () => ({}) });
const client = (options) => api.createClient(Object.assign({ apiUrl: "http://api.test/" }, options));

test("demo mode: empty apiUrl sends nothing and keeps no queue", async () => {
  const fetchFn = fakeFetch(() => ok());
  const c = client({ apiUrl: "", fetchFn, storage: memoryStorage() });
  assert.equal(c.enabled(), false);
  assert.deepEqual(await c.post("/locations", { lat: 1 }), { demo: true });
  assert.equal(fetchFn.calls.length, 0);
  assert.equal(c.queued(), 0);
});

test("online post: correct URL, bearer token, JSON body and auth-only reads", async () => {
  const fetchFn = fakeFetch(() => ok({ ok: 1 }));
  const c = client({ fetchFn, storage: memoryStorage(), getToken: () => "secret-token" });
  await c.post("/fares", { vehicleId: "v1", amount: 500 });
  assert.equal(fetchFn.calls.length, 1);
  assert.equal(fetchFn.calls[0].url, "http://api.test/fares");
  assert.equal(fetchFn.calls[0].init.method, "POST");
  assert.equal(fetchFn.calls[0].init.headers.Authorization, "Bearer secret-token");
  assert.equal(fetchFn.calls[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(fetchFn.calls[0].init.body), { vehicleId: "v1", amount: 500 });

  await c.latest();
  await c.earnings("v1", 7);
  await c.authRequestOtp("+2348010000001", "driver");
  await c.authVerifyOtp("+2348010000001", "driver", "123456");
  assert.deepEqual(fetchFn.calls.slice(1).map((x) => x.url), [
    "http://api.test/vehicles/latest",
    "http://api.test/vehicles/v1/earnings?days=7",
    "http://api.test/auth/request-otp",
    "http://api.test/auth/verify-otp"
  ]);
  assert.equal(fetchFn.calls[1].init.method, "GET");
  assert.deepEqual(JSON.parse(fetchFn.calls[4].init.body), { phone: "+2348010000001", role: "driver", code: "123456" });
});

test("offline: pings are queued in order, persisted, and replayed FIFO on reconnect", async () => {
  const storage = memoryStorage();
  let onlineMode = false;
  const fetchFn = fakeFetch(() => (onlineMode ? ok() : Promise.reject(new Error("offline"))));
  const c = client({ fetchFn, storage, online: false, getToken: () => "t" });
  await c.post("/locations", { n: 1 });
  await c.post("/locations", { n: 2 });
  await c.post("/locations", { n: 3 });
  assert.equal(c.queued(), 3);
  assert.deepEqual(c.pending().map((x) => x.body.n), [1, 2, 3]);
  assert.equal(JSON.parse(storage.getItem(api.QUEUE_KEY)).length, 3);
  assert.equal(fetchFn.calls.length, 0);

  onlineMode = true;
  await c.setOnline(true);
  assert.equal(c.queued(), 0);
  assert.equal(fetchFn.calls.length, 3);
  assert.deepEqual(fetchFn.calls.map((x) => JSON.parse(x.init.body).n), [1, 2, 3]);
  assert.equal(JSON.parse(storage.getItem(api.QUEUE_KEY)).length, 0);
});

test("queue is capped at 500 and drops the oldest ping first", async () => {
  const storage = memoryStorage();
  const c = client({ fetchFn: fakeFetch(() => Promise.reject(new Error("offline"))), storage, online: false, maxQueue: 500 });
  for (let i = 1; i <= 600; i++) await c.post("/locations", { n: i });
  assert.equal(c.queued(), 500);
  assert.equal(JSON.parse(storage.getItem(api.QUEUE_KEY)).length, 500);
  assert.equal(c.pending()[0].body.n, 101);
  assert.equal(c.pending()[499].body.n, 600);

  const restored = client({ fetchFn: fakeFetch(() => Promise.reject(new Error("offline"))), storage, online: false, maxQueue: 500 });
  assert.equal(restored.queued(), 500);
  assert.equal(restored.pending()[0].body.n, 101);
});

test("a failed send never overtakes earlier items; order is preserved after retry", async () => {
  let attempts = 0;
  const fetchFn = fakeFetch(() => {
    attempts++;
    return attempts === 1 ? Promise.reject(new Error("network down")) : ok();
  });
  const c = client({ fetchFn, storage: memoryStorage(), online: false });
  await c.post("/locations", { n: 1 });
  await c.post("/locations", { n: 2 });
  assert.equal(attempts, 0);
  assert.deepEqual(c.pending().map((x) => x.body.n), [1, 2]);

  await c.setOnline(true);
  assert.equal(c.queued(), 2);
  await c.flush();
  assert.deepEqual(fetchFn.calls.map((x) => JSON.parse(x.init.body).n), [1, 1, 2]);
  assert.equal(c.queued(), 0);
});

test("4xx validation errors are dropped, 401 authorisation failures are kept for retry", async () => {
  const fetchFn = fakeFetch((_url, _init, call) => (call === 1 ? httpError(400) : call === 2 ? httpError(401) : ok()));
  const c = client({ fetchFn, storage: memoryStorage() });
  await c.post("/fares", { bad: true });
  assert.equal(c.queued(), 0, "permanent 400 must not poison the queue");

  await c.post("/locations", { n: 2 });
  assert.equal(c.queued(), 1, "401 must keep the item until a token is available");
  await c.flush();
  assert.equal(c.queued(), 0);
});

test("concurrent posts do not duplicate in-flight sends", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fetchFn = (url, init) => { fetchFn.calls.push({ url, init }); return gate.then(() => ok()); };
  fetchFn.calls = [];
  const c = client({ fetchFn, storage: memoryStorage() });
  const a = c.post("/locations", { n: 1 });
  const b = c.post("/locations", { n: 2 });
  assert.equal(fetchFn.calls.length, 1, "a second flush must not duplicate the in-flight item");
  release();
  await Promise.all([a, b]);
  assert.equal(c.queued(), 0);
});

test("applyLatest moves vehicles, marks stale ones and applies earnings totals", () => {
  const vehicles = [
    { id: "v1", pos: [0, 0], status: "active", lastSeen: 0, today: { cash: 0, digital: 0, trips: 0, pax: 0 } },
    { id: "v2", pos: [0, 0], status: "active", lastSeen: 0, today: { cash: 0, digital: 0, trips: 0, pax: 0 } }
  ];
  const now = Date.parse("2026-11-21T12:00:00Z");
  api.applyLatest(vehicles, { vehicles: [
    { vehicleId: "v1", lat: 6.5, lng: 3.3, accuracy: 12, ts: now - 5000 },
    { vehicleId: "v2", lat: 6.6, lng: 3.4, accuracy: 9, ts: now - 120000 }
  ] }, { now, staleAfterMs: 45000 });

  assert.deepEqual(vehicles[0].pos, [6.5, 3.3]);
  assert.equal(vehicles[0].stale, false);
  assert.equal(vehicles[0].status, "active");
  assert.equal(vehicles[1].stale, true);
  assert.equal(vehicles[1].status, "offline");
  assert.equal(vehicles[1].lastSeen, now - 120000);

  api.applyEarnings(vehicles, {
    v1: { totals: { cash: 1200, mobileMoney: 300, fareCount: 3 } },
    v2: { totals: { cash: 0, mobileMoney: 0, fareCount: 0 } }
  });
  assert.equal(vehicles[0].today.cash, 1200);
  assert.equal(vehicles[0].today.digital, 300);
  assert.equal(vehicles[0].today.trips, 3);
  assert.equal(vehicles[0].today.pax, 3);
  assert.equal(vehicles[1].today.cash, 0);
});

test("timestamp helpers accept epoch seconds, milliseconds and ISO strings", () => {
  const ms = Date.parse("2026-11-21T12:00:00Z");
  assert.equal(api.parseTs(ms / 1000), ms);
  assert.equal(api.parseTs(ms), ms);
  assert.equal(api.parseTs("2026-11-21T12:00:00Z"), ms);
  assert.equal(api.isStale(ms - 1000, ms, 45000), false);
  assert.equal(api.isStale(ms - 46000, ms, 45000), true);
  assert.equal(api.isStale(null, ms, 45000), true);
});
