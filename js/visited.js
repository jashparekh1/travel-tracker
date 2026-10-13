// Visited page: tabs for Countries (by continent), States (US + India),
// National Parks and Wonders.
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

  function stamp(type, name, label) {
    const el = document.createElement("button");
    el.className = "stamp";
    const art = flagImg(type, name, "stamp-flag") || `<span class="stamp-mono">${monogram(name)}</span>`;
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

  function setStampStatus(el, s) {
    el.classList.toggle("visited", s === "visited");
    el.classList.toggle("lived", s === "lived");
    el.classList.toggle("want", s === "want");
    el.querySelector(".postmark").textContent = POSTMARK[s] || "";
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

  function refreshAll() { refreshStamps(); refreshParks(); refreshStats(); }
  Store.onChange(refreshAll);
  refreshAll();
})();
