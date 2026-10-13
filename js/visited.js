// Visited page: tabs for Countries (by continent), States (US + India),
// National Parks and Wonders, plus a Passport view of collected stamps
// filed under every year you visited.
// Everything is clickable and shares the same Store as the globe.

(function () {
  const CONTINENT_ORDER = [
    "North America", "South America", "Europe", "Asia", "Africa", "Oceania", "Antarctica",
  ];

  // ---- tabs ----
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("pane-" + btn.dataset.tab).classList.add("active");
    };
  });

  // ---- postage stamps ----
  // Every place is a perforated stamp: faded until marked, then it turns to
  // paper with a postmark. Marked stamps get a small fixed tilt (from the
  // name) so the collection looks hand-placed rather than gridded.
  const POSTMARK = { visited: "Visited", lived: "Lived", want: "Wishlist" };
  const tilt = (name) => {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
    return ((h % 7) - 3) * 0.5 + "deg";
  };
  // Indian states have no flags: their official two-letter code stands in.
  const INDIA_CODES = {
    "Andhra Pradesh": "AP", "Arunachal Pradesh": "AR", "Assam": "AS", "Bihar": "BR",
    "Chhattisgarh": "CG", "Goa": "GA", "Gujarat": "GJ", "Haryana": "HR",
    "Himachal Pradesh": "HP", "Jharkhand": "JH", "Karnataka": "KA", "Kerala": "KL",
    "Madhya Pradesh": "MP", "Maharashtra": "MH", "Manipur": "MN", "Meghalaya": "ML",
    "Mizoram": "MZ", "Nagaland": "NL", "Odisha": "OD", "Punjab": "PB",
    "Rajasthan": "RJ", "Sikkim": "SK", "Tamil Nadu": "TN", "Telangana": "TS",
    "Tripura": "TR", "Uttar Pradesh": "UP", "Uttarakhand": "UK", "West Bengal": "WB",
    "Andaman & Nicobar Islands": "AN", "Chandigarh": "CH",
    "Dadra & Nagar Haveli and Daman & Diu": "DH", "Delhi": "DL",
    "Jammu & Kashmir": "JK", "Ladakh": "LA", "Lakshadweep": "LD", "Puducherry": "PY",
  };
  // Anything else without a flag gets a monogram from its main words.
  const monogram = (name) => {
    if (INDIA_CODES[name]) return INDIA_CODES[name];
    const words = name.replace(/&|\b(and|of|the)\b|\./g, " ").split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  };

  function stamp(type, name, label, art) {
    const el = document.createElement("button");
    el.className = "stamp";
    art = art || flagImg(type, name, "stamp-flag") || `<span class="stamp-mono">${monogram(name)}</span>`;
    el.innerHTML =
      `<span class="stamp-frame"><span class="stamp-art">${art}</span>` +
      `<span class="stamp-name">${label || name}</span></span>` +
      `<span class="postmark"></span>`;
    el.onclick = () => Store.cycle(type, name);
    el.dataset.type = type;
    el.dataset.name = name;
    el.style.setProperty("--tilt", tilt(name));
    return el;
  }

  // Dated visits for a place from its timeline notes, oldest first and
  // de-duplicated. A subdivided country (US, India) also counts the notes
  // on its states, so a Kerala trip dates the India stamp.
  const visitDates = (type, name) => {
    const keys = [`${type}/${name}`];
    if (type === "countries" && window.SUBDIVIDED[name]) {
      for (const sub of window.SUBDIVIDED[name]) keys.push(`states/${sub}`);
    }
    const dates = keys.flatMap((k) => Store.notesFor(k).map(noteFrom)).filter(Boolean);
    return [...new Set(dates)].sort();
  };

  // Postmarks carry a visit's month ("VISITED / MAR 2024"): the first visit
  // unless `date` picks one (passport pages show that year's visit). The
  // hover title lists every dated visit.
  function setStampStatus(el, s, date) {
    el.classList.toggle("visited", s === "visited");
    el.classList.toggle("lived", s === "lived");
    el.classList.toggle("want", s === "want");
    const dates = s && s !== "want" ? visitDates(el.dataset.type, el.dataset.name) : [];
    const shown = date || dates[0];
    el.querySelector(".postmark").innerHTML = s
      ? `<b>${POSTMARK[s]}</b>` + (shown ? `<i>${fmtMonth(shown)}</i>` : "")
      : "";
    el.title = dates.length > 1 ? `${dates.length} visits: ${dates.map(fmtMonth).join(", ")}` : "";
  }

  function refreshStamps() {
    document.querySelectorAll("button.stamp").forEach((el) =>
      setStampStatus(el, Store.get(el.dataset.type, el.dataset.name)));
  }

  // ---- countries tab: sovereign countries first, territories below ----
  const byContinent = {};
  for (const [name, meta] of Object.entries(window.COUNTRY_META)) {
    const bucket = (byContinent[meta[0]] = byContinent[meta[0]] || { sov: [], terr: [] });
    (meta[2] ? bucket.sov : bucket.terr).push(name);
  }
  const alpha = (a, b) => displayName(a).localeCompare(displayName(b));
  const contRoot = document.getElementById("continent-lists");
  for (const cont of CONTINENT_ORDER) {
    const bucket = byContinent[cont];
    if (!bucket) continue;
    const h = document.createElement("h2");
    h.className = "continent";
    h.textContent = cont;
    contRoot.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "stamp-grid";
    bucket.sov.sort(alpha).forEach((n) => grid.appendChild(stamp("countries", n, displayName(n))));
    contRoot.appendChild(grid);
    if (bucket.terr.length) {
      const th = document.createElement("h3");
      th.className = "territories";
      th.textContent = "Territories & dependencies";
      contRoot.appendChild(th);
      const tgrid = document.createElement("div");
      tgrid.className = "stamp-grid terr";
      bucket.terr.sort(alpha).forEach((n) => tgrid.appendChild(stamp("countries", n, displayName(n))));
      contRoot.appendChild(tgrid);
    }
  }

  // ---- states tab ----
  const stateRoot = document.getElementById("state-list");
  window.US_STATES.forEach((n) => stateRoot.appendChild(stamp("states", n)));
  const extrasRoot = document.getElementById("extras-list");
  window.US_EXTRAS.forEach((n) => extrasRoot.appendChild(stamp("states", n)));
  const indiaRoot = document.getElementById("india-state-list");
  window.INDIA_STATES.forEach((n) => indiaRoot.appendChild(stamp("states", n)));
  const utRoot = document.getElementById("india-ut-list");
  window.INDIA_UTS.forEach((n) => utRoot.appendChild(stamp("states", n)));

  // ---- parks tab (cards with lazy-loaded Wikipedia photos) ----
  const parkRoot = document.getElementById("park-list");
  const THUMB_KEY = "travel-tracker-thumbs-v1";
  let thumbs;
  try { thumbs = JSON.parse(localStorage.getItem(THUMB_KEY)) || {}; } catch (e) { thumbs = {}; }

  async function loadThumb(park, photoEl) {
    if (thumbs[park.wiki] === null) return; // known to have no photo
    if (thumbs[park.wiki]) {
      photoEl.style.backgroundImage = `url(${thumbs[park.wiki]})`;
      photoEl.textContent = "";
      return;
    }
    try {
      const res = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(park.wiki));
      const json = await res.json();
      thumbs[park.wiki] = (json.thumbnail && json.thumbnail.source) || null;
      localStorage.setItem(THUMB_KEY, JSON.stringify(thumbs));
      if (thumbs[park.wiki]) {
        photoEl.style.backgroundImage = `url(${thumbs[park.wiki]})`;
        photoEl.textContent = "";
      }
    } catch (e) { /* offline is fine, emoji stays */ }
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      loadThumb(entry.target._park, entry.target.querySelector(".photo"));
    });
  }, { rootMargin: "200px" });

  function buildTile(root, item, type, emoji, sub) {
    const tile = document.createElement("div");
    tile.className = "park-tile stamp";
    tile.dataset.type = type;
    tile.dataset.name = item.name;
    tile.style.setProperty("--tilt", tilt(item.name));
    tile.innerHTML =
      `<div class="stamp-frame"><div class="photo">${emoji}</div>` +
      `<span class="denom">${type === "parks" ? "NP" : "★"}</span>` +
      `<div class="body"><h3>${item.name}</h3><div class="sub">${sub}</div>` +
      `<button class="toggle-visited"></button></div></div>` +
      `<span class="postmark"></span>`;
    tile._park = item; // observer reads .wiki off this for the photo
    tile.querySelector(".toggle-visited").onclick = () => Store.cycle(type, item.name);
    root.appendChild(tile);
    observer.observe(tile);
  }

  [...window.PARKS].sort((a, b) => a.name.localeCompare(b.name))
    .forEach((p) => buildTile(parkRoot, p, "parks", "🏞️", p.state));

  const landmarkRoot = document.getElementById("landmark-list");
  [...window.LANDMARKS].sort((a, b) => a.name.localeCompare(b.name))
    .forEach((l) => buildTile(landmarkRoot, l, "landmarks", "⭐", l.place));

  function refreshParks() {
    document.querySelectorAll(".park-tile").forEach((tile) => {
      const s = Store.get(tile.dataset.type, tile.dataset.name);
      setStampStatus(tile, s);
      const btn = tile.querySelector(".toggle-visited");
      btn.textContent = s === "visited" ? "✓ Visited" : s === "want" ? "✈️ Want to go" : "Mark as visited";
      btn.classList.toggle("is-visited", s === "visited");
      btn.classList.toggle("is-want", s === "want");
    });
  }

  // ---- passport view ----
  // Collected (visited / lived) stamps across every category. Visited
  // places get one page per year, newest first; a place visited in several
  // years gets a stamp on each of those pages but counts once on the cover.
  // Places you've lived sit on one Lived page after the years, then undated
  // stamps, then the wishlist.
  // Indian states stay out of the book; the India stamp stands for them.
  const passportRoot = document.getElementById("passport");
  const indiaSubs = new Set(window.SUBDIVIDED["India"]);
  const PLACES = [].concat(
    Object.keys(window.COUNTRY_META).map((n) => ({ type: "countries", name: n, label: displayName(n) })),
    window.ALL_STATES.filter((n) => !indiaSubs.has(n)).map((n) => ({ type: "states", name: n, label: n })),
    window.PARKS.map((p) => ({ type: "parks", name: p.name, label: p.name, item: p })),
    window.LANDMARKS.map((l) => ({ type: "landmarks", name: l.name, label: l.name, item: l })),
  );
  const TYPE_WORD = {
    countries: ["country", "countries"], states: ["state", "states"],
    parks: ["park", "parks"], landmarks: ["wonder", "wonders"],
  };

  function passportStamp(p) {
    // Parks and wonders use their photo as the stamp art.
    const art = p.item && `<span class="stamp-photo">${p.type === "parks" ? "🏞️" : "⭐"}</span>`;
    const el = stamp(p.type, p.name, p.label, art);
    el.onclick = null;
    el.classList.add("in-passport");
    setStampStatus(el, p.s, p.date);
    if (p.item) loadThumb(p.item, el.querySelector(".stamp-photo"));
    // Year pages badge each stamp: a gold star the first year you went
    // somewhere, then the visit number (②, ③ …) on later years.
    if (p.visitNo) {
      const badge = document.createElement("span");
      badge.className = "visit-badge " + (p.visitNo === 1 ? "first" : "repeat");
      badge.textContent = p.visitNo === 1 ? "★" : p.visitNo;
      badge.title = p.visitNo === 1 ? "First visit" : `Visit #${p.visitNo}`;
      el.appendChild(badge);
    }
    return el;
  }

  // Pages have one row per category, so each kind of stamp gets its own
  // strip; an empty row just stays blank. The Lived page only has
  // countries and states, since you can't live in a park or a wonder.
  const PAGE_ROWS = [
    ["countries", "Countries"], ["states", "States"],
    ["parks", "National Parks"], ["landmarks", "Wonders"],
  ];

  function passportPage(title, sub, places, extraClass, rows = PAGE_ROWS) {
    const page = document.createElement("section");
    page.className = "passport-page" + (extraClass ? " " + extraClass : "");
    page.innerHTML = `<header><h2>${title}</h2><span>${sub}</span></header>`;
    for (const [type, label] of rows) {
      const row = document.createElement("div");
      row.className = "passport-row";
      row.innerHTML = `<div class="passport-row-label">${label}</div>`;
      const grid = document.createElement("div");
      grid.className = "stamp-grid";
      places.filter((p) => p.type === type).forEach((p) => grid.appendChild(passportStamp(p)));
      row.appendChild(grid);
      page.appendChild(row);
    }
    return page;
  }

  function renderPassport() {
    const got = [];
    const wish = [];
    for (const p of PLACES) {
      const s = Store.get(p.type, p.name);
      if (s === "want") wish.push({ ...p, s });
      else if (s) got.push({ ...p, s, dates: visitDates(p.type, p.name) });
    }
    passportRoot.innerHTML = "";

    const byType = {};
    got.forEach((p) => { byType[p.type] = (byType[p.type] || 0) + 1; });
    const years = got.flatMap((p) => p.dates.map((d) => d.slice(0, 4))).sort();
    const cover = document.createElement("div");
    cover.className = "passport-cover";
    cover.innerHTML =
      `<div class="crest">🌍</div><div><div class="cover-title">Passport</div>` +
      `<div class="cover-sub">${got.length} stamp${got.length === 1 ? "" : "s"}` +
      Object.keys(TYPE_WORD).filter((t) => byType[t])
        .map((t) => ` · ${byType[t]} ${TYPE_WORD[t][byType[t] === 1 ? 0 : 1]}`).join("") +
      (years.length ? ` · since ${years[0]}` : "") + `</div></div>`;
    passportRoot.appendChild(cover);

    if (!got.length) {
      const empty = document.createElement("p");
      empty.className = "passport-empty";
      empty.textContent = "No stamps yet. Mark places as visited in All places or on the globe, " +
        "and add dated notes on the Timeline to put a date on each postmark.";
      passportRoot.appendChild(empty);
    }

    const byYear = {};
    const homes = [];
    const undated = [];
    for (const p of got) {
      if (p.s === "lived") { homes.push(p); continue; }
      if (!p.dates.length) { undated.push(p); continue; }
      // One stamp per year, postmarked with that year's first visit and
      // numbered by how many years you've been (1 = somewhere new).
      const firstByYear = {};
      for (const d of p.dates) firstByYear[d.slice(0, 4)] = firstByYear[d.slice(0, 4)] || d;
      Object.keys(firstByYear).sort().forEach((y, i) =>
        (byYear[y] = byYear[y] || []).push({ ...p, date: firstByYear[y], visitNo: i + 1 }));
    }
    const count = (n) => `${n} stamp${n === 1 ? "" : "s"}`;
    for (const y of Object.keys(byYear).sort().reverse()) {
      const places = byYear[y].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
      const fresh = places.filter((p) => p.visitNo === 1).length;
      passportRoot.appendChild(passportPage(y,
        count(places.length) + (fresh ? ` · <b class="new-count">★ ${fresh} new</b>` : ""), places));
    }
    if (homes.length) {
      homes.sort((a, b) => a.label.localeCompare(b.label));
      passportRoot.appendChild(passportPage("Lived", `${count(homes.length)} · places you've called home`, homes,
        "", PAGE_ROWS.slice(0, 2)));
    }
    if (undated.length) {
      undated.sort((a, b) => a.label.localeCompare(b.label));
      passportRoot.appendChild(passportPage("Undated", count(undated.length) +
        " · add a dated note on the Timeline to file these under a year", undated));
    }
    if (wish.length) {
      wish.sort((a, b) => a.label.localeCompare(b.label));
      passportRoot.appendChild(passportPage("Wishlist", `${wish.length} to go`, wish, "wishlist"));
    }
  }

  // All places <-> Passport switch; remembered per browser, and
  // visited.html#passport opens straight into it.
  const VIEW_KEY = "travel-tracker-visited-view";
  const viewButtons = document.querySelectorAll("#view-switch button");
  function setView(view) {
    viewButtons.forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    document.getElementById("places-view").hidden = view !== "places";
    document.getElementById("passport-view").hidden = view !== "passport";
    try { localStorage.setItem(VIEW_KEY, view); } catch (e) { /* private mode */ }
  }
  viewButtons.forEach((b) => { b.onclick = () => setView(b.dataset.view); });
  let savedView = null;
  try { savedView = localStorage.getItem(VIEW_KEY); } catch (e) { /* private mode */ }
  setView(location.hash === "#passport" ? "passport" : savedView === "passport" ? "passport" : "places");

  // ---- stats ----
  function refreshStats() {
    const c = Store.counts();
    document.getElementById("stats").innerHTML =
      `<span>🌍 <b>${c.countries}</b>/${c.countriesTotal} countries` +
      (c.territories ? ` <i>+${c.territories} terr.</i>` : "") + `</span>` +
      `<span>🇺🇸 <b>${c.states}</b>/${c.statesTotal} states</span>` +
      `<span>🇮🇳 <b>${c.indiaStates}</b>/${c.indiaStatesTotal} states</span>` +
      `<span>🏞️ <b>${c.parks}</b>/${c.parksTotal} parks</span>` +
      `<span>⭐ <b>${c.landmarks}</b>/${c.landmarksTotal} wonders</span>`;
    document.getElementById("stats-landmarks").innerHTML =
      `Visited <b>${c.landmarks}</b> of <b>${c.landmarksTotal}</b> wonders & landmarks.`;
    document.getElementById("stats-countries").innerHTML =
      `Visited <b>${c.countries}</b> of <b>${c.countriesTotal}</b> countries` +
      (c.territories ? ` (plus <b>${c.territories}</b> territories)` : "") +
      `. Click to cycle: not yet → visited → lived → want to go.`;
    document.getElementById("stats-states").innerHTML =
      `Visited <b>${c.states}</b> of <b>${c.statesTotal}</b> US states and ` +
      `<b>${c.indiaStates}</b> of <b>${c.indiaStatesTotal}</b> Indian states & union territories. ` +
      `Click to cycle: not yet → visited → lived → want to go.`;
    document.getElementById("stats-parks").innerHTML =
      `Visited <b>${c.parks}</b> of <b>${c.parksTotal}</b> national parks.`;
  }

  document.getElementById("btn-export").onclick = () => Store.exportFile();

  function refreshAll() { refreshStamps(); refreshParks(); refreshStats(); renderPassport(); }
  Store.onChange(refreshAll);
  refreshAll();
})();
