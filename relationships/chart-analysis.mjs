const CENTER_IDS = ['head', 'ajna', 'throat', 'g', 'ego', 'spleen', 'solar', 'sacral', 'root'];

const asSet = values => values instanceof Set ? values : new Set(values || []);
const sorted = values => [...values].sort((a, b) => a - b);
const gateName = (metadata, gate) => metadata.get(gate)?.name || '';

export function deriveChartStructure(natalGates, definitions, gateMetadata, channelReadings = {}) {
  const gates = asSet(natalGates);
  const channels = definitions.filter(({ from, to }) => gates.has(from) && gates.has(to));
  const channelsByCircuit = new Map();
  for (const channel of channels) {
    const key = channel.circuit || 'unclassified';
    if (!channelsByCircuit.has(key)) channelsByCircuit.set(key, {
      circuit: key,
      name: channel.circuitName,
      group: channel.circuitGroup,
      type: channel.circuitType,
      channelCount: 0,
      channels: []
    });
    const group = channelsByCircuit.get(key);
    group.channelCount++;
    group.channels.push(channel.id);
  }
  const defined = new Set(channels.flatMap(({ from, to }) => [gateMetadata.get(from)?.center, gateMetadata.get(to)?.center]).filter(Boolean));
  const activated = new Set([...gates].map(gate => gateMetadata.get(gate)?.center).filter(Boolean));
  return {
    definedCenters: CENTER_IDS.filter(center => defined.has(center)),
    undefinedCenters: CENTER_IDS.filter(center => !defined.has(center) && activated.has(center)),
    fullyOpenCenters: CENTER_IDS.filter(center => !defined.has(center) && !activated.has(center)),
    natalGateDetails: sorted(gates).map(gate => ({
      gate,
      name: gateName(gateMetadata, gate),
      description: gateMetadata.get(gate)?.description || '',
      center: gateMetadata.get(gate)?.center || ''
    })),
    natalChannels: channels.map(channel => {
      const guide = channelReadings[channel.id] || {};
      return {
        channel: channel.id,
        name: guide.name || '',
        description: guide.description || '',
        circuit: channel.circuit || '',
        circuitName: channel.circuitName || '',
        circuitGroup: channel.circuitGroup || '',
        circuitType: channel.circuitType || '',
        gates: [channel.from, channel.to].map(gate => ({ gate, name: gateName(gateMetadata, gate) }))
      };
    }),
    natalCircuitSummary: [...channelsByCircuit.values()]
  };
}

export function deriveRelationshipStructure(first, second, definitions, gateMetadata, transitGates = new Set()) {
  const firstStructure = deriveChartStructure(first.natalGates, definitions, gateMetadata);
  const secondStructure = deriveChartStructure(second.natalGates, definitions, gateMetadata);
  const firstCenters = new Set(firstStructure.definedCenters);
  const secondCenters = new Set(secondStructure.definedCenters);
  const pairGates = new Set([...first.natalGates, ...second.natalGates]);
  const pairCenters = new Set(deriveChartStructure(pairGates, definitions, gateMetadata).definedCenters);
  const withTransitCenters = new Set(deriveChartStructure(new Set([...pairGates, ...transitGates]), definitions, gateMetadata).definedCenters);
  const relationshipType = first.role === 'parent' && second.role === 'parent' ? 'parent-parent' :
    first.role === 'child' && second.role === 'child' ? 'child-child' : 'parent-child';
  return {
    relationshipType,
    ...(relationshipType === 'parent-child' ? {
      parent: first.role === 'parent' ? first.name : second.name,
      child: first.role === 'child' ? first.name : second.name
    } : {}),
    centerDynamics: CENTER_IDS.map(center => ({
      center,
      firstDefined: firstCenters.has(center),
      secondDefined: secondCenters.has(center),
      definedInPair: pairCenters.has(center),
      definedWithTransit: withTransitCenters.has(center),
      firstState: firstCenters.has(center) ? 'defined' : firstStructure.undefinedCenters.includes(center) ? 'undefined with an activated gate' : 'fully open with no activated gate',
      secondState: secondCenters.has(center) ? 'defined' : secondStructure.undefinedCenters.includes(center) ? 'undefined with an activated gate' : 'fully open with no activated gate',
      relationship: firstCenters.has(center) && secondCenters.has(center) ? 'defined by both' :
        firstCenters.has(center) ? `${first.name} defined; ${second.name} undefined or fully open` :
          secondCenters.has(center) ? `${second.name} defined; ${first.name} undefined or fully open` :
            pairCenters.has(center) ? 'defined only by the pair' : 'undefined in both and in the pair'
    })),
    transitDefinedCenters: CENTER_IDS.filter(center => withTransitCenters.has(center) && !pairCenters.has(center))
  };
}

export function deriveBridgeChannels(definitions, first, second, transitGates, snapshot, durationByPlanet, gateMetadata, channelReadings = {}) {
  const transits = asSet(transitGates);
  const firstGates = asSet(first.natalGates);
  const secondGates = asSet(second.natalGates);
  const firstActive = new Set([...firstGates, ...transits]);
  const secondActive = new Set([...secondGates, ...transits]);
  const gateContributors = gate => [
    ...(firstGates.has(gate) ? [`${first.name} natal`] : []),
    ...(secondGates.has(gate) ? [`${second.name} natal`] : []),
    ...(transits.has(gate) ? ['transit'] : [])
  ];
  return definitions.filter(({ from, to }) => {
    if ((firstGates.has(from) && firstGates.has(to)) || (secondGates.has(from) && secondGates.has(to))) return false;
    return (firstActive.has(from) && secondActive.has(to) && (firstGates.has(from) || secondGates.has(to))) ||
      (secondActive.has(from) && firstActive.has(to) && (secondGates.has(from) || firstGates.has(to)));
  }).map(({ id, from, to, reading }) => {
    const guide = channelReadings[id] || {};
    const contributedGates = [from, to].filter(gate => transits.has(gate) && !firstGates.has(gate) && !secondGates.has(gate));
    const planets = [...new Set(contributedGates.flatMap(gate => snapshot.gatePlanets[gate] || []))];
    const exits = planets.map(planet => durationByPlanet[planet]?.nextGateExit).filter(Boolean).map(value => new Date(value).getTime());
    const endsAt = exits.length ? Math.min(...exits) : null;
    const remainingMs = endsAt === null ? null : Math.max(0, endsAt - snapshot.epoch * 1000);
    const hours = remainingMs === null ? null : Math.floor(remainingMs / 3600000);
    return {
      channel: id,
      channelName: guide.name || '',
      channelDescription: guide.description || '',
      gates: `${from}–${to}`,
      chartGuide: guide.description || reading,
      connectionType: contributedGates.length ? 'transit-assisted relationship completion' : 'cross-chart natal bridge',
      gateContributions: [from, to].map(gate => ({
        gate,
        name: gateMetadata.get(gate)?.name || '',
        description: gateMetadata.get(gate)?.description || '',
        natalOwners: gateContributors(gate),
        transitPlanets: transits.has(gate) ? snapshot.gatePlanets[gate] || [] : []
      })),
      contributions: [from, to].map(gate => {
        const owners = [...gateContributors(gate), ...(transits.has(gate) ? ['transit'] : [])];
        return `Gate ${gate}${gateMetadata.get(gate)?.name ? ` (${gateMetadata.get(gate).name})` : ''}: ${owners.join(' + ') || 'no contribution'}`;
      }),
      transitContributed: contributedGates.length > 0,
      transitGates: contributedGates.map(gate => ({ gate, planets: snapshot.gatePlanets[gate] || [] })),
      expectedToStopCompletingAt: endsAt === null ? null : new Date(endsAt).toISOString(),
      expectedToStopCompletingAtLocal: endsAt === null ? null : new Date(endsAt).toLocaleString(),
      estimatedRemaining: hours === null ? 'end estimate unavailable' : hours >= 24 ? `about ${Math.floor(hours / 24)}d ${hours % 24}h` : `about ${Math.max(1, hours)}h`
    };
  });
}

export function deriveAllFamilyRelationships(familyMembers, derivePair) {
  const pairs = [];
  for (let i = 0; i < familyMembers.length; i++) {
    for (let j = i + 1; j < familyMembers.length; j++) pairs.push(derivePair(familyMembers[i], familyMembers[j]));
  }
  return pairs;
}

export function validateFamilyDerivations({ gates, channels, members, connections, chartStructures = {}, transitGates = new Set() }) {
  const issues = [];
  const gateIds = new Set(gates.map(gate => gate.gate));
  const channelIds = new Set(channels.map(channel => channel.channel));
  if (gates.length !== 64 || gateIds.size !== 64 || [...Array(64)].some((_, index) => !gateIds.has(index + 1))) issues.push('BodyGraph gate catalog must contain each gate 1 through 64 exactly once.');
  if (channels.length !== 36) issues.push(`BodyGraph channel catalog should contain 36 channels; found ${channels.length}.`);
  if (channelIds.size !== channels.length) issues.push('BodyGraph channel catalog contains duplicate channel IDs.');
  for (const channel of channels) {
    if (!gateIds.has(channel.from) || !gateIds.has(channel.to)) issues.push(`Channel ${channel.channel} references a missing gate.`);
    if (channel.from === channel.to) issues.push(`Channel ${channel.channel} connects a gate to itself.`);
    const normalizedId = [channel.from, channel.to].sort((a, b) => a - b).join('-');
    if (normalizedId !== channel.channel) issues.push(`Channel ID ${channel.channel} does not match endpoints ${channel.from}-${channel.to}.`);
  }
  const ids = members.map(member => member.id);
  if (new Set(ids).size !== ids.length) issues.push('Family member IDs must be unique.');
  for (const member of members) {
    const invalid = [...member.natalGates].filter(gate => !Number.isInteger(gate) || !gateIds.has(gate));
    if (invalid.length) issues.push(`${member.name || member.id} has invalid natal gate values: ${invalid.join(', ')}.`);
    const structure = chartStructures[member.id];
    if (structure) {
      const personalGates = asSet(member.natalGates);
      const expectedChannels = channels.filter(channel => personalGates.has(channel.from) && personalGates.has(channel.to)).map(channel => channel.channel).sort();
      const actualChannels = (structure.natalChannels || []).map(channel => channel.channel).sort();
      if (JSON.stringify(actualChannels) !== JSON.stringify(expectedChannels)) issues.push(`${member.name || member.id} natal channel list does not match activated gate pairs.`);
      const centerByGate = new Map(gates.map(gate => [gate.gate, gate.center]));
      const expectedDefined = [...new Set(channels.filter(channel => personalGates.has(channel.from) && personalGates.has(channel.to))
        .flatMap(channel => [centerByGate.get(channel.from), centerByGate.get(channel.to)]).filter(Boolean))].sort();
      const expectedActivated = [...new Set([...personalGates].map(gate => centerByGate.get(gate)).filter(Boolean))];
      for (const [property, expected] of [
        ['definedCenters', expectedDefined],
        ['undefinedCenters', expectedActivated.filter(center => !expectedDefined.includes(center)).sort()],
        ['fullyOpenCenters', CENTER_IDS.filter(center => !expectedActivated.includes(center) && !expectedDefined.includes(center)).sort()]
      ]) {
        const actual = [...(structure[property] || [])].sort();
        if (JSON.stringify(actual) !== JSON.stringify(expected)) issues.push(`${member.name || member.id} ${property} does not match BodyGraph gate/channel topology.`);
      }
    }
  }
  const expectedCount = members.length * (members.length - 1) / 2;
  if (connections.length !== expectedCount) issues.push(`Expected ${expectedCount} unique family relationships; received ${connections.length}.`);
  const expectedPairs = new Set();
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expectedPairs.add([ids[i], ids[j]].sort().join('|'));
  const seenPairs = new Set();
  for (const connection of connections) {
    const key = (connection.ids || []).slice().sort().join('|');
    if (!expectedPairs.has(key)) issues.push(`Unexpected family relationship pair: ${key || '(missing IDs)'}.`);
    if (seenPairs.has(key)) issues.push(`Duplicate family relationship pair: ${key}.`);
    seenPairs.add(key);
    const [firstId, secondId] = connection.ids || [];
    const first = members.find(member => member.id === firstId), second = members.find(member => member.id === secondId);
    if (first && second) {
      const firstGates = asSet(first.natalGates), secondGates = asSet(second.natalGates);
      const expectedType = first.role === 'parent' && second.role === 'parent' ? 'parent-parent' :
        first.role === 'child' && second.role === 'child' ? 'child-child' : 'parent-child';
      if (connection.relationshipType && connection.relationshipType !== expectedType) issues.push(`Relationship ${key} has incorrect relationshipType.`);
      const centerDynamics = connection.centerDynamics || connection.structure?.centerDynamics;
      if (centerDynamics) {
        const centerByGate = new Map(gates.map(gate => [gate.gate, gate.center]));
        const definedCentersFor = activeGates => new Set(channels.filter(channel => activeGates.has(channel.from) && activeGates.has(channel.to))
          .flatMap(channel => [centerByGate.get(channel.from), centerByGate.get(channel.to)]).filter(Boolean));
        const definedFirst = definedCentersFor(firstGates), definedSecond = definedCentersFor(secondGates);
        const pairGates = new Set([...firstGates, ...secondGates]);
        const definedPair = definedCentersFor(pairGates);
        const definedWithTransit = definedCentersFor(new Set([...pairGates, ...asSet(transitGates)]));
        for (const item of centerDynamics) {
          if (item.firstDefined !== definedFirst.has(item.center) || item.secondDefined !== definedSecond.has(item.center) ||
              item.definedInPair !== definedPair.has(item.center) || item.definedWithTransit !== definedWithTransit.has(item.center)) {
            issues.push(`Relationship ${key} has incorrect derived state for center ${item.center}.`);
          }
        }
      }
      for (const bridge of connection.channels || []) {
        const sourceChannel = channels.find(channel => channel.channel === bridge.channel);
        if (!sourceChannel) { issues.push(`Relationship ${key} contains unknown channel ${bridge.channel}.`); continue; }
        if ((firstGates.has(sourceChannel.from) && firstGates.has(sourceChannel.to)) || (secondGates.has(sourceChannel.from) && secondGates.has(sourceChannel.to))) {
          issues.push(`Relationship ${key} labels personally defined channel ${bridge.channel} as a bridge.`);
        }
        const contributions = bridge.gateContributions || [];
        if (contributions.length !== 2 || !contributions.some(item => item.gate === sourceChannel.from) || !contributions.some(item => item.gate === sourceChannel.to)) {
          issues.push(`Relationship ${key} channel ${bridge.channel} has incomplete gate contribution details.`);
        }
        if (!bridge.transitContributed && contributions.length === 2) {
          const owners = contributions.map(item => item.natalOwners || []);
          const firstName = first.name, secondName = second.name;
          if (!owners.some(list => list.some(owner => owner.startsWith(`${firstName} natal`))) ||
              !owners.some(list => list.some(owner => owner.startsWith(`${secondName} natal`)))) {
            issues.push(`Relationship ${key} natal bridge ${bridge.channel} lacks a gate from each member.`);
          }
        }
      }
    }
  }
  for (const key of expectedPairs) if (!seenPairs.has(key)) issues.push(`Missing family relationship pair: ${key}.`);
  return { valid: issues.length === 0, memberCount: members.length, expectedConnectionCount: expectedCount, actualConnectionCount: connections.length, issues };
}

export function analyzeSvgChart(svgDocument = globalThis.document, options = {}) {
  if (!svgDocument?.querySelectorAll) throw new TypeError('A parsed BodyGraph SVG document is required.');
  const gateMetadata = new Map([...svgDocument.querySelectorAll('.gate[data-gate]')].map(node => {
    const label = node.getAttribute('aria-label') || '';
    const separator = label.indexOf(':');
    return [Number(node.dataset.gate), {
      name: separator >= 0 ? label.slice(0, separator).trim() : '',
      description: node.dataset.reading || (separator >= 0 ? label.slice(separator + 1).trim() : ''),
      center: node.dataset.center || ''
    }];
  }));
  const definitions = [...svgDocument.querySelectorAll('.channel-group[data-from][data-to]')].map(node => {
    const from = Number(node.dataset.from), to = Number(node.dataset.to);
    return {
      id: `${Math.min(from, to)}-${Math.max(from, to)}`,
      from, to,
      circuit: node.dataset.circuit || '',
      circuitName: node.dataset.circuitLabel || '',
      circuitGroup: node.dataset.circuitGroupLabel || '',
      circuitType: node.dataset.circuitType || '',
      reading: node.dataset.reading || ''
    };
  });
  const gates = [...svgDocument.querySelectorAll('.gate[data-gate]')].filter(node =>
    node.hasAttribute('data-activation') || (options.includeTransit && node.hasAttribute('data-transit-planets')) ||
    (options.includeDemo && node.dataset.demoActive === 'true')
  ).map(node => Number(node.dataset.gate));
  const structure = deriveChartStructure(gates, definitions, gateMetadata, options.channelReadings || {});
  return { gates: sorted(new Set(gates)), ...structure };
}

export function analyzeSvgFamily(members, svgDocument = globalThis.document, transitGates = new Set()) {
  const transits = asSet(transitGates);
  const gateMetadata = new Map([...svgDocument.querySelectorAll('.gate[data-gate]')].map(node => [Number(node.dataset.gate), {
    name: '', description: '', center: node.dataset.center || ''
  }]));
  const definitions = [...svgDocument.querySelectorAll('.channel-group[data-from][data-to]')].map(node => {
    const from = Number(node.dataset.from), to = Number(node.dataset.to);
    return { id: `${Math.min(from, to)}-${Math.max(from, to)}`, from, to, circuit: node.dataset.circuit || '' };
  });
  const connections = deriveAllFamilyRelationships(members, (first, second) => {
    const firstGates = asSet(first.natalGates || first.gates), secondGates = asSet(second.natalGates || second.gates);
    const bridges = definitions.filter(channel => {
      if ((firstGates.has(channel.from) && firstGates.has(channel.to)) || (secondGates.has(channel.from) && secondGates.has(channel.to))) return false;
      const firstActive = new Set([...firstGates, ...transits]);
      const secondActive = new Set([...secondGates, ...transits]);
      const available = new Set([...firstActive, ...secondActive]);
      const hasFamilyNatalContribution = firstGates.has(channel.from) || firstGates.has(channel.to) || secondGates.has(channel.from) || secondGates.has(channel.to);
      return available.has(channel.from) && available.has(channel.to) && hasFamilyNatalContribution;
    }).map(channel => ({
      channel: channel.id,
      gates: [channel.from, channel.to],
      connectionType: [channel.from, channel.to].some(gate => transits.has(gate) && !firstGates.has(gate) && !secondGates.has(gate))
        ? 'transit-assisted relationship completion' : 'cross-chart natal bridge',
      transitContributed: [channel.from, channel.to].some(gate => transits.has(gate) && !firstGates.has(gate) && !secondGates.has(gate)),
      transitGates: [channel.from, channel.to].filter(gate => transits.has(gate) && !firstGates.has(gate) && !secondGates.has(gate)),
      gateContributions: [channel.from, channel.to].map(gate => ({
        gate,
        natalOwners: [
          ...(firstGates.has(gate) ? [`${first.name} natal`] : []),
          ...(secondGates.has(gate) ? [`${second.name} natal`] : []),
          ...(transits.has(gate) && !firstGates.has(gate) && !secondGates.has(gate) ? ['transit'] : [])
        ],
        transit: transits.has(gate) && !firstGates.has(gate) && !secondGates.has(gate)
      }))
    }));
    return {
      ids: [first.id, second.id],
      people: [first.name, second.name],
      ...deriveRelationshipStructure({ ...first, natalGates: firstGates }, { ...second, natalGates: secondGates }, definitions, gateMetadata, transitGates),
      channels: bridges
    };
  });
  const normalizedMembers = members.map(member => ({ ...member, natalGates: asSet(member.natalGates || member.gates) }));
  const chartStructures = Object.fromEntries(normalizedMembers.map(member => [member.id, deriveChartStructure(member.natalGates, definitions, gateMetadata)]));
  const validation = validateFamilyDerivations({
    gates: [...gateMetadata].map(([gate, detail]) => ({ gate, ...detail })),
    channels: definitions.map(({ id: channel, ...item }) => ({ channel, ...item })),
    members: normalizedMembers,
    connections,
    chartStructures,
    transitGates: transits
  });
  return {
    chartCatalog: { gateCount: gateMetadata.size, channelCount: definitions.length },
    members: normalizedMembers.map(member => ({
      id: member.id,
      name: member.name,
      role: member.role,
      natalGates: sorted(member.natalGates),
      ...chartStructures[member.id]
    })),
    connections,
    validation
  };
}

if (typeof window !== 'undefined') {
  window.CastaliaBodyGraphAnalysis = Object.freeze({
    deriveChartStructure,
    deriveRelationshipStructure,
    deriveBridgeChannels,
    deriveAllFamilyRelationships,
    validateFamilyDerivations,
    analyzeSvgChart,
    analyzeSvgFamily
  });
}
