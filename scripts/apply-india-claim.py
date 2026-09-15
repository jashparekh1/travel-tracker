#!/usr/bin/env python3
"""Redraw India in data/countries-50m.json with its full claimed territory.

Natural Earth draws de facto control, which splits Jammu & Kashmir and
Ladakh between India, Pakistan and China. This script moves the whole of
both (from the district-level GeoJSON at github.com/udit-001/india-maps-data)
into India's polygon, cuts the same area out of Pakistan and China, and
folds the separate "Siachen Glacier" polygon into India. Everything else in
the topology is untouched: unchanged borders keep their existing shared
arcs, only the new boundary gets new arcs appended. Run it once, then
scripts/build-india-states.py to regenerate the states layer.

Needs: pip install shapely
Usage: python3 scripts/apply-india-claim.py <path-to-india.geojson>
"""
import json, sys
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import unary_union

PATH = 'data/countries-50m.json'
CLAIM_STATES = ('Jammu and Kashmir', 'Ladakh')
NEIGHBOURS = ('Pakistan', 'China')


def main(districts_path):
    t = json.load(open(PATH))
    sc, tr = t['transform']['scale'], t['transform']['translate']
    q = lambda x, y: (round((x - tr[0]) / sc[0]), round((y - tr[1]) / sc[1]))
    dq = lambda p: (p[0] * sc[0] + tr[0], p[1] * sc[1] + tr[1])

    # Decode arcs to absolute quantized points.
    arcs = []
    for arc in t['arcs']:
        pts, x, y = [], 0, 0
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((x, y))
        arcs.append(pts)

    def ring_pts(idx):
        out = []
        for i in idx:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(a[1:] if out else a)
        return out

    def geom(g):
        rings = lambda p: Polygon([dq(v) for v in ring_pts(p[0])],
                                  [[dq(v) for v in ring_pts(r)] for r in p[1:]])
        if g['type'] == 'Polygon':
            return rings(g['arcs'])
        return MultiPolygon([rings(p) for p in g['arcs']])

    geoms = t['objects']['countries']['geometries']
    by_name = {g['properties']['name']: g for g in geoms}
    india = unary_union([geom(by_name['India']), geom(by_name['Siachen Glacier'])]).buffer(0)
    pak = geom(by_name['Pakistan']).buffer(0)
    china = geom(by_name['China']).buffer(0)

    # The claim: everything the districts file puts in J&K or Ladakh that is
    # currently drawn as Pakistan or China (so nothing spills into Afghanistan
    # or elsewhere).
    src = json.load(open(districts_path))
    claim = unary_union([shape(f['geometry']).buffer(0) for f in src['features']
                         if f['properties']['st_nm'] in CLAIM_STATES])
    claim = claim.intersection(unary_union([pak, china]))

    def polys(g):
        return [p for p in getattr(g, 'geoms', [g]) if p.geom_type == 'Polygon' and p.area > 0]

    # Cut it out of the neighbours; slivers left behind (dataset border
    # mismatches) go to India rather than lingering as orphan specks.
    new_pak = polys(pak.difference(claim))
    main_pak = max(new_pak, key=lambda p: p.area)
    slivers = [p for p in new_pak if p is not main_pak]
    new_china = []
    for p in polys(china.difference(claim)):
        if p.area < 0.05 and p.distance(claim) < 0.05:
            slivers.append(p)
        else:
            new_china.append(p)
    new_india = unary_union([india, claim] + slivers).buffer(0)
    new_pak = main_pak
    new_china = unary_union(new_china)
    print(f'claim {claim.area:.2f} sq deg; {len(slivers)} slivers to India; '
          f'India {india.area:.1f} -> {new_india.area:.1f}')

    # ---- re-encode the three changed countries into the topology ----
    # Rings are walked and matched against existing arcs (whole arcs only,
    # either direction); unmatched stretches become new arcs, split at
    # junctions so the next country can share them.
    starts, ends = {}, {}
    for i, a in enumerate(arcs):
        starts.setdefault(a[0], []).append(i)
        ends.setdefault(a[-1], []).append(i)

    def qrings(g):
        out = []
        for p in polys(g):
            rings = [(True, p.exterior)] + [(False, r) for r in p.interiors]
            for is_ext, r in rings:
                pts = [q(x, y) for x, y in r.coords]
                dedup = [pts[0]] + [v for i, v in enumerate(pts[1:], 1) if v != pts[i - 1]]
                if dedup[0] != dedup[-1]:
                    dedup.append(dedup[0])
                if len(dedup) >= 4:
                    out.append((p, is_ext, dedup))
                elif is_ext:
                    break  # degenerate polygon: skip it and its holes
        return out

    new_geoms = {'India': qrings(new_india), 'Pakistan': qrings(new_pak), 'China': qrings(new_china)}
    junctions = set(starts) | set(ends)
    seen = {}
    for name, rings in new_geoms.items():
        for _, _, pts in rings:
            for v in set(pts):
                seen.setdefault(v, set()).add(name)
    junctions |= {v for v, names in seen.items() if len(names) >= 3}

    def match_at(pts, i):
        """Index (or ~index) of an arc that pts[i:] follows in full, or None."""
        n = len(pts)
        for ai in starts.get(pts[i], []):
            a = arcs[ai]
            if i + len(a) <= n and pts[i:i + len(a)] == a:
                return ai
        for ai in ends.get(pts[i], []):
            a = arcs[ai][::-1]
            if i + len(a) <= n and pts[i:i + len(a)] == a:
                return ~ai
        return None

    def add_arc(pts):
        arcs.append(pts)
        i = len(arcs) - 1
        starts.setdefault(pts[0], []).append(i)
        ends.setdefault(pts[-1], []).append(i)
        return i

    def encode_ring(pts):
        pts = pts[:-1]  # open ring
        n = len(pts)
        # Start at a junction (or an arc start) if the ring has one.
        start = next((i for i, v in enumerate(pts) if v in junctions), None)
        if start is None:
            start = next((i for i, v in enumerate(pts) if v in starts or v in ends), 0)
        pts = pts[start:] + pts[:start]
        pts.append(pts[0])
        out, i, pending = [], 0, []
        while i < len(pts) - 1:
            m = match_at(pts, i)
            if m is not None and not pending:
                out.append(m)
                i += len(arcs[m if m >= 0 else ~m]) - 1
                continue
            if m is not None or (pending and pts[i] in junctions):
                pending.append(pts[i])
                out.append(add_arc(pending))
                pending = []
                continue
            pending.append(pts[i])
            i += 1
        if pending:
            pending.append(pts[-1])
            out.append(add_arc(pending))
        return out

    def encode(rings):
        polys_out = {}
        for p, is_ext, pts in rings:
            polys_out.setdefault(id(p), [None, []])
            if is_ext:
                polys_out[id(p)][0] = encode_ring(pts)
            else:
                polys_out[id(p)][1].append(encode_ring(pts))
        parts = [[ext] + holes for ext, holes in polys_out.values() if ext is not None]
        if len(parts) == 1:
            return {'type': 'Polygon', 'arcs': parts[0]}
        return {'type': 'MultiPolygon', 'arcs': parts}

    n_before = len(t['arcs'])
    for name, rings in new_geoms.items():
        g = by_name[name]
        enc = encode(rings)
        g['type'], g['arcs'] = enc['type'], enc['arcs']
    geoms[:] = [g for g in geoms if g['properties']['name'] != 'Siachen Glacier']

    # Delta-encode the appended arcs.
    for pts in arcs[n_before:]:
        enc, px, py = [], 0, 0
        for x, y in pts:
            enc.append([x - px, y - py]); px, py = x, y
        t['arcs'].append(enc)

    json.dump(t, open(PATH, 'w'), separators=(',', ':'))
    print(f'arcs {n_before} -> {len(t["arcs"])}; {len(geoms)} countries')


if __name__ == '__main__':
    main(sys.argv[1])
