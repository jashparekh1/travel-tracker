// Data store: seed file + localStorage overrides + optional Supabase cloud.
//
// Status lookup order: local override -> cloud document -> seed file.
// Signed out (or Supabase unconfigured), it behaves exactly like before:
// clicks -> localStorage, Export -> committable file.
// Signed in, the cloud document is authoritative: it replaces the local
// view on sign-in, and every change is pushed (debounced) to Supabase.

window.Store = (() => {
  const KEY = "travel-tracker-overrides-v1";
  const TYPES = ["countries", "states", "parks"];
  const seed = window.SEED_TRAVELS || {};

  let overrides;
  try {
    overrides = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch (e) {
    overrides = {};
  }
  for (const k of TYPES) {
    overrides[k] = overrides[k] || {};
    seed[k] = seed[k] || {};
  }

  let remote = null; // full doc from Supabase; authoritative when present

  const listeners = [];
  const syncListeners = [];
  const notify = () => listeners.forEach((cb) => cb());
  let syncState = "local"; // local | signedout | saving | synced | error
  const setSync = (s) => { syncState = s; syncListeners.forEach((cb) => cb(s)); };
  const save = () => localStorage.setItem(KEY, JSON.stringify(overrides));

  // Raw status lookup.
  function raw(type, name) {
    const o = overrides[type][name];
    if (o !== undefined) return o === "none" ? null : o;
    if (remote) return (remote[type] && remote[type][name]) || null;
    return seed[type][name] || null;
  }

  // Country status; the US is derived from its states unless set explicitly.
  function country(name) {
    const explicit = raw("countries", name);
    if (name !== "United States of America" || explicit) return explicit;
    const statuses = window.US_STATES.concat(window.US_EXTRAS).map((s) => raw("states", s));
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
    schedulePush();
    notify();
    return next;
  }

  function set(type, name, status) {
    overrides[type][name] = status === null ? "none" : status;
    save();
    schedulePush();
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
    };
  }

  // Merged snapshot (no nulls) — used for export and cloud pushes.
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

  // ---------------- cloud (Supabase) ----------------
  let client = null;
  let user = null;
  let pushTimer = null;

  const cloudEnabled = () => !!client;

  async function initCloud() {
    const cfg = window.SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey || !window.supabase) return;
    client = window.supabase.createClient(cfg.url, cfg.anonKey);
    setSync("signedout");
    const { data } = await client.auth.getSession();
    await handleUser(data.session ? data.session.user : null);
    client.auth.onAuthStateChange((_event, session) => {
      const next = session ? session.user : null;
      if ((next && next.id) !== (user && user.id)) handleUser(next);
    });
  }

  async function handleUser(u) {
    user = u;
    if (!user) {
      remote = null;
      setSync(client ? "signedout" : "local");
      notify();
      return;
    }
    setSync("saving");
    const { data, error } = await client
      .from("travels").select("data").eq("user_id", user.id).maybeSingle();
    if (error) {
      setSync("error");
      return;
    }
    if (data) {
      // Cloud is the base; any local edits made while signed out are
      // layered on top and immediately pushed (push() then clears them).
      remote = data.data || {};
      for (const k of TYPES) remote[k] = remote[k] || {};
      if (TYPES.some((k) => Object.keys(overrides[k]).length)) await push();
      else setSync("synced");
    } else {
      // First sign-in: current local state becomes the cloud document.
      remote = null;
      await push();
    }
    notify();
  }

  async function push() {
    if (!client || !user) return;
    setSync("saving");
    const doc = merged();
    const { error } = await client.from("travels").upsert({
      user_id: user.id, data: doc, updated_at: new Date().toISOString(),
    });
    if (error) {
      setSync("error");
      return;
    }
    // Fold what we just pushed into the remote layer and drop overrides.
    remote = doc;
    for (const k of TYPES) overrides[k] = {};
    save();
    setSync("synced");
  }

  function schedulePush() {
    if (!client || !user) return;
    clearTimeout(pushTimer);
    setSync("saving");
    pushTimer = setTimeout(push, 1200);
  }

  async function signIn(email, password) {
    const { error } = await client.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }

  async function signUp(email, password) {
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return error.message;
    if (data.user && !data.session) {
      return "Account created — check your email to confirm, then sign in.";
    }
    return null;
  }

  async function signInGoogle() {
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
    return error ? error.message : null;
  }

  async function signOut() {
    await client.auth.signOut();
  }

  initCloud();

  return {
    get, cycle, set, counts, exportFile, clearLocal,
    onChange: (cb) => listeners.push(cb),
    cloud: {
      enabled: cloudEnabled,
      user: () => user,
      state: () => syncState,
      onSync: (cb) => syncListeners.push(cb),
      signIn, signUp, signInGoogle, signOut,
    },
  };
})();
