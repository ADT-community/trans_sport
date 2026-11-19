import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(".");
const htmlContent = fs.readFileSync(path.join(ROOT, "web/index.html"), "utf-8");
const cssContent = fs.readFileSync(path.join(ROOT, "web/styles.css"), "utf-8");
const simCode = fs.readFileSync(path.join(ROOT, "web/sim.js"), "utf-8");
const configCode = fs.readFileSync(path.join(ROOT, "web/config.js"), "utf-8");
const appCode = fs.readFileSync(path.join(ROOT, "web/app.js"), "utf-8");

test("sim.js initializes 8 vehicles with realistic demo data and history", () => {
  const sandbox = {
    window: {},
    performance: { now: () => Date.now() },
    setInterval: () => {},
    setTimeout: () => {}
  };
  vm.createContext(sandbox);
  vm.runInContext(simCode, sandbox);

  const { vehicles, ROUTES } = sandbox.window.SIM;
  assert.equal(vehicles.length, 8, "Expected 8 simulated vehicles");
  assert.equal(ROUTES.length, 4, "Expected 4 routes");

  // Check statuses
  const offlineV = vehicles.find((v) => v.status === "offline");
  assert.ok(offlineV, "Should have at least one offline vehicle");
  assert.equal(offlineV.id, "v8");
  assert.ok(
    Date.now() - offlineV.lastSeen >= 5 * 60 * 1000,
    "Offline vehicle lastSeen should be at least 5 minutes ago (stale)"
  );

  const idleV = vehicles.find((v) => v.status === "idle");
  assert.ok(idleV, "Should have at least one idle vehicle");

  const activeVs = vehicles.filter((v) => v.status === "active");
  assert.equal(activeVs.length, 6, "Expected 6 active vehicles");

  // Check 7-day and 30-day historical earnings
  vehicles.forEach((v) => {
    assert.ok(Array.isArray(v.historyPast6), `Vehicle ${v.id} should have historyPast6 array`);
    assert.equal(v.historyPast6.length, 6, `Vehicle ${v.id} historyPast6 should have 6 items`);
    assert.ok(v.historyPast29Total > 0, `Vehicle ${v.id} historyPast29Total should be > 0`);
    assert.ok(v.today.cash >= 0, `Vehicle ${v.id} today.cash should be >= 0`);
    assert.ok(v.today.digital >= 0, `Vehicle ${v.id} today.digital should be >= 0`);
    assert.ok(v.today.trips > 0, `Vehicle ${v.id} today.trips should be > 0`);
    assert.ok(v.today.hours > 0, `Vehicle ${v.id} today.hours should be > 0`);
  });

  // Test simulation tick
  const initialD = activeVs[0].d;
  sandbox.window.SIM.tick(1.0);
  assert.notEqual(activeVs[0].d, initialD, "Vehicle position d should update after tick");
});

test("index.html contains all 6 Figma owner screens and navigation", () => {
  // Navigation tabs
  assert.match(htmlContent, /data-owner-tab="overview"/, "Must have overview tab");
  assert.match(htmlContent, /data-owner-tab="map"/, "Must have map tab");
  assert.match(htmlContent, /data-owner-tab="vehicles"/, "Must have vehicles tab");
  assert.match(htmlContent, /data-owner-tab="drivers"/, "Must have drivers tab");
  assert.match(htmlContent, /data-owner-tab="earnings"/, "Must have earnings tab");
  assert.match(htmlContent, /data-owner-tab="billing"/, "Must have billing tab");

  // Screen containers
  assert.match(htmlContent, /id="ownerScreenOverview"/, "Must have Overview screen");
  assert.match(htmlContent, /id="ownerScreenMap"/, "Must have Live Map screen");
  assert.match(htmlContent, /id="ownerScreenVehicles"/, "Must have Vehicles screen");
  assert.match(htmlContent, /id="ownerScreenDrivers"/, "Must have Drivers screen");
  assert.match(htmlContent, /id="ownerScreenEarnings"/, "Must have Earnings screen");
  assert.match(htmlContent, /id="ownerScreenBilling"/, "Must have Billing screen");

  // Overview elements
  assert.match(htmlContent, /id="topVehicleCard"/, "Must have Top Vehicle card");
  assert.match(htmlContent, /id="bottomVehicleCard"/, "Must have Needs Attention (Bottom) Vehicle card");
  assert.match(htmlContent, /id="fleetList"/, "Must have fleetList");
  assert.match(htmlContent, /id="oTakings"/, "Must have oTakings");
  assert.match(htmlContent, /id="oActive"/, "Must have oActive");
  assert.match(htmlContent, /id="oPax"/, "Must have oPax");
  assert.match(htmlContent, /id="oDigital"/, "Must have oDigital");
  assert.match(htmlContent, /id="oTrips"/, "Must have oTrips");

  // Live Map elements
  assert.match(htmlContent, /id="ownerMap"/, "Must have ownerMap");
  assert.match(htmlContent, /data-map-filter="all"/, "Must have map filter all");
  assert.match(htmlContent, /data-map-filter="active"/, "Must have map filter active");
  assert.match(htmlContent, /data-map-filter="idle"/, "Must have map filter idle");
  assert.match(htmlContent, /data-map-filter="stale"/, "Must have map filter stale");
  assert.match(htmlContent, /id="mapVehicleList"/, "Must have map vehicle sidebar");

  // Vehicles screen elements
  assert.match(htmlContent, /id="vehicleSearchInput"/, "Must have vehicle search input");
  assert.match(htmlContent, /id="vehiclesGrid"/, "Must have vehicles grid");
  assert.match(htmlContent, /id="vehicleDetailView"/, "Must have vehicle detail panel");
  assert.match(htmlContent, /id="vdPlate"/, "Must have vehicle detail plate");
  assert.match(htmlContent, /id="vdCashBar"/, "Must have vehicle cash vs momo bar");
  assert.match(htmlContent, /id="vd7dChart"/, "Must have vehicle 7-day mini chart");

  // Drivers screen elements
  assert.match(htmlContent, /id="driverTable"/, "Must have driverTable");
  assert.match(htmlContent, /id="drTotal"/, "Must have drTotal KPI");
  assert.match(htmlContent, /id="drAvgPerHour"/, "Must have drAvgPerHour KPI");

  // Earnings screen elements
  assert.match(htmlContent, /id="btnEarn7d"/, "Must have 7d earnings toggle");
  assert.match(htmlContent, /id="btnEarn30d"/, "Must have 30d earnings toggle");
  assert.match(htmlContent, /id="fleetEarningsChart"/, "Must have fleet earnings trend chart");
  assert.match(htmlContent, /id="earningsVehicleTable"/, "Must have earnings vehicle table");

  // Billing screen elements
  assert.match(htmlContent, /TransSport Fleet Pilot/, "Must have pilot plan title");
  assert.match(htmlContent, /₦10,000/, "Must have ₦10,000 per vehicle price");
  assert.match(htmlContent, /id="billFleetSize"/, "Must have billFleetSize");
  assert.match(htmlContent, /id="billMonthlyTotal"/, "Must have billMonthlyTotal");
});

test("styles.css uses design tokens and includes mobile (360px) and laptop (1280px) styles", () => {
  // Shared design tokens
  assert.match(cssContent, /--bg:/, "CSS must define --bg token");
  assert.match(cssContent, /--text:/, "CSS must define --text token");
  assert.match(cssContent, /--muted:/, "CSS must define --muted token");
  assert.match(cssContent, /--line:/, "CSS must define --line token");
  assert.match(cssContent, /--ok:/, "CSS must define --ok token");
  assert.match(cssContent, /--warn:/, "CSS must define --warn token");
  assert.match(cssContent, /--bad:/, "CSS must define --bad token");

  // Dark mode overrides
  assert.match(cssContent, /@media\s*\(prefers-color-scheme:\s*dark\)/, "CSS must support dark mode");

  // Stale bus marker styling
  assert.match(cssContent, /\.bus\.stale/, "CSS must style stale buses");

  // Ratio bar for cash vs mobile money
  assert.match(cssContent, /\.momo-ratio-bar/, "CSS must include momo-ratio-bar");

  // Laptop media query (at 900px / 1280px)
  assert.match(cssContent, /@media\s*\(min-width:\s*900px\)/, "CSS must have laptop media query");
  assert.match(cssContent, /\.app\.owner-mode/, "CSS must expand .app in owner-mode on desktop");
});

test("app.js and owner view lifecycle runs without console errors", () => {
  // Create simulated DOM
  const listeners = {};
  const elements = new Map();

  function createElementMock(tag, id = "", className = "") {
    const el = {
      tagName: tag.toUpperCase(),
      id,
      className,
      hidden: false,
      style: {
        width: "",
        height: "",
        backgroundColor: "",
        setProperty: (k, v) => { el.style[k] = v; }
      },
      classList: {
        classes: new Set(className ? className.split(/\s+/).filter(Boolean) : []),
        add(c) { this.classes.add(c); el.className = [...this.classes].join(" "); },
        remove(c) { this.classes.delete(c); el.className = [...this.classes].join(" "); },
        toggle(c, force) {
          if (force === true) this.add(c);
          else if (force === false) this.remove(c);
          else if (this.contains(c)) this.remove(c);
          else this.add(c);
          return this.contains(c);
        },
        contains(c) { return this.classes.has(c); }
      },
      dataset: {},
      children: [],
      _textContent: "",
      get textContent() { return this._textContent; },
      set textContent(v) { this._textContent = String(v ?? ""); },
      _innerHTML: "",
      get innerHTML() { return this._innerHTML; },
      set innerHTML(val) {
        this._innerHTML = val;
        // Simple parser to extract buttons and data attributes
        this._parsedButtons = [];
        const btnRegex = /<button[^>]*?(?:data-id="([^"]*)")?[^>]*?(?:data-detail-id="([^"]*)")?[^>]*?(?:data-v-id="([^"]*)")?[^>]*?>([\s\S]*?)<\/button>/g;
        let match;
        while ((match = btnRegex.exec(val)) !== null) {
          const btnEl = createElementMock("button");
          if (match[1]) btnEl.dataset.id = match[1];
          if (match[2]) btnEl.dataset.detailId = match[2];
          if (match[3]) btnEl.dataset.vId = match[3];
          this._parsedButtons.push(btnEl);
        }
      },
      value: "",
      addEventListener(evt, fn) {
        if (!el._listeners) el._listeners = {};
        if (!el._listeners[evt]) el._listeners[evt] = [];
        el._listeners[evt].push(fn);
      },
      dispatchEvent(evt) {
        if (!evt.target) evt.target = el;
        const fns = (el._listeners && el._listeners[evt.type]) || [];
        fns.forEach((f) => f(evt));
      },
      querySelector(sel) {
        if (sel === "button" && this._parsedButtons && this._parsedButtons.length > 0) {
          return this._parsedButtons[0];
        }
        return elements.get(sel.replace("#", "")) || null;
      },
      querySelectorAll(sel) {
        if (this._parsedButtons && (sel.includes(".row") || sel.includes(".map-sidebar-item") || sel.includes("[data-detail-id]"))) {
          return this._parsedButtons;
        }
        return [];
      },
      append: (...children) => { el.children.push(...children); },
      appendChild: (c) => { el.children.push(c); return c; },
      closest: () => null,
      scrollIntoView: () => {},
      focus: () => {}
    };
    if (id) elements.set(id, el);
    return el;
  }

  // Pre-populate IDs from HTML
  const allIds = [
    "view-ride", "view-drive", "view-owner", "ownerMap", "rideMap", "toast", "modal", "modalTitle", "modalBody",
    "routeFilter", "locate", "rideSheet", "rideList", "rideWhere", "busList", "rideDetail",
    "dPlate", "dRoute", "dRouteDot", "fareAmt1", "fareAmt2", "shiftBtn", "gpsStatus", "dTrips", "dPax", "dCash", "dDigital",
    "dOnboard", "cashFare", "momoFare", "paxPlus", "paxMinus", "endTrip",
    "ownerScreenOverview", "ownerScreenMap", "ownerScreenVehicles", "ownerScreenDrivers", "ownerScreenEarnings", "ownerScreenBilling",
    "oTakings", "oActive", "oPax", "oDigital", "oTrips",
    "topVehicleCard", "topVehiclePlate", "topVehicleDriver", "topVehicleTakings", "topVehicleTrips", "topVehicleAction",
    "bottomVehicleCard", "bottomVehiclePlate", "bottomVehicleDriver", "bottomVehicleTakings", "bottomVehicleReason", "bottomVehicleAction",
    "btnGoToMap", "btnGoToVehicles", "overviewMapSnippet", "overviewMapSummary", "overviewRouteChips", "fleetList",
    "countAll", "countActive", "countIdle", "countStale", "mapVehicleList",
    "vehiclesListView", "vehicleSearchInput", "vehiclesGrid", "vehiclesEmptyState", "resetVehiclesFilter",
    "vehicleDetailView", "backToVehiclesBtn", "vdStatusBadge", "vdRouteBadge", "vdPlate", "vdRouteName", "vdLastSeen",
    "vdTakings", "vdTrips", "vdHours", "vdOnboard", "vdCashBar", "vdDigitalBar", "vdCashVal", "vdCashPct", "vdDigitalVal", "vdDigitalPct",
    "vd7dChart", "vdDriverAvatar", "vdDriverName", "vdDriverStats", "vdCenterMapBtn",
    "drTotal", "drActive", "drAvgPerHour", "drTopDriver", "driverTable",
    "btnEarn7d", "btnEarn30d", "earnPeriodLabel", "thPeriodTotal", "earnTotal", "earnDailyAvg", "earnBestDay", "earnDigitalPct",
    "fleetEarningsChart", "earningsVehicleTable",
    "billFleetSize", "billMonthlyTotal", "btnUpdatePayment"
  ];

  allIds.forEach((id) => createElementMock("div", id));
  const appEl = createElementMock("div", "app", "app");
  elements.set(".app", appEl);

  const navButtons = [
    { tab: "overview" }, { tab: "map" }, { tab: "vehicles" }, { tab: "drivers" }, { tab: "earnings" }, { tab: "billing" }
  ].map((t) => {
    const btn = createElementMock("button", "", "owner-nav-btn" + (t.tab === "overview" ? " active" : ""));
    btn.dataset.ownerTab = t.tab;
    return btn;
  });

  const mainTabs = [
    { view: "ride" }, { view: "drive" }, { view: "owner" }
  ].map((t) => {
    const btn = createElementMock("button", "", "tab" + (t.view === "ride" ? " active" : ""));
    btn.dataset.view = t.view;
    return btn;
  });

  // Mock document & window
  const consoleErrors = [];
  const sandbox = {
    console: {
      log: () => {},
      error: (...args) => { consoleErrors.push(args.join(" ")); },
      warn: () => {}
    },
    performance: { now: () => Date.now() },
    setInterval: () => {},
    setTimeout: (fn) => { fn(); },
    clearTimeout: () => {},
    location: { href: "http://localhost/", hash: "" },
    navigator: {
      geolocation: null,
      clipboard: { writeText: async () => {} }
    },
    window: {},
    document: {
      createElement: (tag) => createElementMock(tag),
      querySelector: (sel) => {
        if (sel === ".app") return appEl;
        if (sel.startsWith("#")) return elements.get(sel.slice(1)) || null;
        return null;
      },
      querySelectorAll: (sel) => {
        if (sel === ".tab") return mainTabs;
        if (sel === ".owner-nav-btn") return navButtons;
        if (sel.includes("data-owner-tab")) return navButtons;
        return [];
      }
    },
    L: {
      map: () => {
        const m = {
          setView: () => m,
          panTo: () => m,
          fitBounds: () => m,
          invalidateSize: () => m
        };
        return m;
      },
      tileLayer: () => ({ addTo: () => {} }),
      marker: () => ({
        addTo: () => ({ setLatLng: () => {}, setIcon: () => {}, remove: () => {}, on: () => {} }),
        setLatLng: () => {},
        setIcon: () => {},
        remove: () => {},
        on: () => {},
        bindPopup: () => ({ openPopup: () => {} })
      }),
      polyline: () => {
        const p = { addTo: () => p, setStyle: () => p };
        return p;
      },
      divIcon: (opts) => opts,
      latLngBounds: () => ({})
    }
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(configCode, sandbox);
  vm.runInContext(simCode, sandbox);
  vm.runInContext(appCode, sandbox);

  assert.equal(consoleErrors.length, 0, `Expected 0 console errors, got: ${consoleErrors.join(", ")}`);

  // Switch to owner view
  const ownerTab = mainTabs.find((t) => t.dataset.view === "owner");
  elements.get("view-owner").classList.add("active");
  elements.get("view-ride").classList.remove("active");
  ownerTab.dispatchEvent({ type: "click" });

  // Verify KPIs populated
  const oTakings = elements.get("oTakings").textContent;
  assert.ok(oTakings.startsWith("₦"), "oTakings should be formatted with ₦ currency");
  assert.notEqual(oTakings, "₦0", "oTakings should have simulated fleet earnings");

  const oActive = elements.get("oActive").textContent;
  assert.equal(oActive, "5/8", "oActive should show 5/8 active vehicles (v1 and v7 idle, v8 offline)");

  // Verify Top and Bottom vehicle populated
  const topPlate = elements.get("topVehiclePlate").textContent;
  assert.ok(topPlate.length > 5, "topVehiclePlate should be populated");
  const botPlate = elements.get("bottomVehiclePlate").textContent;
  assert.ok(botPlate.length > 5, "bottomVehiclePlate should be populated");

  // Verify Billing populated
  const billSize = elements.get("billFleetSize").textContent;
  assert.equal(billSize, "8 vehicles");
  const billTotal = elements.get("billMonthlyTotal").textContent;
  assert.equal(billTotal, "₦80,000 / month");

  // Verify Earnings KPIs populated
  const earnTotal = elements.get("earnTotal").textContent;
  assert.ok(earnTotal.startsWith("₦"), "earnTotal should have formatted earnings");

  // Verify Chart rendered SVG
  const chartHtml = elements.get("fleetEarningsChart").innerHTML;
  assert.ok(chartHtml.includes("<svg"), "fleetEarningsChart should contain an SVG element");
  assert.ok(chartHtml.includes("<rect"), "fleetEarningsChart SVG should contain rect bar elements");

  // Verify Drivers Table populated
  const driverHtml = elements.get("driverTable").innerHTML;
  assert.ok(driverHtml.includes("Top Earner"), "driverTable should flag the top earner");
  assert.ok(driverHtml.includes("On Track"), "driverTable should have on track status");

  // Test sub-tab navigation
  const tabVehicles = navButtons.find((b) => b.dataset.ownerTab === "vehicles");
  tabVehicles.dispatchEvent({ type: "click" });
  assert.equal(elements.get("ownerScreenVehicles").hidden, false, "Vehicles screen should be visible");
  assert.equal(elements.get("ownerScreenOverview").hidden, true, "Overview screen should be hidden");

  // Test opening vehicle detail
  const v1 = sandbox.window.SIM.vehicles[0];
  sandbox.window._openVD(v1.id);
  assert.equal(elements.get("vehicleDetailView").hidden, false, "Vehicle detail view should be open");
  assert.equal(elements.get("vdPlate").textContent, v1.plate);
  assert.ok(elements.get("vd7dChart").innerHTML.includes("vd-bar-fill"), "Vehicle detail chart should have bar fills");

  // Test closing vehicle detail
  const backBtn = elements.get("backToVehiclesBtn");
  backBtn.dispatchEvent({ type: "click" });
  assert.equal(elements.get("vehicleDetailView").hidden, true, "Vehicle detail view should be closed");
  assert.equal(elements.get("vehiclesListView").hidden, false, "Vehicles list view should be restored");

  // Test switching to Live Map and filtering
  const tabMap = navButtons.find((b) => b.dataset.ownerTab === "map");
  tabMap.dispatchEvent({ type: "click" });
  assert.equal(elements.get("ownerScreenMap").hidden, false, "Map screen should be visible");
  assert.equal(elements.get("countAll").textContent, "8");
  assert.equal(elements.get("countStale").textContent, "1");

  // Test switching to Earnings and 30-day toggle
  const tabEarnings = navButtons.find((b) => b.dataset.ownerTab === "earnings");
  tabEarnings.dispatchEvent({ type: "click" });
  assert.equal(elements.get("ownerScreenEarnings").hidden, false, "Earnings screen should be visible");
  const btn30d = elements.get("btnEarn30d");
  btn30d.dispatchEvent({ type: "click" });
  assert.equal(elements.get("earnPeriodLabel").textContent, "Last 30 days (estimated)");

  // Test switching to Billing
  const tabBilling = navButtons.find((b) => b.dataset.ownerTab === "billing");
  tabBilling.dispatchEvent({ type: "click" });
  assert.equal(elements.get("ownerScreenBilling").hidden, false, "Billing screen should be visible");
  assert.equal(elements.get("billFleetSize").textContent, "8 vehicles");

  // Test Vehicle search & empty state
  tabVehicles.dispatchEvent({ type: "click" });
  const searchInput = elements.get("vehicleSearchInput");
  searchInput.value = "nonexistent_query_xyz";
  searchInput.dispatchEvent({ type: "input" });
  assert.equal(elements.get("vehiclesEmptyState").hidden, false, "Empty state should show when search has no match");

  const resetBtn = elements.get("resetVehiclesFilter");
  resetBtn.dispatchEvent({ type: "click" });
  assert.equal(elements.get("vehiclesEmptyState").hidden, true, "Empty state should hide after reset");
  assert.equal(searchInput.value, "", "Search input should be cleared");

  // Test map filter stale
  tabMap.dispatchEvent({ type: "click" });
  const staleFilterBtn = createElementMock("button");
  staleFilterBtn.dataset.mapFilter = "stale";
  staleFilterBtn.dispatchEvent({ type: "click" });
  assert.equal(sandbox.window.SIM.vehicles.filter(v => v.status === "offline" || Date.now() - v.lastSeen > 300000).length, 1);
});
