(() => {
  const BASE = 'https://ephemeris.castalia.institute/data/ephem';
  const ephemerisCache = new Map();
  const GATE_ORDER = [25,17,21,51,42,3,27,24,2,23,8,20,16,35,45,12,15,52,39,53,62,56,31,33,7,4,29,59,40,64,47,6,46,18,48,57,32,50,28,44,1,43,14,34,9,5,26,11,10,58,38,54,61,60,41,19,13,49,30,55,37,63,22,36];
  const gateAt = longitude => {
    const adjusted = ((longitude - 358.25) % 360 + 360) % 360;
    return GATE_ORDER[Math.min(63, Math.floor(adjusted / (360 / 64)))];
  };

  async function monthData(epoch, noCache = false) {
    const month = new Date(epoch * 1000).toISOString().slice(0, 7);
    if (!ephemerisCache.has(month) || noCache) {
      const request = fetch(`${BASE}/${month}.json`, { cache: noCache ? 'no-cache' : 'default' }).then(async response => {
        if (!response.ok) throw new Error(`Transit ephemeris unavailable (${response.status}) for ${month}.`);
        return response.json();
      });
      ephemerisCache.set(month, request);
      request.catch(() => { if (ephemerisCache.get(month) === request) ephemerisCache.delete(month); });
    }
    return ephemerisCache.get(month);
  }
  function interpolatedLongitude(values, sampleIndex) {
    const index = Math.floor(sampleIndex), next = Math.min(index + 1, values.length - 1);
    const fraction = sampleIndex - index;
    const first = Number(values[index]), second = Number(values[next]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
    const delta = ((second - first + 540) % 360) - 180;
    return ((first + delta * fraction) % 360 + 360) % 360;
  }
  function longitudeAt(data, planet, epoch) {
    const source = planet === 'earth' ? 'sun' : planet;
    const values = data.bodies?.[source];
    if (!values?.length) return null;
    const index = (epoch - data.t0) / data.step;
    if (index < 0 || index > values.length - 1) return null;
    const longitude = interpolatedLongitude(values, index);
    return longitude == null ? null : (planet === 'earth' ? (longitude + 180) % 360 : longitude);
  }
  async function snapshotAt(now = new Date(), noCache = false) {
    now = now instanceof Date ? now : new Date(now);
    if (!Number.isFinite(now.getTime())) throw new Error('Choose a valid date and time for the transit snapshot.');
    const epoch = now.getTime() / 1000;
    const data = await monthData(epoch, noCache);
    if (!Number.isFinite(data.t0) || !Number.isFinite(data.step) || !data.bodies) throw new Error('Transit ephemeris has an unsupported format.');
    const sampleIndex = (epoch - data.t0) / data.step;
    if (sampleIndex < 0 || sampleIndex >= Math.min(...Object.values(data.bodies).map(values => values.length))) {
      throw new Error('Transit ephemeris does not cover the current time.');
    }
    const bodies = {};
    for (const key of ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
      if (data.bodies[key]) bodies[key] = interpolatedLongitude(data.bodies[key], sampleIndex);
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

  async function currentSnapshot(now = new Date()) {
    return snapshotAt(now, true);
  }

  async function nextGateChange(planet, startEpoch, currentGate, maxDays = 240) {
    let cursor = startEpoch;
    const limit = startEpoch + maxDays * 86400;
    while (cursor < limit) {
      const data = await monthData(cursor);
      const values = data.bodies?.[planet === 'earth' ? 'sun' : planet];
      if (!values?.length || !Number.isFinite(data.t0) || !Number.isFinite(data.step) || data.step <= 0) {
        throw new Error(`Transit ephemeris is incomplete for ${planet}.`);
      }
      const monthEnd = data.t0 + (values.length - 1) * data.step;
      let previousTime = Math.max(cursor, data.t0);
      if (previousTime > monthEnd) throw new Error(`Transit ephemeris does not cover ${planet} after ${new Date(cursor * 1000).toISOString()}.`);
      const firstIndex = Math.max(1, Math.floor((previousTime - data.t0) / data.step) + 1);
      for (let index = firstIndex; index < values.length; index++) {
        const sampleTime = data.t0 + index * data.step;
        if (sampleTime > limit) return null;
        const longitude = longitudeAt(data, planet, sampleTime);
        if (longitude == null) throw new Error(`Transit longitude is missing for ${planet}.`);
        if (gateAt(longitude) !== currentGate) {
          let low = previousTime, high = sampleTime;
          for (let attempt = 0; attempt < 12; attempt++) {
            const middle = (low + high) / 2;
            const middleLongitude = longitudeAt(data, planet, middle);
            if (middleLongitude == null) throw new Error(`Transit longitude is missing for ${planet}.`);
            if (gateAt(middleLongitude) !== currentGate) high = middle;
            else low = middle;
          }
          return high;
        }
        previousTime = sampleTime;
      }
      cursor = monthEnd + data.step;
    }
    return null;
  }

  async function estimateDurations(snapshot, maxDays = 240) {
    const labels = { sun: 'Sun', earth: 'Earth', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' };
    return Promise.all(Object.entries(labels).map(async ([planet, name]) => {
      const gate = Object.entries(snapshot.gatePlanets || {}).find(([, planets]) => planets.includes(name))?.[0];
      if (gate == null) return { planet: name, gate: null, exitsAt: null };
      try {
        const exitsAt = await nextGateChange(planet, snapshot.epoch, Number(gate), maxDays);
        return {
          planet: name,
          gate: Number(gate),
          exitsAt: exitsAt == null ? null : new Date(exitsAt * 1000).toISOString(),
          beyondWindow: exitsAt == null,
          windowDays: maxDays
        };
      } catch (error) {
        console.warn(`Could not estimate ${name} transit duration:`, error);
        return { planet: name, gate: Number(gate), exitsAt: null, windowDays: maxDays, unavailable: true };
      }
    }));
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
          if (!group.querySelector('.gate-marker')) continue;
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

  window.CastaliaHumanDesignTransit = { GATE_ORDER, gateAt, currentSnapshot, snapshotAt, estimateDurations, installSvg };
})();
