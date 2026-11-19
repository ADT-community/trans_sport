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
  function busIcon(v, selected) {
    const mine = v.isMine || (driver.onShift && v === driver.v);
    return L.divIcon({
      className: "", iconSize: [0, 0],
      html: `<div class="bus${selected ? " sel" : ""}${mine ? " mine" : ""}" style="--c:${v.route.color}"><i>${v.route.id}</i>${esc(v.plate.split(" ")[1])}</div>`
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
   * DRIVER (Figma Implementation with 6 Screens)
   * ===================================================================== */
  const I18N = {
    en: {
      nav_shift: "Shift", nav_cash: "Cash", nav_momo: "MoMo", nav_today: "Today", nav_settings: "Settings",
      auth_title: "Driver Sign In", auth_sub: "Enter your mobile phone number to connect to your assigned vehicle and share live GPS.",
      auth_phone_label: "Mobile Phone Number", auth_send_code: "Send One-Time Code", auth_otp_label: "Enter 4-Digit Code",
      auth_verify_code: "Verify & Sign In", auth_resend: "Resend Code", auth_loading: "Verifying credentials…",
      auth_quick_demo: "Quick test with demo driver:", your_vehicle: "Your vehicle", shift_time: "Shift Timer",
      gps_title: "GPS Status", start_shift: "Start shift", end_shift: "End shift", pax_onboard: "Passengers on board",
      take_a_fare: "Take a fare", quick_cash: "+ Cash fare", quick_momo: "Request mobile money",
      finish_trip: "🏁 Finish trip (reached end of route)", cash_heading: "Record Cash Fare",
      cash_sub: "One tap per passenger. Tap Undo if recorded by mistake.", one_tap_fare: "+1 Cash Fare",
      presets_title: "Common Presets", add_btn: "+ Add", undo_btn: "Undo Last Fare", recent_cash: "Recent Cash Fares",
      cash_empty: "No cash fares collected yet on this shift.", momo_heading: "Request Mobile Money",
      momo_sub: "Show pay code or QR code to passenger to pay digitally.", fare_amount: "Fare Amount:",
      tell_pax: "Tell Passenger to Enter Code:", paycode_hint: "Passenger enters this in OPay, PalmPay, MoMo, or the Ride tab.",
      scan_qr: "Or passenger can scan to pay", waiting_payment: "Waiting for passenger payment…",
      simulate_paid: "Simulate Payment Received", new_code: "Generate New Code", today_heading: "Today's Summary",
      today_sub: "Total shift earnings, trips completed, and fare types.", total_earned: "Total Takings Today",
      cash_fares: "Cash Fares", momo_fares: "Mobile Money", trips_done: "Trips Done", passengers: "Passengers",
      shift_hours: "Shift Hours", digital_pct: "Digital Share", payment_split: "Payment Split",
      trip_history: "Completed Trips Today", trips_empty: "No trips finished today yet. Start driving to log trips.",
      settings_heading: "Settings & Help", settings_sub: "Vehicle assignment, language preferences, and emergency support.",
      vehicle_assigned: "Assigned Minibus", select_minibus: "Select Minibus to Drive:", lang_title: "Language / Èdè / Harshe / Asụsụ",
      app_lang: "App Language:", help_support: "Emergency & Support", call_dispatch: "Call Dispatch / Emergency",
      whatsapp_owner: "WhatsApp Fleet Owner", demo_controls: "Simulation Controls",
      demo_desc: "Test low-connectivity and sensor conditions on low-cost devices:", sim_offline: "Simulate Offline Network",
      sim_weak_gps: "Simulate Weak GPS Signal", sign_out: "🚪 Sign Out / Switch Driver", trips: "Trips", cash: "Cash", digital: "Mobile money"
    },
    yo: {
      nav_shift: "Iṣẹ́", nav_cash: "Owó", nav_momo: "MoMo", nav_today: "Lónìí", nav_settings: "Ètò",
      auth_title: "Wọlé Awakọ̀", auth_sub: "Tẹ nọ́mbà fóònù rẹ láti darapọ̀ mọ́ ọkọ̀ rẹ.",
      auth_phone_label: "Nọ́mbà Fóònù", auth_send_code: "Fi Kóòdù Ránṣẹ́", auth_otp_label: "Tẹ Kóòdù 4",
      auth_verify_code: "Wọlé Sí Ètò", auth_resend: "Tún Kóòdù Ránṣẹ́", auth_loading: "À ń yẹ ẹ́ wò…",
      auth_quick_demo: "Àkọọ́lẹ̀ àdánwò:", your_vehicle: "Ọkọ̀ rẹ", shift_time: "Àkókò Iṣẹ́",
      gps_title: "GPS Ọkọ̀", start_shift: "Bẹ̀rẹ̀ iṣẹ́", end_shift: "Parí iṣẹ́", pax_onboard: "Èrò nínú ọkọ̀",
      take_a_fare: "Gba owó ọkọ̀", quick_cash: "+ Owó lọ́wọ́", quick_momo: "Owó orí fóònù",
      finish_trip: "🏁 Parí ìrìn-àjò", cash_heading: "Gba Owó Lọ́wọ́",
      cash_sub: "Tẹ ẹ̀kọ̀ọ̀kan fún èrò kọ̀ọ̀kan. Tẹ Dá Padà bí o bá ṣì tẹ̀ ẹ́.", one_tap_fare: "+1 Owó Ọkọ̀",
      presets_title: "Iye Owó Wọ́pọ̀", add_btn: "+ Fi Kún Un", undo_btn: "Dá Owó Padà", recent_cash: "Àwọn Owó Àìpẹ́",
      cash_empty: "Kò tíì sí owó tí o gbà lónìí.", momo_heading: "Gba Owó MoMo",
      momo_sub: "Fi kóòdù tàbí QR hàn èrò láti sanwó.", fare_amount: "Iye Owó:",
      tell_pax: "Sọ fún èrò láti tẹ kóòdù yìí:", paycode_hint: "Èrò yóò tẹ èyí sínú OPay, PalmPay tàbí MoMo.",
      scan_qr: "Tàbí kí wọ́n ya àwòrán QR", waiting_payment: "À ń dúró de owó èrò…",
      simulate_paid: "Jẹ́rìí Sí Gbígbà Owó", new_code: "Ṣẹ̀dá Kóòdù Tuntun", today_heading: "Àkótán Òní",
      today_sub: "Gbogbo owó tí o wọlé, ìrìn-àjò àti èrò.", total_earned: "Gbogbo Owó Òní",
      cash_fares: "Owó Lọ́wọ́", momo_fares: "Owó MoMo", trips_done: "Ìrìn-Àjò", passengers: "Èrò",
      shift_hours: "Wákàtí Iṣẹ́", digital_pct: "Ìpín MoMo", payment_split: "Pínpín Owó",
      trip_history: "Àwọn Ìrìn-Àjò Òní", trips_empty: "Kò tíì sí ìrìn-àjò tí o parí lónìí.",
      settings_heading: "Ètò & Ìrànwọ́", settings_sub: "Yíyàn ọkọ̀, èdè àti ìrànwọ́ pàjáwìrì.",
      vehicle_assigned: "Ọkọ̀ Tí A Yàn Fún Ẹ", select_minibus: "Yan Ọkọ̀ Danfo:", lang_title: "Èdè / Language",
      app_lang: "Èdè Ètò:", help_support: "Pàjáwìrì & Ìrànwọ́", call_dispatch: "Pe Ilé Iṣẹ́ Pàjáwìrì",
      whatsapp_owner: "Fi WhatsApp Ránṣẹ́ Sí Olówó Ọkọ̀", demo_controls: "Àwọn Ìṣàkóso Àdánwò",
      demo_desc: "Dán àwọn ipò ayélujára àti GPS wò:", sim_offline: "Dán Àìsí Ayélujára Wò",
      sim_weak_gps: "Dán GPS Tí Kò Lókun Wò", sign_out: "🚪 Jáde / Yí Awakọ̀ Padà", trips: "Ìrìn-àjò", cash: "Owó lọ́wọ́", digital: "MoMo"
    },
    ha: {
      nav_shift: "Aiki", nav_cash: "Kudi", nav_momo: "MoMo", nav_today: "Yau", nav_settings: "Saituna",
      auth_title: "Shigar Direba", auth_sub: "Shigar da lambar wayarku don haɗawa da motarku.",
      auth_phone_label: "Lambar Waya", auth_send_code: "Aika Lambar Sirri", auth_otp_label: "Lambar Lambobi 4",
      auth_verify_code: "Tabbatar & Shiga", auth_resend: "Sake Aika Lamba", auth_loading: "Ana dubawa…",
      auth_quick_demo: "Gwajin gwaji:", your_vehicle: "Motarka", shift_time: "Lokacin Aiki",
      gps_title: "Yanayin GPS", start_shift: "Fara aiki", end_shift: "Kammala aiki", pax_onboard: "Fasinjoji a ciki",
      take_a_fare: "Karɓi kuɗi", quick_cash: "+ Kuɗi a hannu", quick_momo: "Kuɗin waya (MoMo)",
      finish_trip: "🏁 Kammala tafiya", cash_heading: "Rikodin Kuɗin Hannu",
      cash_sub: "Taɓa ɗaya ga kowane fasinja. Danna Sake idan aka yi kuskure.", one_tap_fare: "+1 Kuɗin Mota",
      presets_title: "Kuɗi Na Musamman", add_btn: "+ Ƙara", undo_btn: "Soke Kuɗin Ƙarshe", recent_cash: "Kuɗin Kusa",
      cash_empty: "Ba a karɓi kuɗi ba tukuna a wannan aikin.", momo_heading: "Nemi Kuɗin MoMo",
      momo_sub: "Nuna lambar ko lambar QR ga fasinja.", fare_amount: "Adadin Kuɗi:",
      tell_pax: "Gaya wa fasinja ya saka wannan lambar:", paycode_hint: "Fasinja zai saka wannan a OPay, PalmPay ko MoMo.",
      scan_qr: "Ko fasinja ya duba QR", waiting_payment: "Ana jiran biyan fasinja…",
      simulate_paid: "Tabbatar da Karɓar Kuɗi", new_code: "Ƙirƙiri Sabuwar Lamba", today_heading: "Takaitaccen Yau",
      today_sub: "Jimillar kuɗi, tafiye-tafiye da fasinjoji.", total_earned: "Jimillar Kuɗin Yau",
      cash_fares: "Kuɗin Hannu", momo_fares: "Kuɗin MoMo", trips_done: "Tafiye-tafiye", passengers: "Fasinjoji",
      shift_hours: "Awanni", digital_pct: "Kason MoMo", payment_split: "Rarraba Biyan Kuɗi",
      trip_history: "Tafiye-tafiyen Yau", trips_empty: "Babu tafiyar da aka kammala yau tukuna.",
      settings_heading: "Saituna & Taimako", settings_sub: "Zaɓin mota, harshe da lambobin gaggawa.",
      vehicle_assigned: "Motar Da Aka Ba Ka", select_minibus: "Zaɓi Mota:", lang_title: "Harshe / Language",
      app_lang: "Harshen App:", help_support: "Gaggawa & Taimako", call_dispatch: "Kira Wurin Gaggawa",
      whatsapp_owner: "WhatsApp Mai Mota", demo_controls: "Sarrafa Gwaji",
      demo_desc: "Gwada yanayin hanyar sadarwa da GPS:", sim_offline: "Gwada Yanayin Wajen Layi",
      sim_weak_gps: "Gwada GPS Mai Rauni", sign_out: "🚪 Fita / Sauya Direba", trips: "Tafiye-tafiye", cash: "Kuɗin hannu", digital: "MoMo"
    },
    ig: {
      nav_shift: "Ọrụ", nav_cash: "Ego", nav_momo: "MoMo", nav_today: "Taa", nav_settings: "Nhazi",
      auth_title: "Mbanye Ọkwọ Ụgbọala", auth_sub: "Tinye nọmba ekwentị gị iji jikọọ na ụgbọ ala gị.",
      auth_phone_label: "Nọmba Ekwentị", auth_send_code: "Ziga Koodu", auth_otp_label: "Koodu Nọmba 4",
      auth_verify_code: "Nyochaa & Banye", auth_resend: "Ziga Koodu Ọzọ", auth_loading: "Na-enyocha…",
      auth_quick_demo: "Nnwale ngwa ngwa:", your_vehicle: "Ụgbọ ala gị", shift_time: "Oge Ọrụ",
      gps_title: "Ọnọdụ GPS", start_shift: "Bido ọrụ", end_shift: "Mechie ọrụ", pax_onboard: "Ndị njem n'ụgbọ",
      take_a_fare: "Nata ego", quick_cash: "+ Ego aka", quick_momo: "Ego ekwentị (MoMo)",
      finish_trip: "🏁 Mechaa njem", cash_heading: "Dekọọ Ego Aka",
      cash_sub: "Kpatụ otu ugboro maka onye njem ọ bụla. Kpatụ Kagbuo ma emee ndudue.", one_tap_fare: "+1 Ego Njem",
      presets_title: "Ọnụ Ego A Na-emekarị", add_btn: "+ Tinye", undo_btn: "Kagbuo Ego Ikpeazụ", recent_cash: "Ego Nso Nso A",
      cash_empty: "Enweghị ego aka anabatara n'oge ọrụ a.", momo_heading: "Rịọ Ego MoMo",
      momo_sub: "Gosi onye njem koodu ma ọ bụ QR ka o kwụọ ụgwọ.", fare_amount: "Ọnụ Ego:",
      tell_pax: "Gwa onye njem tinye koodu a:", paycode_hint: "Onye njem ga-etinye nke a na OPay, PalmPay ma ọ bụ MoMo.",
      scan_qr: "Ma ọ bụ nyochaa QR", waiting_payment: "Na-eche ịkwụ ụgwọ onye njem…",
      simulate_paid: "Gosi na Ego Abatala", new_code: "Mepụta Koodu Ọhụrụ", today_heading: "Nchịkọta Taa",
      today_sub: "Ego niile abatara, njem zuru oke na ndị njem.", total_earned: "Ego Niile Taa",
      cash_fares: "Ego Aka", momo_fares: "Ego MoMo", trips_done: "Njem Zuru Ezu", passengers: "Ndị Njem",
      shift_hours: "Oge Ọrụ", digital_pct: "Oke MoMo", payment_split: "Nkewa Ịkwụ Ụgwọ",
      trip_history: "Njem Emechara Taa", trips_empty: "Ọ dịghị njem emechara taa ma.",
      settings_heading: "Nhazi & Enyemaka", settings_sub: "Nhọrọ ụgbọ ala, asụsụ na nọmba mberede.",
      vehicle_assigned: "Ụgbọ Ala Enyere Gị", select_minibus: "Họrọ Ụgbọ Ala:", lang_title: "Asụsụ / Language",
      app_lang: "Asụsụ App:", help_support: "Mberede & Enyemaka", call_dispatch: "Kpọọ Ụlọ Ọrụ Mberede",
      whatsapp_owner: "WhatsApp Onye Nwe Ụgbọ", demo_controls: "Njikwa Nnwale",
      demo_desc: "Nwalee ọnọdụ ịntanetị na GPS:", sim_offline: "Nwalee Enweghị Ịntanetị",
      sim_weak_gps: "Nwalee GPS Na-adịghị Ike", sign_out: "🚪 Pụọ / Gbanwee Ọkwọ Ụgbọ", trips: "Njem", cash: "Ego aka", digital: "MoMo"
    },
    pcm: {
      nav_shift: "Shift", nav_cash: "Cash", nav_momo: "MoMo", nav_today: "Today", nav_settings: "Settings",
      auth_title: "Driver Log In", auth_sub: "Put your phone number make you fit connect your motor.",
      auth_phone_label: "Phone Number", auth_send_code: "Send Code", auth_otp_label: "Put 4-Digit Code",
      auth_verify_code: "Check Code & Log In", auth_resend: "Send Code Again", auth_loading: "De check am…",
      auth_quick_demo: "Quick test with demo driver:", your_vehicle: "Your motor", shift_time: "Shift Time",
      gps_title: "GPS Status", start_shift: "Start shift", end_shift: "Close shift", pax_onboard: "People inside bus",
      take_a_fare: "Collect money", quick_cash: "+ Cash fare", quick_momo: "Request MoMo",
      finish_trip: "🏁 Finish trip", cash_heading: "Record Cash Money",
      cash_sub: "One tap for each passenger. Press Undo if you tap by mistake.", one_tap_fare: "+1 Cash Fare",
      presets_title: "Regular Fares", add_btn: "+ Add", undo_btn: "Undo Last Fare", recent_cash: "Recent Cash",
      cash_empty: "You never collect any cash for this shift.", momo_heading: "Collect MoMo Transfer",
      momo_sub: "Show passenger pay code or QR make dem transfer.", fare_amount: "Fare Amount:",
      tell_pax: "Tell passenger make dem put this code:", paycode_hint: "Passenger go put this code for OPay, PalmPay or MoMo.",
      scan_qr: "Or make dem scan QR", waiting_payment: "De wait for passenger payment…",
      simulate_paid: "Confirm Money Don Enter", new_code: "Bring Another Code", today_heading: "Today Summary",
      today_sub: "All money wey enter, trips and passengers.", total_earned: "Total Money Today",
      cash_fares: "Cash Fares", momo_fares: "MoMo Money", trips_done: "Trips Done", passengers: "Passengers",
      shift_hours: "Shift Hours", digital_pct: "MoMo Share", payment_split: "How Dem Pay",
      trip_history: "Trips Wey You Do Today", trips_empty: "You never finish any trip today.",
      settings_heading: "Settings & Help", settings_sub: "Change motor, language and emergency contacts.",
      vehicle_assigned: "Motor Wey Dem Give You", select_minibus: "Pick Danfo Motor:", lang_title: "Language / Èdè / Asụsụ",
      app_lang: "App Language:", help_support: "Emergency & Help", call_dispatch: "Call Control Room / Emergency",
      whatsapp_owner: "WhatsApp Motor Owner", demo_controls: "Demo Controls",
      demo_desc: "Test network and GPS conditions:", sim_offline: "Simulate No Network (Offline)",
      sim_weak_gps: "Simulate Weak GPS", sign_out: "🚪 Sign Out / Change Driver", trips: "Trips", cash: "Cash", digital: "MoMo"
    }
  };

  function generateSvgQr(text) {
    const size = 21;
    const matrix = Array.from({ length: size }, () => Array(size).fill(false));
    function addFinder(r0, c0) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const edge = (r === 0 || r === 6 || c === 0 || c === 6);
          const center = (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          matrix[r0 + r][c0 + c] = edge || center;
        }
      }
    }
    addFinder(0, 0);
    addFinder(0, size - 7);
    addFinder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) {
      matrix[6][i] = (i % 2 === 0);
      matrix[i][6] = (i % 2 === 0);
    }
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash) + text.charCodeAt(i);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const inFinder = (r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8);
        if (!inFinder && r !== 6 && c !== 6) {
          matrix[r][c] = ((hash ^ (r * 31 + c * 17)) & 1) === 1;
        }
      }
    }
    let rects = "";
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c]) {
          rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="#111111"/>`;
        }
      }
    }
    return `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
  }

  const driver = {
    v: vehicles[0],
    signedIn: true,
    driverName: "Tunde Bakare",
    onShift: false,
    watch: null,
    realGps: false,
    gpsQuality: "off",
    lastPing: 0,
    activeTab: "shift",
    shiftStartTime: null,
    shiftElapsedSeconds: 0,
    shiftTimerInterval: null,
    offlineSim: false,
    weakGpsSim: false,
    queuedPings: [],
    cashHistory: [],
    tripsHistory: [],
    momoPending: { code: "482 109", rawCode: "482109", amount: 500, status: "waiting", ref: "TRN-839201" },
    lang: "en"
  };

  function setLanguage(lang) {
    if (!I18N[lang]) lang = "en";
    driver.lang = lang;
    const dict = I18N[lang];
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (dict[key]) el.textContent = dict[key];
    });
    const langSelect = $("#driverLangSelect");
    if (langSelect && langSelect.value !== lang) langSelect.value = lang;
  }

  function switchDriverTab(tabName) {
    driver.activeTab = tabName;
    document.querySelectorAll(".driver-nav-btn").forEach((b) => {
      const isMatch = (b.dataset.driverTab === tabName);
      b.classList.toggle("active", isMatch);
      b.setAttribute("aria-selected", isMatch ? "true" : "false");
    });
    const screens = {
      shift: $("#driverScreenShift"),
      cash: $("#driverScreenCash"),
      momo: $("#driverScreenMomo"),
      today: $("#driverScreenToday"),
      settings: $("#driverScreenSettings"),
      signin: $("#driverScreenSignIn")
    };
    Object.entries(screens).forEach(([k, el]) => {
      if (el) el.hidden = (k !== tabName);
    });
    renderDriver();
  }

  function queuePing(type, data) {
    driver.queuedPings.push({ type, data, ts: Date.now() });
    updateSyncBanner();
  }

  function flushQueuedPings() {
    const count = driver.queuedPings.length;
    if (count > 0) {
      for (const p of driver.queuedPings) {
        if (p.type === "location") post("/locations", p.data);
        if (p.type === "fare") post("/fares", p.data);
      }
      driver.queuedPings = [];
      toast(`Synced ${count} cached ping${count === 1 ? "" : "s"} with fleet`);
    }
    updateSyncBanner();
  }

  function updateSyncBanner() {
    const dot = $("#syncStatusDot");
    const text = $("#syncStatusText");
    const badge = $("#driverPendingBadge");
    if (!dot || !text || !badge) return;
    if (driver.offlineSim) {
      dot.className = "sync-dot offline";
      text.textContent = "Offline · Cache Mode";
      badge.hidden = false;
      badge.textContent = `${driver.queuedPings.length} queued`;
    } else {
      dot.className = "sync-dot live";
      text.textContent = "Online · Fleet GPS Synced";
      badge.hidden = driver.queuedPings.length === 0;
      badge.textContent = `${driver.queuedPings.length} queued`;
    }
  }

  function updateShiftTimerDisplay() {
    if (!driver.onShift || !driver.shiftStartTime) {
      const el = $("#shiftTimer");
      if (el && !driver.onShift) el.textContent = "00:00:00";
      return;
    }
    const elapsedSec = Math.floor((Date.now() - driver.shiftStartTime) / 1000) + driver.shiftElapsedSeconds;
    const h = String(Math.floor(elapsedSec / 3600)).padStart(2, "0");
    const m = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, "0");
    const s = String(elapsedSec % 60).padStart(2, "0");
    const el = $("#shiftTimer");
    if (el) el.textContent = `${h}:${m}:${s}`;
  }

  function setDriverGps(state, message) {
    driver.gpsQuality = state;
    const g = $("#gpsStatus");
    const text = $("#gpsStatusText");
    if (!g || !text) return;
    g.className = `gps gps-indicator gps-${state}`;
    text.textContent = message || (state === "live" ? "GPS Live · Accurate to 8m" : state === "weak" ? "GPS Weak · Acquiring signal…" : "GPS off. Location shared while on shift.");
  }

  function toggleDriverShift() {
    const v = driver.v;
    driver.onShift = !driver.onShift;
    if (driver.onShift) {
      v.status = "active";
      v.lastSeen = Date.now();
      driver.shiftStartTime = Date.now();
      if (!driver.shiftTimerInterval) {
        driver.shiftTimerInterval = setInterval(updateShiftTimerDisplay, 1000);
      }
      startDriverGps();
      toast("Shift started. Passengers can see your bus now.");
    } else {
      v.status = "idle";
      v.isMine = false;
      if (driver.shiftStartTime) {
        const addedHours = (Date.now() - driver.shiftStartTime) / (1000 * 3600);
        v.today.hours = Math.round((v.today.hours + addedHours) * 10) / 10;
        driver.shiftElapsedSeconds += Math.floor((Date.now() - driver.shiftStartTime) / 1000);
        driver.shiftStartTime = null;
      }
      if (driver.shiftTimerInterval) {
        clearInterval(driver.shiftTimerInterval);
        driver.shiftTimerInterval = null;
      }
      if (driver.watch !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(driver.watch);
      }
      driver.watch = null;
      driver.realGps = false;
      setDriverGps("off");
      toast("Shift ended");
    }
    render(true);
  }

  function startDriverGps() {
    const v = driver.v;
    if (driver.weakGpsSim) {
      setDriverGps("weak", "GPS Weak · Acquiring satellite lock…");
      return;
    }
    const fallback = (why) => {
      driver.realGps = false;
      v.isMine = false;
      setDriverGps("live", `Simulated GPS (${why}). Sharing live location.`);
    };
    if (!navigator.geolocation) return fallback("no hardware GPS");
    setDriverGps("weak", "Acquiring satellite lock…");
    driver.watch = navigator.geolocation.watchPosition((p) => {
      if (driver.weakGpsSim) {
        setDriverGps("weak", "GPS Weak · Acquiring signal…");
        return;
      }
      const pos = [p.coords.latitude, p.coords.longitude];
      if (!nearLagos(pos)) return fallback("outside Lagos area");
      driver.realGps = true;
      v.isMine = true;
      v.pos = pos;
      v.lastSeen = Date.now();
      setDriverGps("live", `GPS Live · accurate to ${Math.round(p.coords.accuracy)} m`);
      if (Date.now() - driver.lastPing > 10000) {
        driver.lastPing = Date.now();
        const payload = { vehicleId: v.id, lat: pos[0], lng: pos[1], accuracy: p.coords.accuracy, ts: Date.now() };
        if (driver.offlineSim) queuePing("location", payload);
        else post("/locations", payload);
      }
    }, () => fallback("location access denied"), { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }

  function addCashFare(amount, paxCount = 1) {
    const v = driver.v;
    if (!driver.onShift) return toast("Start your shift first");
    amount = Number(amount) || v.route.fare;
    v.today.cash += amount;
    v.today.pax += paxCount;
    v.onboard = Math.min(v.seats, v.onboard + paxCount);
    const fareRecord = {
      id: "cash_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      amount,
      paxCount,
      ts: Date.now(),
      timeStr: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    driver.cashHistory.unshift(fareRecord);
    const payload = { vehicleId: v.id, amount, method: "cash", ts: Date.now() };
    if (driver.offlineSim) queuePing("fare", payload);
    else post("/fares", payload);
    render();
    toast(`${money(amount)} cash fare recorded`);
  }

  function undoLastCashFare() {
    if (!driver.cashHistory.length) return toast("No cash fare to undo");
    const last = driver.cashHistory.shift();
    const v = driver.v;
    v.today.cash = Math.max(0, v.today.cash - last.amount);
    v.today.pax = Math.max(0, v.today.pax - last.paxCount);
    v.onboard = Math.max(0, v.onboard - last.paxCount);
    render();
    toast(`Undone: ${money(last.amount)} fare reversed`);
  }

  function generateMomoCode() {
    const code = String(100000 + Math.floor(Math.random() * 900000));
    const formatted = `${code.slice(0, 3)} ${code.slice(3)}`;
    driver.momoPending = {
      code: formatted,
      rawCode: code,
      amount: driver.momoPending?.amount || driver.v.route.fare,
      status: "waiting",
      ref: "TRN-" + (100000 + Math.floor(Math.random() * 900000))
    };
    renderMomoScreen();
  }

  function confirmMomoPayment() {
    const v = driver.v;
    if (!driver.onShift) return toast("Start your shift first");
    if (!driver.momoPending) generateMomoCode();
    const p = driver.momoPending;
    p.status = "confirmed";
    v.today.digital += p.amount;
    v.today.pax += 1;
    v.onboard = Math.min(v.seats, v.onboard + 1);
    const payload = { vehicleId: v.id, amount: p.amount, method: "mobile_money", ts: Date.now() };
    if (driver.offlineSim) queuePing("fare", payload);
    else post("/fares", payload);
    render();
    toast(`${money(p.amount)} MoMo payment confirmed!`);
  }

  function finishDriverTrip() {
    const v = driver.v;
    if (!driver.onShift) return toast("Start your shift first");
    v.today.trips += 1;
    const origin = v.dir > 0 ? v.route.stops[0][0] : v.route.stops[v.route.stops.length - 1][0];
    const destination = v.dir > 0 ? v.route.stops[v.route.stops.length - 1][0] : v.route.stops[0][0];
    const tripRecord = {
      num: v.today.trips,
      route: `${origin} → ${destination}`,
      pax: v.onboard,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      takings: v.onboard * v.route.fare
    };
    driver.tripsHistory.unshift(tripRecord);
    v.onboard = 0;
    v.dir *= -1;
    render();
    toast("Trip finished. Safe driving!");
  }

  function initDriver() {
    const v = driver.v;
    v.status = "idle";
    generateMomoCode();

    // Navigation buttons
    document.querySelectorAll(".driver-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchDriverTab(btn.dataset.driverTab));
    });

    // Profile pill
    $("#driverProfilePill")?.addEventListener("click", () => switchDriverTab("settings"));

    // Shift screen controls
    $("#shiftBtn")?.addEventListener("click", toggleDriverShift);
    $("#cashFare")?.addEventListener("click", () => addCashFare(v.route.fare, 1));
    $("#momoFare")?.addEventListener("click", () => switchDriverTab("momo"));
    $("#paxPlus")?.addEventListener("click", () => { v.onboard = Math.min(v.seats, v.onboard + 1); render(); });
    $("#paxMinus")?.addEventListener("click", () => { v.onboard = Math.max(0, v.onboard - 1); render(); });
    $("#endTrip")?.addEventListener("click", finishDriverTrip);

    // GPS simulator toggle on shift card
    $("#gpsSimToggle")?.addEventListener("click", () => {
      if (!driver.onShift) return toast("Start shift first to test GPS");
      if (driver.gpsQuality === "live") setDriverGps("weak", "GPS Weak · Low signal simulation");
      else if (driver.gpsQuality === "weak") setDriverGps("live", "GPS Live · High accuracy (8m)");
      else setDriverGps("live");
    });

    // Cash screen controls
    $("#cashAddStandard")?.addEventListener("click", () => addCashFare(v.route.fare, 1));
    $("#cashAdd2Pax")?.addEventListener("click", () => addCashFare(v.route.fare * 2, 2));
    $("#cashAdd3Pax")?.addEventListener("click", () => addCashFare(v.route.fare * 3, 3));
    $("#cashPresetsGrid")?.querySelectorAll(".preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => addCashFare(Number(btn.dataset.amt) || v.route.fare, 1));
    });
    $("#cashAddCustomBtn")?.addEventListener("click", () => {
      const input = $("#cashCustomInput");
      const val = Number(input?.value);
      if (val && val > 0) {
        addCashFare(val, 1);
        if (input) input.value = "";
      } else {
        toast("Enter a valid fare amount");
      }
    });
    $("#cashUndoBtn")?.addEventListener("click", undoLastCashFare);

    // MoMo screen controls
    $("#momoPresets")?.querySelectorAll(".chip-amt").forEach((btn) => {
      btn.addEventListener("click", () => {
        $("#momoPresets").querySelectorAll(".chip-amt").forEach((x) => x.classList.remove("active"));
        btn.classList.add("active");
        if (driver.momoPending) {
          driver.momoPending.amount = Number(btn.dataset.momoAmt) || v.route.fare;
          driver.momoPending.status = "waiting";
        }
        renderMomoScreen();
      });
    });
    $("#momoConfirmBtn")?.addEventListener("click", confirmMomoPayment);
    $("#momoNewCodeBtn")?.addEventListener("click", () => {
      generateMomoCode();
      toast("Generated new pay code");
    });

    // Settings screen controls
    const vSelect = $("#driverVehicleSelect");
    if (vSelect) {
      vSelect.innerHTML = vehicles.map((veh) => `<option value="${veh.id}">${veh.plate} (${veh.driver} · Route ${veh.route.id})</option>`).join("");
      vSelect.value = v.id;
      vSelect.addEventListener("change", (e) => {
        const found = vehicles.find((x) => x.id === e.target.value);
        if (found) {
          driver.v = found;
          driver.driverName = found.driver;
          driver.momoPending.amount = found.route.fare;
          toast(`Switched vehicle to ${found.plate}`);
          render();
        }
      });
    }

    $("#driverLangSelect")?.addEventListener("change", (e) => {
      setLanguage(e.target.value);
      toast(`Language switched to ${e.target.options[e.target.selectedIndex].text}`);
    });

    $("#driverEmergencyBtn")?.addEventListener("click", () => {
      toast("Calling Emergency Dispatch (+234 800 999 0000)…");
    });

    $("#driverWhatsappBtn")?.addEventListener("click", () => {
      toast("Opening WhatsApp chat with fleet owner…");
    });

    $("#driverToggleOffline")?.addEventListener("click", () => {
      driver.offlineSim = !driver.offlineSim;
      const btn = $("#driverToggleOffline");
      if (btn) btn.textContent = `Offline: ${driver.offlineSim ? "ON" : "OFF"}`;
      if (!driver.offlineSim) flushQueuedPings();
      else toast("Offline mode enabled: pings and fares will queue");
      updateSyncBanner();
    });

    $("#driverToggleWeakGps")?.addEventListener("click", () => {
      driver.weakGpsSim = !driver.weakGpsSim;
      const btn = $("#driverToggleWeakGps");
      if (btn) btn.textContent = `Weak GPS: ${driver.weakGpsSim ? "ON" : "OFF"}`;
      if (driver.onShift) {
        if (driver.weakGpsSim) setDriverGps("weak", "Simulated Weak GPS Signal");
        else setDriverGps("live");
      }
    });

    // Auth screen controls
    initDriverAuth();

    // Initial render
    setLanguage("en");
    updateSyncBanner();
  }

  function initDriverAuth() {
    $("#driverSendOtpBtn")?.addEventListener("click", () => {
      const input = $("#driverPhoneInput");
      const phone = input ? input.value.replace(/\D/g, "") : "";
      if (phone.length < 10) {
        const err = $("#driverAuthError");
        if (err) { err.hidden = false; $("#driverAuthErrorMsg").textContent = "Please enter a valid 10 or 11 digit phone number."; }
        return;
      }
      $("#driverAuthError").hidden = true;
      $("#authPhoneStep").hidden = true;
      $("#driverAuthLoading").hidden = false;
      setTimeout(() => {
        $("#driverAuthLoading").hidden = true;
        $("#authOtpStep").hidden = false;
      }, 350);
    });

    $("#driverVerifyOtpBtn")?.addEventListener("click", () => {
      const input = $("#driverOtpInput");
      const otp = input ? input.value.trim() : "";
      if (otp.length < 4) {
        const err = $("#driverAuthError");
        if (err) { err.hidden = false; $("#driverAuthErrorMsg").textContent = "Please enter the 4-digit code."; }
        return;
      }
      $("#driverAuthError").hidden = true;
      $("#authOtpStep").hidden = true;
      $("#driverAuthLoading").hidden = false;
      setTimeout(() => {
        $("#driverAuthLoading").hidden = true;
        driver.signedIn = true;
        toast(`Signed in as ${driver.driverName}`);
        switchDriverTab("shift");
      }, 350);
    });

    $("#driverResendOtpBtn")?.addEventListener("click", () => {
      toast("New code sent: 1234");
    });

    $("#demoDriverTunde")?.addEventListener("click", () => {
      driver.v = vehicles[0];
      driver.driverName = "Tunde Bakare";
      driver.signedIn = true;
      toast("Signed in as Tunde Bakare (LND 482 XA)");
      switchDriverTab("shift");
    });

    $("#demoDriverChinedu")?.addEventListener("click", () => {
      driver.v = vehicles[1];
      driver.driverName = "Chinedu Okafor";
      driver.signedIn = true;
      toast("Signed in as Chinedu Okafor (KJA 117 EP)");
      switchDriverTab("shift");
    });

    $("#driverSignOutBtn")?.addEventListener("click", () => {
      if (driver.onShift) toggleDriverShift();
      driver.signedIn = false;
      const phoneStep = $("#authPhoneStep");
      if (phoneStep) phoneStep.hidden = false;
      const otpStep = $("#authOtpStep");
      if (otpStep) otpStep.hidden = true;
      const err = $("#driverAuthError");
      if (err) err.hidden = true;
      const loading = $("#driverAuthLoading");
      if (loading) loading.hidden = true;
      switchDriverTab("signin");
      toast("Signed out");
    });
  }

  function renderMomoScreen() {
    const p = driver.momoPending;
    if (!p) return;
    const codeEl = $("#momoPayCode");
    if (codeEl) codeEl.textContent = p.code;
    const qrBox = $("#momoQrBox");
    if (qrBox) {
      qrBox.innerHTML = generateSvgQr(`trans_sport://pay?code=${p.rawCode}&amt=${p.amount}`);
    }
    const pill = $("#momoStatusPill");
    const text = $("#momoStatusText");
    const confBox = $("#momoConfirmedBox");
    const errBox = $("#momoErrorBox");
    if (pill && text && confBox && errBox) {
      pill.className = `momo-status-pill momo-${p.status}`;
      if (p.status === "waiting") {
        text.textContent = "Waiting for passenger payment…";
        confBox.hidden = true;
        errBox.hidden = true;
      } else if (p.status === "confirmed") {
        text.textContent = "Payment Confirmed";
        confBox.hidden = false;
        errBox.hidden = true;
        const confAmt = $("#momoConfAmt");
        if (confAmt) confAmt.textContent = `${money(p.amount)} Received`;
        const confRef = $("#momoConfRef");
        if (confRef) confRef.textContent = `Ref: ${p.ref} · Verified`;
      } else if (p.status === "error") {
        text.textContent = "Payment Error";
        confBox.hidden = true;
        errBox.hidden = false;
      }
    }
  }

  function renderDriver() {
    const v = driver.v;
    const t = v.today;

    // Header Profile
    const pName = $("#driverProfileName");
    if (pName) pName.textContent = driver.driverName;
    const pPlate = $("#driverProfilePlate");
    if (pPlate) pPlate.textContent = v.plate;

    // Screen 2: Shift / Home
    const plate = $("#dPlate");
    if (plate) plate.textContent = v.plate;
    const route = $("#dRoute");
    if (route) route.textContent = v.route.name;
    const dot = $("#dRouteDot");
    if (dot) {
      dot.textContent = v.route.id;
      dot.style.setProperty("--c", v.route.color);
    }
    const shiftBtn = $("#shiftBtn");
    if (shiftBtn) {
      const dict = I18N[driver.lang] || I18N.en;
      shiftBtn.textContent = driver.onShift ? dict.end_shift : dict.start_shift;
      shiftBtn.classList.toggle("on", driver.onShift);
    }
    if (!driver.onShift && driver.gpsQuality !== "off") {
      setDriverGps("off");
    }

    // Stats
    const tripsEl = $("#dTrips");
    if (tripsEl) tripsEl.textContent = t.trips;
    const paxEl = $("#dPax");
    if (paxEl) paxEl.textContent = t.pax;
    const cashEl = $("#dCash");
    if (cashEl) cashEl.textContent = money(t.cash);
    const digitalEl = $("#dDigital");
    if (digitalEl) digitalEl.textContent = money(t.digital);

    // Stepper & onboard
    const onboardEl = $("#dOnboard");
    if (onboardEl) onboardEl.textContent = v.onboard;
    const capacityEl = $("#dCapacity");
    if (capacityEl) {
      const free = Math.max(0, v.seats - v.onboard);
      capacityEl.textContent = `${v.onboard} / ${v.seats} seats taken (${free} free)`;
    }
    const minusBtn = $("#paxMinus");
    if (minusBtn) minusBtn.disabled = (v.onboard <= 0);
    const plusBtn = $("#paxPlus");
    if (plusBtn) plusBtn.disabled = (v.onboard >= v.seats);

    const fAmt1 = $("#fareAmt1");
    if (fAmt1) fAmt1.textContent = money(v.route.fare);
    const fAmt2 = $("#fareAmt2");
    if (fAmt2) fAmt2.textContent = money(v.route.fare);
    const cashBtn = $("#cashFare");
    if (cashBtn) cashBtn.disabled = !driver.onShift;
    const momoBtn = $("#momoFare");
    if (momoBtn) momoBtn.disabled = !driver.onShift;

    // Screen 3: Cash Fare
    const stdAmt = $("#cashStandardAmt");
    if (stdAmt) stdAmt.textContent = money(v.route.fare);
    const amt2 = $("#cash2PaxAmt");
    if (amt2) amt2.textContent = money(v.route.fare * 2);
    const amt3 = $("#cash3PaxAmt");
    if (amt3) amt3.textContent = money(v.route.fare * 3);

    const undoBtn = $("#cashUndoBtn");
    const undoInfo = $("#cashUndoInfo");
    if (undoBtn && undoInfo) {
      const hasHistory = driver.cashHistory.length > 0;
      undoBtn.disabled = !hasHistory;
      if (hasHistory) {
        const last = driver.cashHistory[0];
        undoInfo.textContent = `Last: ${money(last.amount)} (${last.paxCount} pax) at ${last.timeStr}`;
      } else {
        undoInfo.textContent = "No recent fare to undo";
      }
    }

    const auditList = $("#cashAuditList");
    const emptyState = $("#cashEmptyState");
    if (auditList && emptyState) {
      if (driver.cashHistory.length > 0) {
        emptyState.hidden = true;
        auditList.innerHTML = driver.cashHistory.slice(0, 5).map((item) => `
          <div class="recent-fare-item">
            <div>
              <b>${money(item.amount)} Cash</b>
              <span class="muted small"> · ${item.paxCount} passenger${item.paxCount === 1 ? "" : "s"}</span>
            </div>
            <span class="muted small">${item.timeStr}</span>
          </div>`).join("");
      } else {
        emptyState.hidden = false;
        auditList.innerHTML = "";
      }
    }

    // Screen 4: MoMo
    renderMomoScreen();

    // Screen 5: Today Summary
    const totalTakings = t.cash + t.digital;
    const takingsVal = $("#dTodayTakings");
    if (takingsVal) takingsVal.textContent = money(totalTakings);

    const tCash = $("#dTodayCash");
    if (tCash) tCash.textContent = money(t.cash);
    const tDigital = $("#dTodayDigital");
    if (tDigital) tDigital.textContent = money(t.digital);
    const tTrips = $("#dTodayTrips");
    if (tTrips) tTrips.textContent = t.trips;
    const tPax = $("#dTodayPax");
    if (tPax) tPax.textContent = t.pax;
    const tHours = $("#dTodayHours");
    if (tHours) tHours.textContent = `${t.hours}h`;

    const digitalPct = totalTakings ? Math.round((t.digital / totalTakings) * 100) : 0;
    const tPct = $("#dTodayDigitalPct");
    if (tPct) tPct.textContent = `${digitalPct}%`;

    const legend = $("#dSplitLegend");
    if (legend) legend.textContent = `Cash ${100 - digitalPct}% · MoMo ${digitalPct}%`;
    const cashSeg = $("#dCashSeg");
    if (cashSeg) cashSeg.style.width = `${100 - digitalPct}%`;
    const momoSeg = $("#dMomoSeg");
    if (momoSeg) momoSeg.style.width = `${digitalPct}%`;

    const tripsList = $("#dTripsList");
    const tripsEmpty = $("#dTodayEmptyState");
    if (tripsList && tripsEmpty) {
      if (driver.tripsHistory.length > 0) {
        tripsEmpty.hidden = true;
        tripsList.innerHTML = driver.tripsHistory.map((tr) => `
          <div class="trip-card">
            <div class="trip-card-left">
              <b>Trip #${tr.num}: ${esc(tr.route)}</b>
              <span class="muted small">${tr.pax} passengers onboard</span>
            </div>
            <div class="trip-card-right">
              <b>${money(tr.takings)}</b>
              <span class="muted small">${tr.time}</span>
            </div>
          </div>`).join("");
      } else {
        tripsEmpty.hidden = false;
        tripsList.innerHTML = "";
      }
    }

    // Screen 6: Settings
    const vehSelect = $("#driverVehicleSelect");
    if (vehSelect && vehSelect.value !== v.id) vehSelect.value = v.id;
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
      if (v.status === "offline") { if (m) { m.remove(); owner.markers.delete(v.id); } continue; }
      if (!m) { m = L.marker(v.pos, { icon: busIcon(v, false) }).addTo(owner.map); owner.markers.set(v.id, m); }
      m.setLatLng(v.pos);
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
