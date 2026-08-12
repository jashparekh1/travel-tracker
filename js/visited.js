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
    el.innerHTML = `<span class="dot"></span><span>${label || name}</span>`;
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

  // ---- countries tab ----
  const byContinent = {};
  for (const [name, cont] of Object.entries(window.CONTINENTS)) {
    (byContinent[cont] = byContinent[cont] || []).push(name);
  }
  const contRoot = document.getElementById("continent-lists");
  for (const cont of CONTINENT_ORDER) {
    const names = (byContinent[cont] || []).sort((a, b) => displayName(a).localeCompare(displayName(b)));
    const h = document.createElement("h2");
    h.className = "continent";
    h.textContent = cont;
    contRoot.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "chip-grid";
    names.forEach((n) => grid.appendChild(chip("countries", n, displayName(n))));
    contRoot.appendChild(grid);
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
      `<span>🌍 <b>${c.countries}</b>/${c.countriesTotal} countries</span>` +
      `<span>🇺🇸 <b>${c.states}</b>/${c.statesTotal} states</span>` +
      `<span>🏞️ <b>${c.parks}</b>/${c.parksTotal} parks</span>`;
    document.getElementById("stats-countries").innerHTML =
      `Visited <b>${c.countries}</b> of <b>${c.countriesTotal}</b> countries & territories. Click to cycle: not yet → visited → lived.`;
    document.getElementById("stats-states").innerHTML =
      `Visited <b>${c.states}</b> of <b>${c.statesTotal}</b> states. Click to cycle: not yet → visited → lived.`;
    document.getElementById("stats-parks").innerHTML =
      `Visited <b>${c.parks}</b> of <b>${c.parksTotal}</b> national parks.`;
  }

  document.getElementById("btn-export").onclick = () => Store.exportFile();

  function refreshAll() { refreshChips(); refreshParks(); refreshStats(); }
  Store.onChange(refreshAll);
  refreshAll();
})();
