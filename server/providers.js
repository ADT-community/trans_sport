"use strict";

const crypto = require("node:crypto");
const { PaymentError } = require("./errors");

const sandbox = {
  async initiate() {
    return {
      reference: "sandbox_" + crypto.randomBytes(8).toString("hex"),
      currency: "NGN",
      sandboxAutoConfirm: true
    };
  }
};

const paystack = {
  async initiate(request, config) {
    const payload = JSON.stringify({
      amount: request.amount * 100,
      email: config.paystack.customerEmail,
      currency: config.paystack.currency,
      mobile_money: { phone: request.phone, provider: config.paystack.momoProvider },
      metadata: { vehicleId: request.vehicleId, payCode: request.payCode }
    });
    let response;
    try {
      response = await fetch(config.paystack.apiBase + "/charge", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + config.paystack.secretKey,
          "Content-Type": "application/json"
        },
        body: payload
      });
    } catch (err) {
      throw new PaymentError("Could not reach the payment provider", 502);
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status === false) {
      throw new PaymentError("Payment provider rejected the request: " + (result.message || response.status), 502);
    }
    if (!result.data || !result.data.reference) {
      throw new PaymentError("Payment provider did not return a reference", 502);
    }
    return {
      reference: String(result.data.reference),
      currency: result.data.currency || config.paystack.currency,
      sandboxAutoConfirm: false
    };
  }
};

const PROVIDERS = { sandbox, paystack };

function getProvider(name) {
  const provider = PROVIDERS[name];
  if (!provider) throw new Error("Unknown payment provider: " + name);
  return provider;
}

module.exports = { sandbox, paystack, getProvider };
