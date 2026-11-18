/* trans_sport demo data and simulation.
 * Simulated Lagos minibus (danfo) routes, vehicles and fares, so the app works before a backend exists.
 * Coordinates are approximate and for demo only.
 */
(() => {
  "use strict";

  const ROUTES = [
    { id: "A", name: "Ikeja → Oshodi → Mile 2", color: "#c2410c", fare: 500, stops: [
      ["Ikeja Along", 6.6018, 3.3515], ["Ikeja Bus Stop", 6.5960, 3.3440], ["Oshodi", 6.5550, 3.3430],
      ["Ilasamaja", 6.5338, 3.3401], ["Cele", 6.5136, 3.3375], ["Ijesha", 6.4990, 3.3360], ["Mile 2", 6.4637, 3.3070]] },
    { id: "B", name: "Yaba → Obalende → CMS", color: "#15803d", fare: 400, stops: [
      ["Yaba", 6.5095, 3.3711], ["Ebute Metta", 6.4882, 3.3790], ["Costain", 6.4800, 3.3740],
      ["Obalende", 6.4500, 3.4040], ["CMS", 6.4532, 3.3925]] },
    { id: "C", name: "Ojota → Ketu → Mile 12", color: "#1d4ed8", fare: 300, stops: [
      ["Ojota", 6.5866, 3.3800], ["Ketu", 6.5968, 3.3893], ["Mile 12", 6.6063, 3.3998]] },
    { id: "D", name: "Lekki Phase 1 → Ajah", color: "#7e22ce", fare: 700, stops: [
      ["Lekki Phase 1", 6.4474, 3.4723], ["Chevron", 6.4360, 3.5250], ["Jakande", 6.4460, 3.5420],
      ["Ajah", 6.4672, 3.5714]] }
  ];

  const DRIVERS = ["Tunde Bakare", "Chinedu Okafor", "Musa Ibrahim", "Segun Adeyemi",
                   "Emeka Nwosu", "Yusuf Bello", "Kunle Ajayi", "Ifeanyi Eze"];
  const PLATES = ["LND 482 XA", "KJA 117 EP", "LSR 903 KT", "APP 245 GG",
                  "EKY 660 BD", "AAA 318 JX", "FST 771 KN", "MUS 552 LA"];

  // ---- geometry ----
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  function km(a, b) {
    const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  for (const r of ROUTES) {
    r.points = r.stops.map((s) => [s[1], s[2]]);
    r.cum = [0];
    for (let i = 1; i < r.points.length; i++) r.cum.push(r.cum[i - 1] + km(r.points[i - 1], r.points[i]));
    r.length = r.cum[r.cum.length - 1];
  }
  function pointAt(route, d) {
    d = Math.max(0, Math.min(route.length, d));
    let i = 1;
    while (i < route.cum.length - 1 && route.cum[i] < d) i++;
    const seg = route.cum[i] - route.cum[i - 1] || 1;
    const t = (d - route.cum[i - 1]) / seg;
    const a = route.points[i - 1], b = route.points[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function nextStop(route, d, dir) {
    if (dir > 0) return route.stops[route.cum.findIndex((c) => c > d + 0.05)] || route.stops[route.stops.length - 1];
    for (let i = route.cum.length - 1; i >= 0; i--) if (route.cum[i] < d - 0.05) return route.stops[i];
    return route.stops[0];
  }

  // ---- seeded random so every visit looks the same at start ----
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  const vehicles = PLATES.map((plate, i) => {
    const route = ROUTES[i % ROUTES.length];
    const trips = 3 + Math.floor(rnd() * 6);
    const pax = trips * (10 + Math.floor(rnd() * 5));
    const cashPax = Math.round(pax * (0.55 + rnd() * 0.25));   // most fares are still cash
    const cash = cashPax * route.fare;
    const digital = (pax - cashPax) * route.fare;
    return {
      id: "v" + (i + 1), plate, driver: DRIVERS[i], route,
      d: rnd() * route.length, dir: rnd() > 0.5 ? 1 : -1,
      speed: 14 + rnd() * 12,               // km/h, Lagos traffic
      seats: 14, onboard: Math.floor(rnd() * 14),
      status: i === 6 ? "idle" : i === 7 ? "offline" : "active",
      today: { trips, pax, cash, digital, hours: 3 + Math.round(rnd() * 50) / 10 },
      lastSeen: Date.now()
    };
  });
  vehicles.forEach((v) => (v.pos = pointAt(v.route, v.d)));

  const listeners = new Set();
  let paused = false;

  function tick(dtSec) {
    for (const v of vehicles) {
      if (v.status !== "active" || v.isMine) continue;
      const jam = 0.4 + Math.random() * 0.9;          // stop-and-go traffic
      v.d += v.dir * (v.speed * jam * dtSec) / 3600 * 25; // sped up 25x so movement is visible
      if (v.d >= v.route.length || v.d <= 0) {
        v.dir *= -1;
        v.d = Math.max(0, Math.min(v.route.length, v.d));
        v.today.trips += 1;
      }
      v.pos = pointAt(v.route, v.d);
      v.lastSeen = Date.now();
      if (Math.random() < 0.06 * dtSec) {            // passengers board and pay
        const n = 1 + Math.floor(Math.random() * 3);
        v.onboard = Math.min(v.seats, v.onboard + n);
        v.today.pax += n;
        const fare = n * v.route.fare;
        if (Math.random() < 0.35) v.today.digital += fare; else v.today.cash += fare;
      }
      if (Math.random() < 0.05 * dtSec) v.onboard = Math.max(0, v.onboard - (1 + Math.floor(Math.random() * 3)));
    }
    listeners.forEach((fn) => fn());
  }

  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    if (!paused) tick(Math.min(5, (now - last) / 1000));
    last = now;
  }, 1000);

  /** Minutes until vehicle v reaches point p (rough: distance / speed). */
  function etaMinutes(v, p) {
    const dist = km(v.pos, p) * 1.3;   // roads aren't straight
    return Math.max(1, Math.round((dist / Math.max(8, v.speed * 0.7)) * 60));
  }

  window.SIM = {
    ROUTES, vehicles, km, pointAt, nextStop, etaMinutes,
    onUpdate: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    pause: (p) => { paused = p; },
    tick
  };
})();
