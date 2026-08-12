// Visited page: three tabs (Countries by continent, US States, National Parks).
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

  // ---- shared chip builder ----
  function chip(type, name, label) {
    const el = document.createElement("button");
    el.className = "chip";
    const flag = flagImg(type, name) || `<span class="dot"></span>`;
    el.innerHTML = `${flag}<span>${label || name}</span>`;
    el.onclick = () => Store.cycle(type, name);
    el.dataset.type = type;
    el.dataset.name = name;
    return el;
  }

  function refreshChips() {
    document.querySelectorAll(".chip").forEach((el) => {
      const s = Store.get(el.dataset.type, el.dataset.name);
      el.classList.toggle("visited", s === "visited");
      el.classList.toggle("lived", s === "lived");
    });
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
    grid.className = "chip-grid";
    bucket.sov.sort(alpha).forEach((n) => grid.appendChild(chip("countries", n, displayName(n))));
    contRoot.appendChild(grid);
    if (bucket.terr.length) {
      const th = document.createElement("h3");
      th.className = "territories";
      th.textContent = "Territories & dependencies";
      contRoot.appendChild(th);
      const tgrid = document.createElement("div");
      tgrid.className = "chip-grid terr";
      bucket.terr.sort(alpha).forEach((n) => tgrid.appendChild(chip("countries", n, displayName(n))));
      contRoot.appendChild(tgrid);
    }
  }

  // ---- states tab ----
  const stateRoot = document.getElementById("state-list");
  window.US_STATES.forEach((n) => stateRoot.appendChild(chip("states", n)));
  const extrasRoot = document.getElementById("extras-list");
  window.US_EXTRAS.forEach((n) => extrasRoot.appendChild(chip("states", n)));

  // ---- provinces tab: only countries with marked provinces ----
  function renderProvinces() {
    const root = document.getElementById("province-lists");
    root.innerHTML = "";
    const marked = Store.markedProvinces();
    const countriesWith = Object.keys(marked).sort((a, b) => displayName(a).localeCompare(displayName(b)));
    const total = window.PROVINCE_INDEX
      ? Object.values(window.PROVINCE_INDEX).reduce((s, v) => s + v.count, 0) : 0;
    document.getElementById("stats-provinces").innerHTML = countriesWith.length
      ? `Marked <b>${Object.values(marked).flat().length}</b> provinces across ` +
        `<b>${countriesWith.length}</b> countries (${total.toLocaleString()} exist worldwide). ` +
        `Zoom into a country on the globe to mark more.`
      : `Nothing marked yet — zoom into a country on the globe and click its provinces. ` +
        `(${total.toLocaleString()} provinces across ${Object.keys(window.PROVINCE_INDEX || {}).length} countries are on the map.)`;
    for (const c of countriesWith) {
      const h = document.createElement("h2");
      h.className = "continent";
      h.innerHTML = `${flagImg("countries", c)} ${displayName(c)} · ${marked[c].length}` +
        (window.PROVINCE_INDEX && window.PROVINCE_INDEX[c] ? `/${window.PROVINCE_INDEX[c].count}` : "");
      root.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "chip-grid";
      marked[c].forEach((p) => grid.appendChild(chip("provinces", p.key, p.name)));
      root.appendChild(grid);
    }
  }

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

  const sortedParks = [...window.PARKS].sort((a, b) => a.name.localeCompare(b.name));
  for (const park of sortedParks) {
    const tile = document.createElement("div");
    tile.className = "park-tile";
    tile.dataset.park = park.name;
    tile.innerHTML =
      `<div class="photo">🏞️</div>` +
      `<div class="body"><h3>${park.name}</h3><div class="sub">${park.state}</div>` +
      `<button class="toggle-visited"></button></div>`;
    tile._park = park;
    tile.querySelector(".toggle-visited").onclick = () => Store.cycle("parks", park.name);
    parkRoot.appendChild(tile);
    observer.observe(tile);
  }

  function refreshParks() {
    document.querySelectorAll(".park-tile").forEach((tile) => {
      const visited = !!Store.get("parks", tile.dataset.park);
      tile.classList.toggle("visited", visited);
      const btn = tile.querySelector(".toggle-visited");
      btn.textContent = visited ? "✓ Visited" : "Mark as visited";
      btn.classList.toggle("is-visited", visited);
    });
  }

  // ---- stats ----
  function refreshStats() {
    const c = Store.counts();
    document.getElementById("stats").innerHTML =
      `<span>🌍 <b>${c.countries}</b>/${c.countriesTotal} countries` +
      (c.territories ? ` <i>+${c.territories} terr.</i>` : "") + `</span>` +
      `<span>🇺🇸 <b>${c.states}</b>/${c.statesTotal} states</span>` +
      `<span>🏞️ <b>${c.parks}</b>/${c.parksTotal} parks</span>` +
      (c.provinces ? `<span>🗺️ <b>${c.provinces}</b> provinces</span>` : "");
    document.getElementById("stats-countries").innerHTML =
      `Visited <b>${c.countries}</b> of <b>${c.countriesTotal}</b> countries` +
      (c.territories ? ` (plus <b>${c.territories}</b> territories)` : "") +
      `. Click to cycle: not yet → visited → lived.`;
    document.getElementById("stats-states").innerHTML =
      `Visited <b>${c.states}</b> of <b>${c.statesTotal}</b> states. Click to cycle: not yet → visited → lived.`;
    document.getElementById("stats-parks").innerHTML =
      `Visited <b>${c.parks}</b> of <b>${c.parksTotal}</b> national parks.`;
  }

  document.getElementById("btn-export").onclick = () => Store.exportFile();

  function refreshAll() { renderProvinces(); refreshChips(); refreshParks(); refreshStats(); }
  Store.onChange(refreshAll);
  refreshAll();
})();
