# Castalia Human Design

Static GitHub Pages app for exploring personal and relationship BodyGraphs.

The SVG files in this repository are geometry templates only. They contain no natal birth details or activated gates. The relationship viewer starts with Daniel and Camille as an intentionally public demo; their birth details are included in the client-side example data. Signing in can load other profiles from a GitHub repository the user is authorized to read.

## Site

https://humandesign.castalia.institute/

## BodyGraph interpretation notes

See [channel direction and particle-flow semantics](docs/channel-direction-model.md) for the distinction between Human Design chart mechanics and the directional simulation used by the BodyGraph visualizer.

See [the circuit metaphor](docs/circuit-metaphor.md) for how the simulation represents center voltage, channel current, and electron-like particles, including the limits of that analogy.

See [Human Design semantic cues](docs/human-design-semantic-cues.md) for the gate, channel, and center terminology reviewed for possible flow-direction clues, including evidence limits and source links.

See [gate-by-gate direction recommendations](docs/gate-direction-recommendations.md) for proposed per-channel arrows, the recommended role of each gate, reasoning, and confidence labels.

## Local preview

Serve this directory over HTTP (for example `python3 -m http.server 8765`) and open `/relationships/threejs.html` for the relationship viewer or `/relationships/lifetime.html` for the family lifetime transit explorer.

Open the standalone BodyGraph at `/bodygraph.svg?chart=camille` (or `?person=camille`) to display a public example chart. `daniel`, `aleia`, and `finn` are available too. The `/bodygraph-app.html` wrapper forwards either parameter, for example `/bodygraph-app.html?chart=finn`. Unknown chart names leave the template activations in place.

## Natal data contract

The Castalia family data format currently uses a `castalia-family.json` document with `guardians[]` and `children[]`; records may include `github`, `birth_date`, `birth_time`, `birth_place`, `timezone`, `utc_offset_sec`, `latitude`, and `longitude`. Access to private GitHub repositories must be granted with a read-only GitHub App installation scoped to the selected repository. Do not add other personal chart data or access tokens to this public repository without explicit authorization.
