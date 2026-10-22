import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBodygraphSource } from './bodygraph-source.mjs';
import {
  deriveChartStructure,
  deriveRelationshipStructure,
  deriveBridgeChannels,
  deriveAllFamilyRelationships,
  validateFamilyDerivations,
  analyzeSvgChart,
  analyzeSvgFamily
} from '../relationships/chart-analysis.mjs';

const source = await loadBodygraphSource();
const snapshot = { epoch: 1_800_000_000, gatePlanets: {} };

test('the SVG exposes the complete and internally unique Human Design bodygraph catalog', () => {
  assert.equal(source.gates.length, 64);
  assert.deepEqual([...new Set(source.gates.map(item => item.gate))].sort((a, b) => a - b), Array.from({ length: 64 }, (_, i) => i + 1));
  assert.equal(source.channels.length, 36);
  assert.equal(new Set(source.channels.map(item => item.id)).size, 36);
  for (const channel of source.channels) {
    assert.ok(source.gateMetadata.has(channel.from), `${channel.id} from gate exists`);
    assert.ok(source.gateMetadata.has(channel.to), `${channel.id} to gate exists`);
    assert.equal(channel.id, [channel.from, channel.to].sort((a, b) => a - b).join('-'));
    assert.notEqual(source.gateMetadata.get(channel.from).center, source.gateMetadata.get(channel.to).center, `${channel.id} should link distinct centers`);
  }
});

test('each channel is defined only when both of its gates are in one chart', () => {
  for (const channel of source.channels) {
    const fromOnly = deriveChartStructure(new Set([channel.from]), source.channels, source.gateMetadata);
    const both = deriveChartStructure(new Set([channel.from, channel.to]), source.channels, source.gateMetadata);
    assert.equal(fromOnly.natalChannels.some(item => item.channel === channel.id), false, `${channel.id} must remain hanging with one gate`);
    assert.equal(both.natalChannels.filter(item => item.channel === channel.id).length, 1, `${channel.id} should appear once when complete`);
    assert.deepEqual(new Set(both.definedCenters), new Set([
      source.gateMetadata.get(channel.from).center,
      source.gateMetadata.get(channel.to).center
    ]));
  }
});

test('cross-chart bridges have one contribution from each person and no personal complete channel', () => {
  for (const channel of source.channels) {
    const first = { id: 'a', name: 'A', role: 'parent', natalGates: new Set([channel.from]) };
    const second = { id: 'b', name: 'B', role: 'child', natalGates: new Set([channel.to]) };
    const bridge = deriveBridgeChannels(source.channels, first, second, new Set(), snapshot, {}, source.gateMetadata)
      .find(item => item.channel === channel.id);
    assert.ok(bridge, `${channel.id} should be recognized as a cross-chart bridge`);
    assert.equal(bridge.connectionType, 'cross-chart natal bridge');
    assert.equal(bridge.gateContributions.length, 2);
    assert.ok(bridge.gateContributions.some(item => item.gate === channel.from && item.natalOwners.includes('A natal')));
    assert.ok(bridge.gateContributions.some(item => item.gate === channel.to && item.natalOwners.includes('B natal')));
    const personal = deriveBridgeChannels(source.channels, { ...first, natalGates: new Set([channel.from, channel.to]) }, second, new Set(), snapshot, {}, source.gateMetadata);
    assert.equal(personal.some(item => item.channel === channel.id), false, `${channel.id} is not a bridge when one person defines it`);
  }
});

test('transit-assisted bridges identify the transit gate and transit planet', () => {
  const channel = source.channels.find(item => item.id === '34-57');
  const first = { id: 'a', name: 'A', role: 'parent', natalGates: new Set([channel.from]) };
  const second = { id: 'b', name: 'B', role: 'parent', natalGates: new Set() };
  const transitGate = channel.to;
  const transitSnapshot = { ...snapshot, gatePlanets: { [transitGate]: ['Moon'] } };
  const bridge = deriveBridgeChannels(source.channels, first, second, new Set([transitGate]), transitSnapshot, {}, source.gateMetadata)
    .find(item => item.channel === channel.id);
  assert.ok(bridge);
  assert.equal(bridge.connectionType, 'transit-assisted relationship completion');
  assert.deepEqual(bridge.transitGates, [{ gate: transitGate, planets: ['Moon'] }]);
  assert.equal(bridge.expectedToStopCompletingAt, null);
});

test('every member pair appears exactly once, including child-child relationships', () => {
  for (let count = 2; count <= 8; count++) {
    const members = Array.from({ length: count }, (_, index) => ({
      id: `member-${index}`,
      name: `Member ${index}`,
      role: index < 2 ? 'parent' : 'child',
      natalGates: new Set([index + 1])
    }));
    const connections = deriveAllFamilyRelationships(members, (a, b) => ({ ids: [a.id, b.id] }));
    const report = validateFamilyDerivations({ gates: source.gates, channels: source.channels.map(({ id: channel, ...item }) => ({ channel, ...item })), members, connections });
    assert.equal(report.valid, true, report.issues.join('\n'));
    assert.equal(connections.length, count * (count - 1) / 2);
  }
  const mixed = deriveRelationshipStructure(
    { name: 'Parent', role: 'parent', natalGates: new Set() },
    { name: 'Child', role: 'child', natalGates: new Set() },
    source.channels,
    source.gateMetadata
  );
  assert.equal(mixed.relationshipType, 'parent-child');
  assert.equal(mixed.parent, 'Parent');
  assert.equal(mixed.child, 'Child');
});

test('validator catches missing, duplicate, and malformed relationship records', () => {
  const members = [
    { id: 'a', name: 'A', natalGates: new Set([1]) },
    { id: 'b', name: 'B', natalGates: new Set([2]) },
    { id: 'c', name: 'C', natalGates: new Set([65]) }
  ];
  const connections = [{ ids: ['a', 'b'] }, { ids: ['a', 'b'] }];
  const report = validateFamilyDerivations({ gates: source.gates, channels: source.channels.map(({ id: channel, ...item }) => ({ channel, ...item })), members, connections });
  assert.equal(report.valid, false);
  assert.ok(report.issues.some(issue => issue.includes('invalid natal gate')));
  assert.ok(report.issues.some(issue => issue.includes('Expected 3 unique')));
  assert.ok(report.issues.some(issue => issue.includes('Duplicate family relationship pair')));
  assert.ok(report.issues.some(issue => issue.includes('Missing family relationship pair')));
});

test('BodyGraph-facing API computes the live chart and every supplied family pair', () => {
  const gates = source.gates.map(gate => {
    const active = [10, 20, 34, 57].includes(gate.gate);
    const transit = gate.gate === 34;
    return {
      dataset: { gate: String(gate.gate), center: gate.center, demoActive: 'false' },
      hasAttribute: attribute => attribute === 'data-activation' ? active : attribute === 'data-transit-planets' ? transit : false,
      getAttribute: name => name === 'aria-label' ? `${gate.name}: ${gate.description}` : null
    };
  });
  const channels = source.channels.map(channel => ({
    dataset: {
      from: String(channel.from), to: String(channel.to), circuit: channel.circuit,
      circuitLabel: channel.circuitName, circuitGroupLabel: channel.circuitGroup, circuitType: channel.circuitType
    }
  }));
  const document = { querySelectorAll: selector => selector.startsWith('.gate') ? gates : channels };
  const chart = analyzeSvgChart(document);
  assert.deepEqual(chart.gates, [10, 20, 34, 57]);
  assert.ok(chart.natalChannels.some(channel => channel.channel === '10-20'));
  assert.equal(chart.natalChannels.some(channel => channel.channel === '34-57'), true);
  const family = analyzeSvgFamily([
    { id: 'p1', name: 'P1', role: 'parent', gates: [10] },
    { id: 'p2', name: 'P2', role: 'parent', gates: [34] },
    { id: 'c1', name: 'C1', role: 'child', gates: [57] }
  ], document);
  assert.deepEqual(family.chartCatalog, { gateCount: 64, channelCount: 36 });
  assert.equal(family.connections.length, 3);
  assert.ok(family.connections.find(pair => pair.ids.includes('p2') && pair.ids.includes('c1')).channels.some(channel => channel.channel === '34-57'));
  assert.equal(family.validation.valid, true, family.validation.issues.join('\n'));
});
