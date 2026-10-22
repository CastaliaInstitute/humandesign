# Channel direction and particle-flow semantics

## What Human Design establishes

In Human Design, a channel is the connection between two gates in two centers. When both gates are activated, the channel is defined and connects those centers as part of the chart's definition. Channel themes and circuitry describe the quality of that connection. Human Design also discusses directed streams and energy relationships in parts of the BodyGraph: Jovian Archive describes the Sacral as energizing the Root–Sacral format channels, and separately names a power column from Sacral to G and another from G to Throat. So it would be too broad to say the system has no directional energy concepts at all. Those examples, however, do not establish a universal one-way source-to-sink rule for every individual channel.

This project should distinguish directions explicitly taught as part of a named stream or channel mechanic from directions inferred for the particle simulation. Gate activations, channel pairs, center connections, and definition status are chart mechanics; a blanket assignment of every individual channel to one source and one sink is not established by the broad channel descriptions cited here.

## What this simulation chooses

Each `.channel-group` in `bodygraph.svg` has `data-from`, `data-to`, and `data-direction` attributes. On a directed channel:

- `data-from` is the simulation source gate.
- `data-to` is the simulation sink gate.
- The arrowhead points toward `data-to`; particles travelling through that channel move from `data-from` to `data-to`.
- The direction does not change when activations, transits, or demo mode change. Those states affect whether a channel is defined and how particles interact with its gates, not which way its arrow points.
- Source and sink are **per-channel endpoint roles**, not permanent properties of a gate or center. A gate can be the sink on one channel and the source on another (for example, Gate 20 is the sink on 20–34 and 20–57, but 10–20 is undirected).

When `data-direction="undirected"`, `data-from` and `data-to` retain the two endpoint IDs for geometry and chart mechanics; they do not assign source/sink roles. The channel has no arrowhead and the particle network allows travel in either direction, subject to the same center-color and gate-entry rules.

The one-way convention makes routes deterministic for the particle model. It provides a consistent rule for choosing channel exits from a center and for representing environmental entry at eligible sink gates. This is a model for visual exploration, not a claim that Human Design channels are literal pipes or that energy physically travels in this direction.

The current arrow assignments are authored in the SVG's `data-from` and `data-to` attributes and recommendations are recorded in [gate-direction-recommendations.md](gate-direction-recommendations.md). The arrows mix stream-supported center ordering with tentative channel-theme interpretations; seven channels are deliberately undirected. These remain recommendations for the simulation, not canonically established Human Design transport directions.

### Direction evidence policy

If directions are revised to better reflect Human Design, use three evidence levels:

1. **Named stream or explicit source/receiver relationship:** use the direction stated in the teaching and cite it. For example, the archive describes a Power Column from Sacral to G, and another from G to Throat.
2. **Channel-specific mechanics with a clear operational sequence:** propose a direction only when a primary Human Design source explains which endpoint initiates, transmits, or receives that channel's process. Record the interpretation and source; do not infer direction from gate-number order, diagram placement, or color.
3. **No clear directional teaching:** leave the channel visually undirected and let the particle network traverse it in either direction, or mark any chosen arrow as a simulation assumption. Do not silently fill gaps with a universal “motor is source” rule; the Root–Sacral format channels include two motor centers, and Human Design describes their interaction as a specific format process rather than a simple generic source/sink pair.

This policy supports a mixed-direction model: some relationships may have a source-supported arrow, while others remain symmetric or explicitly interpretive. A comprehensive directed map would require channel-by-channel source review; the current `data-from`/`data-to` assignments have not passed that review.

## Reading gates and particles

- A gate activation belongs to the chart and can be Design, Personality, both, transit-only, or absent. Gate activation does not set the channel's direction.
- A defined channel has both endpoint gates activated; an incomplete channel does not. The simulation may still show movement on an incomplete channel, which is a visualization behavior rather than Human Design definition.
- On directed channels, an inactive `data-from` gate can act as an environmental outlet, while an eligible inactive `data-to` gate can admit matching chakra-color particles. A transit-designated sink can also admit particles. An active `data-to` gate can capture a matching particle intersecting its channel, even when the opposite gate is not active. On undirected channels, either endpoint can serve as the temporary entry or exit for a particle's current trip; this does not assign the gate a permanent source/sink role. These are simulation rules layered over the chart.
- “Source” and “sink” name the two roles in this model only. They do not mean that the Human Design gate or center is intrinsically a source or sink.

## Review conclusion

Directed channel arrows and particle routes use the same `data-from` → `data-to` convention. Undirected channels omit the arrow and create particle routes at both endpoints. The main semantic risk is presentation: without this distinction, a viewer could mistake the arrows, source/sink labels, or particle behavior for canonical Human Design mechanics. User-facing descriptions should call them **simulation direction** or **particle-flow direction** and state that they are a model overlay.

The particle simulation now uses a circuit metaphor: centers carry normalized node voltage, channels report electron-carrier current, and particles are electron-like carriers. The arrows still describe the Human Design simulation's chosen route. The values are not physical measurements; see [circuit metaphor](circuit-metaphor.md) for the model and its electrical sign convention.

## References

- [Jovian Archive: Channels in Human Design — The Life Force](https://jovianarchive.com/pages/channels-in-human-design-the-life-force) describes channels as connections between centers formed by two gates, and discusses definition and channel themes.
- [Jovian Archive: Centers, Gates and Channels](https://jovianarchive.com/blogs/human-design-basics/centers-gates-and-channels) describes a channel as two gates connecting centers, with definition when both gates are activated.
- [Jovian Archive: Gates and Hexagrams](https://jovianarchive.com/pages/gates-and-hexagrams-in-human-design) describes gates as located in centers and connected to channels.
- [Jovian Archive: The Rave BodyGraph Series — Centers & Streams](https://jovianarchive.com/products/the-rave-bodygraph-centers-and-streams) describes the Sacral as energizing the format channels.
- [Jovian Archive: Human Design Library — Centers](https://jovianarchive.com/collections/centers) lists a Power Column from Sacral to G and another from G to Throat.

These references support the chart-structure summary above. The simulation direction convention and its rationale are project decisions, not claims drawn from those sources.
