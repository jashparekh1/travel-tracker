#!/usr/bin/env python3
"""Build data/cities.json from Natural Earth 10m populated places.

Keeps cities with scalerank <= RANK_CUTOFF. Output is a compact list of
[name, lat, lon, rank, isNationalCapital] — display-only map labels.

Usage: python3 scripts/build-cities.py <path-to-ne_10m_populated_places_simple.json>
"""
import json, sys

RANK_CUTOFF = 4

def main(path):
    gj = json.load(open(path))
    out = []
    for f in gj['features']:
        p = f['properties']
        if p['scalerank'] > RANK_CUTOFF:
            continue
        cap = 1 if str(p.get('featurecla', '')).startswith('Admin-0 capital') else 0
        out.append([p['name'], round(p['latitude'], 2), round(p['longitude'], 2),
                    p['scalerank'], cap])
    out.sort(key=lambda c: (c[3], c[0]))
    body = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
    open('data/cities.json', 'w').write(body)
    print(f'cities: {len(out)} | capitals: {sum(c[4] for c in out)} | {len(body)/1024:.0f} KB')

if __name__ == '__main__':
    main(sys.argv[1])
