// Timeline page: log dated notes per place, rendered as a yearly timeline.

(function () {
  // Searchable place list; labels must be unique (e.g. two Georgias).
  const placeKeys = {};
  for (const n of Object.keys(window.COUNTRY_META)) placeKeys[displayName(n)] = "countries/" + n;
  for (const n of window.US_STATES.concat(window.US_EXTRAS)) {
    const label = n in placeKeys ? `${n} (US state)` : n;
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
  const entryFrom = (e) => e.from || e.when || null; // old entries used {when}
  const fmtWhen = (e) => {
    const from = entryFrom(e);
    if (!from) return "";
    return e.to && e.to !== from ? `${fmtMonth(from)} – ${fmtMonth(e.to)}` : fmtMonth(from);
  };

  const pickFrom = myPicker(document.getElementById("note-when"));
  const pickTo = myPicker(document.getElementById("note-when-to"));

  document.getElementById("note-add").onclick = () => {
    const err = (m) => { document.getElementById("note-error").textContent = m || ""; };
    err("");
    const place = document.getElementById("note-place").value.trim();
    const key = placeKeys[place];
    if (!key) { err("Pick a place from the list (start typing to search)."); return; }
    const from = pickFrom.value();
    const to = pickTo.value();
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
    for (const e of flat) {
      const y = e.when ? e.when.slice(0, 4) : "Undated";
      (byYear[y] = byYear[y] || []).push(e);
    }
    const years = Object.keys(byYear)
      .sort((a, b) => (b === "Undated" ? -1 : a === "Undated" ? 1 : b.localeCompare(a)));
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

  function refreshStats() {
    const c = Store.counts();
    document.getElementById("stats").innerHTML =
      `<span>🌍 <b>${c.countries}</b>/${c.countriesTotal} countries` +
      (c.territories ? ` <i>+${c.territories} terr.</i>` : "") + `</span>` +
      `<span>🇺🇸 <b>${c.states}</b>/${c.statesTotal} states</span>` +
      `<span>🏞️ <b>${c.parks}</b>/${c.parksTotal} parks</span>` +
      `<span>⭐ <b>${c.landmarks}</b>/${c.landmarksTotal} wonders</span>`;
  }

  document.getElementById("btn-export").onclick = () => Store.exportFile();

  function refreshAll() { renderTimeline(); refreshStats(); }
  Store.onChange(refreshAll);
  refreshAll();
})();
