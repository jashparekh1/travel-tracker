#!/usr/bin/env python3
"""Simplify the arcs of data/countries-50m.json in place.

Douglas-Peucker per TopoJSON arc, done in quantized integer space with the
tolerance given in degrees. Arc endpoints are preserved, so shared borders
stay shared and the topology (and country set) is unchanged — just fewer
points per line, which is what SVG re-render speed scales with.

Usage: python3 scripts/simplify-countries.py [tolerance_deg=0.01]
"""
import json, sys

PATH = 'data/countries-50m.json'

def dp(points, tol2):
    n = len(points)
    if n < 3:
        return points
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        dmax, imax = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            if seg2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / seg2
                t = 0.0 if t < 0 else 1.0 if t > 1 else t
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > dmax:
                dmax, imax = d2, i
        if dmax > tol2:
            keep[imax] = True
            stack.append((a, imax))
            stack.append((imax, b))
    return [p for p, k in zip(points, keep) if k]

def main(tol_deg):
    t = json.load(open(PATH))
    sx = t['transform']['scale'][0]
    tol_units = tol_deg / sx
    tol2 = tol_units * tol_units

    before = after = 0
    new_arcs = []
    for arc in t['arcs']:
        pts, x, y = [], 0, 0
        for dxy in arc:
            x += dxy[0]; y += dxy[1]
            pts.append((x, y))
        before += len(pts)
        pts = dp(pts, tol2)
        after += len(pts)
        enc, px, py = [], 0, 0
        for ax, ay in pts:
            enc.append([ax - px, ay - py])
            px, py = ax, ay
        new_arcs.append(enc)
    t['arcs'] = new_arcs

    body = json.dumps(t, separators=(',', ':'))
    open(PATH, 'w').write(body)
    print(f'points: {before} -> {after} ({after/before:.0%}) | file: {len(body)/1024:.0f} KB')

if __name__ == '__main__':
    main(float(sys.argv[1]) if len(sys.argv) > 1 else 0.01)
