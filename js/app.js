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
  const PARK_ZOOM = 1.5; // pins appear past this zoom level

  const [world, statesGeo] = await Promise.all([
    d3.json("data/countries-50m.json"),
    d3.json("data/us-states.json"),
  ]);
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
  const mergedPair = (a, b) =>
    window.MERGED_INTO[a.properties.name] === b.properties.name ||
    window.MERGED_INTO[b.properties.name] === a.properties.name;
  svg.append("path").attr("class", "borders")
    .datum(topojson.mesh(world, world.objects.countries, (a, b) => a !== b && !mergedPair(a, b)))
    .attr("fill", "none").attr("stroke", "#8fa3c7")
    .attr("stroke-width", 0.6).attr("stroke-opacity", 0.55)
    .attr("pointer-events", "none");
  svg.append("path").attr("class", "coastline")
    .datum(topojson.mesh(world, world.objects.countries, (a, b) => a === b))
    .attr("fill", "none").attr("stroke", "#a9bcdd")
    .attr("stroke-width", 0.9).attr("stroke-opacity", 0.9)
    .attr("pointer-events", "none");

  const parksLayer = svg.append("g");
  const PIN = "M0,0 C-5,-8 -9,-11 -9,-16 a9,9 0 1,1 18,0 C9,-11 5,-8 0,0 Z";
  const parkPins = parksLayer.selectAll("g")
    .data(window.PARKS).join("g")
    .attr("class", "park");
  parkPins.append("path").attr("class", "pin-body").attr("d", PIN);
  parkPins.append("circle").attr("cy", -16).attr("r", 3).attr("fill", "#0b1020");

  // Some polygons (e.g. Siachen Glacier) track as part of another country.
  const countryName = (d) => window.MERGED_INTO[d.properties.name] || d.properties.name;

  // ---- coloring ----
  function statusClass(type, name) {
    return "status-" + (Store.get(type, name) || "none");
  }

  function recolor() {
    countryPaths.attr("class", (d) => "country " + statusClass("countries", countryName(d)));
    statePaths.attr("class", (d) => "state " + statusClass("states", d.properties.name));
    parkPins.attr("class", (d) => "park" + (Store.get("parks", d.name) ? " visited" : ""));
    updateStats();
  }

  function updateStats() {
    const c = Store.counts();
    document.getElementById("stats").innerHTML =
      `<span>🌍 <b>${c.countries}</b>/${c.countriesTotal} countries` +
      (c.territories ? ` <i>+${c.territories} terr.</i>` : "") + `</span>` +
      `<span>🇺🇸 <b>${c.states}</b>/${c.statesTotal} states</span>` +
      `<span>🏞️ <b>${c.parks}</b>/${c.parksTotal} parks</span>`;
  }

  // ---- rendering ----
  function render() {
    svg.selectAll("path.sphere, path.graticule, path.borders, path.coastline").attr("d", path);
    countryPaths.attr("d", path);
    statePaths.attr("d", path);

    const showParks = zoomK >= PARK_ZOOM;
    const [cx, cy] = [-projection.rotate()[0], -projection.rotate()[1]];
    const pinScale = Math.min(1.6, 0.85 + 0.25 * Math.log2(zoomK));
    parkPins.attr("display", (d) => {
      if (!showParks) return "none";
      return d3.geoDistance([d.lon, d.lat], [cx, cy]) > 1.45 ? "none" : null;
    }).attr("transform", (d) => {
      const p = projection([d.lon, d.lat]);
      return p ? `translate(${p[0]},${p[1]}) scale(${pinScale})` : null;
    });
    document.getElementById("park-hint").style.display = showParks ? "none" : "block";
  }

  // ---- interaction: rotate (drag) + zoom (wheel/pinch) ----
  let dragMoved = false;
  svg.call(d3.drag()
    .on("start", () => { dragMoved = false; hideTooltip(); })
    .on("drag", (event) => {
      if (Math.abs(event.dx) + Math.abs(event.dy) > 0) dragMoved = true;
      const k = 75 / projection.scale();
      const r = projection.rotate();
      projection.rotate([r[0] + event.dx * k, Math.max(-90, Math.min(90, r[1] - event.dy * k))]);
      render();
    }));

  const zoom = d3.zoom()
    .scaleExtent([1, 24])
    .filter((event) => event.type === "wheel" || event.type === "dblclick" || (event.touches && event.touches.length > 1))
    .on("zoom", (event) => {
      zoomK = event.transform.k;
      projection.scale(baseScale() * zoomK);
      render();
    });
  svg.call(zoom);

  // ---- tooltip ----
  function showTooltip(event, name, sub) {
    tooltip.style.display = "block";
    tooltip.innerHTML = `<div>${name}</div><div class="tt-status">${sub}</div>`;
    moveTooltip(event);
  }
  function moveTooltip(event) {
    tooltip.style.left = Math.min(event.clientX + 14, width - 250) + "px";
    tooltip.style.top = event.clientY + 14 + "px";
  }
  function hideTooltip() { tooltip.style.display = "none"; }

  function regionTooltip(type, name) {
    const s = Store.get(type, name);
    const label = s === "lived" ? "Lived here" : s === "visited" ? "Visited" : "Not visited yet";
    return `${label} · click to change`;
  }

  countryPaths
    .on("mousemove", (event, d) => {
      const n = countryName(d);
      showTooltip(event, flagImg("countries", n) + displayName(n),
        n === "United States of America" ? "Click your states instead" : regionTooltip("countries", n));
    })
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => {
      if (dragMoved) return;
      const n = countryName(d);
      if (n === "United States of America") return; // states handle the US
      Store.cycle("countries", n);
      showTooltip(event, flagImg("countries", n) + displayName(n), regionTooltip("countries", n));
    });

  statePaths
    .on("mousemove", (event, d) => showTooltip(event, flagImg("states", d.properties.name) + d.properties.name, regionTooltip("states", d.properties.name)))
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => {
      if (dragMoved) return;
      Store.cycle("states", d.properties.name);
      showTooltip(event, flagImg("states", d.properties.name) + d.properties.name, regionTooltip("states", d.properties.name));
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

  function renderCardButton(park) {
    const btn = card.querySelector(".toggle-visited");
    const visited = !!Store.get("parks", park.name);
    btn.textContent = visited ? "✓ Visited" : "Mark as visited";
    btn.classList.toggle("is-visited", visited);
    btn.onclick = () => { Store.cycle("parks", park.name); renderCardButton(park); };
  }

  async function openParkCard(park) {
    card.classList.add("open");
    card.querySelector("h3").textContent = park.name + " National Park";
    card.querySelector(".sub").textContent = park.state;
    card.querySelector("a.wiki-link").href = "https://en.wikipedia.org/wiki/" + encodeURIComponent(park.wiki.replaceAll(" ", "_"));
    const photo = card.querySelector(".photo");
    photo.style.backgroundImage = "";
    photo.textContent = "🏞️";
    renderCardButton(park);
    const url = await parkPhoto(park);
    if (url) { photo.style.backgroundImage = `url(${url})`; photo.textContent = ""; }
  }

  card.querySelector(".close").onclick = () => card.classList.remove("open");

  parkPins
    .on("mousemove", (event, d) => {
      event.stopPropagation();
      showTooltip(event, d.name + " National Park", (Store.get("parks", d.name) ? "Visited" : "Not visited yet") + " · click for details");
    })
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => {
      if (dragMoved) return;
      event.stopPropagation();
      openParkCard(d);
    });

  // ---- top bar buttons ----
  document.getElementById("btn-export").onclick = () => Store.exportFile();
  document.getElementById("btn-clear").onclick = () => {
    if (confirm("Discard local edits and go back to the committed data file?")) Store.clearLocal();
  };
  document.getElementById("btn-reset").onclick = () => {
    projection.rotate([95, -38]);
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
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
