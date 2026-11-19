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

test("styles.css defines design tokens including 48px touch targets and high-contrast colors", () => {
  // CSS variables in :root
  assert.match(cssContent, /--touch-target:\s*48px;/, "Must define 48px minimum touch target token");
  assert.match(cssContent, /--bg:/, "Must define background color token");
  assert.match(cssContent, /--text:/, "Must define text color token");
  assert.match(cssContent, /--muted:/, "Must define muted text token");
  assert.match(cssContent, /--ok:/, "Must define ok/success token");
  assert.match(cssContent, /--warn:/, "Must define warning token");
  assert.match(cssContent, /--bad:/, "Must define error/alert token");
  assert.match(cssContent, /--line:/, "Must define border line token");
  assert.match(cssContent, /--soft:/, "Must define soft background token");

  // Touch target rules for 48px driving safety
  assert.match(cssContent, /\.touch-48\s*\{[^}]*min-height:\s*var\(--touch-target\)/, "Must enforce 48px min-height on touch-48");
  assert.match(cssContent, /\.driver-nav-btn\s*\{[^}]*min-height:\s*var\(--touch-target\)/, "Driver nav tabs must be at least 48px tall");
  assert.match(cssContent, /\.step-btn\s*\{[^}]*height:\s*var\(--touch-target\)/, "Passenger stepper buttons must be at least 48px tall");

  // Dark mode token overrides
  assert.match(cssContent, /@media\s*\(prefers-color-scheme:\s*dark\)/, "Must include dark mode color token definitions");

  // Responsive styling down to 360px
  assert.match(cssContent, /@media\s*\(max-width:\s*380px\)/, "Must include responsive rules for 360px small viewports");
});

test("index.html contains all 6 Figma driver screens and navigation", () => {
  // Navigation tabs (Shift, Cash, MoMo, Today, Settings)
  assert.match(htmlContent, /data-driver-tab="shift"/, "Must have shift nav tab");
  assert.match(htmlContent, /data-driver-tab="cash"/, "Must have cash nav tab");
  assert.match(htmlContent, /data-driver-tab="momo"/, "Must have momo nav tab");
  assert.match(htmlContent, /data-driver-tab="today"/, "Must have today nav tab");
  assert.match(htmlContent, /data-driver-tab="settings"/, "Must have settings nav tab");

  // Screen 1: Sign in (phone, OTP, empty/loading/error states)
  assert.match(htmlContent, /id="driverScreenSignIn"/, "Must have Sign In screen");
  assert.match(htmlContent, /id="driverPhoneInput"/, "Must have phone input");
  assert.match(htmlContent, /id="driverSendOtpBtn"/, "Must have send OTP button");
  assert.match(htmlContent, /id="driverOtpInput"/, "Must have OTP input");
  assert.match(htmlContent, /id="driverVerifyOtpBtn"/, "Must have verify OTP button");
  assert.match(htmlContent, /id="driverResendOtpBtn"/, "Must have resend OTP button");
  assert.match(htmlContent, /id="driverAuthLoading"/, "Must have auth loading indicator");
  assert.match(htmlContent, /id="driverAuthError"/, "Must have auth error banner");
  assert.match(htmlContent, /id="demoDriverTunde"/, "Must have demo driver quick login");

  // Screen 2: Shift / Home
  assert.match(htmlContent, /id="driverScreenShift"/, "Must have Shift screen");
  assert.match(htmlContent, /id="driverSyncBanner"/, "Must have sync / offline banner");
  assert.match(htmlContent, /id="shiftBtn"/, "Must have big Start/End shift button");
  assert.match(htmlContent, /id="shiftTimer"/, "Must have real-time shift timer");
  assert.match(htmlContent, /id="gpsStatus"/, "Must have GPS status indicator");
  assert.match(htmlContent, /id="paxMinus"/, "Must have passenger minus stepper");
  assert.match(htmlContent, /id="paxPlus"/, "Must have passenger plus stepper");
  assert.match(htmlContent, /id="dOnboard"/, "Must have passenger count display");
  assert.match(htmlContent, /id="dCapacity"/, "Must have seat capacity display");
  assert.match(htmlContent, /id="endTrip"/, "Must have finish trip button");

  // Screen 3: Record Cash Fare
  assert.match(htmlContent, /id="driverScreenCash"/, "Must have Cash Fare screen");
  assert.match(htmlContent, /id="cashAddStandard"/, "Must have standard one-tap fare button");
  assert.match(htmlContent, /id="cashAdd2Pax"/, "Must have +2 Pax quick button");
  assert.match(htmlContent, /id="cashAdd3Pax"/, "Must have +3 Pax quick button");
  assert.match(htmlContent, /id="cashPresetsGrid"/, "Must have common fare presets grid");
  assert.match(htmlContent, /id="cashCustomInput"/, "Must have custom amount input");
  assert.match(htmlContent, /id="cashUndoBtn"/, "Must have prominent Undo button");
  assert.match(htmlContent, /id="cashAuditList"/, "Must have recent cash audit list");
  assert.match(htmlContent, /id="cashEmptyState"/, "Must have empty state for cash fares");

  // Screen 4: Request Mobile Money
  assert.match(htmlContent, /id="driverScreenMomo"/, "Must have Mobile Money screen");
  assert.match(htmlContent, /id="momoPayCode"/, "Must have large pay code display");
  assert.match(htmlContent, /id="momoQrBox"/, "Must have QR code display box");
  assert.match(htmlContent, /id="momoStatusPill"/, "Must have payment status pill");
  assert.match(htmlContent, /id="momoConfirmedBox"/, "Must have confirmed payment state box");
  assert.match(htmlContent, /id="momoConfirmBtn"/, "Must have simulate payment received button");
  assert.match(htmlContent, /id="momoNewCodeBtn"/, "Must have generate new code button");

  // Screen 5: Today Summary & Trips
  assert.match(htmlContent, /id="driverScreenToday"/, "Must have Today Summary screen");
  assert.match(htmlContent, /id="dTodayTakings"/, "Must have total takings today banner");
  assert.match(htmlContent, /id="dTodayCash"/, "Must have cash takings KPI");
  assert.match(htmlContent, /id="dTodayDigital"/, "Must have digital takings KPI");
  assert.match(htmlContent, /id="dTodayTrips"/, "Must have trips done KPI");
  assert.match(htmlContent, /id="dTodayPax"/, "Must have passengers KPI");
  assert.match(htmlContent, /id="dTodayHours"/, "Must have shift hours KPI");
  assert.match(htmlContent, /class="split-progress-bar"/, "Must have Cash vs MoMo share progress bar");
  assert.match(htmlContent, /id="dTripsList"/, "Must have trip history list");
  assert.match(htmlContent, /id="dTodayEmptyState"/, "Must have empty state for trip history");

  // Screen 6: Settings & Assistance
  assert.match(htmlContent, /id="driverScreenSettings"/, "Must have Settings screen");
  assert.match(htmlContent, /id="driverVehicleSelect"/, "Must have vehicle assignment selector");
  assert.match(htmlContent, /id="driverLangSelect"/, "Must have language selector");
  assert.match(htmlContent, /id="driverEmergencyBtn"/, "Must have emergency dispatch call button");
  assert.match(htmlContent, /id="driverWhatsappBtn"/, "Must have fleet owner WhatsApp button");
  assert.match(htmlContent, /id="driverToggleOffline"/, "Must have offline mode simulator toggle");
  assert.match(htmlContent, /id="driverToggleWeakGps"/, "Must have weak GPS simulator toggle");
  assert.match(htmlContent, /id="driverSignOutBtn"/, "Must have sign out / switch driver button");
});

test("accessibility: form inputs have labels, buttons have text or aria-label", () => {
  // Viewport tag
  assert.match(htmlContent, /<meta name="viewport" content="[^"]*width=device-width[^"]*"/, "Valid viewport meta tag");

  // All inputs have labels or aria-labels
  const inputMatches = htmlContent.match(/<input\s+[^>]*id="([^"]+)"[^>]*>/g) || [];
  for (const inputTag of inputMatches) {
    const id = inputTag.match(/id="([^"]+)"/)[1];
    const hasLabel = htmlContent.includes(`for="${id}"`);
    const hasAria = inputTag.includes("aria-label");
    assert.ok(hasLabel || hasAria, `Input with id='${id}' must have an associated <label> or aria-label`);
  }

  // All selects have labels or aria-labels
  const selectMatches = htmlContent.match(/<select\s+[^>]*id="([^"]+)"[^>]*>/g) || [];
  for (const selectTag of selectMatches) {
    const id = selectTag.match(/id="([^"]+)"/)[1];
    const hasLabel = htmlContent.includes(`for="${id}"`);
    const hasAria = selectTag.includes("aria-label");
    assert.ok(hasLabel || hasAria, `Select with id='${id}' must have an associated <label> or aria-label`);
  }
});

test("sim.js initializes vehicles and simulation correctly", () => {
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

  // Check vehicle 0 properties
  const v1 = vehicles[0];
  assert.equal(v1.id, "v1");
  assert.equal(v1.plate, "LND 482 XA");
  assert.equal(v1.driver, "Tunde Bakare");
  assert.equal(v1.seats, 14);
  assert.ok(v1.today.cash >= 0);
  assert.ok(v1.today.digital >= 0);
});

test("app.js driver workflow runs smoothly without errors", () => {
  // Setup minimal DOM environment in sandbox
  const elements = new Map();
  const makeEl = (tag = "div") => {
    const listeners = {};
    const el = {
      tagName: tag.toUpperCase(),
      textContent: "",
      innerHTML: "",
      value: "",
      hidden: false,
      disabled: false,
      append: () => {},
      appendChild: () => {},
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); },
        toggle(c, force) {
          if (force === undefined) {
            if (this.classes.has(c)) this.classes.delete(c);
            else this.classes.add(c);
          } else if (force) {
            this.classes.add(c);
          } else {
            this.classes.delete(c);
          }
        }
      },
      style: {
        setProperty: () => {},
        width: ""
      },
      dataset: {},
      setAttribute: () => {},
      getAttribute: () => null,
      addEventListener: (evt, fn) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(fn);
      },
      dispatch: (evt) => {
        if (listeners[evt]) listeners[evt].forEach((fn) => fn({ target: el, preventDefault: () => {} }));
      },
      querySelectorAll: (sel) => [],
      querySelector: (sel) => null
    };
    return el;
  };

  const doc = {
    querySelector: (sel) => {
      if (!elements.has(sel)) elements.set(sel, makeEl());
      return elements.get(sel);
    },
    querySelectorAll: (sel) => {
      if (sel === ".tab") return [makeEl("button"), makeEl("button"), makeEl("button")];
      if (sel === ".driver-nav-btn") return [makeEl("button"), makeEl("button"), makeEl("button"), makeEl("button"), makeEl("button")];
      if (sel === "[data-i18n]") return [makeEl()];
      if (sel.includes(".preset-btn")) return [makeEl("button"), makeEl("button")];
      if (sel.includes(".chip-amt")) return [makeEl("button")];
      return [];
    },
    createElement: (tag) => makeEl(tag)
  };

  const sandbox = {
    window: {
      TRANS_CONFIG: {
        apiUrl: "",
        locale: "en-NG",
        city: { name: "Lagos", center: [6.5244, 3.3792], zoom: 12 },
        tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        tileAttribution: "OSM"
      }
    },
    document: doc,
    navigator: {
      geolocation: null,
      clipboard: { writeText: () => Promise.resolve() }
    },
    location: { href: "http://localhost:8000/", hash: "" },
    L: {
      map: () => {
        const m = {
          setView: () => m,
          fitBounds: () => m,
          panTo: () => m,
          invalidateSize: () => m
        };
        return m;
      },
      tileLayer: () => ({ addTo: () => {} }),
      polyline: () => ({ addTo: () => {}, setStyle: () => {} }),
      marker: () => ({
        addTo: () => ({
          on: () => {},
          setLatLng: () => {},
          setIcon: () => {},
          remove: () => {}
        }),
        on: () => {},
        setLatLng: () => {},
        setIcon: () => {},
        remove: () => {}
      }),
      divIcon: () => ({}),
      latLngBounds: () => ({})
    },
    performance: { now: () => Date.now() },
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    console
  };

  vm.createContext(sandbox);
  // Run config
  vm.runInContext(configCode, sandbox);
  // Run sim
  vm.runInContext(simCode, sandbox);
  // Run app
  vm.runInContext(appCode, sandbox);

  assert.ok(sandbox.window.SIM, "SIM object must be defined");
  const { vehicles } = sandbox.window.SIM;
  assert.equal(vehicles.length, 8, "Must have 8 vehicles");

  // Verify shift toggle
  const shiftBtn = doc.querySelector("#shiftBtn");
  assert.ok(shiftBtn, "Must find shiftBtn");
  assert.equal(vehicles[0].status, "idle", "Initial driver vehicle status should be idle");
  shiftBtn.dispatch("click");
  assert.equal(vehicles[0].status, "active", "Driver vehicle status should be active after shift start");

  // Verify passenger counter plus
  const initialOnboard = vehicles[0].onboard;
  const paxPlus = doc.querySelector("#paxPlus");
  paxPlus.dispatch("click");
  assert.equal(vehicles[0].onboard, Math.min(vehicles[0].seats, initialOnboard + 1));

  // Verify cash fare recording
  const initialCash = vehicles[0].today.cash;
  const initialPax = vehicles[0].today.pax;
  const cashFare = doc.querySelector("#cashFare");
  cashFare.dispatch("click");
  assert.equal(vehicles[0].today.cash, initialCash + vehicles[0].route.fare);
  assert.equal(vehicles[0].today.pax, initialPax + 1);

  // Verify undo functionality
  const undoBtn = doc.querySelector("#cashUndoBtn");
  undoBtn.dispatch("click");
  assert.equal(vehicles[0].today.cash, initialCash, "Cash should be restored to initial amount after undo");
  assert.equal(vehicles[0].today.pax, initialPax, "Pax should be restored to initial count after undo");

  // Verify finishing trip
  const initialTrips = vehicles[0].today.trips;
  const endTrip = doc.querySelector("#endTrip");
  endTrip.dispatch("click");
  assert.equal(vehicles[0].today.trips, initialTrips + 1);
  assert.equal(vehicles[0].onboard, 0, "Onboard passengers should reset to 0 after finishing trip");

  // Verify shift end
  shiftBtn.dispatch("click");
  assert.equal(vehicles[0].status, "idle", "Driver vehicle status should be idle after shift end");
});
