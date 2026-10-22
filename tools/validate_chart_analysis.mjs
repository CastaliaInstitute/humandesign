#!/usr/bin/env node
import {
  deriveChartStructure,
  deriveRelationshipStructure,
  deriveBridgeChannels,
  deriveAllFamilyRelationships,
  validateFamilyDerivations
} from '../relationships/chart-analysis.mjs';
import { loadBodygraphSource } from './bodygraph-source.mjs';

const { gates, channels, gateMetadata } = await loadBodygraphSource();
const members = [
  { id: 'adult-a', name: 'Adult A', role: 'parent', natalGates: new Set([10, 20, 13]) },
  { id: 'adult-b', name: 'Adult B', role: 'parent', natalGates: new Set([34, 2]) },
  { id: 'child-a', name: 'Child A', role: 'child', natalGates: new Set([57, 20]) },
  { id: 'child-b', name: 'Child B', role: 'child', natalGates: new Set([10, 34]) }
];
const snapshot = { epoch: 0, gatePlanets: {} };
const transits = new Set();
const connections = deriveAllFamilyRelationships(members, (first, second) => {
  const bridges = deriveBridgeChannels(channels, first, second, transits, snapshot, {}, gateMetadata);
  return {
    ids: [first.id, second.id],
    structure: deriveRelationshipStructure(first, second, channels, gateMetadata, transits),
    channels: bridges
  };
});
const analysis = validateFamilyDerivations({
  gates,
  channels: channels.map(({ id: channel, ...item }) => ({ channel, ...item })),
  members,
  connections,
  chartStructures: Object.fromEntries(members.map(member => [member.id, deriveChartStructure(member.natalGates, channels, gateMetadata)])),
  transitGates: transits
});
const adultStructure = deriveChartStructure(members[0].natalGates, channels, gateMetadata);
const adultBChildABridge = connections.find(item => item.ids.includes('adult-b') && item.ids.includes('child-a'));
const report = {
  valid: analysis.valid,
  bodygraph: { gates: gates.length, channels: channels.length },
  sampleFamily: { members: members.length, relationships: analysis.actualConnectionCount, expectedRelationships: analysis.expectedConnectionCount },
  examples: {
    adultAChannels: adultStructure.natalChannels.map(channel => channel.channel),
    adultBChildABridge: adultBChildABridge?.channels.some(channel => channel.channel === '34-57') || false
  },
  issues: analysis.issues
};
console.log(JSON.stringify(report, null, 2));
if (!analysis.valid || !report.examples.adultBChildABridge) process.exitCode = 1;
