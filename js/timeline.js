// Timeline page: log dated notes per place, rendered as a yearly timeline.

(function () {
  // Searchable place list; labels must be unique (e.g. two Georgias).
  const placeKeys = {};
  for (const n of Object.keys(window.COUNTRY_META)) placeKeys[displayName(n)] = "countries/" + n;
  const STATE_TAG = { "United States of America": "US state", "India": "India" };
  for (const [country, subs] of Object.entries(window.SUBDIVIDED)) {
    for (const n of subs) {
      const label = n in placeKeys ? `${n} (${STATE_TAG[country]})` : n;
      placeKeys[label] = "states/" + n;
    }
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

  const entryFrom = window.noteFrom;
  const fmtWhen = (e) => {
    const from = entryFrom(e);
    if (!from) return "";
    return e.to && e.to !== from ? `${fmtMonth(from)} – ${fmtMonth(e.to)}` : fmtMonth(from);
  };

  const pickFrom = myPicker(document.getElementById("note-when"));
  const pickTo = myPicker(document.getElementById("note-when-to"));
  const keyToLabel = {};
  for (const [label, key] of Object.entries(placeKeys)) keyToLabel[key] = label;

  // Places picked for the entry being written. One place makes a plain
  // note; several make a trip (one memory linked across all of them).
  let picked = [];
  const placeInput = document.getElementById("note-place");
  const pickedRoot = document.getElementById("note-picked");

  function renderPicked() {
    pickedRoot.innerHTML = "";
    for (const key of picked) {
      const chip = document.createElement("span");
      chip.className = "picked-place";
      chip.innerHTML = `${keyLabel(key)}<button title="Remove">✕</button>`;
      chip.querySelector("button").onclick = () => {
        picked = picked.filter((k) => k !== key);
        renderPicked();
      };
      pickedRoot.appendChild(chip);
    }
    placeInput.placeholder = picked.length
      ? "Add another place to this trip…"
      : "Where? Add one or more places (country, state, park, or wonder)";
  }

  // Picking a suggestion (or pressing Enter on an exact match) adds it.
  function takeInput() {
    const key = placeKeys[placeInput.value.trim()];
    if (!key) return false;
    if (!picked.includes(key)) picked.push(key);
    placeInput.value = "";
    renderPicked();
    return true;
  }
  placeInput.addEventListener("input", takeInput);
  placeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); takeInput(); }
  });

  let editing = null; // {key, i} or {trip} while editing an existing entry

  function exitEditMode() {
    editing = null;
    document.getElementById("note-add").textContent = "Add to timeline";
    document.getElementById("note-cancel").style.display = "none";
    placeInput.value = "";
    picked = [];
    renderPicked();
    pickFrom.clear();
    pickTo.clear();
    document.getElementById("note-text").value = "";
    document.getElementById("note-error").textContent = "";
  }

  function startEdit(target, keys, entry) {
    editing = target;
    picked = keys.slice();
    renderPicked();
    placeInput.value = "";
    pickFrom.set(entryFrom(entry));
    pickTo.set(entry.to || null);
    document.getElementById("note-text").value = entry.text || "";
    document.getElementById("note-add").textContent = "Save changes";
    document.getElementById("note-cancel").style.display = "";
    document.querySelector(".note-form").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  document.getElementById("note-cancel").onclick = exitEditMode;

  document.getElementById("note-add").onclick = () => {
    const err = (m) => { document.getElementById("note-error").textContent = m || ""; };
    err("");
    if (placeInput.value.trim() && !takeInput()) {
      err("Pick a place from the list (start typing to search).");
      return;
    }
    if (!picked.length) { err("Add at least one place (start typing to search)."); return; }
    const from = pickFrom.value();
    const to = pickTo.value();
    const text = document.getElementById("note-text").value.trim();
    if (!from && !text) { err("Add a date, a note, or both."); return; }
    const keys = picked.slice();
    if (editing && editing.trip) {
      Store.updateTrip(editing.trip, keys, from, to, text);
    } else if (editing && keys.length === 1 && keys[0] === editing.key) {
      const range = to && to !== from ? to : null;
      Store.updateNote(editing.key, editing.i, { from: from || null, to: range, text });
    } else {
      // New entry, or a single note that changed place / grew into a trip.
      if (editing) Store.deleteNote(editing.key, editing.i);
      if (keys.length === 1) Store.addNote(keys[0], from, to, text);
      else Store.addTrip(keys, from, to, text);
    }
    exitEditMode();
  };

  // A range label clipped to one year: "Dec 2025" or "Mar – Aug 2025".
  const fmtSeg = (from, to) => {
    if (from === to) return fmtMonth(from);
    return `${MONTHS[+from.slice(5, 7) - 1]} – ${MONTHS[+to.slice(5, 7) - 1]} ${from.slice(0, 4)}`;
  };

  function renderTimeline() {
    const root = document.getElementById("timeline");
    root.innerHTML = "";

    // One item per memory: a plain note, or a trip gathered from the
    // linked copies on each of its places.
    const items = [];
    const trips = {};
    for (const [key, entries] of Object.entries(Store.allNotes())) {
      entries.forEach((e, i) => {
        if (!e.trip) { items.push({ keys: [key], key, i, e }); return; }
        if (!trips[e.trip]) items.push((trips[e.trip] = { keys: [], trip: e.trip, e }));
        trips[e.trip].keys.push(key);
      });
    }
    // Trip places read broad to specific: countries, states, parks, wonders.
    const TYPE_RANK = { countries: 0, states: 1, parks: 2, landmarks: 3 };
    for (const t of Object.values(trips)) {
      t.keys.sort((a, b) => TYPE_RANK[a.split("/")[0]] - TYPE_RANK[b.split("/")[0]] || a.localeCompare(b));
    }

    // Split ranges so each year shows its own slice of the trip.
    const segments = [];
    const total = items.length;
    for (const item of items) {
      const e = item.e;
      const from = entryFrom(e);
      if (!from) {
        segments.push({ ...item, year: "Undated", label: "", text: e.text, sort: "9999" });
        continue;
      }
      const to = e.to && e.to > from ? e.to : from;
      const yFrom = +from.slice(0, 4);
      const yTo = +to.slice(0, 4);
      for (let y = yFrom; y <= yTo; y++) {
        const segFrom = y === yFrom ? from : `${y}-01`;
        const segTo = y === yTo ? to : `${y}-12`;
        segments.push({
          ...item, year: String(y),
          label: fmtSeg(segFrom, segTo),
          text: e.text, sort: segFrom,
          contBefore: y > yFrom, contAfter: y < yTo,
        });
      }
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
      // Group consecutive entries by month label; the label becomes a
      // subheading and every entry sits tabbed beneath it.
      let prevLabel = null;
      for (const s of list) {
        const label = s.label || (year === "Undated" ? "" : "No date");
        if (label && label !== prevLabel) {
          const m = document.createElement("div");
          m.className = "tl-month";
          m.textContent = label;
          group.appendChild(m);
        }
        prevLabel = label;
        const cont = s.contBefore ? `<span class="tl-cont">↩ cont’d</span>`
          : s.contAfter ? `<span class="tl-cont">continues →</span>` : "";
        const row = document.createElement("div");
        row.className = "timeline-entry";
        row.innerHTML =
          `<div class="tl-actions">` +
          `<button class="btn small tl-edit" title="Edit this memory">✎</button>` +
          `<button class="btn small tl-del" title="Delete this memory">✕</button>` +
          `</div>` +
          `<div class="tl-head">` +
          `<span class="tl-place">${s.keys.map(keyLabel).join(`<span class="tl-sep">·</span>`)}</span>${cont}</div>` +
          (s.text ? `<div class="tl-text">${s.text.replace(/</g, "&lt;")}</div>` : "");
        row.querySelector(".tl-edit").onclick = () =>
          startEdit(s.trip ? { trip: s.trip } : { key: s.key, i: s.i }, s.keys, s.e);
        row.querySelector(".tl-del").onclick = () => {
          if (editing && (s.trip ? editing.trip === s.trip : editing.key === s.key && editing.i === s.i)) exitEditMode();
          if (s.trip) Store.deleteTrip(s.trip);
          else Store.deleteNote(s.key, s.i);
        };
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
  renderPicked();
  Store.onChange(refreshAll);
  refreshAll();
})();
