(() => {
  const BASE = 'https://ephemeris.castalia.institute/data/ephem';
  const GATE_ORDER = [25,17,21,51,42,3,27,24,2,23,8,20,16,35,45,12,15,52,39,53,62,56,31,33,7,4,29,59,40,64,47,6,46,18,48,57,32,50,28,44,1,43,14,34,9,5,26,11,10,58,38,54,61,60,41,19,13,49,30,55,37,63,22,36];
  const gateAt = longitude => {
    const adjusted = ((longitude - 358.25) % 360 + 360) % 360;
    return GATE_ORDER[Math.min(63, Math.floor(adjusted / (360 / 64)))];
  };

  async function currentSnapshot(now = new Date()) {
    const epoch = now.getTime() / 1000;
    const month = now.toISOString().slice(0, 7);
    const response = await fetch(`${BASE}/${month}.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Transit ephemeris unavailable (${response.status}).`);
    const data = await response.json();
    if (!Number.isFinite(data.t0) || !Number.isFinite(data.step) || !data.bodies) throw new Error('Transit ephemeris has an unsupported format.');
    const sample = (values, position) => {
      const index = Math.floor(position), next = Math.min(index + 1, values.length - 1);
      const fraction = position - index;
      const first = Number(values[index]), second = Number(values[next]);
      if (!Number.isFinite(first) || !Number.isFinite(second)) throw new Error('Transit ephemeris sample is missing.');
      const delta = ((second - first + 540) % 360) - 180;
      return ((first + delta * fraction) % 360 + 360) % 360;
    };
    const sampleIndex = (epoch - data.t0) / data.step;
    if (sampleIndex < 0 || sampleIndex >= Math.min(...Object.values(data.bodies).map(values => values.length))) {
      throw new Error('Transit ephemeris does not cover the current time.');
    }
    const bodies = {};
    for (const key of ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
      if (data.bodies[key]) bodies[key] = sample(data.bodies[key], sampleIndex);
    }
    if (bodies.sun == null || bodies.moon == null) throw new Error('Transit ephemeris is missing the Sun or Moon.');
    bodies.earth = (bodies.sun + 180) % 360;
    const labels = { sun: 'Sun', earth: 'Earth', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' };
    const gatePlanets = {};
    for (const [body, longitude] of Object.entries(bodies)) {
      const gate = gateAt(longitude);
      (gatePlanets[gate] ||= []).push(labels[body]);
    }
    return {
      epoch,
      timestamp: now.toISOString(),
      bodies,
      gates: Object.keys(gatePlanets).map(Number).sort((a, b) => a - b),
      gatePlanets,
      source: `${data.engine || 'Swiss Ephemeris'} ${data.engine_version || ''}`.trim(),
      coordinate: data.coordinate || 'tropical-ecliptic',
      sampleStepSeconds: data.step
    };
  }

  function installSvg(svg) {
    const button = svg.getElementById('transit-control');
    const status = svg.getElementById('transit-status');
    if (!button || !status) return;
    let enabled = true;
    let snapshot = null;
    const refresh = async () => {
      try {
        snapshot = await currentSnapshot();
        render();
        status.textContent = `Current transits · ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(snapshot.epoch * 1000))}`;
      } catch (error) {
        status.textContent = error.message;
      }
    };
    const render = () => {
      svg.querySelectorAll('.transit-channel-overlay,.transit-marker').forEach(el => el.remove());
      svg.querySelectorAll('[data-transit-planets],[data-transit-channel]').forEach(el => {
        el.removeAttribute('data-transit-planets');
        el.removeAttribute('data-transit-channel');
      });
      if (!enabled || !snapshot) return;
      const gateSet = new Set(snapshot.gates);
      for (const gate of snapshot.gates) {
        const groups = svg.querySelectorAll(`.gate[data-gate="${gate}"]`);
        for (const group of groups) {
          const marker = group.querySelector('.gate-marker');
          if (!marker) continue;
          const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          ring.setAttribute('class', 'transit-marker');
          ring.setAttribute('cx', marker.getAttribute('cx'));
          ring.setAttribute('cy', marker.getAttribute('cy'));
          ring.setAttribute('r', '3.7');
          group.appendChild(ring);
          group.dataset.transitPlanets = snapshot.gatePlanets[gate].join(', ');
        }
      }
      for (const channel of svg.querySelectorAll('.channel-group[data-from][data-to]')) {
        const from = Number(channel.dataset.from), to = Number(channel.dataset.to);
        if (!gateSet.has(from) || !gateSet.has(to)) continue;
        channel.dataset.transitChannel = 'true';
        for (const path of channel.querySelectorAll('.channel,.channel-rail')) {
          const overlay = path.cloneNode(false);
          overlay.setAttribute('class', 'transit-channel-overlay');
          overlay.setAttribute('d', path.getAttribute('d'));
          channel.appendChild(overlay);
        }
      }
    };
    const toggle = () => {
      enabled = !enabled;
      button.setAttribute('aria-pressed', String(enabled));
      render();
      if (snapshot) status.textContent = `${enabled ? 'Current transits shown' : 'Current transits hidden'} · ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(snapshot.epoch * 1000))}`;
    };
    button.setAttribute('aria-pressed', 'true');
    button.addEventListener('click', toggle);
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
    });
    void refresh();
    window.setInterval(refresh, 15 * 60 * 1000);
  }

  window.CastaliaHumanDesignTransit = { GATE_ORDER, gateAt, currentSnapshot, installSvg };
})();
