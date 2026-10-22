# Circuit metaphor for the BodyGraph simulation

This is a visual model layered over a Human Design chart. It is not a literal electrical model of a person, and its values are not measured electrical quantities.

## Mapping

- **Centers are voltage nodes.** Each center holds a normalized potential relative to a neutral reference. The value is a simulation state, not volts. Charge accumulation raises the modeled potential; net outflow can lower it. A defined Sacral center has a continuing source term in Generator and Manifesting Generator demo modes.
- **Channels carry current.** The simulation estimates current from the signed movement rate of particles traversing each channel path. It is expressed as electron-like carriers per simulated second using the graph-scaled path speed, not amperes. Channel voltage difference is also stored for inspection and as a visual cue.
- **Particles are electron-like charge carriers.** They move through centers, channels, and the environment under the existing gate and channel rules. Their color tracks their chakra origin, not a physical electron property.
- **Resistance limits channel current.** Each channel has a normalized resistance `R`; an optional SVG `data-resistance` value overrides the default `0.35 + path length / 150`. Effective traversal speed is scaled by the conductance factor `1 / (1 + R)`, so increasing resistance slows carriers and lowers the current measured from their motion. Longer channels also take longer to traverse. This is a simple limiter, not a full Ohm’s-law circuit solver: there are no calibrated resistors, Kirchhoff equations, or amperes.
- **Activated gates act as charge pumps.** Each active endpoint gate multiplies channel carrier speed by `1.35`; two active gates multiply it by `1.70`. Activation includes natal, transit, and demo activations. The pump raises the flow rate while channel resistance still attenuates it. This is an intentional metaphorical boost, not an electrical property assigned to a gate in Human Design.

The simulation records current in **electron-flow direction** so the sign follows the displayed particle motion. In conventional circuit diagrams, current is defined in the direction positive charge would move, opposite to electron drift. The graph's arrows continue to express the documented Human Design simulation direction; they are not measurements of electrical current or claims about canonical Human Design mechanics.

The center voltage responds to stored particle load and net inflow/outflow and relaxes over time. Channel current is computed from the particles currently moving on the path. This gives voltage and current related, inspectable meanings without implying a biological electrical circuit.

For Human Design interpretation and the rationale for channel directions, see [channel direction and particle-flow semantics](channel-direction-model.md) and [gate direction recommendations](gate-direction-recommendations.md).
