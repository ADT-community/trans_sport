"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildConfig } = require("../config");
const { createStore } = require("../store");
const {
  verifySignature, signBody, requestPayment, processWebhook
} = require("../payments");

const env = {
  PAYMENT_PROVIDER: "sandbox",
  WEBHOOK_SECRET: "test-webhook-secret-123456"
};

function config(overrides = {}) {
  return buildConfig({ ...env, ...overrides });
}

let referenceCounter = 0;

function provider(overrides = {}) {
  return {
    async initiate() {
      referenceCounter += 1;
      return {
        reference: "ref_test_" + referenceCounter,
        currency: "NGN",
        sandboxAutoConfirm: false,
        ...overrides
      };
    }
  };
}

const request = {
  vehicleId: "v1", amount: 400, phone: "08012345678"
};

function createPending(store, cfg, overrides = {}) {
  return requestPayment({
    input: { ...request, ...overrides },
    config: cfg,
    store,
    provider: provider(),
    now: () => 1000
  });
}

function deliverWebhook(store, cfg, payload, signature) {
  const rawBody = JSON.stringify(payload);
  return processWebhook({
    rawBody,
    signature: signature === undefined ? signBody(rawBody, cfg) : signature,
    config: cfg,
    store,
    now: () => 2000
  });
}

const successEvent = (reference) => ({
  event: "charge.success",
  data: { reference, status: "success", amount: 40000, currency: "NGN" }
});

test("webhook signature verification rejects missing, wrong and tampered signatures", () => {
  const cfg = config();
  const rawBody = '{"event":"charge.success"}';
  const signature = signBody(rawBody, cfg);
  assert.equal(verifySignature(rawBody, signature, cfg), true);
  assert.equal(verifySignature(rawBody, signature.toUpperCase(), cfg), true);
  assert.equal(verifySignature(rawBody, undefined, cfg), false);
  assert.equal(verifySignature(rawBody, "", cfg), false);
  assert.equal(verifySignature(rawBody, "not-a-signature", cfg), false);
  assert.equal(verifySignature(rawBody, signature, config({ WEBHOOK_SECRET: "a-completely-different-secret" })), false);
  assert.equal(verifySignature(rawBody + " ", signature, cfg), false);
});

test("a payment request starts pending and stores no fare", async () => {
  const store = createStore();
  const payment = await createPending(store, config());
  assert.equal(payment.status, "pending");
  assert.equal(payment.method, "mobile_money");
  assert.equal(payment.amount, 400);
  assert.equal(store.listPayments().length, 1);
  assert.equal(store.listFares().length, 0);
});

test("a verified webhook confirms the fare exactly once", async () => {
  const store = createStore();
  const cfg = config();
  const payment = await createPending(store, cfg);
  const result = deliverWebhook(store, cfg, successEvent(payment.reference));
  assert.equal(result.httpStatus, 200);
  assert.equal(result.status, "confirmed");
  assert.equal(store.getPayment(payment.id).status, "confirmed");
  const fares = store.listFares();
  assert.equal(fares.length, 1);
  assert.equal(fares[0].paymentId, payment.id);
  assert.equal(fares[0].amount, 400);
  assert.equal(fares[0].confirmedAt, 2000);

  const duplicate = deliverWebhook(store, cfg, successEvent(payment.reference));
  assert.equal(duplicate.duplicate, true);
  assert.equal(store.listFares().length, 1);
});

test("an unsigned or modified webhook cannot confirm a fare", async () => {
  const store = createStore();
  const cfg = config();
  const payment = await createPending(store, cfg);
  const badSignature = deliverWebhook(store, cfg, successEvent(payment.reference), "0000000000000000");
  assert.equal(badSignature.httpStatus, 401);
  assert.equal(badSignature.status, "invalid_signature");

  const body = JSON.stringify(successEvent(payment.reference));
  const tampered = processWebhook({
    rawBody: body + " ",
    signature: signBody(body, cfg),
    config: cfg,
    store
  });
  assert.equal(tampered.status, "invalid_signature");
  assert.equal(store.getPayment(payment.id).status, "pending");
  assert.equal(store.listFares().length, 0);
});

test("failed events and amount mismatches never store a fare", async () => {
  const store = createStore();
  const cfg = config();
  const payment = await createPending(store, cfg);
  const failed = deliverWebhook(store, cfg, {
    event: "charge.failed",
    data: { reference: payment.reference, status: "failed" }
  });
  assert.equal(failed.status, "failed");
  assert.equal(store.getPayment(payment.id).status, "failed");
  assert.equal(store.listFares().length, 0);

  const second = await createPending(store, cfg, { vehicleId: "v2" });
  const mismatch = deliverWebhook(store, cfg, {
    event: "charge.success",
    data: { reference: second.reference, status: "success", amount: 1 }
  });
  assert.equal(mismatch.reason, "amount mismatch");
  assert.equal(store.getPayment(second.id).status, "failed");
  assert.equal(store.listFares().length, 0);
});

test("an unknown reference is acknowledged without storing anything", async () => {
  const store = createStore();
  const cfg = config();
  await createPending(store, cfg);
  const result = deliverWebhook(store, cfg, successEvent("never-seen"));
  assert.equal(result.httpStatus, 200);
  assert.equal(result.status, "unknown_reference");
  assert.equal(store.listFares().length, 0);
});

test("configuration requires secrets from the environment", () => {
  assert.throws(() => buildConfig({ WEBHOOK_SECRET: "short" }), /WEBHOOK_SECRET/);
  assert.throws(() => buildConfig({ WEBHOOK_SECRET: env.WEBHOOK_SECRET, PAYMENT_PROVIDER: "other" }), /PAYMENT_PROVIDER/);
  assert.throws(
    () => buildConfig({ WEBHOOK_SECRET: env.WEBHOOK_SECRET, PAYMENT_PROVIDER: "paystack" }),
    /PAYSTACK_SECRET_KEY/
  );
  assert.throws(
    () => buildConfig({
      WEBHOOK_SECRET: env.WEBHOOK_SECRET,
      PAYMENT_PROVIDER: "paystack",
      PAYSTACK_SECRET_KEY: "sk_test_example"
    }),
    /PAYSTACK_CUSTOMER_EMAIL/
  );
  const paystack = buildConfig({
    WEBHOOK_SECRET: env.WEBHOOK_SECRET,
    PAYMENT_PROVIDER: "paystack",
    PAYSTACK_SECRET_KEY: "sk_test_example",
    PAYSTACK_CUSTOMER_EMAIL: "passenger@example.com"
  });
  assert.equal(paystack.webhookHeader, "x-paystack-signature");
  assert.equal(paystack.webhookAlgorithm, "sha512");
});

test("request validation rejects bad input", async () => {
  const store = createStore();
  const cfg = config();
  const cases = [
    { vehicleId: "", amount: 400 },
    { vehicleId: "v1", amount: 0 },
    { vehicleId: "v1", amount: 12.5 },
    { vehicleId: "v1", amount: 400, phone: "123" }
  ];
  for (const input of cases) {
    await assert.rejects(
      () => createPending(store, cfg, input),
      /vehicleId|amount|phone/
    );
  }
  assert.equal(store.listPayments().length, 0);
});

test("payment responses never expose provider keys", async () => {
  const store = createStore();
  const cfg = config({ PAYSTACK_SECRET_KEY: "sk_live_must_never_be_returned" });
  const payment = await createPending(store, cfg);
  assert.equal(JSON.stringify(payment).includes("sk_live_must_never_be_returned"), false);
  assert.equal("secretKey" in payment, false);
  assert.equal("webhookSecret" in payment, false);
});
