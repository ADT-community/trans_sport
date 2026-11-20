"use strict";

const http = require("node:http");
const { buildConfig } = require("./config");
const { createStore } = require("./store");
const { getProvider } = require("./providers");
const { PaymentError, requestPayment, processWebhook, publicPayment } = require("./payments");

function send(res, status, body, config) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": config.corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, " + config.webhookHeader
  });
  res.end(payload);
}

function readBody(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new PaymentError("Request body is too large", 413));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function createServer(options = {}) {
  const config = options.config || buildConfig(options.env || process.env);
  const store = options.store || createStore(config.dataFile);
  const provider = options.provider || getProvider(config.provider);
  const now = options.now || Date.now;
  const schedule = options.schedule || setTimeout;

  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") return send(res, 204, {}, config);
    let pathname;
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
    } catch {
      return send(res, 400, { error: "invalid URL" }, config);
    }
    try {
      if (req.method === "GET" && pathname === "/health") {
        return send(res, 200, {
          status: "ok",
          provider: config.provider,
          sandbox: config.provider === "sandbox"
        }, config);
      }
      if (req.method === "POST" && pathname === "/payments/request") {
        const raw = await readBody(req);
        let input;
        try {
          input = JSON.parse(raw);
        } catch {
          throw new PaymentError("Request body must be valid JSON");
        }
        const payment = await requestPayment({ input, config, store, provider, now, schedule });
        return send(res, 201, payment, config);
      }
      if (req.method === "GET" && pathname.startsWith("/payments/")) {
        const id = decodeURIComponent(pathname.slice("/payments/".length));
        const payment = store.getPayment(id);
        if (!payment) return send(res, 404, { error: "payment not found" }, config);
        return send(res, 200, publicPayment(payment), config);
      }
      if (req.method === "GET" && pathname === "/fares") {
        const url = new URL(req.url, "http://localhost");
        return send(res, 200, { fares: store.listFares(url.searchParams.get("vehicleId") || "") }, config);
      }
      if (req.method === "POST" && pathname === "/webhooks/mobile-money") {
        const raw = await readBody(req);
        const result = processWebhook({
          rawBody: raw,
          signature: req.headers[config.webhookHeader],
          config,
          store,
          now
        });
        return send(res, result.httpStatus, {
          received: true,
          status: result.status,
          matched: result.matched,
          duplicate: !!result.duplicate,
          reason: result.reason || null
        }, config);
      }
      return send(res, 404, { error: "not found" }, config);
    } catch (err) {
      const status = err instanceof PaymentError ? err.status : 500;
      if (status === 500) console.error("Unexpected payments API error:", err.message);
      return send(res, status, { error: status === 500 ? "internal error" : err.message }, config);
    }
  });
}

module.exports = { createServer };
