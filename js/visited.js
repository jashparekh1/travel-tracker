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
      el.classList.toggle("want", s === "want");
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
    tile.className = "park-tile";
    tile.dataset.type = type;
    tile.dataset.name = item.name;
    tile.innerHTML =
      `<div class="photo">${emoji}</div>` +
      `<div class="body"><h3>${item.name}</h3><div class="sub">${sub}</div>` +
      `<button class="toggle-visited"></button></div>`;
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
      tile.classList.toggle("visited", s === "visited");
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
      `<span>🏞️ <b>${c.parks}</b>/${c.parksTotal} parks</span>` +
      `<span>⭐ <b>${c.landmarks}</b>/${c.landmarksTotal} wonders</span>`;
    document.getElementById("stats-landmarks").innerHTML =
      `Visited <b>${c.landmarks}</b> of <b>${c.landmarksTotal}</b> wonders & landmarks.`;
    document.getElementById("stats-countries").innerHTML =
      `Visited <b>${c.countries}</b> of <b>${c.countriesTotal}</b> countries` +
      (c.territories ? ` (plus <b>${c.territories}</b> territories)` : "") +
      `. Click to cycle: not yet → visited → lived → want to go.`;
    document.getElementById("stats-states").innerHTML =
      `Visited <b>${c.states}</b> of <b>${c.statesTotal}</b> states. Click to cycle: not yet → visited → lived → want to go.`;
    document.getElementById("stats-parks").innerHTML =
      `Visited <b>${c.parks}</b> of <b>${c.parksTotal}</b> national parks.`;
  }

  document.getElementById("btn-export").onclick = () => Store.exportFile();

  function refreshAll() { refreshChips(); refreshParks(); refreshStats(); }
  Store.onChange(refreshAll);
  refreshAll();
})();
