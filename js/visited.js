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

  // ---- timeline (notes) ----
  // Searchable place list; labels must be unique (e.g. two Georgias).
  const placeKeys = {};
  for (const n of Object.keys(window.COUNTRY_META)) placeKeys[displayName(n)] = "countries/" + n;
  for (const n of window.US_STATES.concat(window.US_EXTRAS)) {
    const label = n in placeKeys || n === "Georgia" ? `${n} (US state)` : n;
    placeKeys[label] = "states/" + n;
  }
  for (const p of window.PARKS) placeKeys[`${p.name} National Park`] = "parks/" + p.name;
  for (const l of window.LANDMARKS) placeKeys[l.name] = "landmarks/" + l.name;
  const datalist = document.getElementById("note-places");
  Object.keys(placeKeys).sort().forEach((label) => {
    const o = document.createElement("option");
    o.value = label;
    datalist.appendChild(o);
  });

  function keyLabel(key) {
    const [type, ...rest] = key.split("/");
    const name = rest.join("/");
    if (type === "countries") return `${flagImg("countries", name)} ${displayName(name)}`;
    if (type === "states") return `${flagImg("states", name)} ${name}`;
    return `${type === "landmarks" ? "⭐" : "🏞️"} ${name}`;
  }

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtMonth = (m) => (m ? `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}` : "");
  // Entries may have {when} (old) or {from, to} (new).
  const entryFrom = (e) => e.from || e.when || null;
  const fmtWhen = (e) => {
    const from = entryFrom(e);
    if (!from) return "";
    return e.to && e.to !== from ? `${fmtMonth(from)} – ${fmtMonth(e.to)}` : fmtMonth(from);
  };

  document.getElementById("note-add").onclick = () => {
    const err = (m) => { document.getElementById("note-error").textContent = m || ""; };
    err("");
    const place = document.getElementById("note-place").value.trim();
    const key = placeKeys[place];
    if (!key) { err("Pick a place from the list (start typing to search)."); return; }
    const from = document.getElementById("note-when").value || null;
    const to = document.getElementById("note-when-to").value || null;
    const text = document.getElementById("note-text").value.trim();
    if (!from && !text) { err("Add a date, a note, or both."); return; }
    Store.addNote(key, from, to, text);
    document.getElementById("note-text").value = "";
  };

  function renderTimeline() {
    const root = document.getElementById("timeline");
    root.innerHTML = "";
    const flat = [];
    for (const [key, entries] of Object.entries(Store.allNotes())) {
      entries.forEach((e, i) => flat.push({ key, i, when: entryFrom(e), to: e.to, text: e.text }));
    }
    document.getElementById("stats-timeline").innerHTML = flat.length
      ? `<b>${flat.length}</b> ${flat.length === 1 ? "memory" : "memories"} on your timeline.`
      : "Log where you went and when — it becomes your travel timeline.";
    const byYear = {};
    for (const e of flat) (byYear[e.when ? e.when.slice(0, 4) : "Undated"] = byYear[e.when ? e.when.slice(0, 4) : "Undated"] || []).push(e);
    const years = Object.keys(byYear).sort((a, b) => (b === "Undated" ? -1 : a === "Undated" ? 1 : b.localeCompare(a)));
    for (const year of years) {
      const h = document.createElement("h2");
      h.className = "continent";
      h.textContent = year;
      root.appendChild(h);
      const list = byYear[year].sort((a, b) => (a.when || "9999").localeCompare(b.when || "9999"));
      for (const e of list) {
        const row = document.createElement("div");
        row.className = "timeline-entry";
        row.innerHTML =
          `<span class="tl-when">${fmtWhen(e) || "—"}</span>` +
          `<span class="tl-place">${keyLabel(e.key)}</span>` +
          `<span class="tl-text">${e.text ? e.text.replace(/</g, "&lt;") : ""}</span>` +
          `<button class="btn small tl-del" title="Delete">✕</button>`;
        row.querySelector(".tl-del").onclick = () => Store.deleteNote(e.key, e.i);
        root.appendChild(row);
      }
    }
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

  function refreshAll() { refreshChips(); refreshParks(); refreshStats(); renderTimeline(); }
  Store.onChange(refreshAll);
  refreshAll();
})();
