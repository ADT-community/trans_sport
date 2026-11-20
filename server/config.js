"use strict";

const PROVIDERS = ["sandbox", "paystack"];

function buildConfig(env = process.env) {
  const provider = env.PAYMENT_PROVIDER || "sandbox";
  if (!PROVIDERS.includes(provider)) {
    throw new Error("PAYMENT_PROVIDER must be 'sandbox' or 'paystack'");
  }
  const webhookSecret = env.WEBHOOK_SECRET || "";
  if (webhookSecret.length < 16) {
    throw new Error("WEBHOOK_SECRET is required (at least 16 characters)");
  }
  if (provider === "paystack") {
    if (!env.PAYSTACK_SECRET_KEY) throw new Error("PAYSTACK_SECRET_KEY is required when PAYMENT_PROVIDER=paystack");
    if (!env.PAYSTACK_CUSTOMER_EMAIL) throw new Error("PAYSTACK_CUSTOMER_EMAIL is required when PAYMENT_PROVIDER=paystack");
  }
  const port = Number(env.PORT || 4000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT must be a valid port number");
  const sandboxConfirmDelayMs = Number(env.SANDBOX_CONFIRM_DELAY_MS || 1200);
  if (!Number.isFinite(sandboxConfirmDelayMs) || sandboxConfirmDelayMs < 0) {
    throw new Error("SANDBOX_CONFIRM_DELAY_MS must be a non-negative number");
  }
  return {
    provider,
    port,
    webhookSecret,
    webhookHeader: (env.WEBHOOK_SIGNATURE_HEADER ||
      (provider === "paystack" ? "x-paystack-signature" : "x-webhook-signature")).toLowerCase(),
    webhookAlgorithm: env.WEBHOOK_SIGNATURE_ALGORITHM || (provider === "paystack" ? "sha512" : "sha256"),
    corsOrigin: env.CORS_ORIGIN || "*",
    dataFile: env.DATA_FILE || "",
    sandboxConfirmDelayMs,
    paystack: {
      secretKey: env.PAYSTACK_SECRET_KEY || "",
      customerEmail: env.PAYSTACK_CUSTOMER_EMAIL || "",
      currency: env.PAYSTACK_CURRENCY || "NGN",
      momoProvider: env.PAYSTACK_MOMO_PROVIDER || "mtn",
      apiBase: env.PAYSTACK_API_BASE || "https://api.paystack.co"
    }
  };
}

module.exports = { buildConfig, PROVIDERS };
