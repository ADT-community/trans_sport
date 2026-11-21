/* trans_sport API transport: bearer auth, durable FIFO offline queue and live-data helpers.
 * Pure browser JS, no build step. In Node the module is exported for unit tests.
 */
(function (root) {
  "use strict";

  const QUEUE_KEY = "trans_sport.queue.v1";
  const DEFAULT_MAX_QUEUE = 500;
  const RETRYABLE_NO_BODY = [401, 408, 429];

  function safeStorage(target) {
    try {
      return target && target.localStorage ? target.localStorage : null;
    } catch {
      return null;
    }
  }

  function parseTs(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.abs(value) >= 1e11 ? value : value * 1000;
    }
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  function createClient(options) {
    const o = options || {};
    const base = String(o.apiUrl || "").replace(/\/+$/, "");
    const fetchFn = o.fetchFn || (root.fetch ? root.fetch.bind(root) : null);
    const storage = o.storage === undefined ? safeStorage(root) : o.storage;
    const getToken = o.getToken || function () { return ""; };
    const maxQueue = Math.max(1, Number(o.maxQueue) || DEFAULT_MAX_QUEUE);
    const now = o.now || function () { return Date.now(); };
    const onQueueChange = o.onQueueChange || function () {};
    const onError = o.onError || function () {};

    let queue = [];
    let flushing = false;
    let online = o.online !== false;
    let seq = 0;

    try {
      const raw = storage && storage.getItem(QUEUE_KEY);
      const saved = raw ? JSON.parse(raw) : [];
      if (Array.isArray(saved)) {
        queue = saved.filter((item) => item && typeof item.path === "string").slice(-maxQueue);
      }
    } catch { /* corrupt or unavailable storage starts with an empty queue */ }
    onQueueChange(queue.length);

    function persist() {
      try {
        if (storage) storage.setItem(QUEUE_KEY, JSON.stringify(queue));
      } catch { /* private mode / quota: the in-memory queue still works */ }
      onQueueChange(queue.length);
    }

    function enabled() { return !!base; }
    function queued() { return queue.length; }
    function pending() { return queue.map((item) => ({ path: item.path, body: item.body, ts: item.ts })); }

    function request(method, path, body) {
      if (!enabled()) return Promise.resolve({ demo: true });
      if (!fetchFn) return Promise.reject(new Error("fetch is not available"));
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = "Bearer " + token;
      const init = { method: method, headers: headers };
      if (body !== undefined && body !== null) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }
      const url = base + (path.charAt(0) === "/" ? path : "/" + path);
      let response;
      try { response = fetchFn(url, init); } catch (err) { return Promise.reject(err); }
      return response.then((res) => {
        if (!res.ok) {
          const err = new Error("HTTP " + res.status);
          err.status = res.status;
          throw err;
        }
        if (res.status === 204) return null;
        return typeof res.json === "function" ? res.json() : null;
      });
    }

    function enqueue(path, body) {
      queue.push({ id: String(now()) + ":" + (seq++), path: path, body: body, ts: now() });
      if (queue.length > maxQueue) queue.splice(0, queue.length - maxQueue);
      persist();
    }

    function step(tail) {
      if (!online || !queue.length) {
        flushing = false;
        tail();
        return;
      }
      const item = queue[0];
      request("POST", item.path, item.body).then(() => {
        queue.shift();
        persist();
        step(tail);
      }, (err) => {
        flushing = false;
        const permanent = err.status >= 400 && err.status < 500 && RETRYABLE_NO_BODY.indexOf(err.status) === -1;
        if (permanent) {
          queue.shift();
          persist();
          onError(err, item);
          step(tail);
          return;
        }
        onError(err, item);
        tail();
      });
    }

    function flush() {
      if (!enabled() || !online || flushing || !queue.length) return Promise.resolve();
      flushing = true;
      return new Promise((resolve) => step(resolve));
    }

    function post(path, body) {
      if (!enabled()) return Promise.resolve({ demo: true });
      enqueue(path, body);
      return flush();
    }

    function setOnline(value) {
      online = !!value;
      return online ? flush() : Promise.resolve();
    }

    return {
      enabled: enabled,
      queued: queued,
      pending: pending,
      post: post,
      flush: flush,
      setOnline: setOnline,
      request: request,
      get: (path) => request("GET", path),
      latest: () => request("GET", "/vehicles/latest"),
      earnings: (vehicleId, days) => request("GET", "/vehicles/" + encodeURIComponent(vehicleId) + "/earnings?days=" + (days || 7)),
      authRequestOtp: (phone, role) => request("POST", "/auth/request-otp", { phone: phone, role: role }),
      authVerifyOtp: (phone, role, code) => request("POST", "/auth/verify-otp", { phone: phone, role: role, code: code })
    };
  }

  function applyLatest(vehicles, payload, opts) {
    const settings = opts || {};
    const at = typeof settings.now === "number" ? settings.now : Date.now();
    const staleAfter = Number(settings.staleAfterMs) || 45000;
    const rows = payload && Array.isArray(payload.vehicles) ? payload.vehicles : [];
    const byId = new Map();
    for (const row of rows) if (row && row.vehicleId) byId.set(row.vehicleId, row);

    for (const v of vehicles) {
      const row = byId.get(v.id);
      if (!row || !Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng))) continue;
      v.pos = [Number(row.lat), Number(row.lng)];
      v.accuracy = Number(row.accuracy) || 0;
      v.lastSeen = parseTs(row.ts);
      v.stale = !v.lastSeen || (at - v.lastSeen) > staleAfter;
      v.status = v.stale ? "offline" : "active";
      v.remote = true;
    }
    return vehicles;
  }

  function applyEarnings(vehicles, byVehicle) {
    for (const v of vehicles) {
      const data = byVehicle && byVehicle[v.id];
      if (!data || !data.totals) continue;
      const totals = data.totals;
      v.today.cash = Number(totals.cash) || 0;
      v.today.digital = Number(totals.mobileMoney) || 0;
      v.today.trips = Number(totals.fareCount) || 0;
      v.today.pax = v.today.trips;
    }
    return vehicles;
  }

  function isStale(ts, nowMs, maxAgeMs) {
    const at = parseTs(ts);
    return !at || (nowMs - at) > (Number(maxAgeMs) || 45000);
  }

  const api = { createClient, parseTs, applyLatest, applyEarnings, isStale, QUEUE_KEY, DEFAULT_MAX_QUEUE };
  root.TRANS_API = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
