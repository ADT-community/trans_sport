"use strict";

const crypto = require("node:crypto");
const { PaymentError } = require("./errors");

function newId(prefix) {
  return prefix + "_" + crypto.randomBytes(8).toString("hex");
}

function verifySignature(rawBody, signature, config) {
  if (typeof signature !== "string" || signature.length === 0) return false;
  const expected = crypto.createHmac(config.webhookAlgorithm, config.webhookSecret)
    .update(rawBody).digest("hex");
  const received = signature.trim().toLowerCase();
  if (expected.length !== received.length || !/^[0-9a-f]+$/.test(received)) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

function signBody(rawBody, config) {
  return crypto.createHmac(config.webhookAlgorithm, config.webhookSecret).update(rawBody).digest("hex");
}

function validateRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PaymentError("A JSON object body is required");
  }
  const vehicleId = String(input.vehicleId || "").trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(vehicleId)) {
    throw new PaymentError("vehicleId must be a short alphanumeric id");
  }
  const amount = Number(input.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 1000000) {
    throw new PaymentError("amount must be a whole number between 1 and 1000000");
  }
  const phone = input.phone === undefined || input.phone === null
    ? "" : String(input.phone).replace(/\D/g, "");
  if (phone && (phone.length < 10 || phone.length > 15)) {
    throw new PaymentError("phone must be a valid mobile money number");
  }
  return { vehicleId, amount, phone };
}

function publicPayment(payment) {
  return {
    id: payment.id,
    reference: payment.reference,
    payCode: payment.payCode || null,
    vehicleId: payment.vehicleId,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    provider: payment.provider,
    status: payment.status,
    createdAt: payment.createdAt,
    confirmedAt: payment.confirmedAt || null,
    failureReason: payment.failureReason || null
  };
}

async function requestPayment({ input, config, store, provider, now = Date.now, schedule = setTimeout }) {
  const request = validateRequest(input);
  if (config.provider === "paystack" && !request.phone) {
    throw new PaymentError("phone is required for a mobile money charge");
  }
  request.payCode = String(crypto.randomInt(100000, 1000000));
  const initiated = await provider.initiate(request, config);
  const timestamp = now();
  const payment = {
    id: newId("pay"),
    reference: initiated.reference,
    payCode: request.payCode,
    vehicleId: request.vehicleId,
    amount: request.amount,
    currency: initiated.currency || "NGN",
    phone: request.phone,
    method: "mobile_money",
    provider: config.provider,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    confirmedAt: null,
    failureReason: null
  };
  store.savePayment(payment);
  if (initiated.sandboxAutoConfirm) {
    schedule(() => {
      const rawBody = JSON.stringify({
        event: "charge.success",
        data: {
          reference: payment.reference,
          status: "success",
          amount: payment.amount * 100,
          currency: payment.currency
        }
      });
      processWebhook({
        rawBody,
        signature: signBody(rawBody, config),
        config,
        store,
        now
      });
    }, config.sandboxConfirmDelayMs);
  }
  return publicPayment(payment);
}

function failPayment(payment, reason, store, now) {
  payment.status = "failed";
  payment.failureReason = reason;
  payment.updatedAt = now();
  store.savePayment(payment);
}

function processWebhook({ rawBody, signature, config, store, now = Date.now }) {
  if (!verifySignature(rawBody, signature, config)) {
    return { httpStatus: 401, status: "invalid_signature", matched: false };
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { httpStatus: 400, status: "invalid_payload", matched: false };
  }
  const data = event && event.data && typeof event.data === "object" ? event.data : {};
  const reference = data.reference === undefined ? data.tx_ref : data.reference;
  if (typeof reference !== "string" || !reference) {
    return { httpStatus: 400, status: "missing_reference", matched: false };
  }
  const payment = store.findByReference(reference);
  if (!payment) {
    return { httpStatus: 200, status: "unknown_reference", matched: false };
  }
  if (data.amount !== undefined && Number(data.amount) !== payment.amount * 100) {
    failPayment(payment, "confirmed amount does not match the request", store, now);
    return { httpStatus: 200, status: "failed", matched: true, reason: "amount mismatch" };
  }
  const successful = event.event === "charge.success" &&
    (data.status === undefined || String(data.status).toLowerCase() === "success");
  if (!successful) {
    failPayment(payment, "provider reported an unsuccessful payment", store, now);
    return { httpStatus: 200, status: "failed", matched: true };
  }
  if (payment.status === "confirmed") {
    return { httpStatus: 200, status: "confirmed", matched: true, duplicate: true };
  }
  const timestamp = now();
  payment.status = "confirmed";
  payment.confirmedAt = timestamp;
  payment.updatedAt = timestamp;
  store.savePayment(payment);
  store.saveFare({
    id: newId("fare"),
    paymentId: payment.id,
    reference: payment.reference,
    vehicleId: payment.vehicleId,
    amount: payment.amount,
    currency: payment.currency,
    method: "mobile_money",
    provider: payment.provider,
    confirmedAt: timestamp
  });
  return { httpStatus: 200, status: "confirmed", matched: true };
}

module.exports = {
  PaymentError,
  newId,
  verifySignature,
  signBody,
  validateRequest,
  publicPayment,
  requestPayment,
  processWebhook
};
