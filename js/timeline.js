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

  // A range label clipped to one year: "Dec 2025" or "Mar – Aug 2025".
  const fmtSeg = (from, to) => {
    if (from === to) return fmtMonth(from);
    return `${MONTHS[+from.slice(5, 7) - 1]} – ${MONTHS[+to.slice(5, 7) - 1]} ${from.slice(0, 4)}`;
  };

  function renderTimeline() {
    const root = document.getElementById("timeline");
    root.innerHTML = "";

    // Split ranges so each year shows its own slice of the trip.
    const segments = [];
    let total = 0;
    for (const [key, entries] of Object.entries(Store.allNotes())) {
      entries.forEach((e, i) => {
        total++;
        const from = entryFrom(e);
        if (!from) {
          segments.push({ key, i, year: "Undated", label: "", text: e.text, sort: "9999" });
          return;
        }
        const to = e.to && e.to > from ? e.to : from;
        const yFrom = +from.slice(0, 4);
        const yTo = +to.slice(0, 4);
        for (let y = yFrom; y <= yTo; y++) {
          const segFrom = y === yFrom ? from : `${y}-01`;
          const segTo = y === yTo ? to : `${y}-12`;
          segments.push({
            key, i, year: String(y),
            label: fmtSeg(segFrom, segTo),
            text: e.text, sort: segFrom,
            contBefore: y > yFrom, contAfter: y < yTo,
          });
        }
      });
    }

    document.getElementById("stats-timeline").innerHTML = total
      ? `<b>${total}</b> ${total === 1 ? "memory" : "memories"} on your timeline.`
      : "Log where you went and when — it becomes your travel timeline.";

    const byYear = {};
    for (const s of segments) (byYear[s.year] = byYear[s.year] || []).push(s);
    const years = Object.keys(byYear)
      .sort((a, b) => (b === "Undated" ? -1 : a === "Undated" ? 1 : b.localeCompare(a)));

    for (const year of years) {
      const h = document.createElement("h2");
      h.className = "tl-year";
      h.textContent = year;
      root.appendChild(h);
      const group = document.createElement("div");
      group.className = "tl-group";
      const list = byYear[year].sort((a, b) => a.sort.localeCompare(b.sort));
      for (const s of list) {
        const cont = s.contBefore ? `<span class="tl-cont">↩ cont’d</span>`
          : s.contAfter ? `<span class="tl-cont">continues →</span>` : "";
        const row = document.createElement("div");
        row.className = "timeline-entry";
        row.innerHTML =
          `<button class="btn small tl-del" title="Delete this memory">✕</button>` +
          `<div class="tl-head">` +
          (s.label ? `<span class="tl-when">${s.label}</span>` : "") +
          `<span class="tl-place">${keyLabel(s.key)}</span>${cont}</div>` +
          (s.text ? `<div class="tl-text">${s.text.replace(/</g, "&lt;")}</div>` : "");
        row.querySelector(".tl-del").onclick = () => Store.deleteNote(s.key, s.i);
        group.appendChild(row);
      }
      root.appendChild(group);
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
