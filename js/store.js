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
  let comparing = null; // {a: {name, doc}, b: {name, doc}} — overlay compare

  const listeners = [];
  const syncListeners = [];
  const notify = () => listeners.forEach((cb) => cb());
  let syncState = "local"; // local | signedout | saving | synced | error
  const setSync = (s) => { syncState = s; syncListeners.forEach((cb) => cb(s)); };
  const save = () => localStorage.setItem(KEY, JSON.stringify(overrides));

  // Raw status lookup (always MY data; compare mode never changes it).
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
    if (comparing) return null; // read-only while comparing
    const order = type === "parks" ? CYCLE.park : CYCLE.region;
    const next = order[(order.indexOf(raw(type, name)) + 1) % order.length];
    overrides[type][name] = next === null ? "none" : next;
    save();
    schedulePush();
    notify();
    return next;
  }

  function set(type, name, status) {
    if (comparing) return;
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
  let profile = null; // my username, once chosen
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
    comparing = null;
    if (!user) {
      remote = null;
      profile = null;
      setSync(client ? "signedout" : "local");
      notify();
      return;
    }
    setSync("saving");
    client.from("profiles").select("username").eq("user_id", user.id).maybeSingle()
      .then(({ data: p }) => { profile = p ? p.username : null; setSync(syncState); });
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

  // ---- profile & friends ----
  async function setUsername(name) {
    const uname = (name || "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
      return "3–20 characters: lowercase letters, numbers, underscores.";
    }
    const { error } = await client.from("profiles")
      .insert({ user_id: user.id, username: uname });
    if (error) return error.code === "23505" ? "That username is taken." : error.message;
    profile = uname;
    setSync(syncState); // poke listeners
    return null;
  }

  async function addFriend(name) {
    const uname = (name || "").trim().toLowerCase().replace(/^@/, "");
    if (!uname) return "Enter a username.";
    const { data: p, error } = await client.from("profiles")
      .select("user_id").eq("username", uname).maybeSingle();
    if (error) return error.message;
    if (!p) return "No user with that username.";
    if (p.user_id === user.id) return "That's you!";
    const { error: e2 } = await client.from("friendships")
      .insert({ user_id: user.id, friend_id: p.user_id });
    if (e2) return e2.code === "23505" ? "Already in your friends." : e2.message;
    return null;
  }

  async function removeFriend(friendId) {
    await client.from("friendships").delete()
      .eq("user_id", user.id).eq("friend_id", friendId);
  }

  // Friends with their usernames and travel docs (for stats + viewing).
  async function myFriends() {
    const { data: fr, error } = await client.from("friendships").select("friend_id");
    if (error) return { error: error.message };
    const ids = (fr || []).map((r) => r.friend_id);
    if (!ids.length) return { friends: [] };
    const [profs, travels] = await Promise.all([
      client.from("profiles").select("user_id, username").in("user_id", ids),
      client.from("travels").select("user_id, data").in("user_id", ids),
    ]);
    if (profs.error) return { error: profs.error.message };
    const docs = {};
    (travels.data || []).forEach((t) => { docs[t.user_id] = t.data || {}; });
    const friends = (profs.data || [])
      .map((p) => ({ id: p.user_id, username: p.username, doc: docs[p.user_id] || {} }))
      .sort((a, b) => a.username.localeCompare(b.username));
    return { friends };
  }

  // Counts for any plain travel doc (used to compare friends).
  function countsFromDoc(doc) {
    doc = doc || {};
    const c = doc.countries || {}, s = doc.states || {}, p = doc.parks || {};
    const sovereign = Object.keys(window.COUNTRY_META).filter((n) => window.COUNTRY_META[n][2]);
    let countries = sovereign.filter((n) => c[n]).length;
    const usFromStates = window.US_STATES.concat(window.US_EXTRAS).some((n) => s[n]);
    if (usFromStates && !c["United States of America"]) countries += 1;
    return {
      countries,
      states: window.US_STATES.filter((n) => s[n]).length,
      parks: Object.keys(p).length,
    };
  }

  // ---- compare mode (any two people from {me + my friends}) ----
  // Country status inside an arbitrary doc (same US-derivation rule).
  function docCountry(doc, name) {
    const explicit = (doc.countries || {})[name];
    if (name !== "United States of America" || explicit) return explicit || null;
    const s = doc.states || {};
    return window.US_STATES.concat(window.US_EXTRAS).some((n) => s[n]) ? "visited" : null;
  }

  function docStatus(doc, type, name) {
    return type === "countries" ? docCountry(doc, name) : (doc[type] || {})[name] || null;
  }

  // "both" | "a" | "b" | null for the active comparison.
  function compareStatus(type, name) {
    if (!comparing) return null;
    const a = docStatus(comparing.a.doc, type, name);
    const b = docStatus(comparing.b.doc, type, name);
    if (a && b) return "both";
    if (a) return "a";
    if (b) return "b";
    return null;
  }

  function normalizeDoc(doc) {
    doc = doc || {};
    for (const k of TYPES) doc[k] = doc[k] || {};
    return doc;
  }

  function compareWith(a, b) {
    comparing = {
      a: { name: a.name, doc: normalizeDoc(a.doc) },
      b: { name: b.name, doc: normalizeDoc(b.doc) },
    };
    notify();
  }

  function compareOff() {
    comparing = null;
    notify();
  }

  // Tallies for the compare legend: how many entities are both/a/b.
  function compareCounts() {
    if (!comparing) return null;
    const count = (type, names) => {
      const out = { both: 0, a: 0, b: 0 };
      for (const n of names) {
        const s = compareStatus(type, n);
        if (s) out[s]++;
      }
      return out;
    };
    return {
      countries: count("countries",
        Object.keys(window.COUNTRY_META).filter((n) => window.COUNTRY_META[n][2])),
      states: count("states", window.US_STATES),
      parks: count("parks", window.PARKS.map((p) => p.name)),
    };
  }

  initCloud();

  return {
    get, cycle, set, counts, exportFile, clearLocal,
    onChange: (cb) => listeners.push(cb),
    compareWith, compareOff, compareStatus, compareCounts,
    comparing: () => (comparing ? { a: comparing.a.name, b: comparing.b.name } : null),
    myDoc: () => merged(),
    cloud: {
      enabled: cloudEnabled,
      user: () => user,
      profile: () => profile,
      state: () => syncState,
      onSync: (cb) => syncListeners.push(cb),
      signIn, signUp, signInGoogle, signOut,
      setUsername, addFriend, removeFriend, myFriends, countsFromDoc,
    },
  };
})();
