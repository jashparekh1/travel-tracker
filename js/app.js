// Interactive globe: drag to rotate, scroll/pinch to zoom.
// Countries + US states cycle none -> visited -> lived on click.
// National park pins appear once zoomed in; click for photo + toggle.

(async function () {
  const svg = d3.select("#globe");
  const tooltip = document.getElementById("tooltip");

  let width = window.innerWidth;
  let height = window.innerHeight;
  const baseScale = () => Math.min(width, height) / 2.3;

  const projection = d3.geoOrthographic()
    .translate([width / 2, height / 2])
    .scale(baseScale())
    .rotate([95, -38]) // start centered on the US
    .clipAngle(90);

  const path = d3.geoPath(projection);
  let zoomK = 1;
  const PARK_ZOOM = 2.5; // pins appear past this zoom level

  const [world, statesGeo, lakesGeo, citiesRaw] = await Promise.all([
    d3.json("data/countries-50m.json"),
    d3.json("data/us-states.json"),
    d3.json("data/lakes-50m.json"),
    d3.json("data/cities.json?v=2"),
  ]);
  // Phones get ranks 0-2 only; desktop keeps 0-3.
  const MAX_CITY_RANK = window.matchMedia("(max-width: 640px)").matches ? 2 : 3;
  const cities = citiesRaw
    .map(([name, lat, lon, rank, cap]) => ({ name, lat, lon, rank, cap }))
    .filter((d) => d.rank <= MAX_CITY_RANK);
  const countries = topojson.feature(world, world.objects.countries).features;

  // ---- layers (order = paint order) ----
  svg.append("path").attr("class", "sphere").datum({ type: "Sphere" })
    .attr("fill", "var(--ocean)").attr("stroke", "#2b3760").attr("stroke-width", 1);
  svg.append("path").attr("class", "graticule").datum(d3.geoGraticule10())
    .attr("fill", "none").attr("stroke", "#1c2540").attr("stroke-width", 0.5);

  const countryPaths = svg.append("g").selectAll("path")
    .data(countries).join("path")
    .attr("class", "country");

  const statePaths = svg.append("g").selectAll("path")
    .data(statesGeo.features).join("path")
    .attr("class", "state");


  // Outlines on top of all fills: borders between countries, then
  // coastlines/continent edges (slightly brighter).
  // Lakes render as water above the land fills — the country polygons
  // include lake areas (Great Lakes etc.) which would otherwise take on
  // the country's status color.
  const lakePaths = svg.append("g").selectAll("path")
    .data(lakesGeo.features).join("path")
    .attr("class", "lake");

  const mergedPair = (a, b) =>
    window.MERGED_INTO[a.properties.name] === b.properties.name ||
    window.MERGED_INTO[b.properties.name] === a.properties.name;
  svg.append("path").attr("class", "borders")
    .datum(topojson.mesh(world, world.objects.countries, (a, b) => a !== b && !mergedPair(a, b)))
    .attr("fill", "none").attr("stroke", "#0b1020")
    .attr("stroke-width", 0.7).attr("stroke-opacity", 0.9)
    .attr("pointer-events", "none");
  svg.append("path").attr("class", "coastline")
    .datum(topojson.mesh(world, world.objects.countries, (a, b) => a === b))
    .attr("fill", "none").attr("stroke", "#0b1020")
    .attr("stroke-width", 0.8).attr("stroke-opacity", 0.9)
    .attr("pointer-events", "none");

  // City labels: display-only atlas dressing, revealed progressively by
  // importance rank. Never intercepts clicks (pointer-events: none).
  const citiesLayer = svg.append("g").attr("class", "cities").attr("pointer-events", "none");
  const CITY_ZOOM = [1.2, 1.6, 2.2, 3.2]; // min zoom per rank 0..3
  const cityNodes = citiesLayer.selectAll("g")
    .data(cities).join("g")
    .attr("class", (d) => "city" + (d.cap ? " capital" : ""));
  cityNodes.append("circle").attr("r", (d) => (d.rank <= 1 ? 2.5 : 2));
  cityNodes.append("text").attr("x", 5).attr("y", 3).text((d) => d.name);

  const parksLayer = svg.append("g");
  const PIN = "M0,0 C-5,-8 -9,-11 -9,-16 a9,9 0 1,1 18,0 C9,-11 5,-8 0,0 Z";
  const parkPins = parksLayer.selectAll("g")
    .data(window.PARKS).join("g")
    .attr("class", "park");
  parkPins.append("path").attr("class", "pin-body").attr("d", PIN);
  parkPins.append("circle").attr("cy", -16).attr("r", 3).attr("fill", "#0b1020");
  parkPins.append("text").attr("class", "park-label")
    .attr("x", 8).attr("y", -13).text((d) => d.name);

  // World wonders & landmarks: same pin mechanics, star glyph, own view.
  const landmarksLayer = svg.append("g");
  const landmarkPins = landmarksLayer.selectAll("g")
    .data(window.LANDMARKS).join("g")
    .attr("class", "park landmark");
  landmarkPins.append("path").attr("class", "pin-body").attr("d", PIN);
  landmarkPins.append("text").attr("class", "pin-star")
    .attr("y", -13).attr("text-anchor", "middle").text("★");
  landmarkPins.append("text").attr("class", "park-label")
    .attr("x", 8).attr("y", -13).text((d) => d.name);

  // Some polygons (e.g. Siachen Glacier) track as part of another country.
  const countryName = (d) => window.MERGED_INTO[d.properties.name] || d.properties.name;

  // View mode: "all" (countries + states + parks), "countries", or "parks".
  // Always opens in "all".
  let viewMode = "all";

  // ---- coloring ----
  function statusClass(type, name) {
    return "status-" + (Store.get(type, name) || "none");
  }
  function compareClass(type, name) {
    return "cmp-" + (Store.compareStatus(type, name) || "none");
  }
  function regionClass(type, name) {
    return Store.comparing() ? compareClass(type, name) : statusClass(type, name);
  }
  function compareSub(type, name) {
    const s = Store.compareStatus(type, name);
    const cmp = Store.comparing();
    return s === "both" ? "both have been here"
      : s === "a" ? `only ${cmp.a}`
      : s === "b" ? `only ${cmp.b}`
      : "neither yet";
  }

  function recolor() {
    const cmp = Store.comparing();
    countryPaths.attr("class", (d) => {
      const n = countryName(d);
      // In All view the states layer carries the US's color; painting the
      // country polygon too bleeds through lake cutouts and coastline
      // fringes the state shapes don't exactly cover.
      const cls = viewMode === "parks" || viewMode === "landmarks" ? "status-none"
        : viewMode === "all" && n === "United States of America" ? "status-none"
        : regionClass("countries", n);
      return "country " + cls;
    });
    // States: colored in All view, outline-only in Parks view, hidden in
    // Countries and Wonders views.
    statePaths
      .attr("display", viewMode === "all" || viewMode === "parks" ? null : "none")
      .attr("class", (d) => "state " +
        (viewMode === "all" ? regionClass("states", d.properties.name) : "status-none"));
    parkPins.attr("class", (d) => "park " +
      (cmp ? compareClass("parks", d.name) : "st-" + (Store.get("parks", d.name) || "none")));
    landmarkPins.attr("class", (d) => "park landmark " +
      (cmp ? compareClass("landmarks", d.name) : "st-" + (Store.get("landmarks", d.name) || "none")));

    // The compare legend (with its title + exit button) replaces the
    // default legend while comparing.
    document.getElementById("legend-default").style.display = cmp ? "none" : "grid";
    document.getElementById("legend-compare").style.display = cmp ? "grid" : "none";
    if (cmp) {
      document.getElementById("compare-name").textContent = `${cmp.a} vs ${cmp.b}`;
      document.getElementById("legend-a-name").textContent = cmp.a;
      document.getElementById("legend-b-name").textContent = cmp.b;
      // Tallies for whatever the current view is showing.
      const cc = Store.compareCounts();
      const cat = viewMode === "parks" ? cc.parks
        : viewMode === "landmarks" ? cc.landmarks : cc.countries;
      document.getElementById("cmp-count-both").textContent = cat.both;
      document.getElementById("cmp-count-a").textContent = cat.a;
      document.getElementById("cmp-count-b").textContent = cat.b;
      document.getElementById("cmp-unit").textContent =
        viewMode === "parks" ? "counting national parks"
        : viewMode === "landmarks" ? "counting wonders"
        : `counting countries · states: ${cc.states.both} both, ${cc.states.a} / ${cc.states.b} only`;
    }
    svg.classed("parks-mode", viewMode === "parks");
    svg.classed("wonders-mode", viewMode === "landmarks");
    updateStats();
  }

  function updateStats() {
    const c = Store.counts();
    document.getElementById("stats").innerHTML =
      `<span>🌍 <b>${c.countries}</b>/${c.countriesTotal} countries` +
      (c.territories ? ` <i>+${c.territories} terr.</i>` : "") + `</span>` +
      `<span>🇺🇸 <b>${c.states}</b>/${c.statesTotal} states</span>` +
      `<span>🏞️ <b>${c.parks}</b>/${c.parksTotal} parks</span>` +
      `<span>⭐ <b>${c.landmarks}</b>/${c.landmarksTotal} wonders</span>`;
  }

  // ---- rendering ----
  // Skip-flags: when a layer was hidden last frame and stays hidden, its
  // per-node DOM updates are skipped entirely (big win while spinning the
  // world view on phones).
  let citiesShown = false;
  let parksShown = false;
  let landmarksShown = false;

  function render() {
    svg.selectAll("path.sphere, path.graticule, path.borders, path.coastline").attr("d", path);
    countryPaths.attr("d", path);
    if (viewMode !== "countries") statePaths.attr("d", path);
    lakePaths.attr("d", path);

    const showParks = viewMode === "parks" || (viewMode === "all" && zoomK >= PARK_ZOOM);
    const [cx, cy] = [-projection.rotate()[0], -projection.rotate()[1]];

    const anyCities = viewMode !== "parks" && viewMode !== "landmarks" && zoomK >= CITY_ZOOM[0];
    if (anyCities || citiesShown) {
      cityNodes.attr("display", (d) => {
        if (!anyCities) return "none";
        const minZoom = CITY_ZOOM[d.cap ? Math.min(d.rank, 1) : d.rank];
        if (zoomK < minZoom) return "none";
        return d3.geoDistance([d.lon, d.lat], [cx, cy]) > 1.4 ? "none" : null;
      }).attr("transform", (d) => {
        const p = projection([d.lon, d.lat]);
        return p ? `translate(${p[0]},${p[1]})` : null;
      });
    }
    citiesShown = anyCities;
    if (showParks || parksShown) {
      const pinScale = Math.max(0.5, Math.min(1.1, 0.45 + 0.18 * Math.log2(zoomK)));
      parkPins.attr("display", (d) => {
        if (!showParks) return "none";
        return d3.geoDistance([d.lon, d.lat], [cx, cy]) > 1.45 ? "none" : null;
      }).attr("transform", (d) => {
        const p = projection([d.lon, d.lat]);
        return p ? `translate(${p[0]},${p[1]}) scale(${pinScale})` : null;
      });
      // Labels keep a constant on-screen size despite the pin scaling.
      parkPins.select("text.park-label").attr("transform", `scale(${1 / pinScale})`);
    }
    parksShown = showParks;

    const showLandmarks = viewMode === "landmarks" || (viewMode === "all" && zoomK >= PARK_ZOOM);
    if (showLandmarks || landmarksShown) {
      const pinScale = Math.max(0.5, Math.min(1.1, 0.45 + 0.18 * Math.log2(zoomK)));
      landmarkPins.attr("display", (d) => {
        if (!showLandmarks) return "none";
        return d3.geoDistance([d.lon, d.lat], [cx, cy]) > 1.45 ? "none" : null;
      }).attr("transform", (d) => {
        const p = projection([d.lon, d.lat]);
        return p ? `translate(${p[0]},${p[1]}) scale(${pinScale})` : null;
      });
      landmarkPins.select("text.park-label").attr("transform", `scale(${1 / pinScale})`);
    }
    landmarksShown = showLandmarks;

    // In All view, park/wonder names fade in once you're properly close.
    svg.classed("np-labels", viewMode === "all" && zoomK >= 4);
    document.getElementById("park-hint").style.display =
      viewMode === "all" && !showParks ? "block" : "none";
  }

  // Coalesce drag/zoom events into one render per animation frame.
  let renderQueued = false;
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  // ---- interaction: one unified gesture handler ----
  // Drag (mouse or one finger) rotates; wheel / two-finger pinch zooms.
  // A single d3.zoom owns all gestures — splitting drag and zoom across
  // two handlers breaks pinch on touch screens.
  let dragMoved = false;
  let programmaticZoom = false;
  let lastTransform = d3.zoomIdentity;

  const zoom = d3.zoom()
    .scaleExtent([1, 24])
    .on("start", () => { dragMoved = false; hideTooltip(); })
    .on("zoom", (event) => {
      const t = event.transform;
      if (programmaticZoom) { lastTransform = t; return; }
      if (t.k !== lastTransform.k) {
        // Pinch or wheel: change zoom level.
        zoomK = t.k;
        projection.scale(baseScale() * zoomK);
      } else {
        // Pan: rotate the globe.
        const dx = t.x - lastTransform.x;
        const dy = t.y - lastTransform.y;
        if (Math.abs(dx) + Math.abs(dy) > 1) dragMoved = true;
        const k = 75 / projection.scale();
        const r = projection.rotate();
        projection.rotate([r[0] + dx * k, Math.max(-90, Math.min(90, r[1] - dy * k))]);
      }
      lastTransform = t;
      requestRender();
    });
  svg.call(zoom).on("dblclick.zoom", null);

  // ---- tooltip ----
  function showTooltip(event, name, sub) {
    tooltip.style.display = "block";
    const noteHint = Store.comparing() ? "" : `<div class="tt-status tt-note">✎ right-click to add a note</div>`;
    tooltip.innerHTML = `<div>${name}</div><div class="tt-status">${sub}</div>` + noteHint;
    moveTooltip(event);
  }
  function moveTooltip(event) {
    tooltip.style.left = Math.min(event.clientX + 14, width - 250) + "px";
    tooltip.style.top = event.clientY + 14 + "px";
  }
  function hideTooltip() { tooltip.style.display = "none"; }

  const STATUS_LABEL = {
    lived: "Lived here", visited: "Visited", want: "Want to go ✈️", none: "Not visited yet",
  };
  function regionTooltip(type, name) {
    return `${STATUS_LABEL[Store.get(type, name) || "none"]} · click to change`;
  }

  const countrySub = (n) => {
    if (Store.comparing()) return compareSub("countries", n);
    if (viewMode === "parks" || viewMode === "landmarks") return "switch to All to edit";
    if (n === "United States of America" && viewMode === "all") return "Click your states instead";
    return regionTooltip("countries", n);
  };

  countryPaths
    .on("mousemove", (event, d) => {
      const n = countryName(d);
      showTooltip(event, flagImg("countries", n) + displayName(n), countrySub(n));
    })
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => {
      if (dragMoved || viewMode === "parks" || viewMode === "landmarks") return;
      const n = countryName(d);
      if (n === "United States of America" && viewMode === "all") return; // states handle the US
      Store.cycle("countries", n);
      showTooltip(event, flagImg("countries", n) + displayName(n), countrySub(n));
      showMarkToast("countries", n, flagImg("countries", n) + " " + displayName(n));
    })
    .on("contextmenu", (event, d) => {
      event.preventDefault();
      const n = countryName(d);
      hideTooltip();
      openNoteModal("countries/" + n, displayName(n));
    });

  const stateSub = (n) => Store.comparing() ? compareSub("states", n)
    : viewMode !== "all" ? "parks view — switch to All to edit"
    : regionTooltip("states", n);
  statePaths
    .on("mousemove", (event, d) => showTooltip(event, flagImg("states", d.properties.name) + d.properties.name, stateSub(d.properties.name)))
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => {
      if (dragMoved || viewMode !== "all") return;
      Store.cycle("states", d.properties.name);
      showTooltip(event, flagImg("states", d.properties.name) + d.properties.name, stateSub(d.properties.name));
      showMarkToast("states", d.properties.name, flagImg("states", d.properties.name) + " " + d.properties.name);
    })
    .on("contextmenu", (event, d) => {
      event.preventDefault();
      hideTooltip();
      openNoteModal("states/" + d.properties.name, d.properties.name);
    });

  // ---- park card ----
  const card = document.getElementById("park-card");
  const photoCache = {};

  async function parkPhoto(park) {
    if (photoCache[park.wiki] !== undefined) return photoCache[park.wiki];
    try {
      const res = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(park.wiki));
      const json = await res.json();
      photoCache[park.wiki] = (json.thumbnail && json.thumbnail.source) || null;
    } catch (e) {
      photoCache[park.wiki] = null;
    }
    return photoCache[park.wiki];
  }

  function renderCardButton(item, type) {
    const s = Store.get(type, item.name);
    const cmp = !!Store.comparing();
    const bv = card.querySelector(".toggle-visited");
    const bw = card.querySelector(".toggle-wish");
    bv.disabled = bw.disabled = cmp;
    bv.textContent = s === "visited" ? "✓ Visited" : "Mark as Visited";
    bv.classList.toggle("is-visited", s === "visited" && !cmp);
    bw.textContent = s === "want" ? "✈️ Wished" : "Mark as Wish";
    bw.classList.toggle("is-want", s === "want" && !cmp);
    bv.onclick = () => { Store.set(type, item.name, s === "visited" ? null : "visited"); renderCardButton(item, type); };
    bw.onclick = () => { Store.set(type, item.name, s === "want" ? null : "want"); renderCardButton(item, type); };
  }

  let cardCurrent = null; // {key, label} for the note button

  async function openCard(item, type) {
    const isPark = type === "parks";
    card.classList.add("open");
    const title = isPark ? item.name + " National Park" : item.name;
    card.querySelector("h3").textContent = title;
    card.querySelector(".sub").textContent = isPark ? item.state : item.place;
    cardCurrent = { key: `${type}/${item.name}`, label: title };
    const photo = card.querySelector(".photo");
    photo.style.backgroundImage = "";
    photo.textContent = isPark ? "🏞️" : "⭐";
    renderCardButton(item, type);
    const url = await parkPhoto(item);
    if (url) { photo.style.backgroundImage = `url(${url})`; photo.textContent = ""; }
  }

  document.getElementById("card-note").onclick = () =>
    cardCurrent && openNoteModal(cardCurrent.key, cardCurrent.label);

  // ---- note modal (from/to months + free text) ----
  const noteModal = document.getElementById("note-modal");
  const notePickFrom = myPicker(document.getElementById("gnote-from"));
  const notePickTo = myPicker(document.getElementById("gnote-to"));
  let noteKey = null;

  function openNoteModal(key, label) {
    noteKey = key;
    document.getElementById("note-title").textContent = "Add note · " + label.replace(/<[^>]*>/g, "").trim();
    notePickFrom.clear();
    notePickTo.clear();
    document.getElementById("gnote-text").value = "";
    document.getElementById("gnote-error").textContent = "";
    noteModal.classList.add("open");
  }

  document.getElementById("gnote-save").onclick = () => {
    const from = notePickFrom.value();
    const to = notePickTo.value();
    const text = document.getElementById("gnote-text").value.trim();
    if (!from && !text) {
      document.getElementById("gnote-error").textContent = "Add a date, a note, or both.";
      return;
    }
    Store.addNote(noteKey, from, to, text);
    noteModal.classList.remove("open");
  };
  document.getElementById("note-close").onclick = () => noteModal.classList.remove("open");
  noteModal.addEventListener("click", (e) => { if (e.target === noteModal) noteModal.classList.remove("open"); });

  // ---- "just marked" toast with note shortcut ----
  const toast = document.getElementById("mark-toast");
  let toastTimer = null;
  let toastTarget = null;

  function showMarkToast(type, name, labelHTML) {
    const s = Store.get(type, name);
    if (!s) {
      toast.style.display = "none";
      return;
    }
    toastTarget = { key: `${type}/${name}`, label: labelHTML };
    document.getElementById("toast-label").innerHTML = `${labelHTML} · ${STATUS_LABEL[s]}`;
    toast.style.display = "flex";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = "none"; }, 6000);
  }

  document.getElementById("toast-note").onclick = () => {
    if (toastTarget) openNoteModal(toastTarget.key, toastTarget.label);
    toast.style.display = "none";
  };
  document.getElementById("toast-close").onclick = () => { toast.style.display = "none"; };

  card.querySelector(".close").onclick = () => card.classList.remove("open");

  parkPins
    .on("mousemove", (event, d) => {
      event.stopPropagation();
      const sub = Store.comparing() ? compareSub("parks", d.name)
        : STATUS_LABEL[Store.get("parks", d.name) || "none"] + " · click for details";
      showTooltip(event, d.name + " National Park", sub);
    })
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => {
      if (dragMoved) return;
      event.stopPropagation();
      openCard(d, "parks");
    })
    .on("contextmenu", (event, d) => {
      event.preventDefault();
      hideTooltip();
      openNoteModal("parks/" + d.name, d.name + " National Park");
    });

  landmarkPins
    .on("mousemove", (event, d) => {
      event.stopPropagation();
      const sub = Store.comparing() ? compareSub("landmarks", d.name)
        : STATUS_LABEL[Store.get("landmarks", d.name) || "none"] + " · click for details";
      showTooltip(event, "⭐ " + d.name, sub);
    })
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => {
      if (dragMoved) return;
      event.stopPropagation();
      openCard(d, "landmarks");
    })
    .on("contextmenu", (event, d) => {
      event.preventDefault();
      hideTooltip();
      openNoteModal("landmarks/" + d.name, d.name);
    });

  // ---- view toggle ----
  const segButtons = document.querySelectorAll("#view-toggle button");
  function setViewMode(mode) {
    viewMode = mode;
    segButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    if (mode === "countries") card.classList.remove("open"); // pins are hidden
    recolor();
    render();
  }
  segButtons.forEach((b) => { b.onclick = () => setViewMode(b.dataset.mode); });
  setViewMode("all");

  // ---- overflow menu ----
  const menuBtn = document.getElementById("btn-menu");
  const menu = document.getElementById("menu-dropdown");
  menuBtn.onclick = (e) => { e.stopPropagation(); menu.classList.toggle("open"); };
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target)) menu.classList.remove("open");
  });

  // ---- top bar buttons ----
  document.getElementById("btn-export").onclick = () => Store.exportFile();
  document.getElementById("btn-clear").onclick = () => {
    if (confirm("Discard local edits and go back to the committed data file?")) Store.clearLocal();
  };
  document.getElementById("btn-reset").onclick = () => {
    programmaticZoom = true;
    svg.call(zoom.transform, d3.zoomIdentity);
    programmaticZoom = false;
    lastTransform = d3.zoomIdentity;
    zoomK = 1;
    projection.rotate([95, -38]).scale(baseScale());
    render();
  };

  window.addEventListener("resize", () => {
    width = window.innerWidth;
    height = window.innerHeight;
    svg.attr("width", width).attr("height", height);
    projection.translate([width / 2, height / 2]).scale(baseScale() * zoomK);
    render();
  });

  svg.attr("width", width).attr("height", height);
  Store.onChange(recolor);
  recolor();
  render();
})();
