"use strict";

const fs = require("node:fs");
const path = require("node:path");

function createStore(dataFile = "") {
  const state = { payments: {}, fares: {} };
  if (dataFile) {
    try {
      const parsed = JSON.parse(fs.readFileSync(dataFile, "utf8"));
      if (parsed && typeof parsed === "object") {
        state.payments = parsed.payments && typeof parsed.payments === "object" ? parsed.payments : {};
        state.fares = parsed.fares && typeof parsed.fares === "object" ? parsed.fares : {};
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  function persist() {
    if (!dataFile) return;
    const target = path.resolve(dataFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = target + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, target);
  }
  return {
    savePayment(payment) {
      state.payments[payment.id] = payment;
      persist();
      return payment;
    },
    getPayment(id) {
      return state.payments[id] || null;
    },
    findByReference(reference) {
      return Object.values(state.payments).find((p) => p.reference === reference) || null;
    },
    saveFare(fare) {
      state.fares[fare.id] = fare;
      persist();
      return fare;
    },
    listFares(vehicleId) {
      return Object.values(state.fares).filter((f) => !vehicleId || f.vehicleId === vehicleId);
    },
    listPayments(vehicleId) {
      return Object.values(state.payments).filter((p) => !vehicleId || p.vehicleId === vehicleId);
    }
  };
}

module.exports = { createStore };
