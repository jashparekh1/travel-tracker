#!/usr/bin/env python3
"""Build data/india-states.json (28 states + 8 union territories).

Input: the district-level GeoJSON from github.com/udit-001/india-maps-data
(geojson/india.geojson). Districts are dissolved into their state (st_nm),
then each mainland unit is clipped to India's outline in
data/countries-50m.json (run scripts/apply-india-claim.py first so that
outline includes all of Jammu & Kashmir and Ladakh). Slivers of the country polygon that
no state covers are handed to the nearest state so the states tile the
country exactly — the globe hides India's own fill in All view and lets
the states carry its color, just like the US. Island territories
(Lakshadweep, Andaman & Nicobar) are kept as-is: the 50m country outline
drops most of their islands.

Needs: pip install shapely
Usage: python3 scripts/build-india-states.py <path-to-india.geojson>
"""
import json, sys
from shapely import set_precision
from shapely.geometry import shape, mapping, Polygon, MultiPolygon
from shapely.ops import unary_union

COUNTRIES = 'data/countries-50m.json'
OUT = 'data/india-states.json'
ISLANDS = {'Lakshadweep', 'Andaman and Nicobar Islands'}
# Display names where the source's differ from what we want on the map.
RENAME = {
    'Dadra and Nagar Haveli and Daman and Diu': 'Dadra & Nagar Haveli and Daman & Diu',
    'Andaman and Nicobar Islands': 'Andaman & Nicobar Islands',
    'Jammu and Kashmir': 'Jammu & Kashmir',
}


def country_outline():
    """India (+ Siachen, which the app merges into India) from the TopoJSON."""
    t = json.load(open(COUNTRIES))
    sc, tr = t['transform']['scale'], t['transform']['translate']
    arcs = []
    for arc in t['arcs']:
        pts, x, y = [], 0, 0
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((x * sc[0] + tr[0], y * sc[1] + tr[1]))
        arcs.append(pts)

    def ring(idx):
        out = []
        for i in idx:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(a[1:] if out else a)
        return out

    def geom(g):
        if g['type'] == 'Polygon':
            return Polygon(ring(g['arcs'][0]), [ring(r) for r in g['arcs'][1:]])
        return MultiPolygon([Polygon(ring(p[0]), [ring(r) for r in p[1:]]) for p in g['arcs']])

    keep = ('India', 'Siachen Glacier')
    return unary_union([geom(g) for g in t['objects']['countries']['geometries']
                        if g['properties']['name'] in keep]).buffer(0)


def polys_only(g):
    parts = [p for p in getattr(g, 'geoms', [g]) if p.geom_type == 'Polygon' and p.area > 0]
    return unary_union(parts) if parts else None


def main(path):
    india = country_outline()
    src = json.load(open(path))
    by = {}
    for f in src['features']:
        by.setdefault(f['properties']['st_nm'], []).append(shape(f['geometry']).buffer(0))
    states = {k: unary_union(v).buffer(0) for k, v in by.items()}

    clipped = {}
    for name, g in states.items():
        clipped[name] = g if name in ISLANDS else polys_only(g.intersection(india))

    # Hand uncovered slivers of the country polygon to the nearest state.
    covered = unary_union(list(clipped.values()))
    leftover = polys_only(india.difference(covered))
    n_slivers = 0
    if leftover is not None:
        for piece in getattr(leftover, 'geoms', [leftover]):
            n_slivers += 1
            nearest = min(clipped, key=lambda n: clipped[n].distance(piece))
            clipped[nearest] = polys_only(unary_union([clipped[nearest], piece]))

    features = []
    for name in sorted(clipped):
        # ~10 m precision keeps the file small and the rings valid.
        geo = mapping(polys_only(set_precision(clipped[name], 1e-4)))
        features.append({'type': 'Feature', 'properties': {'name': RENAME.get(name, name)},
                         'geometry': geo})

    body = json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':'))
    open(OUT, 'w').write(body)
    verts = sum(len(r) for f in features for p in
                ([f['geometry']['coordinates']] if f['geometry']['type'] == 'Polygon'
                 else f['geometry']['coordinates']) for r in p)
    print(f'{len(features)} units | {verts} vertices | {n_slivers} slivers reassigned | {len(body)/1024:.0f} KB')


if __name__ == '__main__':
    main(sys.argv[1])
