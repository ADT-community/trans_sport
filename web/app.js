/* trans_sport web app: Passenger (Ride), Driver (Drive) and Owner views. */
(() => {
  "use strict";
  const CFG = window.TRANS_CONFIG;
  const { ROUTES, vehicles, km, nextStop, etaMinutes, onUpdate } = window.SIM;
  const $ = (s) => document.querySelector(s);
  const money = (n) => "₦" + Math.round(n).toLocaleString(CFG.locale);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const firstName = (n) => n.split(" ")[0];
  const nearLagos = (p) => km(p, CFG.city.center) < 60;

  const LIVE = !!CFG.apiUrl;
  const TOKEN_KEY = "trans_sport.token";
  const driver = { v: vehicles[0], onShift: false, watch: null, realGps: false, lastPing: 0,
                   accuracy: 0, queued: 0, pingTimer: null, gpsText: "", gpsLive: false };
  const token = () => {
    try { return LIVE ? (sessionStorage.getItem(TOKEN_KEY) || "") : ""; } catch { return ""; }
  };
  const API = window.TRANS_API.createClient({
    apiUrl: CFG.apiUrl,
    getToken: token,
    maxQueue: CFG.maxQueue,
    onQueueChange: (n) => { driver.queued = n; renderGps(); }
  });
  const post = (path, body) => API.post(path, body);
  if (LIVE) window.addEventListener("online", () => API.flush());

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

  /* ---------- backend sign-in (pilot OTP) ---------- */
  function normalizePhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 ? "+" + digits : "";
  }

  function openSignIn() {
    const role = views.drive.classList.contains("active") ? "driver" : "owner";
    openModal("Connect to backend", `
      <p>Use the phone number from your backend account. In pilot mode the 6-digit code is printed in the backend console.</p>
      <label for="siPhone">Phone number</label>
      <input id="siPhone" type="tel" inputmode="tel" placeholder="+2348010000001" autocomplete="tel">
      <label for="siRole">Role</label>
      <select id="siRole">
        <option value="driver"${role === "driver" ? " selected" : ""}>Driver</option>
        <option value="owner"${role === "owner" ? " selected" : ""}>Owner</option>
      </select>
      <div class="actions" style="margin-top:12px">
        <button class="btn" data-close>Cancel</button>
        <button class="btn primary" id="siSend">Send code</button>
      </div>`, (body) => {
      body.querySelector("#siSend").addEventListener("click", () => {
        const phone = normalizePhone(body.querySelector("#siPhone").value);
        if (!phone) return toast("Enter a valid phone number");
        const chosen = body.querySelector("#siRole").value;
        API.authRequestOtp(phone, chosen).then(
          () => askOtp(phone, chosen),
          () => toast("Could not reach the backend")
        );
      });
    });
  }

  function askOtp(phone, role) {
    openModal("Enter your code", `
      <p>Enter the code for ${esc(phone)}. Check the backend console in pilot mode.</p>
      <label for="siCode">6-digit code</label>
      <input id="siCode" type="text" inputmode="numeric" maxlength="6" placeholder="123456" autocomplete="one-time-code">
      <div class="actions" style="margin-top:12px">
        <button class="btn" data-close>Cancel</button>
        <button class="btn primary" id="siVerify">Connect</button>
      </div>`, (body) => {
      body.querySelector("#siVerify").addEventListener("click", () => {
        const code = body.querySelector("#siCode").value.replace(/\D/g, "");
        if (code.length !== 6) return toast("Enter the 6-digit code");
        API.authVerifyOtp(phone, role, code).then((data) => {
          try { sessionStorage.setItem(TOKEN_KEY, data.token); } catch {}
          closeModal();
          updateConnectLabels();
          toast("Connected to backend");
          if (role === "driver" && driver.onShift) post("/shifts/start", { vehicleId: driver.v.id });
          refreshOwnerLive();
          refreshEarnings();
          API.flush();
        }, () => toast("That code did not work"));
      });
    });
  }

  function updateConnectLabels() {
    if (!LIVE) return;
    const label = token() ? "Connected" : "Sign in";
    $("#driverConnect").textContent = label;
    $("#ownerConnect").textContent = label;
  }

  function makeMap(el, opts = {}) {
    const map = L.map(el, { zoomControl: false, attributionControl: true, ...opts })
      .setView(CFG.city.center, CFG.city.zoom);
    L.tileLayer(CFG.tileUrl, { maxZoom: 18, attribution: CFG.tileAttribution }).addTo(map);
    return map;
  }
  function busIcon(v, selected) {
    const mine = v.isMine || (driver.onShift && v === driver.v);
    return L.divIcon({
      className: "", iconSize: [0, 0],
      html: `<div class="bus${selected ? " sel" : ""}${v.stale ? " stale" : ""}${mine ? " mine" : ""}" style="--c:${v.route.color}"><i>${v.route.id}</i>${esc(v.plate.split(" ")[1])}</div>`
    });
  }

  /* ---------- tabs ---------- */
  const views = { ride: $("#view-ride"), drive: $("#view-drive"), owner: $("#view-owner") };
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
    Object.entries(views).forEach(([k, el]) => el.classList.toggle("active", k === b.dataset.view));
    if (b.dataset.view === "ride") setTimeout(() => ride.map.invalidateSize(), 0);
    if (b.dataset.view === "owner") setTimeout(() => { owner.map.invalidateSize(); owner.fit(); }, 0);
    if (LIVE && b.dataset.view === "owner") { refreshOwnerLive(); refreshEarnings(); }
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
  function initDriver() {
    const v = driver.v;
    $("#dPlate").textContent = v.plate;
    $("#dRoute").textContent = v.route.name;
    $("#dRouteDot").textContent = v.route.id;
    $("#dRouteDot").style.setProperty("--c", v.route.color);
    $("#fareAmt1").textContent = money(v.route.fare);
    $("#fareAmt2").textContent = money(v.route.fare);
    v.status = "idle";
    if (LIVE) {
      $("#driverConnect").hidden = false;
      $("#driverConnect").addEventListener("click", openSignIn);
      updateConnectLabels();
    }
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
      startPingTimer();
      if (LIVE) post("/shifts/start", { vehicleId: v.id });
      toast("Shift started. Passengers can see you now.");
    } else {
      v.status = "idle";
      v.isMine = false;
      if (driver.watch !== null) navigator.geolocation.clearWatch(driver.watch);
      driver.watch = null; driver.realGps = false;
      if (driver.pingTimer) { clearInterval(driver.pingTimer); driver.pingTimer = null; }
      if (LIVE) post("/shifts/end?vehicleId=" + encodeURIComponent(v.id));
      toast("Shift ended");
    }
    render(true);
  }

  function startGps() {
    const v = driver.v;
    const fallback = (why) => { driver.realGps = false; v.isMine = false; setGps(`Simulated GPS (${why}). On a real shift your phone's GPS is used.`, true); };
    if (!navigator.geolocation) return fallback("no GPS on this device");
    setGps("Finding your location…", false);
    driver.watch = navigator.geolocation.watchPosition((p) => {
      const pos = [p.coords.latitude, p.coords.longitude];
      if (!nearLagos(pos)) return fallback("you're outside the Lagos demo area");
      driver.realGps = true; v.isMine = true; v.pos = pos; v.lastSeen = Date.now();
      driver.accuracy = p.coords.accuracy || 0;
      setGps(`Sharing live GPS · accurate to ${Math.round(p.coords.accuracy)} m`, true);
      if (Date.now() - driver.lastPing >= (CFG.pingIntervalMs || 20000)) sendPing();
    }, () => fallback("location permission off"), { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }

  function startPingTimer() {
    if (!LIVE || driver.pingTimer) return;
    driver.pingTimer = setInterval(sendPing, CFG.pingIntervalMs || 20000);
  }
  function sendPing() {
    if (!driver.onShift || !LIVE) return;
    const v = driver.v;
    driver.lastPing = Date.now();
    post("/locations", { vehicleId: v.id, lat: v.pos[0], lng: v.pos[1],
                         accuracy: driver.accuracy || 0, ts: Date.now() });
  }
  function setGps(text, live) {
    driver.gpsText = text;
    driver.gpsLive = live;
    renderGps();
  }
  function renderGps() {
    const g = $("#gpsStatus");
    const queued = LIVE && driver.queued ? ` · ${driver.queued} queued` : "";
    g.textContent = (driver.gpsText || "") + queued;
    g.classList.toggle("live", !!driver.gpsLive);
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
  }

  /* =====================================================================
   * OWNER
   * ===================================================================== */
  const owner = { map: null, markers: new Map(), fitted: false };

  function initOwner() {
    owner.map = makeMap("ownerMap", { attributionControl: true });
    for (const r of ROUTES) L.polyline(r.points, { color: r.color, weight: 3, opacity: 0.4 }).addTo(owner.map);
    owner.fit = () => {
      if (owner.fitted) return;
      owner.fitted = true;
      owner.map.fitBounds(L.latLngBounds(ROUTES.flatMap((r) => r.points)), { padding: [16, 16] });
    };
    if (LIVE) {
      $("#ownerConnect").hidden = false;
      $("#ownerConnect").addEventListener("click", openSignIn);
      updateConnectLabels();
      owner.pollTimer = setInterval(refreshOwnerLive, CFG.latestIntervalMs || 15000);
      owner.earningsTimer = setInterval(refreshEarnings, CFG.earningsIntervalMs || 60000);
    }
  }

  function refreshOwnerLive() {
    if (!LIVE || !token()) return;
    API.latest().then((data) => {
      if (!data) return;
      mergeRemoteVehicles(data);
      window.TRANS_API.applyLatest(vehicles, data, { now: Date.now(), staleAfterMs: CFG.staleAfterMs });
      renderOwner();
    }, () => {});
  }

  function mergeRemoteVehicles(data) {
    const rows = data && Array.isArray(data.vehicles) ? data.vehicles : [];
    for (const row of rows) {
      if (!row || !row.vehicleId || vehicles.some((v) => v.id === row.vehicleId)) continue;
      const route = ROUTES.find((r) => r.id === row.routeId) || ROUTES[0];
      vehicles.push({
        id: row.vehicleId, plate: row.plate || row.vehicleId, driver: row.plate || row.vehicleId,
        route, d: 0, dir: 1, speed: 0, seats: 14, onboard: 0, status: "active",
        today: { trips: 0, pax: 0, cash: 0, digital: 0, hours: 1 },
        pos: [Number(row.lat) || CFG.city.center[0], Number(row.lng) || CFG.city.center[1]],
        lastSeen: window.TRANS_API.parseTs(row.ts), remote: true
      });
    }
  }

  function refreshEarnings() {
    if (!LIVE || !token()) return;
    Promise.all(vehicles.map((v) => API.earnings(v.id, CFG.earningsDays).then((e) => [v.id, e], () => null)))
      .then((pairs) => {
        const map = {};
        for (const pair of pairs) if (pair) map[pair[0]] = pair[1];
        window.TRANS_API.applyEarnings(vehicles, map);
        renderOwner();
      });
  }

  function ago(ts, status) {
    if (status === "offline") return "offline";
    const s = Math.round((Date.now() - ts) / 1000);
    return s < 30 ? "live" : s < 3600 ? `${Math.round(s / 60)} min ago` : "over an hour ago";
  }

  function renderOwner() {
    const total = vehicles.reduce((a, v) => a + v.today.cash + v.today.digital, 0);
    const digital = vehicles.reduce((a, v) => a + v.today.digital, 0);
    const active = vehicles.filter((v) => v.status === "active").length;
    $("#oTakings").textContent = money(total);
    $("#oActive").textContent = `${active}/${vehicles.length}`;
    $("#oPax").textContent = vehicles.reduce((a, v) => a + v.today.pax, 0).toLocaleString(CFG.locale);
    $("#oDigital").textContent = total ? Math.round((digital / total) * 100) + "%" : "0%";

    for (const v of vehicles) {
      let m = owner.markers.get(v.id);
      if (v.status === "offline" && !v.remote) { if (m) { m.remove(); owner.markers.delete(v.id); } continue; }
      if (!m) { m = L.marker(v.pos, { icon: busIcon(v, false) }).addTo(owner.map); owner.markers.set(v.id, m); }
      m.setLatLng(v.pos);
      if (v.remote) m.setIcon(busIcon(v, false));
    }

    const order = { active: 0, idle: 1, offline: 2 };
    $("#fleetList").innerHTML = [...vehicles].sort((a, b) => order[a.status] - order[b.status]).map((v) => `
      <button class="row" data-id="${v.id}" style="--c:${v.route.color}">
        <span class="badge">${v.route.id}</span>
        <span class="main"><b>${esc(v.plate)}${v === driver.v ? " · you" : ""}</b>
          <span><i class="status-dot s-${v.status}"></i>${esc(v.driver)} · ${ago(v.lastSeen, v.status)}</span></span>
        <span class="end"><b>${money(v.today.cash + v.today.digital)}</b><span>${v.today.trips} trips</span></span>
      </button>`).join("");
    $("#fleetList").querySelectorAll(".row").forEach((b) => b.addEventListener("click", () => {
      const v = vehicles.find((x) => x.id === b.dataset.id);
      if (v.status === "offline") return toast(`${v.plate} is offline`);
      owner.map.setView(v.pos, 14);
      $("#ownerMap").scrollIntoView({ behavior: "smooth", block: "center" });
    }));

    const rows = vehicles.map((v) => {
      const takings = v.today.cash + v.today.digital;
      return { v, takings, perHour: takings / Math.max(0.5, v.today.hours) };
    });
    const avg = rows.reduce((a, r) => a + r.perHour, 0) / rows.length;
    const best = Math.max(...rows.map((r) => r.perHour));
    $("#driverTable").innerHTML = rows.sort((a, b) => b.takings - a.takings).map((r) => `
      <tr>
        <td>${esc(r.v.driver)}</td>
        <td class="num">${r.v.today.trips}</td>
        <td class="num">${money(r.takings)}</td>
        <td class="num">${money(r.perHour)}</td>
        <td>${r.perHour === best ? '<span class="flag top">Top</span>' : r.perHour < avg * 0.6 ? '<span class="flag low">Check</span>' : ""}</td>
      </tr>`).join("");
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

  // Deep link from a shared trip: #bus=v3
  const m = location.hash.match(/bus=(v\d+)/);
  if (m) { const v = vehicles.find((x) => x.id === m[1]); if (v && v.status === "active") selectBus(v); }
})();
