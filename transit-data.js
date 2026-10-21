(() => {
  const BASE = 'https://ephemeris.castalia.institute/data/ephem';
  const LIFETIME_BASE = 'https://ephemeris.castalia.institute/data/lifetime-ephem';
  const ephemerisCache = new Map();
  const lifetimeScanCache = new Map();
  const GATE_ORDER = [25,17,21,51,42,3,27,24,2,23,8,20,16,35,45,12,15,52,39,53,62,56,31,33,7,4,29,59,40,64,47,6,46,18,48,57,32,50,28,44,1,43,14,34,9,5,26,11,10,58,38,54,61,60,41,19,13,49,30,55,37,63,22,36];
  const gateAt = longitude => {
    const adjusted = ((longitude - 358.25) % 360 + 360) % 360;
    return GATE_ORDER[Math.min(63, Math.floor(adjusted / (360 / 64)))];
  };

  async function monthData(epoch, noCache = false, lifetimeOnly = false) {
    const month = new Date(epoch * 1000).toISOString().slice(0, 7);
    const cacheKey = lifetimeOnly ? `lifetime:${month}` : month;
    if (!ephemerisCache.has(cacheKey) || noCache) {
      const request = (async () => {
        const options = { cache: noCache ? 'no-cache' : 'default' };
        if (lifetimeOnly) {
          const response = await fetch(`${LIFETIME_BASE}/${month}.json`, options);
          if (!response.ok) throw new Error(`Lifetime transit ephemeris unavailable for ${month} (${response.status}).`);
          return response.json();
        }
        const currentResponse = await fetch(`${BASE}/${month}.json`, options);
        if (currentResponse.ok) return currentResponse.json();
        const lifetimeResponse = await fetch(`${LIFETIME_BASE}/${month}.json`, options);
        if (lifetimeResponse.ok) return lifetimeResponse.json();
        throw new Error(`Transit ephemeris unavailable for ${month} (monthly feed ${currentResponse.status}; lifetime feed ${lifetimeResponse.status}).`);
      })();
      ephemerisCache.set(cacheKey, request);
      request.catch(() => { if (ephemerisCache.get(cacheKey) === request) ephemerisCache.delete(cacheKey); });
    }
    return ephemerisCache.get(cacheKey);
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

  function monthEpochs(startEpoch, endEpoch) {
    const months = [];
    const date = new Date(startEpoch * 1000);
    date.setUTCDate(1);
    date.setUTCHours(0, 0, 0, 0);
    while (date.getTime() / 1000 <= endEpoch) {
      months.push(date.getTime() / 1000);
      date.setUTCMonth(date.getUTCMonth() + 1);
    }
    return months;
  }

  // Scan a bounded lifetime window at the ephemeris' native sample cadence.
  // The result keeps natal definition separate from temporary transit completion.
  async function scanChannelTimeline(startEpoch, endEpoch, subjects, channels, onProgress = () => {}) {
    if (!Number.isFinite(startEpoch) || !Number.isFinite(endEpoch) || endEpoch <= startEpoch) {
      throw new Error('A valid lifetime date range is required for a transit scan.');
    }
    if (!subjects.length || !channels.length) throw new Error('Choose at least one chart or relationship and one channel to scan.');
    const normalizedSubjects = subjects.map(subject => ({
      ...subject,
      natalGates: new Set(subject.natalGates || []),
      charts: (subject.charts || []).map(chart => ({ ...chart, natalGates: new Set(chart.natalGates || []) })),
      startEpoch: Number.isFinite(subject.startEpoch) ? subject.startEpoch : startEpoch,
      endEpoch: Number.isFinite(subject.endEpoch) ? subject.endEpoch : endEpoch
    }));
    if (normalizedSubjects.some(subject => subject.endEpoch <= subject.startEpoch)) throw new Error('A relationship must have an overlapping birth-to-100-year window to scan.');
    const normalizedChannels = channels.map(channel => ({
      ...channel,
      from: Number(channel.from),
      to: Number(channel.to),
      id: channel.id || `${Math.min(channel.from, channel.to)}-${Math.max(channel.from, channel.to)}`
    }));
    const cacheKey = JSON.stringify({
      startEpoch, endEpoch,
      subjects: normalizedSubjects.map(({ id, natalGates, charts, startEpoch: subjectStart, endEpoch: subjectEnd }) => [id, subjectStart, subjectEnd, [...natalGates].sort((a, b) => a - b), charts.map(chart => [chart.id, [...chart.natalGates].sort((a, b) => a - b)])]),
      channels: normalizedChannels.map(({ id, from, to }) => [id, from, to])
    });
    if (lifetimeScanCache.has(cacheKey)) return lifetimeScanCache.get(cacheKey);
    const scan = (async () => {
      const months = monthEpochs(
        Math.min(...normalizedSubjects.map(subject => subject.startEpoch)),
        Math.max(...normalizedSubjects.map(subject => subject.endEpoch))
      );
      const segments = new Map();
      const failedMonths = [];
      let scannedMonths = 0;
      const subjectSampleCounts = new Map(normalizedSubjects.map(subject => [subject.id, 0]));
      let sampleStepSeconds = 21600;
      let nextMonthIndex = 0;
      const workers = Array.from({ length: Math.min(8, months.length) }, async () => {
        while (nextMonthIndex < months.length) {
          const monthIndex = nextMonthIndex++;
          const monthEpoch = months[monthIndex];
          let data;
          let lastError;
          for (let attempt = 0; attempt < 2 && !data; attempt++) {
            try { data = await monthData(monthEpoch, false, true); }
            catch (error) { lastError = error; }
          }
          if (!data) {
            failedMonths.push({ month: new Date(monthEpoch * 1000).toISOString().slice(0, 7), error: lastError?.message || 'Unavailable' });
            scannedMonths++;
            onProgress({ complete: scannedMonths, total: months.length });
            continue;
          }
          const bodyKeys = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
          const bodyLength = Math.min(...bodyKeys.map(key => data.bodies?.[key]?.length || 0));
          if (!Number.isFinite(data.t0) || !Number.isFinite(data.step) || data.step <= 0 || !bodyLength) {
            failedMonths.push({ month: new Date(monthEpoch * 1000).toISOString().slice(0, 7), error: 'Unsupported or incomplete ephemeris format' });
            scannedMonths++;
            onProgress({ complete: scannedMonths, total: months.length });
            continue;
          }
          sampleStepSeconds = data.step;
          const openRuns = new Map();
          const localSegments = new Map();
          const ensureList = (map, key) => {
            if (!map.has(key)) map.set(key, []);
            return map.get(key);
          };
          for (let index = 0; index < bodyLength; index++) {
            const epoch = data.t0 + index * data.step;
            const transitGates = new Set();
            const planetsByGate = new Map();
            for (const planet of bodyKeys) {
              const longitude = Number(data.bodies[planet][index]);
              if (!Number.isFinite(longitude)) continue;
              const gate = gateAt(planet === 'earth' ? (longitude + 180) % 360 : longitude);
              transitGates.add(gate);
              const label = planet === 'earth' ? 'Earth' : planet[0].toUpperCase() + planet.slice(1);
              if (!planetsByGate.has(gate)) planetsByGate.set(gate, []);
              planetsByGate.get(gate).push(label);
            }
            for (const subject of normalizedSubjects) {
              if (epoch < subject.startEpoch || epoch > subject.endEpoch) continue;
              subjectSampleCounts.set(subject.id, subjectSampleCounts.get(subject.id) + 1);
              for (const channel of normalizedChannels) {
                const key = `${subject.id}|${channel.id}`;
                const natalComplete = subject.natalGates.has(channel.from) && subject.natalGates.has(channel.to);
                const active = natalComplete ||
                  (subject.natalGates.has(channel.from) || transitGates.has(channel.from)) &&
                  (subject.natalGates.has(channel.to) || transitGates.has(channel.to));
                if (!active || natalComplete) {
                  const run = openRuns.get(key);
                  if (run) {
                    ensureList(localSegments, key).push(run);
                    openRuns.delete(key);
                  }
                  continue;
                }
                const transitEndpointGates = [channel.from, channel.to].filter(gate => !subject.natalGates.has(gate) && transitGates.has(gate));
                const planets = [...new Set(transitEndpointGates.flatMap(gate => planetsByGate.get(gate) || []))].sort();
                let run = openRuns.get(key);
                if (!run) {
                  run = { startEpoch: epoch, endEpoch: epoch, samples: 0, transitGates: new Set(), planets: new Set() };
                  openRuns.set(key, run);
                }
                run.endEpoch = epoch;
                run.samples++;
                transitEndpointGates.forEach(gate => run.transitGates.add(gate));
                planets.forEach(planet => run.planets.add(planet));
              }
            }
          }
          for (const [key, run] of openRuns) ensureList(localSegments, key).push(run);
          for (const [key, runs] of localSegments) ensureList(segments, key).push(...runs);
          scannedMonths++;
          onProgress({ complete: scannedMonths, total: months.length });
        }
      });
      await Promise.all(workers);

      const results = [];
      for (const subject of normalizedSubjects) {
        for (const channel of normalizedChannels) {
          const subjectMonths = monthEpochs(subject.startEpoch, subject.endEpoch);
          const subjectMonthKeys = new Set(subjectMonths.map(epoch => new Date(epoch * 1000).toISOString().slice(0, 7)));
          const subjectFailures = failedMonths.filter(item => subjectMonthKeys.has(item.month));
          const natalOwners = subject.charts
            .filter(chart => chart.natalGates.has(channel.from) && chart.natalGates.has(channel.to))
            .map(chart => chart.name);
          const natalComplete = subject.natalGates.has(channel.from) && subject.natalGates.has(channel.to);
          const runs = (segments.get(`${subject.id}|${channel.id}`) || [])
            .sort((a, b) => a.startEpoch - b.startEpoch);
          const merged = [];
          for (const run of runs) {
            const previous = merged[merged.length - 1];
            if (previous && run.startEpoch - previous.endEpoch <= sampleStepSeconds * 1.5) {
              previous.endEpoch = Math.max(previous.endEpoch, run.endEpoch);
              previous.samples += run.samples;
              run.transitGates.forEach(gate => previous.transitGates.add(gate));
              run.planets.forEach(planet => previous.planets.add(planet));
            } else merged.push({ ...run, transitGates: new Set(run.transitGates), planets: new Set(run.planets) });
          }
          const episodes = merged.map(run => ({
            start: new Date(run.startEpoch * 1000).toISOString(),
            startLocal: new Date(run.startEpoch * 1000).toLocaleString(),
            end: new Date(run.endEpoch * 1000).toISOString(),
            endLocal: new Date(run.endEpoch * 1000).toLocaleString(),
            approximateDays: Number((run.samples * sampleStepSeconds / 86400).toFixed(2)),
            transitGates: [...run.transitGates].sort((a, b) => a - b),
            planets: [...run.planets].sort()
          }));
          const durations = episodes.map(episode => episode.approximateDays).sort((a, b) => a - b);
          const activeTransitDays = Number(durations.reduce((sum, days) => sum + days, 0).toFixed(2));
          results.push({
            subject: subject.name,
            subjectType: subject.type,
            people: subject.people || [],
            channel: channel.id,
            channelName: channel.name || '',
            description: channel.description || '',
            gateContributions: [channel.from, channel.to].map(gate => {
              const natalOwners = subject.charts.filter(chart => chart.natalGates.has(gate)).map(chart => chart.name);
              return { gate, natalOwners, transitRequired: natalOwners.length === 0 };
            }),
            natalDefined: natalComplete,
            natalChannelOwners: natalOwners,
            natalBridge: ['relationship', 'family'].includes(subject.type) && !natalOwners.length && natalComplete,
            coverage: {
              start: new Date(subject.startEpoch * 1000).toISOString(),
              startLocal: new Date(subject.startEpoch * 1000).toLocaleString(),
              end: new Date(subject.endEpoch * 1000).toISOString(),
              endLocal: new Date(subject.endEpoch * 1000).toLocaleString(),
              sampledMonths: subjectMonths.length - subjectFailures.length,
              expectedMonths: subjectMonths.length,
              samples: subjectSampleCounts.get(subject.id),
              sampleStepSeconds,
              complete: subjectFailures.length === 0,
              failedMonths: subjectFailures
            },
            transitEpisodes: episodes.length,
            activeTransitDays,
            shareOfWindowPct: Number((activeTransitDays / ((subject.endEpoch - subject.startEpoch) / 86400) * 100).toFixed(3)),
            meanEpisodeDays: durations.length ? Number((activeTransitDays / durations.length).toFixed(2)) : null,
            medianEpisodeDays: durations.length ? durations[Math.floor((durations.length - 1) / 2)] : null,
            longestEpisodeDays: durations.length ? durations[durations.length - 1] : null,
            firstEpisodes: episodes.slice(0, 5),
            lastEpisodes: episodes.slice(-3)
          });
        }
      }
      return results;
    })();
    lifetimeScanCache.set(cacheKey, scan);
    try {
      const result = await scan;
      if (result.some(item => !item.coverage.complete)) lifetimeScanCache.delete(cacheKey);
      return result;
    }
    catch (error) { lifetimeScanCache.delete(cacheKey); throw error; }
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

  window.CastaliaHumanDesignTransit = { GATE_ORDER, gateAt, currentSnapshot, snapshotAt, estimateDurations, scanChannelTimeline, installSvg };
})();
