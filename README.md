# 🌍 My Travels

A personal travel tracker: an interactive globe where I color in the countries,
US states, and US national parks I've been to. No backend, no accounts, no cost —
just a static site.

## Features

- **Zoomable globe** (drag to spin, scroll to zoom) built with D3's orthographic projection
- **Click to mark**: countries and states cycle *not yet → visited (orange) → lived (green)*
- **US broken down by state**, drawn right on the globe
- **All 63 national parks** as pins (zoom in on the US) — click one for a photo
  (pulled from Wikipedia, free) and a "mark as visited" button
- **Visited page** with tabs: Countries (grouped by continent), US States, National Parks
- Live stats: countries / states / parks counts

## Running it

It's a static site, but it loads map data with `fetch`, so it needs any local
web server (opening `index.html` directly from Finder won't work):

```sh
cd travel-tracker
python3 -m http.server 8000
# open http://localhost:8000
```

## How your data is saved

1. Clicks are saved instantly to your browser's **localStorage** — survives refreshes.
2. When you want to back up / sync, press **Export**. It downloads a `my-travels.js`
   with everything merged. Replace `data/my-travels.js` with it and commit:

   ```sh
   mv ~/Downloads/my-travels.js data/my-travels.js
   git add -A && git commit -m "Update travels"
   ```

3. `Clear local edits` drops the browser overrides and goes back to whatever is
   in the committed file.

## Free hosting on GitHub Pages

```sh
gh repo create travel-tracker --public --source=. --push
gh api -X POST repos/{owner}/travel-tracker/pages -f 'source[branch]=main' -f 'source[path]=/'
```

(or on github.com: repo → Settings → Pages → Deploy from branch → `main` / root)

Your globe is then live at `https://<username>.github.io/travel-tracker/`.

## Project layout

```
index.html         the globe
visited.html       tabbed checklists (countries / states / parks)
data/my-travels.js YOUR data — the only file you ever need to edit/commit
data/*.json        map geometry (vendored: world countries + US states)
js/parks.js        the 63 national parks (name, state, coords, wiki title)
js/continents.js   country → continent mapping + display names
js/store.js        seed + localStorage merge, export
js/app.js          globe rendering & interaction
js/visited.js      visited page
vendor/            d3 + topojson-client (vendored, works offline)
```

## Ideas for later

- Cities visited (pins with notes/dates)
- Trip log: dates, photos, journal entries per place
- Provinces/states for other countries (Canada, Australia, India…)
- Share mode: read-only link with your map
- Animated "travel history" replay
