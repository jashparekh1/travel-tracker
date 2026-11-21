// Places: searching any city / region / island group and turning a search
// hit into a place record. Search uses Photon (photon.komoot.io), a free
// OpenStreetMap geocoder built for search-as-you-type. Only the typed query
// (and a map position to rank nearby hits first) is sent.

window.Places = (() => {
  // ISO2 -> our country name. Sovereign countries win over territories
  // that share a code.
  const BY_ISO = {};
  for (const [name, meta] of Object.entries(window.COUNTRY_META)) {
    const iso = meta[1];
    if (iso && (!BY_ISO[iso] || meta[2])) BY_ISO[iso] = name;
  }
  const countryFromIso = (iso) => (iso && BY_ISO[iso.toLowerCase()]) || null;

  // Street addresses, shops and houses aren't places you "go to".
  const SKIP_TYPES = new Set(["street", "house"]);

  const KIND_LABEL = {
    city: "City", town: "Town", village: "Village", hamlet: "Village",
    island: "Island", archipelago: "Islands", islet: "Island",
    region: "Region", state: "Region", province: "Province", county: "Area",
    national_park: "Park", peak: "Mountain", volcano: "Mountain",
    beach: "Beach", bay: "Bay", lake: "Lake", valley: "Valley",
    administrative: "Area", local_authority: "Area", locality: "Place",
  };
  const kindLabel = (kind) => KIND_LABEL[kind] || "Place";

  function fromFeature(f) {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    return {
      id: `osm:${p.osm_type}${p.osm_id}`,
      name: p.name,
      country: countryFromIso(p.countrycode),
      state: p.state && p.state !== p.name ? p.state : null,
      lat: +lat.toFixed(4),
      lon: +lon.toFixed(4),
      kind: p.osm_value || p.type || "place",
    };
  }

  // Search. `country` (our name) keeps only hits inside it; `near` [lon, lat]
  // ranks closer hits first. Returns [] on network errors.
  let controller = null;
  async function search(query, { country, near } = {}) {
    if (controller) controller.abort();
    controller = new AbortController();
    const params = new URLSearchParams({ q: query, limit: country ? "20" : "10", lang: "en" });
    if (near) { params.set("lon", near[0].toFixed(2)); params.set("lat", near[1].toFixed(2)); }
    try {
      const res = await fetch("https://photon.komoot.io/api/?" + params, { signal: controller.signal });
      const json = await res.json();
      const seen = new Set();
      return json.features
        .filter((f) => f.properties.name && !SKIP_TYPES.has(f.properties.type))
        .map(fromFeature)
        .filter((p) => !country || p.country === country)
        // The same town often comes back as both a node and a boundary.
        .filter((p) => {
          const k = `${p.name}|${p.country}|${p.state}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 8);
    } catch (e) {
      if (e.name === "AbortError") return null; // superseded by a newer query
      return [];
    }
  }

  const STATUS_WORD = { visited: "Been", lived: "Lived", want: "Wish" };

  return { search, countryFromIso, kindLabel, STATUS_WORD };
})();
