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

  async function post(path, body) {
    if (!CFG.apiUrl) return;
    try {
      await fetch(CFG.apiUrl.replace(/\/$/, "") + path, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
    } catch { /* offline: a real app would queue and retry */ }
  }

  function makeMap(el, opts = {}) {
    const map = L.map(el, { zoomControl: false, attributionControl: true, ...opts })
      .setView(CFG.city.center, CFG.city.zoom);
    L.tileLayer(CFG.tileUrl, { maxZoom: 18, attribution: CFG.tileAttribution }).addTo(map);
    return map;
  }
  function isStale(v) {
    return v.status === "offline" || (Date.now() - v.lastSeen > 5 * 60 * 1000);
  }

  function busIcon(v, selected) {
    const mine = v.isMine || (driver.onShift && v === driver.v);
    const stale = isStale(v);
    const idle = v.status === "idle";
    const statusClass = stale ? " stale" : idle ? " idle" : "";
    return L.divIcon({
      className: "", iconSize: [0, 0],
      html: `<div class="bus${selected ? " sel" : ""}${mine ? " mine" : ""}${statusClass}" style="--c:${stale ? "var(--muted)" : v.route.color}"><i>${v.route.id}</i>${esc(v.plate.split(" ")[1])}</div>`
    });
  }

  /* ---------- tabs ---------- */
  const views = { ride: $("#view-ride"), drive: $("#view-drive"), owner: $("#view-owner") };
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
    Object.entries(views).forEach(([k, el]) => el.classList.toggle("active", k === b.dataset.view));
    const isOwner = b.dataset.view === "owner";
    const appEl = document.querySelector(".app");
    if (appEl) appEl.classList.toggle("owner-mode", isOwner);
    if (b.dataset.view === "ride") setTimeout(() => ride.map && ride.map.invalidateSize(), 0);
    if (isOwner) setTimeout(() => { owner.map && owner.map.invalidateSize(); owner.fit && owner.fit(); }, 0);
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
  const driver = { v: vehicles[0], onShift: false, watch: null, realGps: false, lastPing: 0 };

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
      toast("Shift started. Passengers can see you now.");
    } else {
      v.status = "idle";
      v.isMine = false;
      if (driver.watch !== null) navigator.geolocation.clearWatch(driver.watch);
      driver.watch = null; driver.realGps = false;
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
      setGps(`Sharing live GPS · accurate to ${Math.round(p.coords.accuracy)} m`, true);
      if (Date.now() - driver.lastPing > 10000) {
        driver.lastPing = Date.now();
        post("/locations", { vehicleId: v.id, lat: pos[0], lng: pos[1], accuracy: p.coords.accuracy, ts: Date.now() });
      }
    }, () => fallback("location permission off"), { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }
  function setGps(text, live) {
    const g = $("#gpsStatus");
    g.textContent = text;
    g.classList.toggle("live", live);
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
  const owner = {
    map: null,
    markers: new Map(),
    fitted: false,
    activeTab: "overview",
    mapFilter: "all",
    vFilter: "all",
    search: "",
    selectedVehicleId: null,
    earnPeriod: 7
  };

  function ago(ts, status) {
    if (status === "offline") return "offline (15 min ago)";
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 30) return "live";
    if (s < 300) return `${Math.round(s / 60)} min ago`;
    if (s < 3600) return `${Math.round(s / 60)} min ago (stale)`;
    return "over an hour ago (stale)";
  }

  function getStatusBadge(v) {
    if (v.status === "offline") return '<span class="status-badge offline">Offline</span>';
    if (isStale(v)) return '<span class="status-badge stale">Stale (&gt;5m)</span>';
    if (v.status === "idle") return '<span class="status-badge idle">Idle</span>';
    return '<span class="status-badge active">Active</span>';
  }

  function switchOwnerTab(tabName) {
    owner.activeTab = tabName;
    document.querySelectorAll(".owner-nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.ownerTab === tabName);
    });
    const screens = {
      overview: $("#ownerScreenOverview"),
      map: $("#ownerScreenMap"),
      vehicles: $("#ownerScreenVehicles"),
      drivers: $("#ownerScreenDrivers"),
      earnings: $("#ownerScreenEarnings"),
      billing: $("#ownerScreenBilling")
    };
    Object.entries(screens).forEach(([name, el]) => {
      if (!el) return;
      const isTarget = name === tabName;
      el.hidden = !isTarget;
      el.classList.toggle("active", isTarget);
    });
    if (tabName === "map") {
      setTimeout(() => {
        if (owner.map) {
          owner.map.invalidateSize();
          owner.fit();
        }
      }, 50);
    }
    renderOwner();
  }

  function openVehicleDetail(v) {
    owner.selectedVehicleId = v.id;
    switchOwnerTab("vehicles");
    const listEl = $("#vehiclesListView");
    const detailEl = $("#vehicleDetailView");
    if (listEl) listEl.hidden = true;
    if (detailEl) detailEl.hidden = false;
    renderVehicleDetail(v);
  }

  function closeVehicleDetail() {
    owner.selectedVehicleId = null;
    const listEl = $("#vehiclesListView");
    const detailEl = $("#vehicleDetailView");
    if (listEl) listEl.hidden = false;
    if (detailEl) detailEl.hidden = true;
    renderVehiclesScreen();
  }

  function renderVehicleDetail(v) {
    if (!v) return;
    const takings = v.today.cash + v.today.digital;
    const cashPct = takings ? Math.round((v.today.cash / takings) * 100) : 0;
    const digitalPct = takings ? 100 - cashPct : 0;

    $("#vdRouteBadge").textContent = v.route.id;
    $("#vdRouteBadge").style.backgroundColor = v.route.color;
    $("#vdPlate").textContent = v.plate;
    $("#vdRouteName").textContent = v.route.name;
    $("#vdStatusBadge").innerHTML = getStatusBadge(v);
    $("#vdLastSeen").textContent = ago(v.lastSeen, v.status);

    $("#vdTakings").textContent = money(takings);
    $("#vdTrips").textContent = v.today.trips;
    $("#vdHours").textContent = `${v.today.hours.toFixed(1)}h`;
    $("#vdOnboard").textContent = `${v.onboard} / ${v.seats} seats`;

    $("#vdCashBar").style.width = `${cashPct}%`;
    $("#vdDigitalBar").style.width = `${digitalPct}%`;
    $("#vdCashVal").textContent = money(v.today.cash);
    $("#vdCashPct").textContent = `(${cashPct}%)`;
    $("#vdDigitalVal").textContent = money(v.today.digital);
    $("#vdDigitalPct").textContent = `(${digitalPct}%)`;

    // 7-day mini chart
    const history7 = [...(v.historyPast6 || []), takings];
    const maxVal = Math.max(...history7, 1000);
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();
    const dayLabels = [];
    for (let i = 6; i >= 0; i--) {
      if (i === 0) dayLabels.push("Today");
      else {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        dayLabels.push(dayNames[d.getDay()]);
      }
    }
    const barsHtml = history7.map((val, idx) => {
      const heightPct = Math.round((val / maxVal) * 100);
      const isToday = idx === 6;
      return `<div class="vd-bar-col">
        <div class="vd-bar-fill-wrap">
          <div class="vd-bar-fill${isToday ? " is-today" : ""}" style="height:${heightPct}%" title="${dayLabels[idx]}: ${money(val)}"></div>
        </div>
        <span class="vd-bar-label">${dayLabels[idx]}</span>
        <span class="vd-bar-val">${money(val)}</span>
      </div>`;
    }).join("");
    $("#vd7dChart").innerHTML = `<div class="vd-chart-row">${barsHtml}</div>`;

    // Driver card
    const initials = v.driver.split(" ").map((n) => n[0]).join("");
    $("#vdDriverAvatar").textContent = initials;
    $("#vdDriverName").textContent = v.driver;
    $("#vdDriverStats").textContent = `${money(takings)} takings · ${v.today.trips} trips · ${v.today.hours.toFixed(1)}h on road`;

    $("#vdCenterMapBtn").onclick = () => {
      switchOwnerTab("map");
      setTimeout(() => {
        if (owner.map) {
          owner.map.setView(v.pos, 15);
        }
      }, 100);
      toast(`Centered on ${v.plate}`);
    };
  }

  function initOwner() {
    owner.map = makeMap("ownerMap", { attributionControl: true });
    for (const r of ROUTES) L.polyline(r.points, { color: r.color, weight: 3, opacity: 0.4 }).addTo(owner.map);
    owner.fit = () => {
      if (owner.fitted) return;
      owner.fitted = true;
      owner.map.fitBounds(L.latLngBounds(ROUTES.flatMap((r) => r.points)), { padding: [16, 16] });
    };

    // Sub-tab navigation
    document.querySelectorAll(".owner-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchOwnerTab(btn.dataset.ownerTab));
    });

    // Overview buttons
    $("#btnGoToMap")?.addEventListener("click", () => switchOwnerTab("map"));
    $("#btnGoToVehicles")?.addEventListener("click", () => switchOwnerTab("vehicles"));
    $("#topVehicleAction")?.addEventListener("click", () => {
      const sorted = [...vehicles].sort((a, b) => (b.today.cash + b.today.digital) - (a.today.cash + a.today.digital));
      if (sorted[0]) openVehicleDetail(sorted[0]);
    });
    $("#bottomVehicleAction")?.addEventListener("click", () => {
      const offline = vehicles.find((v) => v.status === "offline") || vehicles.find(isStale);
      const sorted = [...vehicles].sort((a, b) => (a.today.cash + a.today.digital) - (b.today.cash + b.today.digital));
      openVehicleDetail(offline || sorted[0]);
    });

    // Map filters
    document.querySelectorAll("[data-map-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-map-filter]").forEach((b) => b.classList.toggle("active", b === btn));
        owner.mapFilter = btn.dataset.mapFilter;
        renderMapScreen();
      });
    });

    // Vehicle list filters & search
    document.querySelectorAll("[data-v-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-v-filter]").forEach((b) => b.classList.toggle("active", b === btn));
        owner.vFilter = btn.dataset.vFilter;
        renderVehiclesScreen();
      });
    });
    $("#vehicleSearchInput")?.addEventListener("input", (e) => {
      owner.search = e.target.value.toLowerCase().trim();
      renderVehiclesScreen();
    });
    $("#resetVehiclesFilter")?.addEventListener("click", () => {
      owner.search = "";
      owner.vFilter = "all";
      const searchInput = $("#vehicleSearchInput");
      if (searchInput) searchInput.value = "";
      document.querySelectorAll("[data-v-filter]").forEach((b) => b.classList.toggle("active", b.dataset.vFilter === "all"));
      renderVehiclesScreen();
    });

    // Vehicle Detail back button
    $("#backToVehiclesBtn")?.addEventListener("click", closeVehicleDetail);

    // Earnings period buttons
    $("#btnEarn7d")?.addEventListener("click", () => {
      owner.earnPeriod = 7;
      $("#btnEarn7d").classList.add("active");
      $("#btnEarn30d").classList.remove("active");
      $("#earnPeriodLabel").textContent = "Last 7 days (including today)";
      $("#thPeriodTotal").textContent = "7-Day Total";
      renderEarningsScreen();
    });
    $("#btnEarn30d")?.addEventListener("click", () => {
      owner.earnPeriod = 30;
      $("#btnEarn30d").classList.add("active");
      $("#btnEarn7d").classList.remove("active");
      $("#earnPeriodLabel").textContent = "Last 30 days (estimated)";
      $("#thPeriodTotal").textContent = "30-Day Total";
      renderEarningsScreen();
    });

    // Billing modals & actions
    $("#btnUpdatePayment")?.addEventListener("click", () => {
      openModal("Update Payment Method", `
        <p>Update your fleet auto-debit mobile money account.</p>
        <label for="billPhone">Mobile Money Phone Number</label>
        <input id="billPhone" type="tel" value="08038924821" placeholder="080 0000 0000">
        <label for="billProvider">Provider</label>
        <select id="billProvider"><option selected>MTN MoMo</option><option>OPay</option><option>PalmPay</option><option>Moniepoint</option></select>
        <div class="actions">
          <button class="btn" data-close>Cancel</button>
          <button class="btn primary" id="savePaymentBtn">Save Changes</button>
        </div>`, (body) => {
        body.querySelector("#savePaymentBtn")?.addEventListener("click", () => {
          closeModal();
          toast("Payment method updated successfully");
        });
      });
    });

    document.querySelectorAll("[data-download-stmt]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.target.dataset.downloadStmt;
        openModal(`Statement #${id}`, `
          <div class="statement-modal-body">
            <p><strong>Ade Transport Ltd</strong> · Fleet Pilot (8 Vehicles)</p>
            <p class="muted small">Coverage: Lagos Mainland Danfo Routes</p>
            <hr style="margin:12px 0; border:0; border-top:1px solid var(--line);">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;"><span>8x Fleet Platform Access</span><b>₦80,000</b></div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; color:var(--ok);"><span>Pilot Trial Discount (100%)</span><b>-₦80,000</b></div>
            <hr style="margin:12px 0; border:0; border-top:1px solid var(--line);">
            <div style="display:flex; justify-content:space-between; font-weight:700; font-size:16px;"><span>Total Due</span><b>₦0</b></div>
            <p class="muted small" style="margin-top:12px;">Paid via Trial Waiver · Status: Settled</p>
            <div class="actions" style="margin-top:16px;">
              <button class="btn primary" data-close>Close</button>
            </div>
          </div>
        `);
      });
    });
  }

  function renderOverviewScreen(total, active, digital) {
    $("#oTakings").textContent = money(total);
    $("#oActive").textContent = `${active}/${vehicles.length}`;
    $("#oPax").textContent = vehicles.reduce((a, v) => a + v.today.pax, 0).toLocaleString(CFG.locale);
    $("#oDigital").textContent = total ? Math.round((digital / total) * 100) + "%" : "0%";
    const totalTrips = vehicles.reduce((a, v) => a + v.today.trips, 0);
    const tripsEl = $("#oTrips");
    if (tripsEl) tripsEl.textContent = totalTrips;

    // Top Vehicle
    const sorted = [...vehicles].sort((a, b) => (b.today.cash + b.today.digital) - (a.today.cash + a.today.digital));
    const topV = sorted[0];
    if (topV) {
      const topTakings = topV.today.cash + topV.today.digital;
      $("#topVehiclePlate").textContent = topV.plate;
      $("#topVehicleDriver").textContent = `Driver: ${topV.driver} · Route ${topV.route.id}`;
      $("#topVehicleTakings").textContent = money(topTakings);
      $("#topVehicleTrips").textContent = `${topV.today.trips} trips completed`;
    }

    // Bottom / Attention Vehicle
    const offlineV = vehicles.find((v) => v.status === "offline") || vehicles.find(isStale);
    const bottomV = offlineV || sorted[sorted.length - 1];
    if (bottomV) {
      const botTakings = bottomV.today.cash + bottomV.today.digital;
      $("#bottomVehiclePlate").textContent = bottomV.plate;
      $("#bottomVehicleDriver").textContent = `Driver: ${bottomV.driver} · Route ${bottomV.route.id}`;
      $("#bottomVehicleTakings").textContent = money(botTakings);
      $("#bottomVehicleReason").textContent = bottomV.status === "offline" ? "Offline (stale 15m)" : isStale(bottomV) ? "Stale (>5m no ping)" : "Lowest takings today";
    }

    // Overview Map Summary & Route chips
    const mapSummary = $("#overviewMapSummary");
    if (mapSummary) {
      mapSummary.textContent = `${active} active vehicles moving live on Lagos routes`;
    }
    const routeChipsEl = $("#overviewRouteChips");
    if (routeChipsEl && !routeChipsEl.dataset.built) {
      routeChipsEl.dataset.built = "true";
      routeChipsEl.innerHTML = ROUTES.map((r) => {
        const rCount = vehicles.filter((v) => v.route.id === r.id && v.status === "active").length;
        return `<span class="chip" style="display:inline-flex; align-items:center; gap:6px; font-size:12px; margin:2px 4px 2px 0;">
          <b style="color:${r.color}">${r.id}</b> ${esc(r.name.split("→")[0].trim())} (${rCount} active)
        </span>`;
      }).join("");
    }

    // Fleet list
    const order = { active: 0, idle: 1, offline: 2 };
    $("#fleetList").innerHTML = [...vehicles].sort((a, b) => order[a.status] - order[b.status]).map((v) => `
      <button class="row" data-id="${v.id}" style="--c:${v.route.color}">
        <span class="badge">${v.route.id}</span>
        <span class="main"><b>${esc(v.plate)}${v === driver.v ? " · you" : ""}</b>
          <span><i class="status-dot ${isStale(v) ? "s-offline" : v.status === "idle" ? "s-idle" : "s-active"}"></i>${esc(v.driver)} · ${ago(v.lastSeen, v.status)}</span></span>
        <span class="end"><b>${money(v.today.cash + v.today.digital)}</b><span>${v.today.trips} trips</span></span>
      </button>`).join("");
    $("#fleetList").querySelectorAll(".row").forEach((b) => b.addEventListener("click", () => {
      const v = vehicles.find((x) => x.id === b.dataset.id);
      if (v) openVehicleDetail(v);
    }));
  }

  function renderMapScreen() {
    const filter = owner.mapFilter;
    const filterFn = (v) => {
      const stale = isStale(v);
      if (filter === "active") return v.status === "active" && !stale;
      if (filter === "idle") return v.status === "idle" && !stale;
      if (filter === "stale") return stale;
      return true;
    };

    // Update counts
    const countActive = vehicles.filter((v) => v.status === "active" && !isStale(v)).length;
    const countIdle = vehicles.filter((v) => v.status === "idle" && !isStale(v)).length;
    const countStale = vehicles.filter(isStale).length;
    if ($("#countAll")) $("#countAll").textContent = String(vehicles.length);
    if ($("#countActive")) $("#countActive").textContent = String(countActive);
    if ($("#countIdle")) $("#countIdle").textContent = String(countIdle);
    if ($("#countStale")) $("#countStale").textContent = String(countStale);

    // Update markers on owner.map
    if (owner.map) {
      for (const v of vehicles) {
        const visible = filterFn(v);
        let m = owner.markers.get(v.id);
        if (!visible) {
          if (m) { m.remove(); owner.markers.delete(v.id); }
          continue;
        }
        if (!m) {
          m = L.marker(v.pos, { icon: busIcon(v, false) }).addTo(owner.map);
          m.on("click", () => {
            const takings = v.today.cash + v.today.digital;
            const popupHtml = `<div style="min-width:160px; font-family:system-ui,sans-serif;">
              <b>${esc(v.plate)}</b> · <span style="color:${v.route.color};font-weight:700;">${v.route.id}</span>
              <p style="margin:4px 0 2px; font-size:12px; color:var(--muted);">${esc(v.driver)}</p>
              <p style="margin:0 0 6px; font-size:12px;">Takings: <b>${money(takings)}</b></p>
              <p style="margin:0 0 8px; font-size:11px;">Status: ${ago(v.lastSeen, v.status)}</p>
              <button class="btn small primary" style="width:100%; padding:4px 8px; font-size:12px;" onclick="window._openVD('${v.id}')">View Detail</button>
            </div>`;
            m.bindPopup(popupHtml).openPopup();
          });
          owner.markers.set(v.id, m);
        }
        m.setLatLng(v.pos);
        m.setIcon(busIcon(v, false));
      }
    }

    // Sidebar list
    const sidebarEl = $("#mapVehicleList");
    if (sidebarEl) {
      const filtered = vehicles.filter(filterFn);
      if (filtered.length === 0) {
        sidebarEl.innerHTML = `<p class="muted small" style="padding:12px;">No vehicles match this filter.</p>`;
      } else {
        sidebarEl.innerHTML = filtered.map((v) => {
          const takings = v.today.cash + v.today.digital;
          const dotClass = isStale(v) ? "s-offline" : v.status === "idle" ? "s-idle" : "s-active";
          return `<button class="map-sidebar-item" data-id="${v.id}" style="--c:${v.route.color}">
            <span class="badge small">${v.route.id}</span>
            <div class="msi-main">
              <b>${esc(v.plate)}</b>
              <span><i class="status-dot ${dotClass}"></i>${esc(v.driver)} · ${ago(v.lastSeen, v.status)}</span>
            </div>
            <div class="msi-end">
              <b>${money(takings)}</b>
              <span>${v.today.trips} trips</span>
            </div>
          </button>`;
        }).join("");
        sidebarEl.querySelectorAll(".map-sidebar-item").forEach((b) => {
          b.addEventListener("click", () => {
            const v = vehicles.find((x) => x.id === b.dataset.id);
            if (v && owner.map) {
              owner.map.setView(v.pos, 15);
              const m = owner.markers.get(v.id);
              if (m && m.openPopup) m.openPopup();
              toast(`Centered on ${v.plate}`);
            }
          });
        });
      }
    }
  }

  function renderVehiclesScreen() {
    if (owner.selectedVehicleId) {
      const v = vehicles.find((x) => x.id === owner.selectedVehicleId);
      if (v) renderVehicleDetail(v);
      return;
    }
    const filter = owner.vFilter;
    const query = owner.search;
    const filtered = vehicles.filter((v) => {
      const stale = isStale(v);
      if (filter === "active" && (v.status !== "active" || stale)) return false;
      if (filter === "idle" && (v.status !== "idle" || stale)) return false;
      if (filter === "offline" && !stale) return false;
      if (query) {
        const txt = `${v.plate} ${v.driver} ${v.route.name} ${v.route.id}`.toLowerCase();
        if (!txt.includes(query)) return false;
      }
      return true;
    });

    const gridEl = $("#vehiclesGrid");
    const emptyEl = $("#vehiclesEmptyState");
    if (!gridEl) return;

    if (filtered.length === 0) {
      gridEl.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    gridEl.innerHTML = filtered.map((v) => {
      const takings = v.today.cash + v.today.digital;
      const cashPct = takings ? Math.round((v.today.cash / takings) * 100) : 0;
      const digitalPct = takings ? 100 - cashPct : 0;
      return `<div class="card vehicle-overview-card" style="--c:${v.route.color}">
        <div class="voc-head">
          <div class="voc-title">
            <span class="badge">${v.route.id}</span>
            <div>
              <h3>${esc(v.plate)}</h3>
              <p class="muted small">${esc(v.route.name)}</p>
            </div>
          </div>
          ${getStatusBadge(v)}
        </div>
        <div class="voc-driver-row">
          <span class="muted small">Driver: <b>${esc(v.driver)}</b></span>
          <span class="muted small">${ago(v.lastSeen, v.status)}</span>
        </div>
        <div class="voc-stats">
          <div class="voc-stat"><span class="k">Today's Takings</span><span class="v">${money(takings)}</span></div>
          <div class="voc-stat"><span class="k">Trips / Hours</span><span class="v">${v.today.trips} / ${v.today.hours.toFixed(1)}h</span></div>
          <div class="voc-stat"><span class="k">Onboard</span><span class="v">${v.onboard} / ${v.seats}</span></div>
        </div>
        <div class="voc-momo-bar">
          <div class="momo-ratio-bar small">
            <div class="momo-fill-cash" style="width:${cashPct}%" title="Cash: ${money(v.today.cash)} (${cashPct}%)"></div>
            <div class="momo-fill-digital" style="width:${digitalPct}%" title="MoMo: ${money(v.today.digital)} (${digitalPct}%)"></div>
          </div>
          <div class="voc-momo-label">
            <span>Cash: ${money(v.today.cash)} (${cashPct}%)</span>
            <span>MoMo: ${money(v.today.digital)} (${digitalPct}%)</span>
          </div>
        </div>
        <button class="btn small voc-action" data-detail-id="${v.id}">View Details →</button>
      </div>`;
    }).join("");

    gridEl.querySelectorAll("[data-detail-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = vehicles.find((x) => x.id === btn.dataset.detailId);
        if (v) openVehicleDetail(v);
      });
    });
  }

  function renderDriversScreen() {
    const rows = vehicles.map((v) => {
      const takings = v.today.cash + v.today.digital;
      const perHour = takings / Math.max(0.5, v.today.hours);
      return { v, takings, perHour };
    });
    const avg = rows.reduce((a, r) => a + r.perHour, 0) / rows.length;
    const best = Math.max(...rows.map((r) => r.perHour));
    const sorted = [...rows].sort((a, b) => b.takings - a.takings);

    // KPIs
    if ($("#drTotal")) $("#drTotal").textContent = vehicles.length;
    if ($("#drActive")) $("#drActive").textContent = vehicles.filter((v) => v.status === "active").length;
    if ($("#drAvgPerHour")) $("#drAvgPerHour").textContent = money(avg);
    if ($("#drTopDriver") && sorted[0]) $("#drTopDriver").textContent = firstName(sorted[0].v.driver);

    // Table
    const tableEl = $("#driverTable");
    if (tableEl) {
      tableEl.innerHTML = sorted.map((r) => {
        const isTop = r.perHour === best;
        const isLow = r.perHour < avg * 0.6;
        const flagHtml = isTop ? '<span class="flag top">Top Earner</span>' : isLow ? '<span class="flag low">Check</span>' : '<span class="flag ok">On Track</span>';
        return `<tr data-v-id="${r.v.id}" style="cursor:pointer;" title="Click to view vehicle detail">
          <td><b>${esc(r.v.driver)}</b></td>
          <td><span class="badge small" style="background:${r.v.route.color}">${r.v.route.id}</span> ${esc(r.v.plate)}</td>
          <td class="num">${r.v.today.trips}</td>
          <td class="num">${r.v.today.hours.toFixed(1)}h</td>
          <td class="num">${money(r.takings)}</td>
          <td class="num">${money(r.perHour)}</td>
          <td>${flagHtml}</td>
        </tr>`;
      }).join("");

      tableEl.querySelectorAll("tr").forEach((tr) => {
        tr.addEventListener("click", () => {
          const v = vehicles.find((x) => x.id === tr.dataset.vId);
          if (v) openVehicleDetail(v);
        });
      });
    }
  }

  function renderEarningsScreen() {
    const period = owner.earnPeriod || 7;
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();

    // Prepare daily sums across fleet
    const dailyFleetTotals = [];
    const dayLabels = [];

    if (period === 7) {
      for (let i = 6; i >= 0; i--) {
        if (i === 0) dayLabels.push("Today");
        else {
          const d = new Date(now);
          d.setDate(now.getDate() - i);
          dayLabels.push(`${dayNames[d.getDay()]} ${d.getDate()}`);
        }
      }
      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        let daySum = 0;
        for (const v of vehicles) {
          if (dayIdx === 6) {
            daySum += (v.today.cash + v.today.digital);
          } else {
            daySum += (v.historyPast6 ? v.historyPast6[dayIdx] : 35000);
          }
        }
        dailyFleetTotals.push(daySum);
      }
    } else {
      // 30 days
      for (let dayIdx = 0; dayIdx < 30; dayIdx++) {
        const daysAgo = 29 - dayIdx;
        if (daysAgo === 0) dayLabels.push("Today");
        else {
          const d = new Date(now);
          d.setDate(now.getDate() - daysAgo);
          dayLabels.push(`${dayNames[d.getDay()]} ${d.getDate()}`);
        }
        let daySum = 0;
        for (const v of vehicles) {
          if (daysAgo === 0) {
            daySum += (v.today.cash + v.today.digital);
          } else {
            const base = (v.historyPast29Total ? v.historyPast29Total / 29 : 40000);
            const varFactor = 0.85 + (((v.plate.charCodeAt(1) + dayIdx * 7) % 30) / 100);
            daySum += Math.round(base * varFactor);
          }
        }
        dailyFleetTotals.push(daySum);
      }
    }

    const periodTotal = dailyFleetTotals.reduce((a, b) => a + b, 0);
    const dailyAvg = periodTotal / period;
    const maxDayVal = Math.max(...dailyFleetTotals, 1);
    const bestDayIdx = dailyFleetTotals.indexOf(maxDayVal);
    const bestDayLabel = `${dayLabels[bestDayIdx]}: ${money(maxDayVal)}`;

    const totalToday = vehicles.reduce((a, v) => a + v.today.cash + v.today.digital, 0);
    const digitalToday = vehicles.reduce((a, v) => a + v.today.digital, 0);
    const digitalPct = totalToday ? Math.round((digitalToday / totalToday) * 100) : 0;

    if ($("#earnTotal")) $("#earnTotal").textContent = money(periodTotal);
    if ($("#earnDailyAvg")) $("#earnDailyAvg").textContent = money(dailyAvg);
    if ($("#earnBestDay")) $("#earnBestDay").textContent = bestDayLabel;
    if ($("#earnDigitalPct")) $("#earnDigitalPct").textContent = `${digitalPct}%`;

    // Render SVG Trend Chart
    const chartContainer = $("#fleetEarningsChart");
    if (chartContainer) {
      const W = 680, H = 220, padLeft = 45, padRight = 20, padTop = 30, padBottom = 35;
      const chartW = W - padLeft - padRight;
      const chartH = H - padTop - padBottom;
      const step = chartW / dailyFleetTotals.length;
      const barW = Math.max(8, Math.min(42, step * 0.65));

      let gridSvg = "";
      for (let g = 0; g <= 3; g++) {
        const yVal = Math.round(maxDayVal * (g / 3));
        const yPos = padTop + chartH - (g / 3) * chartH;
        gridSvg += `<line x1="${padLeft}" y1="${yPos}" x2="${W - padRight}" y2="${yPos}" stroke="var(--line)" stroke-dasharray="3,3" />
          <text x="${padLeft - 6}" y="${yPos + 4}" fill="var(--muted)" font-size="10" text-anchor="end">${money(yVal).replace("₦", "")}</text>`;
      }

      let barsSvg = "";
      dailyFleetTotals.forEach((val, i) => {
        const bH = (val / maxDayVal) * chartH;
        const x = padLeft + i * step + (step - barW) / 2;
        const y = padTop + chartH - bH;
        const isToday = i === dailyFleetTotals.length - 1;
        const barFill = isToday ? "var(--ok)" : "var(--text)";
        const labelInterval = period === 30 ? (i % 5 === 0 || isToday) : true;
        const lbl = labelInterval ? `<text x="${x + barW / 2}" y="${H - 12}" fill="var(--muted)" font-size="10" text-anchor="middle">${dayLabels[i].split(" ")[0]}</text>` : "";
        barsSvg += `<g class="chart-bar-group" tabindex="0">
          <title>${dayLabels[i]}: ${money(val)}</title>
          <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(2, bH)}" fill="${barFill}" rx="3" />
          ${lbl}
          ${period === 7 ? `<text x="${x + barW / 2}" y="${Math.max(12, y - 6)}" fill="var(--text)" font-size="10" font-weight="600" text-anchor="middle">${money(val).replace("₦", "")}</text>` : ""}
        </g>`;
      });

      chartContainer.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet" style="display:block; overflow:visible;">
        ${gridSvg}
        ${barsSvg}
      </svg>`;
    }

    // Vehicle breakdown table
    const tableEl = $("#earningsVehicleTable");
    if (tableEl) {
      tableEl.innerHTML = vehicles.map((v) => {
        const takingsToday = v.today.cash + v.today.digital;
        const v7 = [...(v.historyPast6 || []), takingsToday];
        const vTotal = period === 7 ? v7.reduce((a, b) => a + b, 0) : ((v.historyPast29Total || 29 * 35000) + takingsToday);
        const vAvg = vTotal / period;
        const maxV = Math.max(...v7, 1);

        // mini sparkline
        const sparklineSvg = `<div style="display:inline-flex; align-items:flex-end; gap:3px; height:20px;">
          ${v7.map((val, idx) => {
            const h = Math.max(3, Math.round((val / maxV) * 20));
            const color = idx === 6 ? "var(--ok)" : "var(--muted)";
            return `<div style="width:5px; height:${h}px; background:${color}; border-radius:1px;" title="${money(val)}"></div>`;
          }).join("")}
        </div>`;

        return `<tr data-v-id="${v.id}" style="cursor:pointer;" title="Click to view vehicle detail">
          <td><span class="badge small" style="background:${v.route.color}">${v.route.id}</span> <b>${esc(v.plate)}</b></td>
          <td>${esc(v.driver)}</td>
          <td class="num">${money(takingsToday)}</td>
          <td class="num"><b>${money(vTotal)}</b></td>
          <td class="num">${money(vAvg)}</td>
          <td>${sparklineSvg}</td>
        </tr>`;
      }).join("");

      tableEl.querySelectorAll("tr").forEach((tr) => {
        tr.addEventListener("click", () => {
          const v = vehicles.find((x) => x.id === tr.dataset.vId);
          if (v) openVehicleDetail(v);
        });
      });
    }
  }

  function renderBillingScreen() {
    const count = vehicles.length;
    const monthlyRate = 10000;
    const monthlyTotal = count * monthlyRate;
    if ($("#billFleetSize")) $("#billFleetSize").textContent = `${count} vehicles`;
    if ($("#billMonthlyTotal")) $("#billMonthlyTotal").textContent = `${money(monthlyTotal)} / month`;
  }

  function renderOwner() {
    const total = vehicles.reduce((a, v) => a + v.today.cash + v.today.digital, 0);
    const digital = vehicles.reduce((a, v) => a + v.today.digital, 0);
    const active = vehicles.filter((v) => v.status === "active" && !isStale(v)).length;

    renderOverviewScreen(total, active, digital);
    renderMapScreen();
    renderVehiclesScreen();
    renderDriversScreen();
    renderEarningsScreen();
    renderBillingScreen();
  }

  // Global helper for Leaflet popups
  window._openVD = (vid) => {
    const v = vehicles.find((x) => x.id === vid);
    if (v) openVehicleDetail(v);
  };

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
