# Places inside countries — design (piece 1 of 2)

## Why
A country is one status today, so "France ✓" hides that I've only seen Paris,
and there's nowhere to keep the Riviera as a deliberate wish. The tracker
should record exactly where I've been and where I intend to go. Piece 2
(itineraries: legs by flight/train/drive between places, animated replay)
builds on these places.

## What
- **Places**: any city, town, region or island group, found by search, marked
  *been*, *lived* or *wish*. Stored with name, country, state, coordinates.
- **Two globe modes** (switch above the view bar):
  - *Countries*: today's map unchanged, with place pins on top.
  - *Places*: no country fill — only pins (my places + my marked parks and
    wonders). Countries/states I've been to with no places inside show faintly.
- **Country panel**: clicking a country opens a panel with its status buttons,
  its places, and a search box to add more. "📍 Add place" opens the same
  panel with worldwide search (covers US / India, whose states still cycle).
- **Derivation**: a been/lived place colors its country (and its US / Indian
  state), same rule the US already uses with its states. Explicit statuses win.
- **Visited page**: new *Places* tab grouped by country
  ("🇫🇷 France · 1 been · 2 wish").

## Approaches considered
- Make the existing city dots clickable — rejected: only 522 big cities, and
  regions (Riviera, Azores) can't be dots.
- Subdivide more countries into regions like the US — rejected: regions don't
  match how trips are described (cities, coasts, islands), and needs geometry
  per country.
- **Search any place via Photon (free, OpenStreetMap-based, built for
  search-as-you-type)** — chosen. Only the typed query is sent.

## Calls made by the builder
- Clicking a country opens the panel instead of cycling (status is one click
  inside it).
- Place pins are hidden in compare mode and in the Parks / Wonders views.
- Places stay out of the Passport for now (iterate later).
- Data: `places` map in the travel doc, keyed by OSM id → `{name, country,
  state, lat, lon, kind, status}`; notes key as `places/<id>`.
