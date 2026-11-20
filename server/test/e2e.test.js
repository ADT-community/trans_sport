"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildConfig } = require("../config");
const { createStore } = require("../store");
const { getProvider } = require("../providers");
const { createServer } = require("../app");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `GET ${url} failed`);
  return response.json();
}

test("sandbox payment completes end to end over HTTP", async (t) => {
  const config = buildConfig({
    PAYMENT_PROVIDER: "sandbox",
    WEBHOOK_SECRET: "e2e-webhook-secret-123456",
    SANDBOX_CONFIRM_DELAY_MS: "20"
  });
  const store = createStore();
  const server = createServer({ config, store, provider: getProvider("sandbox") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;

  const health = await getJson(base + "/health");
  assert.equal(health.status, "ok");
  assert.equal(health.sandbox, true);

  const response = await fetch(base + "/payments/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicleId: "v1", amount: 500, phone: "08012345678" })
  });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.status, "pending");
  assert.match(created.reference, /^sandbox_/);
  assert.match(created.payCode, /^\d{6}$/);

  const pending = await getJson(base + "/payments/" + created.id);
  assert.equal(pending.status, "pending");
  assert.deepEqual((await getJson(base + "/fares")).fares, []);

  let confirmed;
  for (let attempt = 0; attempt < 40; attempt++) {
    confirmed = await getJson(base + "/payments/" + created.id);
    if (confirmed.status === "confirmed") break;
    await wait(25);
  }
  assert.equal(confirmed.status, "confirmed");
  assert.ok(confirmed.confirmedAt);

  const fares = (await getJson(base + "/fares")).fares;
  assert.equal(fares.length, 1);
  assert.equal(fares[0].paymentId, created.id);
  assert.equal(fares[0].amount, 500);
  assert.equal(fares[0].provider, "sandbox");

  const forged = await fetch(base + "/webhooks/mobile-money", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-signature": "deadbeef" },
    body: JSON.stringify({ event: "charge.success", data: { reference: created.reference, status: "success" } })
  });
  assert.equal(forged.status, 401);
  assert.equal((await getJson(base + "/fares")).fares.length, 1);

  const invalid = await fetch(base + "/payments/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicleId: "v1", amount: -5 })
  });
  assert.equal(invalid.status, 400);
  assert.equal((await getJson(base + "/fares")).fares.length, 1);
});
