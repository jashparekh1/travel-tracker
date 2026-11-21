// Interactive globe: drag to rotate, scroll/pinch to zoom.
// Countries + US / Indian states cycle none -> visited -> lived on click.
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
  const PARK_ZOOM = 3; // pins appear past this zoom level in All view

  const [world, usStatesGeo, indiaStatesGeo, lakesGeo, citiesRaw] = await Promise.all([
    d3.json("data/countries-50m.json"),
    d3.json("data/us-states.json"),
    d3.json("data/india-states.json"),
    d3.json("data/lakes-50m.json"),
    d3.json("data/cities.json?v=2"),
  ]);
  // Long straight edges in the map data (e.g. the US/Canada 49th parallel)
  // are stored as just two points. d3 draws great-circle arcs between
  // vertices, so those edges bow away from the parallel, and the state and
  // country layers bow differently, leaving an unfilled wedge along the
  // border. Interpolating every half degree makes every layer follow it.
  function densifyLine(pts, step = 0.5) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      out.push(pts[i]);
      const n = Math.abs(x1 - x0) > 180 ? 1 // antimeridian crossing
        : Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / step);
      for (let j = 1; j < n; j++) out.push([x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function densify(features) {
    for (const f of features) {
      const g = f.geometry;
      if (g.type === "Polygon") g.coordinates = g.coordinates.map((r) => densifyLine(r));
      else if (g.type === "MultiPolygon") g.coordinates = g.coordinates.map((p) => p.map((r) => densifyLine(r)));
    }
    return features;
  }
  // One layer for every clickable subdivision (US states + Indian states/UTs).
  const stateFeatures = densify(usStatesGeo.features.concat(indiaStatesGeo.features));

  // Countries: decode the quantized TopoJSON arcs to plain coordinates,
  // densify them, and drop the transform so topojson reads the arcs as-is
  // (polygons and border meshes all share these arcs).
  (function densifyTopology(topo) {
    const [sx, sy] = topo.transform.scale;
    const [tx, ty] = topo.transform.translate;
    topo.arcs = topo.arcs.map((arc) => {
      let x = 0, y = 0;
      return densifyLine(arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }));
    });
    delete topo.transform;
  })(world);
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
    .data(stateFeatures).join("path")
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
  const CITY_ZOOM = [1.5, 2.2, 3.2, 4.5]; // min zoom per rank 0..3
  const cityNodes = citiesLayer.selectAll("g")
    .data(cities).join("g")
    .attr("class", (d) => "city" + (d.cap ? " capital" : ""));
  cityNodes.append("circle").attr("r", (d) => (d.rank <= 1 ? 2.5 : 2));
  cityNodes.append("text").attr("x", 5).attr("y", 3).text((d) => d.name);
  // Declutter priority: capitals count as rank <= 1, then by rank.
  const cityPriority = (d) => (d.cap ? Math.min(d.rank, 1) : d.rank);
  const citiesByRank = cities.slice().sort((a, b) => cityPriority(a) - cityPriority(b) || b.cap - a.cap);

  // Every pin (parks, wonders, my places) is the 📍 emoji, nudged so its
  // needle tip sits on the spot; CSS hue-shifts it per status.
  const appendPin = (sel) => sel.append("text").attr("class", "pin-emoji")
    .attr("text-anchor", "middle").attr("y", -1).text("📍");

  const parksLayer = svg.append("g");
  const parkPins = parksLayer.selectAll("g")
    .data(window.PARKS).join("g")
    .attr("class", "park");
  appendPin(parkPins);
  parkPins.append("text").attr("class", "park-label")
    .attr("text-anchor", "middle").text((d) => d.name);

  // World wonders & landmarks: same pin mechanics, own view.
  const landmarksLayer = svg.append("g");
  const landmarkPins = landmarksLayer.selectAll("g")
    .data(window.LANDMARKS).join("g")
    .attr("class", "park landmark");
  appendPin(landmarkPins);
  landmarkPins.append("text").attr("class", "park-label")
    .attr("text-anchor", "middle").text((d) => d.name);

  // My places (searched cities / regions): same pin. The data
  // join is redone on every store change (see syncPlacePins).
  const placesLayer = svg.append("g").attr("class", "places");
  let placeMarkers = placesLayer.selectAll("g.place-pin");

  // Pin groups: pins too close to tell apart on screen merge into one
  // count bubble until you zoom in. Drawn above the pins.
  const groupsLayer = svg.append("g").attr("class", "pin-groups");
  const GROUP_PX = 18;          // pins closer than this (screen px) merge
  const GROUP_MAX_ZOOM = 9;     // past this, always show individual pins

  // Label widths for the declutter pass, measured once per name.
  const measureCtx = document.createElement("canvas").getContext("2d");
  const fontFamily = getComputedStyle(document.body).fontFamily;
  const PIN_FONT = `600 10.5px ${fontFamily}`;
  measureCtx.font = PIN_FONT;
  window.PARKS.concat(window.LANDMARKS).forEach((d) => { d._w = measureCtx.measureText(d.name).width; });
  cities.forEach((d) => {
    measureCtx.font = d.cap ? `700 10.5px ${fontFamily}` : `500 10px ${fontFamily}`;
    d._w = measureCtx.measureText(d.name).width;
  });

  // Some polygons (e.g. Siachen Glacier) track as part of another country.
  const countryName = (d) => window.MERGED_INTO[d.properties.name] || d.properties.name;

  // View mode: "all" (countries + states + pins), "countries", "states"
  // (US + Indian states only), "parks", or "landmarks". Always opens in "all".
  let viewMode = "all";
  // Map mode: "countries" (fills + place pins on top) or "places" (pins
  // only; been-but-no-places regions drawn faintly).
  let mapMode = "countries";
  const STATE_COUNTRY = {};
  for (const [c, subs] of Object.entries(window.SUBDIVIDED)) for (const n of subs) STATE_COUNTRY[n] = c;
  const BEEN = (s) => s === "visited" || s === "lived";
  // Pin status for any visible pin (places carry their own).
  const pinStatus = (type, d) => (type === "places" ? d.status : Store.get(type, d.name));

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

  // Places mode: a region you've been to shows faintly until it has
  // places of its own, so the map never looks emptier than your travels.
  function faintClass(type, name) {
    if (!BEEN(Store.get(type, name))) return "status-none";
    const key = type === "countries" ? "country" : "state";
    return Store.places().some((p) => p[key] === name) ? "status-none" : "status-faint";
  }

  function syncPlacePins() {
    measureCtx.font = PIN_FONT;
    placeMarkers = placesLayer.selectAll("g.place-pin")
      .data(Store.places(), (d) => d.id)
      .join((enter) => {
        const g = enter.append("g");
        appendPin(g);
        g.append("text").attr("class", "park-label").attr("text-anchor", "middle");
        g.on("mousemove", (event, d) => {
          event.stopPropagation();
          const where = [d.state, d.country && displayName(d.country)].filter(Boolean).join(", ");
          showTooltip(event, "📍 " + d.name,
            `${Places.STATUS_WORD[d.status]} · ${where || Places.kindLabel(d.kind)} · click for details`);
        })
          .on("mouseout", hideTooltip)
          .on("click", (event, d) => {
            if (dragMoved) return;
            event.stopPropagation();
            hideTooltip();
            openPanel(d.country, d.id);
          })
          .on("contextmenu", (event, d) => {
            event.preventDefault();
            hideTooltip();
            openNoteModal("places/" + d.id, d.name);
          });
        return g;
      })
      .attr("class", (d) => "park place-pin st-" + d.status)
      .each((d) => { d._w = measureCtx.measureText(d.name).width; });
    placeMarkers.select("text.park-label").text((d) => d.name);
  }

  function recolor() {
    const cmp = Store.comparing();
    const placesMode = mapMode === "places" && !cmp;
    document.body.classList.toggle("places-mode", placesMode);
    countryPaths.attr("class", (d) => {
      const n = countryName(d);
      if (placesMode) return "country " + (window.SUBDIVIDED[n] ? "status-none" : faintClass("countries", n));
      // In All view the states layer carries the color of subdivided
      // countries (US, India); painting the country polygon too bleeds
      // through lake cutouts and coastline fringes the state shapes don't
      // exactly cover.
      const cls = viewMode === "parks" || viewMode === "landmarks" || viewMode === "states" ? "status-none"
        : viewMode === "all" && window.SUBDIVIDED[n] ? "status-none"
        : regionClass("countries", n);
      return "country " + cls;
    });
    // States: colored in All and States views, outline-only in Parks view,
    // hidden in Countries and Wonders views.
    const statesEditable = viewMode === "all" || viewMode === "states";
    statePaths
      .attr("display", placesMode || statesEditable || viewMode === "parks" ? null : "none")
      .attr("class", (d) => "state " +
        (placesMode ? faintClass("states", d.properties.name)
          : statesEditable ? regionClass("states", d.properties.name) : "status-none"));
    syncPlacePins();
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
      const statesCat = {
        both: cc.states.both + cc.indiaStates.both,
        a: cc.states.a + cc.indiaStates.a,
        b: cc.states.b + cc.indiaStates.b,
      };
      const shown = viewMode === "states" ? statesCat : cat;
      document.getElementById("cmp-count-both").textContent = shown.both;
      document.getElementById("cmp-count-a").textContent = shown.a;
      document.getElementById("cmp-count-b").textContent = shown.b;
      document.getElementById("cmp-unit").textContent =
        viewMode === "parks" ? "counting national parks"
        : viewMode === "landmarks" ? "counting wonders"
        : viewMode === "states" ? `counting states · US: ${cc.states.both} both, ${cc.states.a} / ${cc.states.b} only` +
          ` · India: ${cc.indiaStates.both} both, ${cc.indiaStates.a} / ${cc.indiaStates.b} only`
        : `counting countries · US states: ${cc.states.both} both, ${cc.states.a} / ${cc.states.b} only` +
          ` · India: ${cc.indiaStates.both} both, ${cc.indiaStates.a} / ${cc.indiaStates.b} only`;
    }
    updateStats();
    if (panelCountry !== undefined) renderPanel();
    requestRender();
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
    const placesMode = mapMode === "places" && !Store.comparing();
    if (viewMode !== "countries" || placesMode) statePaths.attr("d", path);
    lakePaths.attr("d", path);

    const [cx, cy] = [-projection.rotate()[0], -projection.rotate()[1]];
    const pinScale = Math.max(0.5, Math.min(1.1, 0.45 + 0.18 * Math.log2(zoomK)));

    // Declutter: screen boxes claimed so far this frame. Pins claim first,
    // then pin names (your visited / wish-list ones win ties), then city
    // labels by importance; anything that would overlap is hidden, so more
    // names appear as you zoom in and things spread apart.
    const taken = [];
    const claim = (b) => {
      for (const t of taken) if (b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]) return false;
      taken.push(b);
      return true;
    };

    // Places mode shows only the parks / wonders you've marked, at any zoom.
    const showParks = placesMode || viewMode === "parks" || (viewMode === "all" && zoomK >= PARK_ZOOM);
    const showLandmarks = placesMode || viewMode === "landmarks" || (viewMode === "all" && zoomK >= PARK_ZOOM);
    const showPlaces = !Store.comparing() && (placesMode || viewMode === "all" || viewMode === "countries" || viewMode === "states");
    const visiblePins = [];
    function placePins(pins, type, show, wasShown) {
      if (!show && !wasShown) return;
      const onlyMine = placesMode && type !== "places";
      pins.each(function (d) {
        const ok = show && (!onlyMine || pinStatus(type, d)) && d3.geoDistance([d.lon, d.lat], [cx, cy]) <= 1.45;
        d._p = ok ? projection([d.lon, d.lat]) : null;
        if (d._p) visiblePins.push({ d, type, node: this, label: this.querySelector("text.park-label") });
      });
      pins.attr("display", (d) => (d._p ? null : "none"))
        .attr("transform", (d) => (d._p ? `translate(${d._p[0]},${d._p[1]}) scale(${pinScale})` : null));
    }
    placePins(parkPins, "parks", showParks, parksShown);
    placePins(landmarkPins, "landmarks", showLandmarks, landmarksShown);
    placePins(placeMarkers, "places", showPlaces, true);
    parksShown = showParks;
    landmarksShown = showLandmarks;

    // Group pins that would overlap. Your marked places seed groups first
    // so a group sits where your visited pin is.
    const mine = (v) => (pinStatus(v.type, v.d) ? 0 : 1);
    visiblePins.sort((a, b) => mine(a) - mine(b));
    const groups = [];
    for (const v of visiblePins) {
      const [x, y] = v.d._p;
      const g = zoomK < GROUP_MAX_ZOOM &&
        groups.find((g) => Math.hypot(g.x - x, g.y - y) < GROUP_PX);
      if (g) g.members.push(v);
      else groups.push({ x, y, members: [v] });
    }
    const singles = [];
    const multi = [];
    for (const g of groups) {
      if (g.members.length === 1) { singles.push(g.members[0]); continue; }
      for (const m of g.members) m.node.setAttribute("display", "none");
      g.x = d3.mean(g.members, (m) => m.d._p[0]);
      g.y = d3.mean(g.members, (m) => m.d._p[1]);
      g.r = 9 + Math.min(6, Math.sqrt(g.members.length) * 1.6);
      // Name the group when every pin shares a state / place ("Utah · 5").
      const regions = new Set(g.members.map((m) =>
        m.type === "places" ? m.d.country && displayName(m.d.country) : m.d.state || m.d.place));
      g.region = regions.size === 1 ? [...regions][0] : "";
      // Red only when you've been to one of them; wishlist pins don't count.
      g.visited = g.members.some((m) => BEEN(pinStatus(m.type, m.d)));
      multi.push(g);
    }

    // Pins and bubbles claim their space first, then names.
    for (const { d } of singles) {
      const [x, y] = d._p;
      taken.push([x - 9 * pinScale, y - 25 * pinScale, x + 9 * pinScale, y]);
    }
    for (const g of multi) taken.push([g.x - g.r, g.y - g.r, g.x + g.r, g.y + g.r]);

    const groupNodes = groupsLayer.selectAll("g.pin-group").data(multi).join((enter) => {
      const e = enter.append("g").attr("class", "pin-group");
      e.append("circle");
      e.append("text").attr("class", "pin-group-count").attr("text-anchor", "middle").attr("dy", "0.35em");
      e.append("text").attr("class", "park-label").attr("text-anchor", "middle");
      return e;
    });
    groupNodes
      .classed("has-visited", (g) => g.visited)
      .attr("transform", (g) => `translate(${g.x},${g.y})`);
    groupNodes.select("circle").attr("r", (g) => g.r);
    groupNodes.select(".pin-group-count").text((g) => g.members.length);
    measureCtx.font = PIN_FONT;
    groupNodes.select(".park-label").each(function (g) {
      const text = g.region && `${g.region} · ${g.members.length}`;
      const w = text ? measureCtx.measureText(text).width / 2 + 2 : 0;
      const ok = text && claim([g.x - w, g.y - g.r - 15, g.x + w, g.y - g.r - 2]);
      this.textContent = text;
      this.setAttribute("y", -g.r - 5);
      this.style.display = ok ? "block" : "none";
    });

    // Names sit centered just above the pin head, at a constant on-screen
    // size despite the pin scaling. If that spot is taken (e.g. Kings Canyon
    // right above Sequoia), the name drops just below the pin tip instead.
    const labelY = -(25 * pinScale + 4);
    const LABEL_BELOW_Y = 13;
    for (const v of singles) {
      const [x, y] = v.d._p;
      const hw = v.d._w / 2 + 2;
      const ly = claim([x - hw, y + labelY - 10, x + hw, y + labelY + 3]) ? labelY
        : claim([x - hw, y + 2, x + hw, y + LABEL_BELOW_Y + 3]) ? LABEL_BELOW_Y
        : null;
      v.label.style.display = ly !== null ? "block" : "none";
      if (ly !== null) {
        v.label.setAttribute("y", ly);
        v.label.setAttribute("transform", `scale(${1 / pinScale})`);
      }
    }

    const anyCities = viewMode !== "parks" && viewMode !== "landmarks" && zoomK >= CITY_ZOOM[0];
    if (anyCities || citiesShown) {
      for (const d of citiesByRank) {
        d._p = null;
        if (!anyCities || zoomK < CITY_ZOOM[cityPriority(d)]) continue;
        if (d3.geoDistance([d.lon, d.lat], [cx, cy]) > 1.4) continue;
        const p = projection([d.lon, d.lat]);
        if (p && claim([p[0] - 3, p[1] - 8, p[0] + 7 + d._w, p[1] + 5])) d._p = p;
      }
      cityNodes.attr("display", (d) => (d._p ? null : "none"))
        .attr("transform", (d) => (d._p ? `translate(${d._p[0]},${d._p[1]})` : null));
    }
    citiesShown = anyCities;

    document.getElementById("park-hint").style.display =
      viewMode === "all" && !showParks && !placesMode ? "block" : "none";
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
    if (mapMode === "places") return placesSub("country", n);
    if (viewMode === "parks" || viewMode === "landmarks" || viewMode === "states") return "switch to All to edit";
    if (window.SUBDIVIDED[n] && viewMode === "all") return "Click your states instead";
    return `${STATUS_LABEL[Store.get("countries", n) || "none"]} · click for places`;
  };
  // "Paris, Nice · click for places": what's pinned inside a region.
  function placesSub(key, name) {
    const mine = Store.places().filter((p) => p[key] === name);
    const list = mine.slice(0, 4).map((p) => p.name).join(", ") + (mine.length > 4 ? ` +${mine.length - 4}` : "");
    return (list || "No places yet") + " · click for places";
  }

  countryPaths
    .on("mousemove", (event, d) => {
      const n = countryName(d);
      showTooltip(event, flagImg("countries", n) + displayName(n), countrySub(n));
    })
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => {
      if (dragMoved || Store.comparing()) return;
      const n = countryName(d);
      if (mapMode !== "places") {
        if (viewMode === "parks" || viewMode === "landmarks" || viewMode === "states") return;
        if (window.SUBDIVIDED[n] && viewMode === "all") return; // states handle it
      }
      hideTooltip();
      openPanel(n);
    })
    .on("contextmenu", (event, d) => {
      event.preventDefault();
      const n = countryName(d);
      hideTooltip();
      openNoteModal("countries/" + n, displayName(n));
    });

  const stateSub = (n) => Store.comparing() ? compareSub("states", n)
    : mapMode === "places" ? placesSub("state", n)
    : viewMode !== "all" && viewMode !== "states" ? "parks view — switch to All to edit"
    : regionTooltip("states", n);
  statePaths
    .on("mousemove", (event, d) => showTooltip(event, flagImg("states", d.properties.name) + d.properties.name, stateSub(d.properties.name)))
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => {
      if (dragMoved) return;
      if (mapMode === "places" && !Store.comparing()) {
        hideTooltip();
        openPanel(STATE_COUNTRY[d.properties.name]);
        return;
      }
      if (viewMode !== "all" && viewMode !== "states") return;
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
    closePanel();
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

  // Pin groups: hover lists what's inside, click flies in until it splits.
  groupsLayer
    .on("mousemove", (event) => {
      const g = d3.select(event.target.closest("g.pin-group")).datum();
      if (!g) return;
      const names = g.members.map((m) => ({ parks: "🏞️ ", landmarks: "⭐ ", places: "📍 " })[m.type] + m.d.name);
      const list = names.slice(0, 8).join("<br>") +
        (names.length > 8 ? `<br>+${names.length - 8} more` : "");
      tooltip.style.display = "block";
      tooltip.innerHTML = `<div>${g.region || "Nearby places"} · ${g.members.length}</div>` +
        `<div class="tt-status">${list}</div><div class="tt-status tt-note">click to zoom in</div>`;
      moveTooltip(event);
    })
    .on("mouseout", hideTooltip)
    .on("click", (event) => {
      if (dragMoved) return;
      event.stopPropagation();
      const g = d3.select(event.target.closest("g.pin-group")).datum();
      if (!g) return;
      hideTooltip();
      // Fly to the group's center; zoom far enough that its pins spread
      // past the grouping distance (spread scales linearly with zoom).
      const center = projection.invert([g.x, g.y]);
      const spread = d3.max(g.members, (m) => Math.hypot(m.d._p[0] - g.x, m.d._p[1] - g.y)) || 1;
      const k = Math.min(GROUP_MAX_ZOOM, Math.max(zoomK * 2, zoomK * (GROUP_PX * 1.6) / spread));
      flyTo(center, k);
    });

  function setZoom(k) {
    zoomK = k;
    projection.scale(baseScale() * k);
    programmaticZoom = true;
    svg.call(zoom.transform, d3.zoomIdentity.scale(k));
    programmaticZoom = false;
  }

  function flyTo([lon, lat], k) {
    const r0 = projection.rotate();
    let lon1 = -lon;
    while (lon1 - r0[0] > 180) lon1 -= 360;
    while (lon1 - r0[0] < -180) lon1 += 360;
    const rot = d3.interpolate([r0[0], r0[1]], [lon1, -lat]);
    const k0 = zoomK;
    const start = performance.now();
    (function step(now) {
      const t = d3.easeCubicInOut(Math.min(1, (now - start) / 650));
      projection.rotate(rot(t));
      setZoom(k0 * Math.pow(k / k0, t));
      render();
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  // ---- place panel ----
  // One panel for a country (its status, its places, search inside it) or,
  // with country = null, a worldwide "add a place" search.
  const panel = document.getElementById("place-panel");
  const ppSearch = document.getElementById("pp-search");
  const ppResults = document.getElementById("pp-results");
  let panelCountry; // undefined = closed, null = worldwide, else a country name
  let panelHighlight = null;
  let searchHits = [];
  let searching = false;
  let searchTimer = null;

  const STATUS_ORDER = ["visited", "lived", "want"];
  const CHIP_WORDS = { visited: "Been", lived: "Lived", want: "Wish" };
  const ADD_WORDS = { visited: "+ Been", lived: "+ Lived", want: "+ Wish" };

  function openPanel(country, highlightId) {
    card.classList.remove("open");
    const changed = panelCountry !== (country || null);
    panelCountry = country || null;
    panelHighlight = highlightId || null;
    if (changed) {
      ppSearch.value = "";
      searchHits = [];
    }
    ppSearch.placeholder = panelCountry
      ? `Add a place in ${displayName(panelCountry)}…`
      : "Search any city, region or island…";
    panel.classList.add("open");
    renderPanel();
    if (!panelCountry) ppSearch.focus();
  }

  function closePanel() {
    panel.classList.remove("open");
    panelCountry = undefined;
  }
  document.getElementById("pp-close").onclick = closePanel;

  // Been / Lived / Wish chips; clicking the active one clears it.
  function statusButtons(current, onPick, words) {
    const wrap = document.createElement("div");
    wrap.className = "pp-chips";
    for (const s of STATUS_ORDER) {
      const b = document.createElement("button");
      b.className = "pp-chip st-" + s + (current === s ? " active" : "");
      b.textContent = current === s ? CHIP_WORDS[s] : words[s];
      b.onclick = (e) => { e.stopPropagation(); onPick(current === s ? null : s); };
      wrap.appendChild(b);
    }
    return wrap;
  }

  function noteButton(key, label) {
    const b = document.createElement("button");
    b.className = "pp-icon";
    b.title = "Add a note";
    b.textContent = "✎";
    b.onclick = () => openNoteModal(key, label);
    return b;
  }

  function placeRow(place, words, onPick, onName) {
    const row = document.createElement("div");
    row.className = "pp-row";
    row.innerHTML = `<span class="pp-dot st-${place.status || "none"}"></span><div class="pp-name"><b></b><span></span></div>`;
    row.querySelector("b").textContent = place.name;
    row.querySelector(".pp-name span").textContent = place.sub;
    row.querySelector(".pp-name").onclick = onName;
    row.appendChild(statusButtons(place.status, onPick, words));
    return row;
  }

  function renderPanel() {
    if (panelCountry === undefined) return;
    const c = panelCountry;
    const title = document.getElementById("pp-title");
    const sub = document.getElementById("pp-sub");
    const statusRow = document.getElementById("pp-status");
    const listLabel = document.getElementById("pp-list-label");
    const list = document.getElementById("pp-list");
    statusRow.innerHTML = "";
    list.innerHTML = "";

    if (!c) {
      title.textContent = "📍 Add a place";
      sub.textContent = "Cities, regions, islands, anywhere. Marking a place as been fills in its country.";
      statusRow.style.display = "none";
      listLabel.style.display = "none";
      renderResults();
      return;
    }

    const mine = Store.places().filter((p) => p.country === c);
    title.innerHTML = `${flagImg("countries", c)} ${displayName(c)}`;
    const been = mine.filter((p) => BEEN(p.status)).length;
    const wish = mine.filter((p) => p.status === "want").length;
    sub.textContent = mine.length ? `${been} been · ${wish} wish` : "No places yet. Search below to add some.";

    statusRow.style.display = "";
    if (window.SUBDIVIDED[c]) {
      statusRow.innerHTML = `<div class="pp-note">Colored by your states and places. Click states on the map to change them.</div>`;
    } else {
      const label = document.createElement("span");
      label.className = "pp-label inline";
      label.textContent = "Country";
      statusRow.appendChild(label);
      statusRow.appendChild(statusButtons(Store.get("countries", c),
        (s) => Store.set("countries", c, s), CHIP_WORDS));
      statusRow.appendChild(noteButton("countries/" + c, displayName(c)));
    }

    // My places here: been / lived first, then wishes, alphabetical.
    listLabel.style.display = mine.length ? "" : "none";
    const rank = (p) => (p.status === "want" ? 1 : 0);
    mine.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    for (const p of mine) {
      const row = placeRow(
        { ...p, sub: [Places.kindLabel(p.kind), p.state].filter(Boolean).join(" · ") },
        CHIP_WORDS,
        (s) => Store.setPlaceStatus(p.id, s),
        () => flyTo([p.lon, p.lat], Math.max(zoomK, 6)),
      );
      row.appendChild(noteButton("places/" + p.id, p.name));
      if (p.id === panelHighlight) row.classList.add("highlight");
      list.appendChild(row);
    }
    const hl = list.querySelector(".highlight");
    if (hl) hl.scrollIntoView({ block: "nearest" });
    renderResults();
  }

  function renderResults() {
    ppResults.innerHTML = "";
    if (ppSearch.value.trim().length < 2) return;
    if (!searchHits.length) {
      ppResults.innerHTML = `<div class="pp-empty">${searching ? "Searching…"
        : "No matches" + (panelCountry ? ` in ${displayName(panelCountry)}` : "") + "."}</div>`;
      return;
    }
    const mineById = {};
    Store.places().forEach((p) => { mineById[p.id] = p; });
    for (const hit of searchHits) {
      const have = mineById[hit.id];
      const where = [!panelCountry && hit.country && displayName(hit.country), hit.state].filter(Boolean).join(", ");
      ppResults.appendChild(placeRow(
        { name: hit.name, status: have && have.status, sub: [Places.kindLabel(hit.kind), where].filter(Boolean).join(" · ") },
        ADD_WORDS,
        (s) => {
          const { id, ...place } = hit;
          Store.setPlace(id, s ? { ...place, status: s } : null);
          if (s) flyTo([hit.lon, hit.lat], Math.max(zoomK, 4));
        },
        () => flyTo([hit.lon, hit.lat], Math.max(zoomK, 5)),
      ));
    }
  }

  ppSearch.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = ppSearch.value.trim();
    searchHits = [];
    searching = q.length >= 2;
    renderResults();
    if (!searching) return;
    searchTimer = setTimeout(async () => {
      const r = projection.rotate();
      const hits = await Places.search(q, { country: panelCountry, near: [-r[0], -r[1]] });
      if (hits === null || ppSearch.value.trim() !== q) return; // a newer search took over
      searching = false;
      searchHits = hits;
      renderResults();
    }, 250);
  });

  document.getElementById("btn-add-place").onclick = () => openPanel(null);

  // ---- map mode (countries / places) ----
  const mapButtons = document.querySelectorAll("#map-mode button");
  function setMapMode(mode) {
    mapMode = mode;
    mapButtons.forEach((b) => b.classList.toggle("active", b.dataset.map === mode));
    recolor();
    render();
  }
  mapButtons.forEach((b) => { b.onclick = () => setMapMode(b.dataset.map); });

  // ---- view toggle ----
  const segButtons = document.querySelectorAll("#view-toggle button");
  function setViewMode(mode) {
    viewMode = mode;
    segButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    if (mode === "countries" || mode === "states") card.classList.remove("open"); // pins are hidden
    if (mode === "parks" || mode === "landmarks") closePanel();
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
    setZoom(1);
    projection.rotate([95, -38]);
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
