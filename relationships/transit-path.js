// Search actual ephemeris snapshots in both directions, including retrograde
// returns. Never assume that the next activation follows the mandala forwards.
export async function neighboringTransitGates(snapshot, planet, snapshotAt, gateAt, maxDays = 240) {
  const current = gateAt(snapshot.bodies[planet]);
  const step = (planet === 'moon' ? 1 : 6) * 3600;
  async function search(direction) {
    let previous = snapshot.epoch;
    try {
      for (let elapsed = step; elapsed <= maxDays * 86400; elapsed += step) {
        const epoch = snapshot.epoch + direction * elapsed;
        const sample = await snapshotAt(new Date(epoch * 1000));
        const longitude = sample.bodies[planet];
        if (!Number.isFinite(longitude)) return null;
        const gate = gateAt(longitude);
        if (gate !== current) {
          let inside = previous, outside = epoch;
          for (let i = 0; i < 10; i++) {
            const middle = (inside + outside) / 2;
            const value = await snapshotAt(new Date(middle * 1000));
            if (gateAt(value.bodies[planet]) === current) inside = middle;
            else outside = middle;
          }
          return { gate, epoch: (inside + outside) / 2 };
        }
        previous = epoch;
      }
    } catch { /* A missing ephemeris month means this neighbor is unknown. */ }
    return null;
  }
  const [previous, next] = await Promise.all([search(-1), search(1)]);
  return { previous, current, next };
}
