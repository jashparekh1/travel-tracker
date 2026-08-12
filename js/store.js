// Data store: seed file (data/my-travels.js) + localStorage overrides.
//
// Clicks in the UI write explicit overrides ("visited" | "lived" | "none")
// to localStorage; anything without an override falls through to the seed.
// "Export" downloads the merged result as a new my-travels.js so it can be
// committed to git.

window.Store = (() => {
  const KEY = "travel-tracker-overrides-v1";
  const seed = window.SEED_TRAVELS || { countries: {}, states: {}, parks: {} };

  let overrides;
  try {
    overrides = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch (e) {
    overrides = {};
  }
  for (const k of ["countries", "states", "parks", "provinces"]) {
    overrides[k] = overrides[k] || {};
    seed[k] = seed[k] || {};
  }

  const listeners = [];
  const notify = () => listeners.forEach((cb) => cb());
  const save = () => localStorage.setItem(KEY, JSON.stringify(overrides));

  // Raw status lookup: override wins, else seed, else null.
  function raw(type, name) {
    const o = overrides[type][name];
    if (o !== undefined) return o === "none" ? null : o;
    return (seed[type] && seed[type][name]) || null;
  }

  // All province keys ("Country/Province") that currently have any status.
  function provinceKeys() {
    return [...new Set([...Object.keys(seed.provinces), ...Object.keys(overrides.provinces)])]
      .filter((k) => raw("provinces", k));
  }

  // Country status; derived from its states (US) or provinces unless explicit.
  function country(name) {
    const explicit = raw("countries", name);
    if (explicit) return explicit;
    let statuses;
    if (name === "United States of America") {
      statuses = window.US_STATES.concat(window.US_EXTRAS).map((s) => raw("states", s));
    } else {
      statuses = provinceKeys().filter((k) => k.startsWith(name + "/")).map((k) => raw("provinces", k));
    }
    if (statuses.includes("lived")) return "lived";
    if (statuses.includes("visited")) return "visited";
    return null;
  }

  function get(type, name) {
    return type === "countries" ? country(name) : raw(type, name);
  }

  const CYCLE = { region: [null, "visited", "lived"], park: [null, "visited"] };

  function cycle(type, name) {
    const order = type === "parks" ? CYCLE.park : CYCLE.region;
    const next = order[(order.indexOf(raw(type, name)) + 1) % order.length];
    overrides[type][name] = next === null ? "none" : next;
    save();
    notify();
    return next;
  }

  function set(type, name, status) {
    overrides[type][name] = status === null ? "none" : status;
    save();
    notify();
  }

  function counts() {
    const names = Object.keys(window.COUNTRY_META);
    const sovereign = names.filter((n) => window.COUNTRY_META[n][2]);
    const c = sovereign.filter((n) => country(n)).length;
    const t = names.filter((n) => !window.COUNTRY_META[n][2] && country(n)).length;
    const s = window.US_STATES.filter((n) => raw("states", n)).length;
    const p = window.PARKS.filter((pk) => raw("parks", pk.name)).length;
    return {
      countries: c, countriesTotal: sovereign.length, territories: t,
      states: s, statesTotal: window.US_STATES.length,
      parks: p, parksTotal: window.PARKS.length,
      provinces: provinceKeys().length,
    };
  }

  // Marked provinces grouped by country: { country: [{name, key, status}] }
  function markedProvinces() {
    const out = {};
    for (const k of provinceKeys()) {
      const [c, ...rest] = k.split("/");
      (out[c] = out[c] || []).push({ name: rest.join("/"), key: k, status: raw("provinces", k) });
    }
    for (const c of Object.keys(out)) out[c].sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  // Merged snapshot (no nulls) for export.
  function merged() {
    const out = { countries: {}, states: {}, parks: {} };
    for (const n of Object.keys(window.COUNTRY_META)) {
      const v = raw("countries", n);
      if (v) out.countries[n] = v;
    }
    for (const n of window.US_STATES.concat(window.US_EXTRAS)) {
      const v = raw("states", n);
      if (v) out.states[n] = v;
    }
    for (const pk of window.PARKS) {
      const v = raw("parks", pk.name);
      if (v) out.parks[pk.name] = v;
    }
    out.provinces = {};
    for (const k of provinceKeys()) out.provinces[k] = raw("provinces", k);
    return out;
  }

  function exportFile() {
    const body =
      "// Exported from the travel tracker on " + new Date().toISOString().slice(0, 10) + ".\n" +
      "// Replace data/my-travels.js with this file and commit it.\n" +
      "// After replacing it you can use \"Clear local edits\" to drop browser overrides.\n\n" +
      "window.SEED_TRAVELS = " + JSON.stringify(merged(), null, 2) + ";\n";
    const url = URL.createObjectURL(new Blob([body], { type: "text/javascript" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-travels.js";
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearLocal() {
    localStorage.removeItem(KEY);
    location.reload();
  }

  return {
    get, cycle, set, counts, markedProvinces, exportFile, clearLocal,
    onChange: (cb) => listeners.push(cb),
  };
})();
