#!/usr/bin/env python3
"""Build data/lakes-50m.json from Natural Earth 50m lakes.

Keeps lakes with scalerank <= RANK_CUTOFF, rewinds rings to d3's spherical
convention, rounds coordinates. Drawn as water over country/state fills so
lake areas inside country polygons (Great Lakes etc.) don't render as land.

Usage: python3 scripts/build-lakes.py <path-to-ne_50m_lakes.json>
"""
import json, math, sys

RANK_CUTOFF = 4
PRECISION = 3

def signed_area(ring):
    total = 0.0
    for i in range(len(ring) - 1):
        (lon1, lat1), (lon2, lat2) = ring[i], ring[i + 1]
        l1, p1, l2, p2 = map(math.radians, (lon1, lat1, lon2, lat2))
        total += (l2 - l1) * (2 + math.sin(p1) + math.sin(p2))
    return total / 2

def clean_poly(poly):
    out = []
    for i, ring in enumerate(poly):
        r = [[round(x, PRECISION), round(y, PRECISION)] for x, y in ring]
        dedup = [r[0]]
        for p in r[1:]:
            if p != dedup[-1]:
                dedup.append(p)
        if dedup[0] != dedup[-1]:
            dedup.append(dedup[0])
        if len(dedup) < 4:
            if i == 0:
                return None
            continue
        s = signed_area(dedup)
        if (s < 0) if i == 0 else (s > 0):  # d3: exteriors +, holes -
            dedup.reverse()
        out.append(dedup)
    return out or None

def main(path):
    gj = json.load(open(path))
    feats = []
    for f in gj['features']:
        if f['properties'].get('scalerank', 99) > RANK_CUTOFF:
            continue
        g = f['geometry']
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        cleaned = [p for p in (clean_poly(poly) for poly in polys) if p]
        if not cleaned:
            continue
        geom = ({'type': 'Polygon', 'coordinates': cleaned[0]} if len(cleaned) == 1
                else {'type': 'MultiPolygon', 'coordinates': cleaned})
        feats.append({'type': 'Feature',
                      'properties': {'name': f['properties'].get('name') or ''},
                      'geometry': geom})
    body = json.dumps({'type': 'FeatureCollection', 'features': feats},
                      separators=(',', ':'), ensure_ascii=False)
    open('data/lakes-50m.json', 'w').write(body)
    print(f'lakes kept: {len(feats)} | {len(body)/1024:.0f} KB')

if __name__ == '__main__':
    main(sys.argv[1])
