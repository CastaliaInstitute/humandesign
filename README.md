# Castalia Human Design

Static GitHub Pages app for exploring personal and relationship BodyGraphs.

The SVG files in this repository are geometry templates only. They contain no natal birth details or activated gates. User chart data is intended to load after Castalia sign-in from a GitHub repository the user is authorized to read.

## Site

https://humandesign.castalia.institute/

## Local preview

Serve this directory over HTTP (for example `python3 -m http.server 8765`) and open `/relationships/threejs.html`.

## Natal data contract

The Castalia family data format currently uses a `castalia-family.json` document with `guardians[]` and `children[]`; records may include `github`, `birth_date`, `birth_time`, `birth_place`, `timezone`, `utc_offset_sec`, `latitude`, and `longitude`. Access to private GitHub repositories must be granted with a read-only GitHub App installation scoped to the selected repository. Do not add personal chart data or access tokens to this public repository.
