/* trans_sport web app: Passenger (Ride), Driver (Drive) and Owner views. */
(() => {
  "use strict";
  const CFG = window.TRANS_CONFIG;
  const { ROUTES, vehicles, km, nextStop, etaMinutes, onUpdate } = window.SIM;

  /* Backend. Empty apiUrl = demo mode: nothing is sent or fetched and the simulation runs alone. */
  const API = (CFG.apiUrl || "").replace(/\/$/, "");
  const LIVE = !!API;
  const PING_MS = 20000;       // driver sends one ping every 20 s while on shift
  const FLEET_MS = 15000;      // owner refreshes GET /vehicles/latest every 15 s
  const EARNINGS_MS = 60000;   // owner refreshes earnings every minute
  const STALE_MS = 60000;      // a vehicle with no ping for a minute is stale (greyed out)
  const QUEUE_MAX = 500;       // pings kept while offline
  const QUEUE_KEY = "trans_sport.outbox";
  const $ = (s) => document.querySelector(s);
  const money = (n) => "₦" + Math.round(n).toLocaleString(CFG.locale);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const firstName = (n) => n.split(" ")[0];
  const nearLagos = (p) => km(p, CFG.city.center) < 60;

  /* ---------- shared UI ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function openModal(title, html, onReady) {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = html;
    $("#modal").hidden = false;
    onReady && onReady($("#modalBody"));
  }
  function closeModal() { $("#modal").hidden = true; }
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal(); });

  /* ---------- outbox ----------
   * Everything the app sends to the backend goes through here. Items are flushed
   * oldest first and a failed send stops the flush, so pings arrive in the order
   * they were taken. The queue survives a reload and is capped at QUEUE_MAX. */
  const outbox = {
    items: [],          // [{ path, body }], oldest first
    sending: false,
    load() {
      try {
        const saved = JSON.parse(localStorage.getItem(QUEUE_KEY));
        if (Array.isArray(saved)) this.items = saved.filter((it) => it && typeof it.path === "string");
      } catch { /* unreadable storage: start empty */ }
    },
    save() { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(this.items)); } catch { /* storage full or blocked */ } },
    add(path, body) {
      this.items.push({ path, body });
      while (this.items.length > QUEUE_MAX) {
        const oldestPing = this.items.findIndex((it) => it.path === "/locations");
        this.items.splice(oldestPing === -1 ? 0 : oldestPing, 1);   // drop old pings first: fares are money
      }
      this.save();
      this.flush();
    },
    async flush() {
      if (!LIVE || this.sending) return;
      this.sending = true;
      try {
        while (this.items.length) {
          if (!(await send(this.items[0]))) break;   // offline: keep the rest, in order, for later
          this.items.shift();
          this.save();
        }
      } finally { this.sending = false; }
    }
  };

  /** Sends one queued item. True when it is done with: accepted, or rejected in a way a retry can't fix. */
  async function send(item) {
    try {
      const res = await fetch(API + item.path, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body), keepalive: true
      });
      if (res.status >= 400 && res.status < 500) {
        console.warn(`trans_sport: backend rejected ${item.path} (${res.status}), dropping it`);
        return true;
      }
      return res.ok;
    } catch { return false; }   // no network
  }

  function post(path, body) { if (LIVE) outbox.add(path, body); }

  async function getJson(path) {
    try {
      const res = await fetch(API + path, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      fleet.error = "";
      return data;
    } catch (e) {
      fleet.error = /fetch/i.test(e.message) ? "Can't reach the backend" : `Backend error: ${e.message}`;
      return null;
    }
  }

  function makeMap(el, opts = {}) {
    const map = L.map(el, { zoomControl: false, attributionControl: true, ...opts })
      .setView(CFG.city.center, CFG.city.zoom);
    L.tileLayer(CFG.tileUrl, { maxZoom: 18, attribution: CFG.tileAttribution }).addTo(map);
    return map;
  }
  const plateShort = (p) => String(p).split(" ")[1] || String(p);
  function busIcon(v, selected) {
    const mine = v.isMine || (driver.onShift && v.id === driver.v.id);
    const cls = `bus${selected ? " sel" : ""}${mine ? " mine" : ""}${v.stale ? " stale" : ""}`;
    return L.divIcon({
      className: "", iconSize: [0, 0],
      html: `<div class="${cls}" style="--c:${v.route.color}"><i>${esc(v.route.id)}</i>${esc(plateShort(v.plate))}</div>`
    });
  }

  /* ---------- tabs ---------- */
  const views = { ride: $("#view-ride"), drive: $("#view-drive"), owner: $("#view-owner") };
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
    Object.entries(views).forEach(([k, el]) => el.classList.toggle("active", k === b.dataset.view));
    if (b.dataset.view === "ride") setTimeout(() => ride.map.invalidateSize(), 0);
    if (b.dataset.view === "owner") setTimeout(() => { owner.map.invalidateSize(); owner.fit(); }, 0);
    render();
  }));

  /* =====================================================================
   * PASSENGER
   * ===================================================================== */
  const ride = { map: null, markers: new Map(), lines: new Map(), me: null, pos: ROUTES[1].points[0], selected: null, filter: "" };

  function initRide() {
    ride.map = makeMap("rideMap");
    for (const r of ROUTES) {
      ride.lines.set(r.id, L.polyline(r.points, { color: r.color, weight: 4, opacity: 0.35 }).addTo(ride.map));
      const o = document.createElement("option");
      o.value = r.id; o.textContent = `${r.id} · ${r.name}`;
      $("#routeFilter").append(o);
    }
    ride.me = L.marker(ride.pos, { icon: L.divIcon({ className: "", iconSize: [0, 0], html: '<div class="me"></div>' }), interactive: false }).addTo(ride.map);
    ride.map.setView(ride.pos, 13);
    $("#routeFilter").addEventListener("change", (e) => { ride.filter = e.target.value; ride.selected = null; renderRide(true); });
    $("#locate").addEventListener("click", locateMe);
  }

  function locateMe() {
    if (!navigator.geolocation) return toast("Location isn't available on this device");
    navigator.geolocation.getCurrentPosition((p) => {
      const pos = [p.coords.latitude, p.coords.longitude];
      if (nearLagos(pos)) {
        ride.pos = pos; ride.me.setLatLng(pos); ride.map.setView(pos, 14);
        $("#rideWhere").textContent = "Using your location";
      } else {
        toast("You're outside Lagos, so the demo uses a spot in Yaba");
        ride.map.setView(ride.pos, 14);
      }
      renderRide(true);
    }, () => toast("Couldn't get your location"), { enableHighAccuracy: true, timeout: 10000 });
  }

  function visibleBuses() {
    return vehicles.filter((v) => v.status === "active" && (!ride.filter || v.route.id === ride.filter));
  }

  function renderRide(force) {
    const buses = visibleBuses();
    // markers
    for (const v of vehicles) {
      const show = buses.includes(v);
      let m = ride.markers.get(v.id);
      if (show && !m) { m = L.marker(v.pos, { icon: busIcon(v, ride.selected === v) }).addTo(ride.map); m.on("click", () => selectBus(v)); ride.markers.set(v.id, m); }
      if (!show && m) { m.remove(); ride.markers.delete(v.id); continue; }
      if (m) { m.setLatLng(v.pos); if (force) m.setIcon(busIcon(v, ride.selected === v)); }
    }
    for (const [id, line] of ride.lines) {
      const on = ride.selected ? ride.selected.route.id === id : !ride.filter || ride.filter === id;
      line.setStyle({ opacity: on ? 0.85 : 0.15, weight: ride.selected && on ? 6 : 4 });
    }
    if (ride.selected) return renderBusDetail();
    // list
    const sorted = buses.map((v) => ({ v, eta: etaMinutes(v, ride.pos) })).sort((a, b) => a.eta - b.eta).slice(0, 6);
    $("#busList").innerHTML = sorted.length ? sorted.map(({ v, eta }) => `
      <button class="row" data-id="${v.id}" style="--c:${v.route.color}">
        <span class="badge">${v.route.id}</span>
        <span class="main"><b>${esc(v.route.name)}</b><span>${esc(v.plate)} · ${v.seats - v.onboard} seat${v.seats - v.onboard === 1 ? "" : "s"} free · ${money(v.route.fare)}</span></span>
        <span class="end"><b>${eta} min</b><span>away</span></span>
      </button>`).join("") : `<p class="muted">No minibuses on this route right now.</p>`;
    $("#busList").querySelectorAll(".row").forEach((b) => b.addEventListener("click", () => selectBus(vehicles.find((x) => x.id === b.dataset.id))));
  }

  function selectBus(v) {
    ride.selected = v;
    $("#rideList").hidden = true;
    $("#rideDetail").hidden = false;
    ride.map.panTo(v.pos);
    renderRide(true);
  }
  function unselect() {
    ride.selected = null;
    $("#rideList").hidden = false;
    $("#rideDetail").hidden = true;
    renderRide(true);
  }

  function renderBusDetail() {
    const v = ride.selected;
    const stop = nextStop(v.route, v.d, v.dir);
    const eta = etaMinutes(v, ride.pos);
    const dest = v.dir > 0 ? v.route.stops[v.route.stops.length - 1][0] : v.route.stops[0][0];
    const el = $("#rideDetail");
    if (!el.dataset.built || el.dataset.built !== v.id) {
      el.dataset.built = v.id;
      el.innerHTML = `
        <button class="back" id="backBtn">← All minibuses</button>
        <div class="detail-head" style="--c:${v.route.color}">
          <span class="badge">${v.route.id}</span>
          <div><h2>${esc(v.route.name)}</h2><p class="muted small">${esc(v.plate)} · Driver ${esc(firstName(v.driver))}</p></div>
        </div>
        <div class="facts">
          <div class="fact"><span class="k">Arrives in</span><span class="v" id="fEta"></span></div>
          <div class="fact"><span class="k">Fare</span><span class="v">${money(v.route.fare)}</span></div>
          <div class="fact"><span class="k">Seats free</span><span class="v" id="fSeats"></span></div>
        </div>
        <p class="muted small" id="fNext" style="margin-bottom:12px"></p>
        <div class="actions">
          <button class="btn primary" id="payBtn">Pay ${money(v.route.fare)}</button>
          <button class="btn" id="shareBtn">Share trip</button>
        </div>`;
      $("#backBtn").addEventListener("click", unselect);
      $("#payBtn").addEventListener("click", () => payFare(v));
      $("#shareBtn").addEventListener("click", () => shareTrip(v));
    }
    $("#fEta").textContent = `${eta} min`;
    $("#fSeats").textContent = String(v.seats - v.onboard);
    $("#fNext").textContent = `Heading to ${dest} · next stop ${stop[0]}`;
  }

  function payFare(v) {
    openModal(`Pay ${money(v.route.fare)}`, `
      <p>Pay your fare for ${esc(v.plate)} (${esc(v.route.name)}) by mobile money.</p>
      <label for="payPhone">Mobile money number</label>
      <input id="payPhone" type="tel" inputmode="tel" placeholder="080 0000 0000" autocomplete="tel">
      <label for="payProvider">Pay with</label>
      <select id="payProvider"><option>OPay</option><option>PalmPay</option><option>MTN MoMo</option><option>Moniepoint</option></select>
      <div class="actions">
        <button class="btn" data-close>Cancel</button>
        <button class="btn primary" id="payGo">Send payment request</button>
      </div>
      <p class="muted small" style="margin:12px 0 0">Demo mode: no money moves.</p>`, (body) => {
      body.querySelector("#payGo").addEventListener("click", () => {
        const phone = body.querySelector("#payPhone").value.replace(/\D/g, "");
        if (phone.length < 10) { body.querySelector("#payPhone").focus(); return toast("Enter your mobile money number"); }
        v.today.digital += v.route.fare; v.today.pax += 1; v.onboard = Math.min(v.seats, v.onboard + 1);
        post("/fares", { vehicleId: v.id, amount: v.route.fare, method: "mobile_money", ts: Date.now() });
        closeModal();
        toast(`Paid ${money(v.route.fare)} · show this to the driver`);
      });
    });
  }

  async function shareTrip(v) {
    const text = `I'm on minibus ${v.plate} (${v.route.name}), driver ${firstName(v.driver)}.`;
    const url = location.href.split("#")[0] + "#bus=" + v.id;
    try {
      if (navigator.share) await navigator.share({ title: "My trip", text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); toast("Trip details copied, paste them to a friend"); }
    } catch { /* user cancelled */ }
  }

  /* =====================================================================
   * DRIVER
   * ===================================================================== */
  const driver = { v: vehicles[0], onShift: false, watch: null, realGps: false, accuracy: null, pingTimer: null, gpsText: "", gpsLive: false };

  function initDriver() {
    const v = driver.v;
    $("#dPlate").textContent = v.plate;
    $("#dRoute").textContent = v.route.name;
    $("#dRouteDot").textContent = v.route.id;
    $("#dRouteDot").style.setProperty("--c", v.route.color);
    $("#fareAmt1").textContent = money(v.route.fare);
    $("#fareAmt2").textContent = money(v.route.fare);
    v.status = "idle";
    $("#shiftBtn").addEventListener("click", toggleShift);
    $("#cashFare").addEventListener("click", () => takeFare("cash"));
    $("#momoFare").addEventListener("click", requestMomo);
    $("#paxPlus").addEventListener("click", () => { v.onboard = Math.min(v.seats, v.onboard + 1); render(); });
    $("#paxMinus").addEventListener("click", () => { v.onboard = Math.max(0, v.onboard - 1); render(); });
    $("#endTrip").addEventListener("click", () => {
      if (!driver.onShift) return toast("Start your shift first");
      v.today.trips += 1; v.onboard = 0; v.dir *= -1; render(); toast("Trip finished. Safe driving!");
    });
  }

  function toggleShift() {
    const v = driver.v;
    driver.onShift = !driver.onShift;
    if (driver.onShift) {
      v.status = "active";
      v.lastSeen = Date.now();
      startGps();
      startPings();
      toast("Shift started. Passengers can see you now.");
    } else {
      v.status = "idle";
      v.isMine = false;
      if (driver.watch !== null) navigator.geolocation.clearWatch(driver.watch);
      driver.watch = null; driver.realGps = false; driver.accuracy = null;
      stopPings();
      toast("Shift ended");
    }
    render(true);
  }

  function startGps() {
    const v = driver.v;
    const fallback = (why) => { driver.realGps = false; driver.accuracy = null; v.isMine = false; setGps(`Simulated GPS (${why}). On a real shift your phone's GPS is used.`, true); };
    if (!navigator.geolocation) return fallback("no GPS on this device");
    setGps("Finding your location…", false);
    driver.watch = navigator.geolocation.watchPosition((p) => {
      const pos = [p.coords.latitude, p.coords.longitude];
      if (!nearLagos(pos)) return fallback("you're outside the Lagos demo area");
      driver.realGps = true; driver.accuracy = p.coords.accuracy; v.isMine = true; v.pos = pos; v.lastSeen = Date.now();
      setGps(`Sharing live GPS · accurate to ${Math.round(p.coords.accuracy)} m`, true);
    }, () => fallback("location permission off"), { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }

  /* Pings go out on a fixed 20 s beat rather than on every GPS fix, so data use is
   * predictable. Each one is queued first: a ping taken in a dead spot is sent later,
   * in order, once the network is back. */
  function startPings() {
    stopPings();
    if (!LIVE) return;
    sendPing();
    driver.pingTimer = setInterval(sendPing, PING_MS);
  }
  function stopPings() {
    if (driver.pingTimer !== null) clearInterval(driver.pingTimer);
    driver.pingTimer = null;
  }
  function sendPing() {
    if (!driver.onShift) return stopPings();
    const v = driver.v;
    post("/locations", {
      vehicleId: v.id, lat: v.pos[0], lng: v.pos[1],
      accuracy: driver.accuracy === null ? null : Math.round(driver.accuracy), ts: Date.now()
    });
  }

  function setGps(text, live) {
    driver.gpsText = text;
    driver.gpsLive = live;
    paintGps();
  }
  function paintGps() {
    const q = outbox.items.length;
    const g = $("#gpsStatus");
    g.textContent = driver.gpsText + (q ? ` · ${q} update${q === 1 ? "" : "s"} waiting to send` : "");
    g.classList.toggle("live", driver.gpsLive);
  }

  function takeFare(method) {
    const v = driver.v;
    if (!driver.onShift) return toast("Start your shift first");
    if (method === "cash") v.today.cash += v.route.fare; else v.today.digital += v.route.fare;
    v.today.pax += 1;
    v.onboard = Math.min(v.seats, v.onboard + 1);
    post("/fares", { vehicleId: v.id, amount: v.route.fare, method: method === "cash" ? "cash" : "mobile_money", ts: Date.now() });
    render();
    toast(`${money(v.route.fare)} ${method === "cash" ? "cash" : "mobile money"} recorded`);
  }

  function requestMomo() {
    const v = driver.v;
    if (!driver.onShift) return toast("Start your shift first");
    const code = String(100000 + Math.floor(Math.random() * 900000));
    openModal(`Collect ${money(v.route.fare)}`, `
      <p>Ask the passenger to pay with this code in their mobile money app, or pay from the Ride screen.</p>
      <div class="paycode">${code.slice(0, 3)} ${code.slice(3)}</div>
      <div class="actions">
        <button class="btn" data-close>Cancel</button>
        <button class="btn primary" id="markPaid">Payment received</button>
      </div>
      <p class="muted small" style="margin:12px 0 0">Demo mode: a real version confirms payment automatically.</p>`, (body) => {
      body.querySelector("#markPaid").addEventListener("click", () => { closeModal(); takeFare("mobile_money"); });
    });
  }

  function renderDriver() {
    const v = driver.v, t = v.today;
    $("#shiftBtn").textContent = driver.onShift ? "End shift" : "Start shift";
    $("#shiftBtn").classList.toggle("on", driver.onShift);
    if (!driver.onShift) setGps("GPS off. Your location is only shared while you're on shift.", false);
    $("#dTrips").textContent = t.trips;
    $("#dPax").textContent = t.pax;
    $("#dCash").textContent = money(t.cash);
    $("#dDigital").textContent = money(t.digital);
    $("#dOnboard").textContent = v.onboard;
    $("#cashFare").disabled = $("#momoFare").disabled = !driver.onShift;
    paintGps();
  }

  /* =====================================================================
   * OWNER
   * ===================================================================== */
  const owner = { map: null, markers: new Map(), fitted: false };

  /* The live fleet, filled from the backend when apiUrl is set. */
  const fleet = { vehicles: new Map(), earnings: new Map(), updated: 0, error: "" };
  const NO_EARNINGS = { trips: 0, pax: 0, cash: 0, digital: 0, hours: 0 };

  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const pick = (o, ...keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]; };
  /** Timestamps may be epoch ms, epoch seconds or ISO strings. */
  function toMs(ts) {
    if (typeof ts === "number") return ts > 1e12 ? ts : ts * 1000;
    const t = Date.parse(ts);
    return Number.isNaN(t) ? Date.now() : t;
  }
  const UNKNOWN_ROUTE = { id: "·", name: "Unknown route", color: "#6b7280", fare: 0 };
  const routeOf = (r) => ROUTES.find((x) => x.id === pick(r, "routeId") || (r.route && x.id === r.route.id)) || UNKNOWN_ROUTE;

  /** One row of GET /vehicles/latest, in the shape the views already use. Null if unusable. */
  function liveVehicle(r) {
    const id = String(pick(r, "vehicleId", "id") || "");
    const lat = Number(pick(r, "lat", "latitude"));
    const lng = Number(pick(r, "lng", "longitude"));
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const lastSeen = toMs(pick(r, "ts", "recordedAt", "updatedAt", "lastSeen"));
    const stale = Date.now() - lastSeen > STALE_MS;
    const status = pick(r, "status");
    return {
      id, plate: String(pick(r, "plate") || id), driver: String(pick(r, "driver", "driverName") || "—"),
      route: routeOf(r), pos: [lat, lng], lastSeen, stale,
      status: ["active", "idle", "offline"].includes(status) ? status : stale ? "idle" : "active",
      seats: num(pick(r, "seats")) || 14, onboard: num(pick(r, "onboard"))
    };
  }

  /** Today's totals from GET /vehicles/{id}/earnings. */
  function liveEarnings(data) {
    const rows = Array.isArray(data) ? data : pick(data, "days", "earnings") || [];
    const day = (d) => ({
      cash: num(pick(d, "cash", "cashTotal")),
      digital: num(pick(d, "mobileMoney", "mobile_money", "digital", "momo")),
      trips: num(pick(d, "trips")), pax: num(pick(d, "passengers", "pax")), hours: num(pick(d, "hours"))
    });
    const sorted = [...rows].sort((a, b) => String(pick(a, "date") || "").localeCompare(String(pick(b, "date") || "")));
    return sorted.length ? day(sorted[sorted.length - 1]) : day(pick(data, "today", "totals") || data);
  }

  async function refreshFleet() {
    const data = await getJson("/vehicles/latest");
    if (!data) return paintOwner();
    const rows = Array.isArray(data) ? data : pick(data, "vehicles", "data") || [];
    fleet.vehicles = new Map(rows.map(liveVehicle).filter(Boolean).map((v) => [v.id, v]));
    fleet.updated = Date.now();
    owner.fit();
    if ([...fleet.vehicles.keys()].some((id) => !fleet.earnings.has(id))) refreshEarnings();
    paintOwner();
  }

  async function refreshEarnings() {
    await Promise.all([...fleet.vehicles.keys()].map(async (id) => {
      const data = await getJson(`/vehicles/${encodeURIComponent(id)}/earnings?days=1`);
      if (data) fleet.earnings.set(id, liveEarnings(data));
    }));
    paintOwner();
  }

  function paintOwner() { if (views.owner.classList.contains("active")) renderOwner(); }

  function initOwner() {
    owner.map = makeMap("ownerMap", { attributionControl: true });
    if (!LIVE) for (const r of ROUTES) L.polyline(r.points, { color: r.color, weight: 3, opacity: 0.4 }).addTo(owner.map);
    owner.fit = () => {
      if (owner.fitted) return;
      const pts = LIVE ? [...fleet.vehicles.values()].map((v) => v.pos) : ROUTES.flatMap((r) => r.points);
      if (!pts.length) return;
      owner.fitted = true;
      owner.map.fitBounds(L.latLngBounds(pts), { padding: [16, 16], maxZoom: 15 });
    };
  }

  function ago(ts, status) {
    if (status === "offline") return "offline";
    const s = Math.round((Date.now() - ts) / 1000);
    return s < 30 ? "live" : s < 3600 ? `${Math.round(s / 60)} min ago` : "over an hour ago";
  }

  /** What the owner sees: the simulation in demo mode, the backend's fleet in live mode. */
  function ownerFleet() {
    if (!LIVE) return vehicles;
    return [...fleet.vehicles.values()].map((v) => ({
      ...v, stale: Date.now() - v.lastSeen > STALE_MS, today: fleet.earnings.get(v.id) || NO_EARNINGS
    }));
  }

  function renderOwner() {
    const fl = ownerFleet();
    const total = fl.reduce((a, v) => a + v.today.cash + v.today.digital, 0);
    const digital = fl.reduce((a, v) => a + v.today.digital, 0);
    const active = fl.filter((v) => v.status === "active" && !v.stale).length;
    $("#oTakings").textContent = money(total);
    $("#oActive").textContent = `${active}/${fl.length}`;
    $("#oPax").textContent = fl.reduce((a, v) => a + v.today.pax, 0).toLocaleString(CFG.locale);
    $("#oDigital").textContent = total ? Math.round((digital / total) * 100) + "%" : "0%";

    const shown = new Set(fl.map((v) => v.id));
    for (const [id, m] of owner.markers) if (!shown.has(id)) { m.remove(); owner.markers.delete(id); }
    for (const v of fl) {
      let m = owner.markers.get(v.id);
      if (v.status === "offline") { if (m) { m.remove(); owner.markers.delete(v.id); } continue; }
      if (!m) { m = L.marker(v.pos, { icon: busIcon(v, false) }).addTo(owner.map); m.stale = !!v.stale; owner.markers.set(v.id, m); }
      m.setLatLng(v.pos);
      if (m.stale !== !!v.stale) { m.stale = !!v.stale; m.setIcon(busIcon(v, false)); }   // grey out, or bring back
    }

    const order = { active: 0, idle: 1, offline: 2 };
    $("#fleetList").innerHTML = [...fl].sort((a, b) => order[a.status] - order[b.status]).map((v) => `
      <button class="row${v.stale ? " stale" : ""}" data-id="${esc(v.id)}" style="--c:${v.route.color}">
        <span class="badge">${esc(v.route.id)}</span>
        <span class="main"><b>${esc(v.plate)}${v.id === driver.v.id ? " · you" : ""}</b>
          <span><i class="status-dot s-${v.stale ? "offline" : v.status}"></i>${esc(v.driver)} · ${ago(v.lastSeen, v.status)}</span></span>
        <span class="end"><b>${money(v.today.cash + v.today.digital)}</b><span>${v.today.trips} trips</span></span>
      </button>`).join("") || `<p class="muted">No vehicles have reported yet.</p>`;
    $("#fleetList").querySelectorAll(".row").forEach((b) => b.addEventListener("click", () => {
      const v = fl.find((x) => x.id === b.dataset.id);
      if (!v) return;
      if (v.status === "offline") return toast(`${v.plate} is offline`);
      owner.map.setView(v.pos, 14);
      $("#ownerMap").scrollIntoView({ behavior: "smooth", block: "center" });
    }));

    const rows = fl.map((v) => {
      const takings = v.today.cash + v.today.digital;
      return { v, takings, perHour: v.today.hours ? takings / Math.max(0.5, v.today.hours) : null };
    });
    const rated = rows.filter((r) => r.perHour !== null);
    const avg = rated.length ? rated.reduce((a, r) => a + r.perHour, 0) / rated.length : 0;
    const best = rated.length ? Math.max(...rated.map((r) => r.perHour)) : 0;
    $("#driverTable").innerHTML = rows.sort((a, b) => b.takings - a.takings).map((r) => `
      <tr>
        <td>${esc(r.v.driver)}</td>
        <td class="num">${r.v.today.trips}</td>
        <td class="num">${money(r.takings)}</td>
        <td class="num">${r.perHour === null ? "—" : money(r.perHour)}</td>
        <td>${r.perHour === null || !best ? "" : r.perHour === best ? '<span class="flag top">Top</span>' : r.perHour < avg * 0.6 ? '<span class="flag low">Check</span>' : ""}</td>
      </tr>`).join("");
    $("#ownerFoot").innerHTML = ownerFootNote(fl.length);
  }

  function ownerFootNote(count) {
    if (!LIVE) return `Demo data: simulated minibuses in Lagos. Connect a backend in <code>config.js</code> to see your real fleet.`;
    if (fleet.error) return `${esc(fleet.error)}. Showing the last fleet received${fleet.updated ? ` (${ago(fleet.updated)})` : ""}.`;
    return `Live fleet from <code>${esc(API)}</code> · ${count} vehicle${count === 1 ? "" : "s"} · refreshed ${ago(fleet.updated)}.
      Vehicles with no ping for ${STALE_MS / 1000} s are greyed out.`;
  }

  /* ---------- render loop ---------- */
  function render(force) {
    if (views.ride.classList.contains("active")) renderRide(force);
    if (views.drive.classList.contains("active")) renderDriver();
    if (views.owner.classList.contains("active")) renderOwner();
  }

  initRide();
  initDriver();
  initOwner();
  onUpdate(() => render(false));
  render(true);

  if (LIVE) {
    outbox.load();
    outbox.flush();
    addEventListener("online", () => outbox.flush());
    refreshFleet();
    setInterval(() => { if (!document.hidden) refreshFleet(); }, FLEET_MS);
    setInterval(() => { if (!document.hidden) refreshEarnings(); }, EARNINGS_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { refreshFleet(); refreshEarnings(); } });
  }

  // Deep link from a shared trip: #bus=v3
  const m = location.hash.match(/bus=(v\d+)/);
  if (m) { const v = vehicles.find((x) => x.id === m[1]); if (v && v.status === "active") selectBus(v); }
})();
