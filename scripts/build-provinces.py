#!/usr/bin/env python3
"""Build per-country province files from Natural Earth 10m admin-1.

Input:  ne_10m_admin_1_states_provinces.json (60MB, all countries)
Output: data/provinces/<code>.json  — simplified, d3-wound, one per country
        js/provinces-index.js      — country name -> {file, count}

Usage: python3 scripts/build-provinces.py <path-to-admin1-10m.json> <path-to-world-countries.json>

The US is skipped (the app has its own states layer). Geometry is
simplified with Douglas-Peucker (tolerance in degrees below) — provinces
are simplified independently, so hairline seams between neighbors are
possible but invisible at globe scale.
"""
import json, math, re, sys, unicodedata, os
from collections import defaultdict

TOLERANCE = 0.005   # degrees; ~500m
PRECISION = 4       # coordinate decimals

def norm(s):
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.lower().replace('&', 'and').replace('.', '').replace('-', ' ')
    return re.sub(r'\s+', ' ', s).strip()

# NE 'admin' names that aren't in world-countries; map straight to NE country name
SPECIAL_ADMIN = {
    'Somaliland': 'Somaliland',
    'Northern Cyprus': 'N. Cyprus',
    'Turkish Republic of Northern Cyprus': 'N. Cyprus',
    'S. Sudan': 'S. Sudan',
    'Turkey': 'Turkey',
    'The Bahamas': 'Bahamas',
    'Hong Kong S.A.R.': 'Hong Kong',
    'Macau S.A.R': 'Macao',
    'Gaza Strip': 'Palestine',
    'West Bank': 'Palestine',
    'South Georgia and the Islands': 'S. Geo. and the Is.',
}
SKIP_ADMIN = {'United States of America', 'Antarctica'}

def dp_simplify(ring, tol):
    """Iterative Douglas-Peucker on [lon, lat] pairs (planar approx is fine here)."""
    if len(ring) < 5:
        return ring
    keep = [False] * len(ring)
    keep[0] = keep[-1] = True
    stack = [(0, len(ring) - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        ax, ay = ring[a]
        bx, by = ring[b]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        dmax, imax = -1.0, -1
        for i in range(a + 1, b):
            px, py = ring[i]
            if seg2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / seg2
                t = max(0.0, min(1.0, t))
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > dmax:
                dmax, imax = d2, i
        if dmax > tol * tol:
            keep[imax] = True
            stack.append((a, imax))
            stack.append((imax, b))
    return [p for p, k in zip(ring, keep) if k]

def signed_area(ring):
    total = 0.0
    for i in range(len(ring) - 1):
        (lon1, lat1), (lon2, lat2) = ring[i], ring[i + 1]
        l1, p1, l2, p2 = map(math.radians, (lon1, lat1, lon2, lat2))
        total += (l2 - l1) * (2 + math.sin(p1) + math.sin(p2))
    return total / 2

def clean_poly(poly):
    """Simplify, round, close, rewind (d3: exteriors +, holes -). None if degenerate."""
    out = []
    for i, ring in enumerate(poly):
        r = dp_simplify(ring, TOLERANCE)
        r = [[round(x, PRECISION), round(y, PRECISION)] for x, y in r]
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
        if (s < 0) if i == 0 else (s > 0):
            dedup.reverse()
        out.append(dedup)
    return out or None

def main(admin1_path, wc_path):
    meta_src = open('js/countries-meta.js').read()
    iso2_to_ne = {m[1]: json.loads(m[0]) for m in
                  re.findall(r'^  (".*?"): \[".*?", "(\w*)",', meta_src, re.M) if m[1]}
    wc = json.load(open(wc_path))
    idx = {}
    for c in wc:
        for n in [c['name']['common'], c['name']['official']] + c.get('altSpellings', []):
            idx.setdefault(norm(n), c)

    gj = json.load(open(admin1_path))
    grouped, unmatched = defaultdict(list), set()
    for f in gj['features']:
        admin = f['properties']['admin']
        if admin in SKIP_ADMIN:
            continue
        if admin in SPECIAL_ADMIN:
            ne_name = SPECIAL_ADMIN[admin]
        else:
            c = idx.get(norm(admin))
            ne_name = iso2_to_ne.get(c['cca2'].lower()) if c else None
        if not ne_name:
            unmatched.add(admin)
            continue
        grouped[ne_name].append(f)

    os.makedirs('data/provinces', exist_ok=True)
    index, total_bytes = {}, 0
    for ne_name, feats in grouped.items():
        out_feats = []
        for f in feats:
            g = f['geometry']
            if g is None:
                continue
            polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
            cleaned = [p for p in (clean_poly(poly) for poly in polys) if p]
            if not cleaned:
                continue
            pname = f['properties']['name'] or f['properties'].get('name_en') or '?'
            geom = ({'type': 'Polygon', 'coordinates': cleaned[0]} if len(cleaned) == 1
                    else {'type': 'MultiPolygon', 'coordinates': cleaned})
            out_feats.append({'type': 'Feature',
                              'properties': {'name': pname, 'key': f'{ne_name}/{pname}'},
                              'geometry': geom})
        if not out_feats:
            continue
        code = re.sub(r'[^a-z0-9]+', '-', ne_name.lower()).strip('-')
        path = f'data/provinces/{code}.json'
        body = json.dumps({'type': 'FeatureCollection', 'features': out_feats},
                          separators=(',', ':'))
        open(path, 'w').write(body)
        total_bytes += len(body)
        index[ne_name] = {'file': code, 'count': len(out_feats)}

    lines = ['// GENERATED by scripts/build-provinces.py — do not hand-edit.',
             '// country name -> lazy-loadable province file + province count',
             'window.PROVINCE_INDEX = {']
    for name in sorted(index):
        lines.append(f'  {json.dumps(name)}: {json.dumps(index[name])},')
    lines.append('};')
    open('js/provinces-index.js', 'w').write('\n'.join(lines) + '\n')

    print(f'countries: {len(index)} | provinces: {sum(v["count"] for v in index.values())}')
    print(f'total size: {total_bytes/1e6:.1f} MB')
    print('unmatched admins (skipped):', sorted(unmatched) or 'none')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
