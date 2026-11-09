import { neighboringTransitGates } from './transit-path.js';
const symbols = { sun: '☀️', earth: '🌎', moon: '🌙', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '🪐' };
const nameOf = planet => planet[0].toUpperCase() + planet.slice(1);
const ns = 'http://www.w3.org/2000/svg';
export function createTransitLayer({ project, enabled, showInfo }) {
  const root = document.createElement('div');
  root.className = 'transit-planet-layer';
  const svg = document.createElementNS(ns, 'svg');
  svg.innerHTML = '<defs><marker id="transit-path-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="#dfd8ff"/></marker></defs>';
  root.append(svg);
  document.body.append(root);
  let signature = '', selected = null, generation = 0;
  let buttons = [], paths = [], labels = [];
  const cache = new Map();
  function clearPath() {
    [...paths, ...labels].forEach(element => element.remove());
    paths = []; labels = [];
  }
  async function select(person, planet, snapshot) {
    const token = ++generation;
    selected = { person, planet };
    clearPath();
    const api = window.CastaliaHumanDesignTransit;
    const current = api.gateAt(snapshot.bodies[planet]);
    const title = `${nameOf(planet)} transit · Gate ${current}`;
    showInfo({ title, detail: 'Finding previous and next gate activations…' }, `${person}:gate:${current}`);
    const key = `${snapshot.epoch}:${planet}`;
    if (!cache.has(key)) {
      if (cache.size > 24) cache.clear();
      cache.set(key, neighboringTransitGates(snapshot, planet, api.snapshotAt, api.gateAt));
    }
    const result = await cache.get(key);
    if (token !== generation) return;
    const date = epoch => new Date(epoch * 1000).toLocaleString();
    const previous = result.previous, next = result.next;
    showInfo({ title, detail: `${previous?.gate ?? '?'} → ${current} → ${next?.gate ?? '?'}. As of ${date(snapshot.epoch)}. ${previous ? `Entered from Gate ${previous.gate}: ${date(previous.epoch)}.` : 'Previous gate unavailable in the 240-day search window.'} ${next ? `Next: Gate ${next.gate}, ${date(next.epoch)}.` : 'Next gate unavailable in the 240-day search window.'} Dashed arrows show activation order, not travel through channels.` }, `${person}:gate:${current}`);
    const stops = [[previous?.gate, 'Previous'], [current, 'Current'], [next?.gate, 'Next']];
    for (const [gate, label] of stops) {
      if (gate == null) continue;
      const text = document.createElementNS(ns, 'text');
      text.textContent = `${label} · ${gate}`;
      text.dataset.person = person; text.dataset.gate = gate;
      svg.append(text); labels.push(text);
    }
    for (const [from, to, side] of [[previous?.gate, current, -1], [current, next?.gate, 1]]) {
      if (from == null || to == null) continue;
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('class', 'transit-gate-trail');
      path.setAttribute('marker-end', 'url(#transit-path-arrow)');
      Object.assign(path.dataset, { person, from, to, side });
      svg.append(path); paths.push(path);
    }
  }
  function update(snapshot, people) {
    const visible = people.filter(enabled);
    const nextSignature = `${snapshot?.epoch}:${visible.join(',')}`;
    if (signature !== nextSignature) {
      signature = nextSignature; generation++;
      buttons.forEach(button => button.remove()); buttons = []; clearPath();
      if (snapshot) for (const person of visible) {
        const counts = new Map();
        for (const [planet, longitude] of Object.entries(snapshot.bodies)) {
          if (!Number.isFinite(longitude)) continue;
          const gate = window.CastaliaHumanDesignTransit.gateAt(longitude);
          const slot = counts.get(gate) || 0; counts.set(gate, slot + 1);
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'transit-planet-icon';
          button.textContent = symbols[planet] || nameOf(planet).slice(0, 2);
          button.setAttribute('aria-label', `${nameOf(planet)} at Gate ${gate}; show transit path`);
          button.title = `${nameOf(planet)} · Gate ${gate}`;
          Object.assign(button.dataset, { person, gate, slot, planet });
          button.addEventListener('click', () => void select(person, planet, snapshot));
          root.append(button); buttons.push(button);
        }
      }
      if (snapshot && selected && visible.includes(selected.person)) void select(selected.person, selected.planet, snapshot);
    }
    for (const button of buttons) {
      const point = project(button.dataset.person, +button.dataset.gate);
      button.hidden = !point;
      if (point) button.style.transform = `translate(${point.x + 7 + Number(button.dataset.slot) * 29}px,${point.y - 32}px)`;
      button.classList.toggle('selected', selected?.person === button.dataset.person && selected?.planet === button.dataset.planet);
    }
    for (const path of paths) {
      const a = project(path.dataset.person, +path.dataset.from), b = project(path.dataset.person, +path.dataset.to);
      path.style.display = a && b ? '' : 'none';
      if (a && b) {
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.max(1, Math.hypot(dx, dy));
        const bend = Math.min(110, length * .35) * Number(path.dataset.side);
        path.setAttribute('d', `M${a.x},${a.y} Q${(a.x+b.x)/2-dy/length*bend},${(a.y+b.y)/2+dx/length*bend} ${b.x},${b.y}`);
      }
    }
    labels.forEach((label, index) => {
      const point = project(label.dataset.person, +label.dataset.gate);
      label.style.display = point ? '' : 'none';
      if (point) { label.setAttribute('x', point.x + 8); label.setAttribute('y', point.y + 15 + (index === 2 ? 12 : 0)); }
    });
  }
  return { update };
}
